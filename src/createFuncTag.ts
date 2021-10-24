import { useConstant, useState, isAsyncState, isConstantState, isObservableState } from './asyncState'
import { objectState } from './objectState'

export function createFuncTag(type: (attributes: object) => unknown, attributes: object, children: unknown) {
	let isObservableResult = false
	let done = false
	const values = new Map()

	let lastBuffer: AsyncIterable<unknown> | undefined

	async function runCopyLoop(buffer: AsyncIterable<unknown>, cb?: Function): Promise<void> {
		lastBuffer = buffer
		await undefined // wait for updateResult to be assigned
		try {
			for await (const item of buffer) {
				if (lastBuffer !== buffer) break
				if (!await updateResult(item)) {
					done = true
					if (lastBuffer === buffer) {
						lastBuffer = undefined
					}
					break
				}
				if (cb) {
					cb()
					cb = undefined
				}
				if (lastBuffer !== buffer) break
			}
		} finally {
			cb?.()
		}
	}

	function updateValues(): void {
		const cbs = callbacks.splice(0)
		const nextAttributes = Object.fromEntries(values)
		const nextResult = type(nextAttributes)
		let ret: Promise<unknown>
		if (!isAsyncState(nextResult)) {
			ret = updateResult(nextResult)
		} else {
			ret = new Promise(resolve => runCopyLoop(nextResult, resolve))
		}
		for (const cb of cbs) cb(ret)
	}

	const getAttribute = (key: string) => Object.hasOwn(attributes, key) ? attributes[key] : key === "children" ? children : undefined

	const attr = new Proxy(attributes, {
		get(target, property: string, receiver) {
			if (property.startsWith("$") || property.endsWith("$$")) {
				throw new Error(`bad attribute name: ${property}`)
			}
			if (values.has(property)) {
				return values.get(property)
			}
			let value: unknown = undefined
			if (property.endsWith("$")) {
				const key = property.slice(0, -1)
				if (values.has(key)) {
					throw new Error(`either ${property} or ${key} attribute should be used, but not both`)
				}
				value = getAttribute(key)
				if (value !== undefined /* let default function params work */ && !isAsyncState(value)) {
					value = useConstant(value)
				}
			} else {
				const key = property + "$"
				if (values.has(key)) {
					throw new Error(`either ${property} or ${key} attribute should be used, but not both`)
				}
				value = getAttribute(property)
				if (isAsyncState(value)) {
					if (!isObservableState(value)) {
						value = value.syncReadInitialValue()
					} else {
						isObservableResult = true
						const value$ = value
						value = value.syncReadInitialValue()
						runAttributeUpdateLoop(property, value$)
					}
				}
			}
			values.set(property, value)
			return value
		}
	})

	let result = type(attr)

	if (isConstantState(result)) {
		result = result.syncReadInitialValue()
	}

	if (!isObservableResult) {
		return result
	}

	if (isObservableState(result)) {
		runCopyLoop(result)
		result = result.syncReadInitialValue()
	}

	const [result$, updateResult] = useState(result)

	return result$
}
