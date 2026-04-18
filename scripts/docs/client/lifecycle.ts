const pageCleanupCallbacks = new Set<() => void>();

export function registerPageCleanup (callback: () => void): () => void {
	pageCleanupCallbacks.add(callback);

	return () => {
		pageCleanupCallbacks.delete(callback);
	};
}

export function runPageCleanup (): void {
	for (const callback of [...pageCleanupCallbacks]) {
		try {
			callback();
		} catch (error) {
			console.error(error);
		}
	}

	pageCleanupCallbacks.clear();
}