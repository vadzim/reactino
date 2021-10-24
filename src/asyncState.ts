import { Async } from "./async"
import { isThenable } from "./isThenable"

//
//
type NotPromise<T> = T extends PromiseLike<infer U> ? never : T

//
//
class AsyncStateClass<T> {
	constructor(protected _hasInitialValue: boolean, protected _initialValue: T | undefined) {}

	syncReadInitialValue(): T | undefined {
		// just return undefined if no initial value was provided
		// this is enough for the needs...
		const value = this._initialValue
		this._hasInitialValue = false
		this._initialValue = undefined
		return value
	}

	get hasInitialValue(): boolean {
		return this._hasInitialValue
	}
}

//
//
export type AsyncState<T> = ObservableState<T> | ConstantState<T>

//
//
export type AsAsyncState<A extends unknown> =
	[A] extends [ObservableState<infer T>] ? ([ObservableState<T>] extends [A] ? ObservableState<T> : never) :
	[A] extends [ConstantState<infer T>] ? ([ConstantState<T>] extends [A] ? ConstantState<T> : never) :
	never

//
//
class ConstantState<T> extends AsyncStateClass<T> {
	constructor(value: T) {
		if (!isAsyncState(value)) {
			super(true, value)
		} else {
			throw new Error("cannot use state as scalar")
		}
	}

	static create<T extends AsyncState<unknown>>(value: T): unknown
	static create<T>(value: T): ConstantState<T>
	static create<T>(value: T): ConstantState<T> {
		return new ConstantState<T>(value)
	}

	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		if (this._hasInitialValue) {
			yield this.syncReadInitialValue()!
		}
	}
}

export const useConstant = ConstantState.create

//
//
type Push<T> = {
	(): Promise<boolean>
	(value: T | PromiseLike<T> | ConstantState<T> | ObservableState<T>): Promise<boolean>
}

//
//
class ObservableState<T> extends AsyncStateClass<T> {
	protected _async = new Async<T>()
	protected _current?: AsyncIterable<T>

	static create<T>(): [ObservableState<T>, Push<T>]
	static create<T extends AsyncState<unknown>>(value: T): unknown
	static create<T>(value: T | PromiseLike<T>): [ObservableState<T>, Push<T>]
	static create<T>(...values: Array<T | PromiseLike<T>>): [ObservableState<T>, Push<T>] {
		let that: ObservableState<T>
		if (!isAsyncState(values[0])) {
			if (values.length > 0) {
				if (!isThenable(values[0])) {
					that = new ObservableState<T>(true, values[0] as T)
				} else {
					that = new ObservableState<T>(false, undefined)
					that._async.push(values[0]!)
				}
			} else {
				that = new ObservableState<T>(false, undefined)
			}
		} else {
			throw new Error("cannot use state as scalar")
		}
		return [that, that._push.bind(that)]
	}

	_push(): Promise<boolean>
	_push(value: T | PromiseLike<T> | ObservableState<T> | ConstantState<T>): Promise<boolean>
	_push(...values: [] | [T | PromiseLike<T> | ObservableState<T> | ConstantState<T>]): Promise<boolean> {
		this._current = undefined

		if (values.length === 0) {
			return this._async.push()
		}

		const value = values[0]

		if (!isAsyncState(value)) {
			return this._async.push(value)
		}

		if (!isObservableState(value)) {
			if (value.hasInitialValue) {
				return this._async.push(value.syncReadInitialValue()!)
			}
			return Promise.resolve(true)
		}

		if (value.hasInitialValue) {
			const ret = this._async.push(value.syncReadInitialValue()!)
			this._copy(value._async)
			return ret
		}

		return new Promise(resolve => this._copy(value._async, resolve))
	}

	async _copy(iterable: AsyncIterable<T>, callback?: (result: boolean) => void) {
		this._current = iterable
		try {
			for await (const item of iterable) {
				if (this._current !== iterable) break
				if (!await this._push(item)) break
				if (callback) {
					callback(true)
					callback = undefined
				}
				if (this._current !== iterable) break
			}
		} finally {
			callback?.(false)
		}
	}

	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		try {
			if (this._hasInitialValue) {
				yield this.syncReadInitialValue()!
			}
			yield* this._async
		} finally {
			await this._async.push()
		}
	}
}

export const useState = ObservableState.create


//
//
class IteratorState<T> extends AsyncStateClass<T> {
	_async = new Async<T>()

	static create<T>(): [IteratorState<T>, Push<T>]
	static create<T extends AsyncState<unknown>>(value: T): unknown
	static create<T>(value: T | PromiseLike<T>): [IteratorState<T>, Push<T>]
	static create<T>(...values: Array<T | PromiseLike<T>>): [IteratorState<T>, Push<T>] {
		let that: IteratorState<T>
		if (!isAsyncState(values[0])) {
			if (values.length > 0) {
				if (!isThenable(values[0])) {
					that = new IteratorState<T>(true, values[0] as T)
				} else {
					that = new IteratorState<T>(false, undefined)
					that._async.push(values[0]!)
				}
			} else {
				that = new IteratorState<T>(false, undefined)
			}
		} else {
			throw new Error("cannot use state as scalar")
		}
		return [that, that._async.push.bind(that._async)]
	}

	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		try {
			if (this._hasInitialValue) {
				yield this.syncReadInitialValue()!
			}
			yield* this._async
		} finally {
			await this._async.push()
		}
	}
}

export const useIterator = IteratorState.create

//
//
export function isAsyncState(s: unknown): s is (ConstantState<unknown> | ObservableState<unknown>) {
	return s instanceof AsyncStateClass
}

//
//
export function isConstantState(s: unknown): s is ConstantState<unknown> {
	return s instanceof ConstantState
}

//
//
export function isObservableState(s: unknown): s is ObservableState<unknown> {
	return s instanceof ObservableState
}

