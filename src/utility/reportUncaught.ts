/**
 * Surfaces an error as uncaught without throwing into the current call stack,
 * so the caller keeps running while the error still reaches error reporting.
 */
export function reportUncaught (error: unknown): void {
	queueMicrotask(() => {
		throw error;
	});
}
