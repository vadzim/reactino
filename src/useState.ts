//
//
let currentCalculation: Calculation<unknown> | undefined
let backupCalculations: Map<State<unknown>, Calculation<unknown>> | undefined
const dirtyCalculations: Calculation<unknown>[] = []

function runCalculations(length?: number): void {
	if (length !== dirtyCalculations.length) {
		return dirtyCalculationsChanged()
	}
	dirtyCalculations.sort((effect1, effect2) => effect1._rank - effect2._rank)
	while (dirtyCalculations.length > 0) {
		const currentLength = dirtyCalculations.length
		dirtyCalculations.shift()!.update()
		if (currentLength !== dirtyCalculations.length) {
			return dirtyCalculationsChanged()
		}
	}
}

function dirtyCalculationsChanged(): void {
	Promise.resolve(dirtyCalculations.length).then(runCalculations)
}

//
//
class State<T> {
	_isError: boolean = false
	_value: T
	_subscriptions: Set<Calculation<unknown>> = new Set()
	_currentCalculation?: Calculation<unknown> = undefined
	_owner?: Calculation<unknown> = undefined

	constructor(value: T) {
		this._value = value
		if (currentCalculation) {
			(currentCalculation._children ??= []).push(this)
		}
	}

	read(): T {
		if (!this._subscriptions) {
			throw new Error('state is already destroyed')
		}

		if (!currentCalculation) {
			throw new Error("a state can be read only in an effect")
		}

		this._owner?.update()
		
		if (this._currentCalculation !== currentCalculation) {
			if (this._currentCalculation) {
				(backupCalculations ??= new Map()).set(this, this._currentCalculation)
			}
			this._currentCalculation = currentCalculation
			this._subscriptions.add(currentCalculation)
			currentCalculation._dependencies.add(this)
			if (this._owner && currentCalculation._rank <= this._owner._rank) {
				currentCalculation._rank = this._owner._rank + 1
			}
		}

		if (this._isError) {
			throw this._value
		}

		return this._value
	}

	_set(value: T, isError: boolean) {
		if (!this._subscriptions) {
			throw new Error('state is already destroyed')
		}

		if (currentCalculation && currentCalculation !== this._owner) {
			throw new Error("cannot update a state in an effect")
		}

		if (this._isError !== isError || this._value !== value) {
			this._isError = isError
			this._value = value
			for (const effect of this._subscriptions) if (!effect._dirty) {
				effect._dirty = true
				dirtyCalculations.push(effect)
				if (dirtyCalculations.length === 1) {
					dirtyCalculationsChanged()
				}
			}
			this._subscriptions.clear()
		}
	}

	update(value: T) {
		this._set(value, false)
	}

	throw(error: unknown) {
		this._set(error as T, true)
	}

	suspend() {
		if (this._subscriptions.size > 0 || !this._owner) {
			return false
		}
		this._owner._dirty = true
		for (const state of this._owner._dependencies) {
			state._subscriptions.delete(this._owner)
			this._owner._dependencies.delete(state)
			state.suspend()
		}
		return true
	}

	_destroy() {
		this._subscriptions = undefined!
		this._owner?._destroy()
	}
}

//
//
class Calculation<T> {
	_proc: () => T
	_state: State<T>
	_dependencies: Set<State<unknown>> = new Set()
	_children?: State<unknown>[] = undefined
	_dirty: boolean = true
	_rank: number = 0

	constructor(proc: () => T, initial: T) {
		this._proc = proc
		this._state = new State<T>(initial)
		this._state._owner = this
	}

	update() {
		if (!this._dependencies) {
			throw new Error('effect is already destroyed')
		}

		if (this._dirty) {
			const parentCalculation = currentCalculation
			const parentBackupCalculations = backupCalculations
			backupCalculations = undefined
			currentCalculation = this
			this._destroyChildren()
			this._rank = 0
			try {
				this._state.update(this._proc())
			} catch (error) {
				this._state.throw(error)
			}
			this._dirty = false
			currentCalculation = parentCalculation
			for (const state of this._dependencies) {
				if (state._currentCalculation === this) {
					state._currentCalculation = backupCalculations!?.get(state)
				} else {
					state._subscriptions.delete(this)
					this._dependencies.delete(state)
				}
			}
			backupCalculations = parentBackupCalculations
		}
	}

	_destroy() {
		this._destroyChildren()
		for (const state of this._dependencies) {
			state._subscriptions.delete(this)
		}
		this._dependencies = undefined!
	}

	_destroyChildren() {
		if (this._children) {
			for (const state of this._children) {
				state._destroy()
			}
			this._children.length = 0
		}
	}
}

//
//
class Effect extends Calculation<(() => void) | undefined> {
	_destroyChildren() {
		const cb = this._state._value
		this._state._value = undefined
		try {
			cb?.()
		} finally {
			super._destroyChildren()
		}
	}
}

//
//
export function useState<T>(initial: T): [() => T, (value: T) => void] {
	const state = new State(initial)
	const read = state.read.bind(state)
	const update = state.update.bind(state)
	return [read, update]
}

//
//
export function use<T>(proc: () => T): () => T {
	const effect = new Calculation<T>(proc, undefined!)
	const read = effect._state.read.bind(effect._state)
	return read
}

//
//
export function useEffect(proc: () => void | (() => void)): void {
	const effect = new Calculation<void>(proc, undefined)
	const resume = effect._state.read.bind(effect._state)
	resume()
}

//
//
export function useRootEffect(proc: () => void): [/*resume*/() => void, /*suspend*/() => void] {
	const effect = new Calculation<void>(proc, undefined)
	const resume = effect._state.read.bind(effect._state)
	const suspend = effect._state.suspend.bind(effect._state)
	resume()
	return [resume, suspend]
}
