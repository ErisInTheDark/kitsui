export interface DeferredTimeoutHandle {
	cancel (): void;
}

export function scheduleTimeoutPromise (callback: () => void): DeferredTimeoutHandle {
	let active = true;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const timeoutPromise = new Promise<void>((resolve) => {
		timeoutId = setTimeout(resolve, 0);
	});

	void timeoutPromise.then(() => {
		timeoutId = null;

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

			if (timeoutId === null) {
				return;
			}

			clearTimeout(timeoutId);
			timeoutId = null;
		},
	};
}