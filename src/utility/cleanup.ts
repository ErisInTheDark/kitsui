export type CleanupStep = () => void;

export function runCleanupSteps (cleanupSteps: Iterable<CleanupStep>): void {
	let firstError: unknown;
	let failed = false;

	for (const cleanupStep of cleanupSteps) {
		try {
			cleanupStep();
		} catch (error) {
			if (!failed) {
				failed = true;
				firstError = error;
			}
		}
	}

	if (failed) {
		throw firstError;
	}
}

export function cleanupAndRethrow (error: unknown, cleanup: CleanupStep): never {
	try {
		cleanup();
	} catch (cleanupError) {
		let attached = false;
		try {
			if (error instanceof Error) {
				if (error.cause === undefined) {
					error.cause = cleanupError;
					attached = error.cause === cleanupError;
				}
			}
		} catch { }

		if (!attached) {
			try {
				console.error("Structural rollback cleanup failed.", cleanupError);
			} catch { }
		}
	}

	throw error;
}
