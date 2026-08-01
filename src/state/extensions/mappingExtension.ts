import { Owner, State, type CleanupFunction, type StateOptions } from "../State";

type Nullish = null;
type ComparableValue<T> = T | State.Readonly<T>;

/** Maps a source state value, and optionally its previous value, into a derived value. */
export type Mapper<T, TMapped> = (value: T, oldValue?: T) => TMapped;

/** The canonical immutable value used while an asynchronous mapping is pending. */
export const AsyncPending = Object.freeze({
	type: "pending",
} as const);

/** The canonical pending value type. */
export type AsyncPending = typeof AsyncPending;

/** A successfully resolved asynchronous mapping value. */
export interface AsyncResolved<T> {
	readonly type: "resolved";
	readonly value: T;
}

/** A rejected asynchronous mapping value. */
export interface AsyncRejected<E> {
	readonly type: "rejected";
	readonly error: E;
}

/** The pending, resolved, or rejected result of the latest asynchronous mapping. */
export type AsyncResult<T, E> = AsyncPending | AsyncResolved<T> | AsyncRejected<E>;

/** A resolved or rejected asynchronous mapping result. */
export type AsyncSettled<T, E> = AsyncResolved<T> | AsyncRejected<E>;

/** A readonly latest-only asynchronous mapping State. */
export interface AsyncState<T, E> extends State.Readonly<AsyncResult<T, E>> {
	/**
	 * The latest accepted resolved or rejected result, or `null` before the first settlement.
	 * Starting a newer evaluation does not clear this State.
	 */
	readonly lastSettled: State.Readonly<AsyncSettled<T, E> | null>;
}

/** A mapped state that can be manually recomputed when external mapping inputs change. */
export interface RecomputableState<T> extends State.Readonly<T> {
	/**
	 * Recomputes the current value of the state by reapplying all mapping and transformation functions.
	 * Useful when external conditions affecting the mapped values have changed and a manual update is needed.
	 */
	recompute (): void;
}

type MutableRecomputableState<T> = State<T> & RecomputableState<T>;
type MutableAsyncState<T, E> = State<AsyncResult<T, E>> & AsyncState<T, E>;

type ImplicitOwnerLinkedState = State<unknown> & {
	_registerImplicitOwnerDependent?: (dependent: State.Readonly<unknown>) => CleanupFunction;
};

declare module "../State" {
	interface StateExtensions<T> {
		/**
		 * Creates a new ownerless state containing the mapped value of this state.
		 * The mapped state subscribes to changes in the source and automatically updates.
		 * The mapped state must gain an owner before the next tick.
		 * @param mapValue Function that transforms each value from the source state.
		 * @param options Optional state configuration for the mapped state.
		 * @returns A new ownerless state with the transformed values.
		 */
		map<TMapped> (mapValue: Mapper<T, TMapped>, options?: StateOptions<TMapped>): RecomputableState<TMapped>;

		/**
		 * Creates a new state containing the mapped value of this state.
		 * The mapped state subscribes to changes in the source and automatically updates.
		 * @param owner The owner responsible for managing the mapped state's lifecycle.
		 * @param mapValue Function that transforms each value from the source state.
		 * @param options Optional state configuration for the mapped state.
		 * @returns A new state with the transformed values.
		 */
		map<TMapped> (owner: Owner, mapValue: Mapper<T, TMapped>, options?: StateOptions<TMapped>): RecomputableState<TMapped>;

		/**
		 * Maps the latest coalesced source value asynchronously.
		 * Superseded operations are aborted and ignored, and the returned State is disposed with the explicit owner.
		 * @param owner The owner responsible for the asynchronous mapping lifetime.
		 * @param mapper Maps a source value with a signal that aborts on supersession or disposal.
		 * @returns A readonly asynchronous State that begins with the canonical pending value.
		 */
		mapAsync<U, E = unknown> (owner: Owner, mapper: (value: T, signal: AbortSignal) => Promise<U>): AsyncState<U, E>;

		/**
		 * A boolean state indicating whether the current value is truthy.
		 * The value is memoized per state instance for efficiency.
		 */
		readonly truthy: RecomputableState<boolean>;

		/**
		 * A boolean state indicating whether the current value is falsy.
		 * The value is memoized per state instance for efficiency.
		 */
		readonly falsy: RecomputableState<boolean>;

		/**
		 * Returns a state that falls back to a computed value when this state is null.
		 * Otherwise, returns the original value.
		 * @param getValue Function invoked to compute the fallback value when needed.
		 * @param options Optional state configuration for the derived state.
		 * @returns A new state with the original or fallback value.
		 */
		or<TFallback> (getValue: () => TFallback, options?: StateOptions<Exclude<T, Nullish> | TFallback>): RecomputableState<Exclude<T, Nullish> | TFallback>;

		/**
		 * Returns a boolean state that is true when this state equals the provided value or state.
		 * Uses strict equality (===) for comparison.
		 * @param compareValue The value or state to compare against the current state value.
		 * @returns A new state that is true when the values are strictly equal, false otherwise.
		 */
		equals (compareValue: T | State.Readonly<T>): RecomputableState<boolean>;

		/**
		 * Returns a boolean state that is true when this state does not equal the provided value or state.
		 * Uses strict inequality (!==) for comparison.
		 * @param compareValue The value or state to compare against the current state value.
		 * @returns A new state that is true when the values are not strictly equal, false otherwise.
		 */
		notEquals (compareValue: T | State.Readonly<T>): RecomputableState<boolean>;
	}
}

const truthyStates = new WeakMap<State<unknown>, MutableRecomputableState<boolean>>();
const falsyStates = new WeakMap<State<unknown>, MutableRecomputableState<boolean>>();

const createOwnedState = State as unknown as <T>(owner: Owner, initialValue: T, options?: StateOptions<T>) => State<T>;
const createOwnerlessState = State as unknown as <T>(initialValue: T, options?: StateOptions<T>) => State<T>;

let patched = false;

function createMappedState<T, TMapped> (
	source: State<T>,
	owner: Owner | null,
	mapValue: Mapper<T, TMapped>,
	options?: StateOptions<TMapped>,
): MutableRecomputableState<TMapped> {
	const stateOptions = {
		...options,
		graph: source.getGraph(),
	};
	const mapped = (owner
		? createOwnedState(owner, mapValue(source.value) as Exclude<TMapped, undefined>, stateOptions as StateOptions<Exclude<TMapped, undefined>>)
		: createOwnerlessState(mapValue(source.value) as Exclude<TMapped, undefined>, stateOptions as StateOptions<Exclude<TMapped, undefined>>)
	) as unknown as MutableRecomputableState<TMapped>;
	const releaseImplicitOwnerPropagation = ((mapped as unknown as ImplicitOwnerLinkedState)._registerImplicitOwnerDependent?.(source)) ?? (() => undefined);
	const releaseSourceSubscription = source.subscribeImmediate(mapped, (value, oldValue) => {
		mapped.set(mapValue(value, oldValue));
	});
	const releaseSourceCleanup = source.onCleanup(() => {
		mapped.dispose();
	});

	mapped.onCleanup(() => {
		releaseImplicitOwnerPropagation();
		releaseSourceCleanup();
		releaseSourceSubscription();
	});

	mapped.recompute = () => {
		mapped.set(mapValue(source.value, source.value));
	};

	return mapped;
}

function createAsyncMappingState<T, U, E> (
	source: State<T>,
	owner: Owner,
	mapper: (value: T, signal: AbortSignal) => Promise<U>,
): AsyncState<U, E> {
	const graphOptions = {
		graph: source.getGraph(),
	};
	const asyncState = createOwnedState<AsyncResult<U, E>>(owner, AsyncPending, graphOptions as StateOptions<AsyncResult<U, E>>) as MutableAsyncState<U, E>;
	const lastSettled = createOwnedState<AsyncSettled<U, E> | null>(asyncState, null, graphOptions as StateOptions<AsyncSettled<U, E> | null>);

	Object.defineProperty(asyncState, "lastSettled", {
		configurable: false,
		enumerable: false,
		value: lastSettled as State.Readonly<AsyncSettled<U, E> | null>,
		writable: false,
	});

	let generation = 0;
	let activeController: AbortController | null = null;

	const evaluate = (value: T): void => {
		if (asyncState.disposed) {
			return;
		}

		const currentGeneration = ++generation;
		activeController?.abort();

		const operationController = new AbortController();
		activeController = operationController;
		const signal = AbortSignal.any([
			asyncState.signal,
			operationController.signal,
		]);

		asyncState.set(AsyncPending);

		const acceptsSettlement = (): boolean => currentGeneration === generation
			&& activeController === operationController
			&& !signal.aborted
			&& !asyncState.disposed;

		void Promise.resolve()
			.then(() => {
				if (!acceptsSettlement()) {
					return undefined;
				}

				return mapper(value, signal);
			})
			.then((mappedValue) => {
				if (!acceptsSettlement()) {
					return;
				}

				activeController = null;
				const settled: AsyncResolved<U> = {
					type: "resolved",
					value: mappedValue as U,
				};
				asyncState.set(settled);

				if (!lastSettled.disposed) {
					lastSettled.set(settled);
				}
			}, (error: unknown) => {
				if (!acceptsSettlement()) {
					return;
				}

				activeController = null;
				const settled: AsyncRejected<E> = {
					error: error as E,
					type: "rejected",
				};
				asyncState.set(settled);

				if (!lastSettled.disposed) {
					lastSettled.set(settled);
				}
			});
	};

	const releaseSourceSubscription = source.subscribe(asyncState, (value) => {
		evaluate(value);
	});
	const releaseSourceCleanup = source.onCleanup(() => {
		asyncState.dispose();
	});

	asyncState.onCleanup(() => {
		generation++;
		activeController?.abort();
		activeController = null;
		releaseSourceCleanup();
		releaseSourceSubscription();
	});

	evaluate(source.value);

	return asyncState;
}

function createComparisonState<T> (
	source: State<T>,
	compareValue: ComparableValue<T>,
	compare: (value: T, otherValue: T) => boolean,
): MutableRecomputableState<boolean> {
	const comparator = compareValue instanceof State ? compareValue : null;
	const comparisonState = createMappedState(source, source, (value) => compare(value, (comparator?.value ?? compareValue) as T));

	if (!comparator || comparator === source) {
		return comparisonState;
	}

	const releaseComparatorImplicitOwnerPropagation = ((comparisonState as unknown as ImplicitOwnerLinkedState)._registerImplicitOwnerDependent?.(comparator)) ?? (() => undefined);
	const releaseComparatorSubscription = comparator.subscribeImmediate(comparisonState, () => {
		comparisonState.recompute();
	});

	comparisonState.onCleanup(() => {
		releaseComparatorImplicitOwnerPropagation();
		releaseComparatorSubscription();
	});

	return comparisonState;
}

/**
 * Extends the State class with synchronous and asynchronous mapping and transformation methods.
 * This extension adds the {@link StateExtensions.map}, {@link StateExtensions.mapAsync}, {@link StateExtensions.truthy},
 * {@link StateExtensions.falsy}, {@link StateExtensions.or}, {@link StateExtensions.equals},
 * and {@link StateExtensions.notEquals} methods to all State instances.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export default function mappingExtension (): void {
	if (patched) {
		return;
	}

	patched = true;

	const StateClass = State.extend<unknown>();
	const prototype = StateClass.prototype;

	prototype.map = function map<TMapped> (
		ownerOrMapValue: Owner | (Mapper<unknown, TMapped>),
		maybeMapValueOrOptions?: Mapper<unknown, TMapped> | StateOptions<TMapped>,
		maybeOptions?: StateOptions<TMapped>,
	): RecomputableState<TMapped> {
		if (ownerOrMapValue instanceof Owner) {
			return createMappedState(this, ownerOrMapValue, maybeMapValueOrOptions as Mapper<unknown, TMapped>, maybeOptions);
		}

		return createMappedState(this, null, ownerOrMapValue, maybeMapValueOrOptions as StateOptions<TMapped> | undefined);
	};

	prototype.mapAsync = function mapAsync<U, E = unknown> (
		owner: Owner,
		mapper: (value: unknown, signal: AbortSignal) => Promise<U>,
	): AsyncState<U, E> {
		return createAsyncMappingState(this, owner, mapper);
	};

	Object.defineProperty(prototype, "truthy", {
		configurable: true,
		enumerable: false,
		get (this: State<unknown>): RecomputableState<boolean> {
			let mapped = truthyStates.get(this);

			if (!mapped) {
				mapped = createMappedState(this, this, (value) => Boolean(value));
				truthyStates.set(this, mapped);
			}

			return mapped;
		},
	});

	Object.defineProperty(prototype, "falsy", {
		configurable: true,
		enumerable: false,
		get (this: State<unknown>): RecomputableState<boolean> {
			let mapped = falsyStates.get(this);

			if (!mapped) {
				mapped = createMappedState(this, this, (value) => !value);
				falsyStates.set(this, mapped);
			}

			return mapped;
		},
	});

	prototype.or = function or<TFallback> (
		getValue: () => TFallback,
		options?: StateOptions<unknown | TFallback>,
	): RecomputableState<unknown | TFallback> {
		return createMappedState<unknown, unknown | TFallback>(this, this, (value) => {
			if (value === null) {
				return getValue();
			}

			return value;
		}, options);
	};

	prototype.equals = function equals (compareValue: unknown): RecomputableState<boolean> {
		return createComparisonState(this, compareValue as ComparableValue<unknown>, (value, otherValue) => value === otherValue);
	};

	prototype.notEquals = function notEquals (compareValue: unknown): RecomputableState<boolean> {
		return createComparisonState(this, compareValue as ComparableValue<unknown>, (value, otherValue) => value !== otherValue);
	};
}
