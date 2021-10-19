import { useConstant, useState } from './asyncState'
import { isAsyncIterable } from './isAsyncIterable'

export function createFuncTag(type: Function, attributes: object, children: unknown) {
	let isObservable = false
	const values = new Map()

	let callbacks: Array<(result: boolean | PromiseLike<boolean>) => void>

	async function runCopyLoop(buffer: AsyncIterable<unknown>): Promise<void> {
		await undefined // wait for updateResult to be assigned
		for await (const item of buffer) {
			if (!await updateResult(item)) {
				break
			}
		}
	}

	function updateValues(): void {
		const nextAttributes = Object.fromEntries(values)
		const cbs = callbacks.splice(0)
		const nextResult = type(Object.fromEntries(values))
		let ret: Promise<boolean>
		if (!isAsyncIterable(nextResult)) {
			ret = updateResult(nextResult)
		} else {
			ret = 
		}
		for (const cb of cbs) cb(ret)
	}

	function onValuesChanged(callback: (result: boolean | PromiseLike<boolean>) => void): void {
		(callbacks ??= []).push(callback)
		if (callbacks.length === 1) {
			setImmediate(updateValues)
		}
	}

	async function runAttributeUpdateLoop(property: string, value$: AsyncIterable<unknown>): Promise<void> {
		for await (const value of value$) {
			values.set(property, value)
			if (!await new Promise(onValuesChanged)) {
				break
			}
		}
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
			let value = undefined
			if (property.endsWith("$")) {
				const key = property.slice(0, -1)
				if (values.has(key)) {
					throw new Error(`either ${property} or ${key} attribute should be used, but not both`)
				}
				value = getAttribute(key)
				if (value !== undefined /* let default function params work */ && !isAsyncIterable(value)) {
					value = useConstant(value)
				}
			} else {
				const key = property + "$"
				if (values.has(key)) {
					throw new Error(`either ${property} or ${key} attribute should be used, but not both`)
				}
				value = getAttribute(property)
				if (isAsyncIterable(value)) {
					if (values.hasTheOnlyValue) {
						value = value.initialValue
					} else {
						isObservable = true
						const value$ = value
						value = value.syncReadInitialValue?.()
						runAttributeUpdateLoop(property, value$)
					}
				}
			}
			values.set(property, value)
			return value
		}
	})

	let result = type(attr)
	if (!isObservable) {
		return result
	}

	if (isAsyncIterable(result)) {
		runCopyLoop(result)
		result = result.syncReadInitialValue()
	}

	const [result$, updateResult] = useState(result)

	return result$
}
