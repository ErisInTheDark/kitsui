import { vi } from "vitest";
import { flushNextTickChecks, hasPendingNextTickChecks } from "../../src/utility/nextTickCheck";

export interface OrphanCheckCapture {
	/** Runs the pending next-tick orphan checks now, or null when none are scheduled. */
	readonly orphanCheck: (() => void) | null;
	/** The latest deferred rethrow queued by a failed check. */
	readonly queuedError: (() => void) | null;
	restore (): void;
}

/**
 * Takes control of next-tick orphan checks: timers never fire on their own, checks run when the test calls
 * `orphanCheck`, and the uncaught rethrow of a failed check is captured instead of reported.
 */
export function captureOrphanCheck (): OrphanCheckCapture {
	let queuedError: (() => void) | null = null;
	const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback: VoidFunction) => {
		queuedError = callback as () => void;
	});

	// Settle checks left behind by earlier tests so this capture only observes its own.
	flushNextTickChecks();
	queuedError = null;

	const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((() => 0) as unknown as typeof setTimeout);

	return {
		get orphanCheck (): (() => void) | null {
			return hasPendingNextTickChecks() ? flushNextTickChecks : null;
		},
		get queuedError (): (() => void) | null {
			return queuedError;
		},
		restore (): void {
			queueMicrotaskSpy.mockRestore();
			setTimeoutSpy.mockRestore();
		},
	};
}
