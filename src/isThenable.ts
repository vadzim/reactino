export function isThenable(value: unknown): value is PromiseLike<unknown> {
	return Boolean(value) && (typeof value === "object" || typeof value === "function") && typeof (value as PromiseLike<unknown>).then === "function"
}
