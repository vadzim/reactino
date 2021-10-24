//
//
export class Async<T> implements AsyncIterable<T> {
	#closed: boolean = false
	#waitcb?: Function
	#buffer?: Array<{ value: typeof ASYNC_STOP | T | PromiseLike<T>, cb: (result: boolean) => void }>

	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		try {
			while (true) {
				let promise: typeof ASYNC_STOP | T | PromiseLike<T>
				if (this.#buffer?.length) {
					const rec = this.#buffer.shift()!
					rec.cb(true)
					promise = rec.value
				} else if (!this.#closed) {
					promise = new Promise(resolve => { this.#waitcb = resolve })
				} else {
					break
				}
				const value = await promise
				if (value === ASYNC_STOP) {
					break
				}
				yield value as T
			}
		} finally {
			this.#closed = true
			while (this.#buffer?.length) {
				this.#buffer.shift()!.cb(false)
			}
		}
	}

	readBuffer() {
		let buffer: Array<T | PromiseLike<T>> | undefined
		while (this.#buffer?.length) {
			const rec = this.#buffer.shift()!
			rec.cb(true)
			if (rec.value !== ASYNC_STOP) {
				(buffer ??= []).push(rec.value as T | PromiseLike<T>)
			} else {
				break
			}
		}
		return buffer
	}

	push(): Promise<boolean>
	push(value: T | PromiseLike<T>): Promise<boolean>
	push(...values: Array<T | PromiseLike<T>>): Promise<boolean> {
		if (!this.#closed) {
			let value: typeof ASYNC_STOP | T | PromiseLike<T>
			if (values.length > 0) {
				value = values[0] as T
			} else {
				value = ASYNC_STOP
				this.#closed = true
			}
			const waitcb = this.#waitcb
			if (waitcb) {
				this.#waitcb = undefined
				waitcb(value)
				return Promise.resolve(true)
			} else {
				return new Promise(cb => {
					(this.#buffer ??= []).push({ value, cb })
				})
			}
		}
		return Promise.resolve(false)
	}
}

//
//
const ASYNC_STOP = new class {}()
