export function isAsyncIterable(f: unknown): f is AsyncIterable<unknown> {
	return Boolean(f) && (typeof f === "object" || typeof f === "function") && typeof (f as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
}
