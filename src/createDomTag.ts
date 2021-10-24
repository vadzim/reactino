import { JSDOM } from 'jsdom'
import { useConstant, useState, isAsyncState, isConstantState, isObservableState } from './asyncState'
import { objectState, entriesState } from './objectState'

const { window } = new JSDOM()

export function createDomTag<T extends { className?: string, style?: object }>(type: string, attributes: T, children: unknown) {
	if (Object.hasOwn(attributes, "class")) throw new Error("use className attribute name instead of class")

	if (Object.hasOwn(attributes, "style")) {
		attributes = { ...attributes, style: entriesState(Object.entries(attributes.style as object)) }
	}

	const attr = new Map(attributes && Object.entries(attributes))

	if (attr.has("style")) {
		const style = attr.get("style")
		if (style && !isAsyncState(style)) {

		}
	}

	const element = window.document.createElement(type)

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
}
