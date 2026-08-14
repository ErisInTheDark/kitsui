import { Owner, State, type CleanupFunction, type StateOptions } from "../State";
import { scheduleTimeout, type ScheduledTimeoutHandle } from "../../utility/timer";

type ImplicitOwnerLinkedState = State<unknown> & {
	_registerImplicitOwnerDependent?: (dependent: State.Readonly<unknown>) => CleanupFunction;
};

declare module "../State" {
	interface StateExtensions<T> {
		/**
		 * Creates an ownerless readonly state that waits until source changes stop for the requested duration.
		 * The initial value is available synchronously and later source changes are processed after queued State batching.
		 * @param milliseconds The quiet duration in milliseconds. Must be finite and non-negative.
		 * @returns A debounced readonly derivation that follows the normal implicit-owner lifecycle.
		 */
		debounce (milliseconds: number): State.Readonly<T>;

		/**
		 * Creates an explicitly owned readonly state that waits until source changes stop for the requested duration.
		 * The initial value is available synchronously and later source changes are processed after queued State batching.
		 * @param owner The owner responsible for managing the debounced state's lifecycle.
		 * @param milliseconds The quiet duration in milliseconds. Must be finite and non-negative.
		 * @returns A debounced readonly derivation owned by the provided owner.
		 */
		debounce (owner: Owner, milliseconds: number): State.Readonly<T>;

		/**
		 * Creates an ownerless readonly state that emits the first queued change immediately and then at most once per interval.
		 * The latest value received during an interval is emitted at its trailing boundary.
		 * @param milliseconds The throttle interval in milliseconds. Must be finite and non-negative.
		 * @returns A leading-and-trailing readonly derivation that follows the normal implicit-owner lifecycle.
		 */
		throttle (milliseconds: number): State.Readonly<T>;

		/**
		 * Creates an explicitly owned readonly state that emits the first queued change immediately and then at most once per interval.
		 * The latest value received during an interval is emitted at its trailing boundary.
		 * @param owner The owner responsible for managing the throttled state's lifecycle.
		 * @param milliseconds The throttle interval in milliseconds. Must be finite and non-negative.
		 * @returns A leading-and-trailing readonly derivation owned by the provided owner.
		 */
		throttle (owner: Owner, milliseconds: number): State.Readonly<T>;
	}
}

const createOwnedState = State as unknown as <T>(owner: Owner, initialValue: T, options?: StateOptions<T>) => State<T>;
const createOwnerlessState = State as unknown as <T>(initialValue: T, options?: StateOptions<T>) => State<T>;

let patched = false;

function validateDuration (milliseconds: number): void {
	if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0) {
		throw new RangeError("State duration must be a finite non-negative number.");
	}
}

function createDebouncedState<T> (source: State<T>, owner: Owner | null, milliseconds: number): State.Readonly<T> {
	validateDuration(milliseconds);

	const options = {
		graph: source.getGraph(),
	} as StateOptions<T>;
	const debounced = owner
		? createOwnedState(owner, source.value, options)
		: createOwnerlessState(source.value, options);
	let latestValue = source.value;
	let timeoutHandle: ScheduledTimeoutHandle | null = null;
	const releaseImplicitOwnerPropagation = ((debounced as unknown as ImplicitOwnerLinkedState)._registerImplicitOwnerDependent?.(source)) ?? (() => undefined);
	const releaseSourceSubscription = source.subscribe(debounced, (value) => {
		if (milliseconds === 0) {
			debounced.set(value);
			return;
		}

		latestValue = value;
		timeoutHandle?.cancel();
		timeoutHandle = scheduleTimeout(() => {
			timeoutHandle = null;

			if (!debounced.disposed) {
				debounced.set(latestValue);
			}
		}, milliseconds);
	});
	const releaseSourceCleanup = source.onCleanup(() => {
		debounced.dispose();
	});

	debounced.onCleanup(() => {
		timeoutHandle?.cancel();
		timeoutHandle = null;
		latestValue = debounced.value;
		releaseImplicitOwnerPropagation();
		releaseSourceCleanup();
		releaseSourceSubscription();
	});

	return debounced;
}

function createThrottledState<T> (source: State<T>, owner: Owner | null, milliseconds: number): State.Readonly<T> {
	validateDuration(milliseconds);

	const options = {
		graph: source.getGraph(),
	} as StateOptions<T>;
	const throttled = owner
		? createOwnedState(owner, source.value, options)
		: createOwnerlessState(source.value, options);
	let timeoutHandle: ScheduledTimeoutHandle | null = null;
	let trailingValue = source.value;
	let hasTrailingValue = false;

	const beginInterval = () => {
		timeoutHandle = scheduleTimeout(() => {
			timeoutHandle = null;

			if (throttled.disposed || !hasTrailingValue) {
				return;
			}

			const nextValue = trailingValue;
			hasTrailingValue = false;
			throttled.set(nextValue);
			beginInterval();
		}, milliseconds);
	};

	const releaseImplicitOwnerPropagation = ((throttled as unknown as ImplicitOwnerLinkedState)._registerImplicitOwnerDependent?.(source)) ?? (() => undefined);
	const releaseSourceSubscription = source.subscribe(throttled, (value) => {
		if (milliseconds === 0) {
			throttled.set(value);
			return;
		}

		if (timeoutHandle === null) {
			throttled.set(value);
			beginInterval();
			return;
		}

		trailingValue = value;
		hasTrailingValue = true;
	});
	const releaseSourceCleanup = source.onCleanup(() => {
		throttled.dispose();
	});

	throttled.onCleanup(() => {
		timeoutHandle?.cancel();
		timeoutHandle = null;
		hasTrailingValue = false;
		trailingValue = throttled.value;
		releaseImplicitOwnerPropagation();
		releaseSourceCleanup();
		releaseSourceSubscription();
	});

	return throttled;
}

/**
 * Extends State with queued debounce and leading-and-trailing throttle derivations.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export default function temporalExtension (): void {
	if (patched) {
		return;
	}

	patched = true;

	const StateClass = State.extend<unknown>();
	const prototype = StateClass.prototype;

	prototype.debounce = function debounce (ownerOrMilliseconds: Owner | number, maybeMilliseconds?: number): State.Readonly<unknown> {
		const owner = ownerOrMilliseconds instanceof Owner ? ownerOrMilliseconds : null;
		const milliseconds = typeof ownerOrMilliseconds === "number" ? ownerOrMilliseconds : maybeMilliseconds as number;
		return createDebouncedState(this, owner, milliseconds);
	};

	prototype.throttle = function throttle (ownerOrMilliseconds: Owner | number, maybeMilliseconds?: number): State.Readonly<unknown> {
		const owner = ownerOrMilliseconds instanceof Owner ? ownerOrMilliseconds : null;
		const milliseconds = typeof ownerOrMilliseconds === "number" ? ownerOrMilliseconds : maybeMilliseconds as number;
		return createThrottledState(this, owner, milliseconds);
	};
}
