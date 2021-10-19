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
export type AsyncState<T> = UseState<T> | UseConstant<T>

//
//
export type AsAsyncState<A extends unknown> =
	[A] extends [UseState<infer T>] ? ([UseState<T>] extends [A] ? UseState<T> : never) :
	[A] extends [UseConstant<infer T>] ? ([UseConstant<T>] extends [A] ? UseConstant<T> : never) :
	never

//
//
export function isAsyncState(s: unknown): s is AsyncStateClass<unknown> {
	return s instanceof AsyncStateClass
}

//
//
export function isUseConstant(s: unknown): s is UseConstant<unknown> {
	return s instanceof UseConstant
}

//
//
export function isUseState(s: unknown): s is UseState<unknown> {
	return s instanceof UseState
}

//
//
class UseConstant<T> extends AsyncStateClass<NotPromise<T>> {
	constructor(value: NotPromise<T>) {
		super(true, value)
	}

	static create<T>(value: NotPromise<T>): UseConstant<T> {
		return new UseConstant<T>(value)
	}

	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		if (this._hasInitialValue) {
			yield this.syncReadInitialValue()!
		}
	}

	get initialValue() {
		return this._initialValue
	}

	get hasTheOnlyValue() {
		return this._hasInitialValue
	}
}

export const useConstant = UseConstant.create

//
//
type Push<T> = {
	(): Promise<boolean>
	(value: T | PromiseLike<T>): Promise<boolean>
}

//
//
class UseState<T> extends AsyncStateClass<T> {
	_async = new Async<T>()

	static create<T>(): [AsyncIterable<T>, Push<T>]
	static create<T extends AsyncState<unknown>>(value: T): unknown
	static create<T>(value: T | PromiseLike<T>): [AsyncIterable<T>, Push<T>]
	static create<T>(...values: Array<T | PromiseLike<T>>): [AsyncIterable<T>, Push<T>] {
		let that: UseState<T>
		if (!isAsyncState(values[0])) {
			if (values.length > 0) {
				if (!isThenable(values[0])) {
					that = new UseState<T>(true, values[0] as T)
				} else {
					that = new UseState<T>(false, undefined)
					that._async.push(values[0]!)
				}
			} else {
				that = new UseState<T>(false, undefined)
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

export const useState = UseState.create

{const x = useState(1)}
{const x = useState(useConstant(2))}
