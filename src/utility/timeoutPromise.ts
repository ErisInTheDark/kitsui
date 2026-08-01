import { scheduleTimeout, type ScheduledTimeoutHandle } from "./timer";

export interface DeferredTimeoutHandle {
	cancel (): void;
}

export function scheduleTimeoutPromise (callback: () => void): DeferredTimeoutHandle {
	let active = true;
	let timeoutHandle: ScheduledTimeoutHandle | null = null;

	const timeoutPromise = new Promise<void>((resolve) => {
		timeoutHandle = scheduleTimeout(resolve, 0);
	});

	void timeoutPromise.then(() => {
		const scheduledTimeout = timeoutHandle;
		timeoutHandle = null;
		scheduledTimeout?.cancel();

		if (!active) {
			return;
		}

		active = false;

		try {
			callback();
		} catch (error) {
			// Rethrow outside the promise chain so failures stay uncaught.
			queueMicrotask(() => {
				throw error;
			});
		}
	});

	return {
		cancel (): void {
			if (!active) {
				return;
			}

			active = false;

			if (timeoutHandle === null) {
				return;
			}

			timeoutHandle.cancel();
			timeoutHandle = null;
		},
	};
}
