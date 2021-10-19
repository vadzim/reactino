import { JSDOM } from 'jsdom'
import { useConstant, useState } from './asyncState'
import { isAsyncIterable } from './isAsyncIterable'

const { window } = new JSDOM()

export function createDomTag(type: string, attributes: object, children: unknown) {
	const element = window.document.createElement(type)
	return element

	let isObservable = false
	const values = new Map()

	let callbacks: Array<(result: boolean | PromiseLike<boolean>) => void>

	function updateValues(): void {
		const nextAttributes = Object.fromEntries(values)
		const cbs = callbacks.splice(0)
		const ret = updateResult(type(Object.fromEntries(values)))
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
				if (!isAsyncIterable(value)) {
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
						value = value.readInitialValue?.()
						runAttributeUpdateLoop(property, value$)
					}
				}
			}
			values.set(property, value)
			return value
		}
	})

	const result = type(attr)
	if (!isObservable) {
		return result
	}

	const [result$, updateResult] = useState(result)

	return result$
}
