import { isNextTickCheckScheduled, scheduleNextTickCheck } from "./nextTickCheck";

let tracing = false;
let traces = new WeakMap<object, Error>();

/**
 * Reported when a Component, Marker or State is still unmanaged after the tick it became unmanaged in.
 * `orphan` is the offending object, for debuggers and error reporters. While {@link traceOrphans} is on,
 * `cause` is an error whose stack shows where the orphan became unmanaged.
 */
export class OrphanError<ORPHAN extends object = object> extends Error {
	override readonly name = "OrphanError";

	constructor (readonly orphan: ORPHAN, message: string) {
		const trace = traces.get(orphan);
		super(message, trace ? { cause: trace } : undefined);
	}
}

/**
 * Records where each Component, Marker and State becomes unmanaged, so an {@link OrphanError} can point at that line
 * through its `cause`. Costs a stack capture per scheduled orphan check, so enable it while reproducing an orphan
 * error rather than leaving it on.
 */
export function traceOrphans (enabled: boolean): void {
	tracing = enabled;
	if (!enabled) {
		traces = new WeakMap();
	}
}

/** Schedules `target`'s next-tick orphan check, recording where when {@link traceOrphans} is on. */
export function scheduleOrphanCheck<TARGET extends object> (target: TARGET, check: (target: TARGET) => void): void {
	if (isNextTickCheckScheduled(target)) {
		return;
	}

	if (tracing) {
		traces.set(target, new Error("Became unmanaged here"));
	}

	scheduleNextTickCheck(target, check);
}
