/** @jsx _jsx */
/** @jsxFrag _jsxf */
// import { useState, use } from 'reactino'
import { asyncConstant, async } from './asyncState'
import { isAsyncIterable } from './isAsyncIterable'
import { createFuncTag } from './createFuncTag'
import { createDomTag } from './createDomTag'

declare global {
	namespace JSX {
		type HtmlProps<T extends { style: CSSStyleDeclaration }> = Partial<Omit<T, "style"> & {
			style: Partial<CSSStyleDeclaration>
		}>
		type IntrinsicElements = {
			[tag in keyof HTMLElementTagNameMap]: HtmlProps<HTMLElementTagNameMap[tag]>
		} & {
			[elemName in string]: HtmlProps<HTMLElement> & { [attrName in string]: unknown }
		}
	}
}

function _jsx<T extends keyof HTMLElementTagNameMap>(type: T, attributes: object, children: unknown): HTMLElementTagNameMap[T]
function _jsx(type: unknown, attributes: object = {}, children: unknown): unknown {
	const badKeys = Object.keys(attributes).filter(key => typeof key !== "string" || key.endsWith("$") || key.startsWith("$"))
	if (badKeys.length > 0) {
		throw new Error(`bad attribute name: ${badKeys}`)
	}

	if (typeof type === "string") {
		return createDomTag(type, attributes, children)
	}

	if (typeof type === "function") {
		return createFuncTag(type, attributes, children)
	}

	throw new Error("bad arguments")
}

function _jsxf(props: unknown): unknown {
	return undefined!
}

const x = <div style={{ width: "1" }} />
const x2 = <div2 xx="x" />
console.log(x.outerHTML)
console.log(x2.outerHTML)

type ComponentXProps = {
	path: string,
	color$: Value<number>,
}

function ComponentX({
	path,
	color$,
}: ComponentXProps) {

}

let insideSetter: boolean = false
let dirtyState: boolean = false
const dirtySubscriptions: CBRecord[] = []
let currentRecord: CBRecord | undefined
const updaters: unknown[] = []

function notifyChanges() {
	if (!dirtyState) {
		dirtyState = true
	}
}

function throwError(value: unknown): never {
	throw value
}

class Value<T = unknown> {
	links: CBLink[] = []
	trap: undefined | ((value: T) => T) = undefined
	value: unknown = undefined

	static create<T>(defaultValue: T): Value<T> {
		const ret = new Value<T>()
		ret.value = defaultValue
		return ret
	}

	static createDeferred<T>(trap: (value: T) => T): Value<T> {
		const ret = new Value<T>()
		ret.trap = trap
		return ret
	}

	read(): T {
		// if (nextValue === this && !this.trap) {
		// 	nextValue = currentRecord.links[++currentRecord.index].val
		// 	return this.value
		// }
		// return this.fullRead()
		if (currentRecord !== undefined) {
			currentRecord.notify(this as Value<unknown>)
			if (!this.trap) {
				return this.value as T
			}
			this.callTrap()
			return this.value as T
		}
		throw new Error("don't call outside of use() or useCallback() functions")
	}

	subscribe(cb: (value: T) => void): { unsubscribe(): void } {
		throw new Error("unimplemented: subscribe")
	}

	callTrap(): void {
		try {
			this.value = this.trap!(this.value as T)
			this.trap = undefined
		} catch (error) {
			this.value = error
			this.trap = throwError
			throw error
		}
	}

	assign(newValue: T): void {
		if (this.trap || this.value !== newValue) {
			this.trap = undefined
			this.value = newValue
			this.changed()
		}
	}

	throw(error: unknown): void {
		if (this.trap !== throwError || this.value !== error) {
			this.trap = throwError
			this.value = error
			this.changed()
		}
	}

	update(cb: (val: T) => T): void {
		let newValue
		try {
			newValue = cb(this.value as T)
		} catch (error) {
			this.throw(error)
			throw error
		}
		this.assign(newValue)
	}

	changed(): void {
		for (const link of this.links) {
			if (!link.rec.dirty) {
				link.rec.dirty = true
				dirtySubscriptions.push(link.rec)
				notifyChanges()
			}
		}
	}

	removeLink(link: CBLink): void {
		const { index } = link
		if (this.links[index] !== link) throw new Error("Wrong op")
		const last = this.links.pop()
		if (last !== link) {
			this.links[index] = last!
			last!.index = index
		}
	}

	addLink(link: CBLink) {
		link.index = this.links.length
		this.links.push(link)
	}
}

const endValue = new Value()
let nextValue = endValue

class CBLink {
	index: number = 0
	rec: CBRecord
	val: Value
	constructor(rec: CBRecord, val: Value) {
		this.rec = rec
		this.val = val
	}
}

class CBRecord {
	dirty: boolean = false
	links: CBLink[] = []
	current: number = 0

	notify(val: Value) {
		if (this.current < this.links.length) {
			if (this.links[this.current].val === val) {
				this.current++
				return
			}
			do {
				this.removeLink(this.links.pop()!)
			} while (this.current < this.links.length)
		}
		this.links.push(this.createLink(val))
		this.current++
	}

	createLink(val: Value): CBLink {
		const link = new CBLink(this, val)
		val.addLink(link)
		return link
	}

	removeLink(link: CBLink) {
		link.val.removeLink(link)
	}
}

type State<T> = [
	(() => T) & {
		subscribe(cb: (value: T) => void): {
			unsubscribe(): void
		}
	},
	(cb: (value: T) => T) => void,
]

function useState<T>(defaultValue: T): State<T>
function useState(): State<unknown>
function useState(defaultValue: unknown = undefined): State<unknown> {
	const val = new Value()
	val.value = arguments[0]

	const getter = () => {
		return val.read()
	}

	getter.subscribe = (cb: (value: unknown) => void): { unsubscribe(): void } => {
		return val.subscribe(cb)
	}

	const setter = (cb: (value: unknown) => unknown) => {
		updaters.push(() => val.update(cb))
		notifyChanges()
	}

	return [getter, setter]
}

function createCalculated<T>(cb: () => T): State<T>[0] {
	const rec = new CBRecord()
	const [result$, setResult] = useState<T>(undefined!)
	setResult(cb)

	const update = () => {
		let result
		try {
			result = cb()
		} finally {

		}
		setResult(result)
	}

	update()
	return result$
}

function use<T>(cb: () => T): State<T>[0] {
	return createCalculated<T>(() => {
		const ret = cb()
		if (ret && typeof ret === 'object' && ret instanceof Node) {
			throw "please use 'useReinstantiatingHTML' function for returning dom nodes"
		}
		return ret
	})
}

function useReinstantiatingHTML<T>(cb: () => T): State<T>[0] {
	return createCalculated<T>(cb)
}

function useCallback(cb: () => void) {
	// allow to call state$() inside cb
}

function App() {
	const [checked$, setChecked] = useState(true)
	const [count$, setCount] = useState(0)
	const doubleCount$ = use(() => `::${count$() * 2}::`)
	return (
		<div>
			{checked$}<br />
			{count$}<br />
			=={doubleCount$}==<br />
			<button onclick={() => setCount(count => count + 1)}>Increase</button><br />
			<input type="checkbox" checked={checked$} onClick={() => setChecked(checked => !checked)} /><br />
			{use(() => {
				if (checked$()) {
					return <div style={{ width: 40, height: 40, backgroundColor: 'read'}}></div>
				} else {
					return <>
						<div style={{ width: 40, height: 20, backgroundColor: 'green'}}></div>
						<div style={{ width: 40, height: 20, backgroundColor: 'blue'}}></div>
					</>
				}
			})}
		</div>
	)
}
