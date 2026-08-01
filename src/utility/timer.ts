/** A cancellable callback scheduled on kitsui's shared deadline timer. */
export interface ScheduledTimeoutHandle {
	cancel (): void;
}

interface ScheduledTimeout {
	callback: (() => void) | null;
	deadline: number;
	heapIndex: number;
	sequence: number;
}

const maximumNativeTimeout = 2_147_483_647;
const scheduledTimeouts: ScheduledTimeout[] = [];

let activeNativeTimeout: ReturnType<typeof setTimeout> | null = null;
let nextSequence = 0;

function compareTimeouts (left: ScheduledTimeout, right: ScheduledTimeout): number {
	return left.deadline - right.deadline || left.sequence - right.sequence;
}

function swapTimeouts (leftIndex: number, rightIndex: number): void {
	const left = scheduledTimeouts[leftIndex];
	const right = scheduledTimeouts[rightIndex];

	scheduledTimeouts[leftIndex] = right;
	scheduledTimeouts[rightIndex] = left;
	left.heapIndex = rightIndex;
	right.heapIndex = leftIndex;
}

function bubbleUp (startIndex: number): void {
	let index = startIndex;

	while (index > 0) {
		const parentIndex = Math.floor((index - 1) / 2);

		if (compareTimeouts(scheduledTimeouts[parentIndex], scheduledTimeouts[index]) <= 0) {
			return;
		}

		swapTimeouts(parentIndex, index);
		index = parentIndex;
	}
}

function bubbleDown (startIndex: number): void {
	let index = startIndex;

	while (true) {
		const leftIndex = index * 2 + 1;
		const rightIndex = leftIndex + 1;
		let smallestIndex = index;

		if (leftIndex < scheduledTimeouts.length && compareTimeouts(scheduledTimeouts[leftIndex], scheduledTimeouts[smallestIndex]) < 0) {
			smallestIndex = leftIndex;
		}

		if (rightIndex < scheduledTimeouts.length && compareTimeouts(scheduledTimeouts[rightIndex], scheduledTimeouts[smallestIndex]) < 0) {
			smallestIndex = rightIndex;
		}

		if (smallestIndex === index) {
			return;
		}

		swapTimeouts(index, smallestIndex);
		index = smallestIndex;
	}
}

function removeTimeoutAt (index: number): ScheduledTimeout {
	const removed = scheduledTimeouts[index];
	const replacement = scheduledTimeouts.pop();

	removed.heapIndex = -1;

	if (replacement === undefined || replacement === removed) {
		return removed;
	}

	scheduledTimeouts[index] = replacement;
	replacement.heapIndex = index;

	if (index > 0 && compareTimeouts(replacement, scheduledTimeouts[Math.floor((index - 1) / 2)]) < 0) {
		bubbleUp(index);
	}
	else {
		bubbleDown(index);
	}

	return removed;
}

function clearNativeTimeout (): void {
	if (activeNativeTimeout === null) {
		return;
	}

	clearTimeout(activeNativeTimeout);
	activeNativeTimeout = null;
}

function armNextTimeout (): void {
	clearNativeTimeout();

	const nextTimeout = scheduledTimeouts[0];

	if (!nextTimeout) {
		return;
	}

	const remaining = Math.max(0, nextTimeout.deadline - performance.now());
	const delay = Math.min(maximumNativeTimeout, Math.ceil(remaining));
	activeNativeTimeout = setTimeout(runDueTimeouts, delay);
}

function runDueTimeouts (): void {
	activeNativeTimeout = null;

	const currentTime = performance.now();
	const callbacks: Array<() => void> = [];

	while (scheduledTimeouts[0]?.deadline <= currentTime) {
		const scheduledTimeout = removeTimeoutAt(0);
		const callback = scheduledTimeout.callback;
		scheduledTimeout.callback = null;

		if (callback) {
			callbacks.push(callback);
		}
	}

	armNextTimeout();

	for (const callback of callbacks) {
		try {
			callback();
		}
		catch (error) {
			queueMicrotask(() => {
				throw error;
			});
		}
	}
}

/**
 * Schedules a callback on kitsui's single adaptive deadline timer.
 * The native timer sleeps until the earliest registered deadline and turns off when no work remains.
 */
export function scheduleTimeout (callback: () => void, milliseconds: number): ScheduledTimeoutHandle {
	if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0) {
		throw new RangeError("Timeout duration must be a finite non-negative number.");
	}

	const currentTime = performance.now();
	const calculatedDeadline = currentTime + milliseconds;
	const scheduledTimeout: ScheduledTimeout = {
		callback,
		deadline: Number.isFinite(calculatedDeadline) ? calculatedDeadline : Number.MAX_VALUE,
		heapIndex: scheduledTimeouts.length,
		sequence: nextSequence++,
	};

	scheduledTimeouts.push(scheduledTimeout);
	bubbleUp(scheduledTimeout.heapIndex);

	if (scheduledTimeout.heapIndex === 0) {
		armNextTimeout();
	}

	return {
		cancel (): void {
			if (scheduledTimeout.heapIndex < 0) {
				return;
			}

			const wasNext = scheduledTimeout.heapIndex === 0;
			scheduledTimeout.callback = null;
			removeTimeoutAt(scheduledTimeout.heapIndex);

			if (wasNext) {
				armNextTimeout();
			}
		},
	};
}
