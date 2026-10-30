import { scheduleTimeout, type ScheduledTimeoutHandle } from "./timer";

/** Verifies a target once, after the tick it was scheduled in settles. */
export type NextTickCheck<TARGET extends object> = (target: TARGET) => void;

type AnyCheck = NextTickCheck<object>;

interface Batch {
	readonly checks: Map<object, AnyCheck>;
	timer: ScheduledTimeoutHandle | null;
}

let pending: Batch | null = null;
let running: Map<object, AnyCheck> | null = null;

function flush (batch: Batch): void {
	if (pending !== batch) {
		return;
	}

	pending = null;
	batch.timer = null;
	const checks = batch.checks;
	running = checks;

	try {
		for (const [target, check] of checks) {
			checks.delete(target);
			try {
				check(target);
			} catch (error) {
				// Rethrow outside the batch so one failed check neither stops the others nor goes unreported.
				queueMicrotask(() => {
					throw error;
				});
			}
		}
	} finally {
		running = null;
	}
}

function startBatch (): Batch {
	const batch: Batch = { checks: new Map(), timer: null };
	void new Promise<void>((resolve) => {
		batch.timer = scheduleTimeout(resolve, 0);
	}).then(() => flush(batch));
	return batch;
}

/**
 * Runs `check(target)` once after the current tick, batched with every other check scheduled before then.
 * Scheduling a target that already has a pending check keeps the existing check.
 */
export function scheduleNextTickCheck<TARGET extends object> (target: TARGET, check: NextTickCheck<TARGET>): void {
	if (isNextTickCheckScheduled(target)) {
		return;
	}

	pending ??= startBatch();
	pending.checks.set(target, check as AnyCheck);
}

/** Cancels the target's pending check; nothing runs unless it is scheduled again. */
export function cancelNextTickCheck (target: object): void {
	running?.delete(target);

	const batch = pending;
	if (batch === null || !batch.checks.delete(target) || batch.checks.size > 0) {
		return;
	}

	// Release the shared timer as soon as nothing is waiting on it.
	pending = null;
	batch.timer?.cancel();
	batch.timer = null;
}

/** Runs every pending check now instead of after the tick. */
export function flushNextTickChecks (): void {
	const batch = pending;
	if (batch === null) {
		return;
	}

	batch.timer?.cancel();
	flush(batch);
}

export function hasPendingNextTickChecks (): boolean {
	return pending !== null && pending.checks.size > 0;
}

export function isNextTickCheckScheduled (target: object): boolean {
	return pending?.checks.has(target) === true || running?.has(target) === true;
}
