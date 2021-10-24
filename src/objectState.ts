import { AsyncState, useConstant, useState, isAsyncState, isConstantState, isObservableState } from './asyncState'

export function objectState<T extends object>(object: T): T | AsyncState<T> {
	const entries = Object.entries(object)

	let lastObject: T | undefined = undefined

	return entriesState(entries, nextEntries => {
		if (nextEntries === entries) {
			lastObject = object
		} else {
			lastObject = { ...lastObject, ...Object.fromEntries(entries) } as T
		}
		return lastObject
	})
}

export function entriesState<T>(entries: [key: string, value: unknown][], reducer: (entries: [key: string, value: unknown][]) => T): T | AsyncState<T> {
	if (entries.every(kv => !isAsyncState(kv[1]))) {
		return reducer(entries)
	}

	if (entries.every(kv => !isObservableState(kv[1]))) {
		return reducer(entries.map(kv => [kv[0], isConstantState(kv[1]) ? kv[1].syncReadInitialValue() : kv[1]]))
	}
	
	{ // don't create unneeded variables
		const changedEntries: typeof entries = []
		const callbacks: Array<(result: PromiseLike<boolean>) => void> = []
		let done: boolean = false
		let numThreads = 0

		function pushNextObject(): void {
			const cbs = callbacks.splice(0)
			const ret = updateResult(reducer(changedEntries.splice(0)))
			ret.catch(() => false).then(success => { if (!success) done = false })
			for (const cb of cbs) cb(ret)
		}

		async function debounceUpdateValues(): Promise<void> {
			do {
				const length = callbacks.length
				await undefined // TODO: do we need await Promise.resolve() instead ????
			} while (length !== callbacks.length)

			pushNextObject()
		}

		function onValuesChanged(callback: (result: PromiseLike<boolean>) => void): void {
			callbacks.push(callback)
			if (callbacks.length === 1) {
				debounceUpdateValues()
			}
		}

		async function runAttributeUpdateLoop(key: string, value$: AsyncIterable<unknown>): Promise<void> {
			try {
				for await (const value of value$) {
					if (done) break
					changedEntries.push([key, value])
					if (!await new Promise(onValuesChanged)) break
					if (done) break
				}
			} finally {
				numThreads -= 1
				if (numThreads === 0) updateResult()
			}
		}

		const firstEntries: [key: string, value: unknown][] = entries.map(kv => {
			const v = kv[1]
			if (!isAsyncState(v)) {
				return kv
			}
			if (!isObservableState(v)) {
				return [kv[0], v.syncReadInitialValue()]
			}
			const value = v.syncReadInitialValue()
			numThreads += 1
			runAttributeUpdateLoop(kv[0], v)
			return [kv[0], value]
		})

		const [result$, updateResult] = useState(reducer(firstEntries))

		return result$
	}
}
