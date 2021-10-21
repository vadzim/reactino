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
export function isAsyncState(s: unknown): s is ConstantState<unknown> | ObservableState<unknown> {
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
	(value: T | PromiseLike<T>): Promise<boolean>
}

//
//
class ObservableState<T> extends AsyncStateClass<T> {
	_async = new Async<T>()

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

export const useState = ObservableState.create

{const x = useState(1)}
{const x = useState(useConstant(2))}
