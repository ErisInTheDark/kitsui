import { Owner, State, type CleanupFunction, type StateOptions } from "../State";

type Nullish = null;

/** Maps a source state value, and optionally its previous value, into a derived value. */
export type Mapper<T, TMapped> = (value: T, oldValue?: T) => TMapped;

/** A mapped state that can be manually recomputed when external mapping inputs change. */
export interface RecomputableState<T> extends State<T> {
	/**
	 * Recomputes the current value of the state by reapplying all mapping and transformation functions.
	 * Useful when external conditions affecting the mapped values have changed and a manual update is needed.
	 */
	recompute (): void;
}

type ImplicitOwnerLinkedState = State<unknown> & {
	_registerImplicitOwnerDependent?: (dependent: State<unknown>) => CleanupFunction;
};

declare module "../State" {
	interface StateExtensions<T> {
		/**
		 * Creates a new ownerless state containing the mapped value of this state.
		 * The mapped state subscribes to changes in the source and automatically updates.
		 * The mapped state must gain an owner before the next tick.
		 * @param mapValue Function that transforms each value from the source state.
		 * @returns A new ownerless state with the transformed values.
		 */
		map<TMapped> (mapValue: Mapper<T, TMapped>): RecomputableState<TMapped>;

		/**
		 * Creates a new state containing the mapped value of this state.
		 * The mapped state subscribes to changes in the source and automatically updates.
		 * @param owner The owner responsible for managing the mapped state's lifecycle.
		 * @param mapValue Function that transforms each value from the source state.
		 * @returns A new state with the transformed values.
		 */
		map<TMapped> (owner: Owner, mapValue: Mapper<T, TMapped>): RecomputableState<TMapped>;

		/**
		 * A boolean state indicating whether the current value is truthy.
		 * The value is memoized per state instance for efficiency.
		 */
		readonly truthy: State<boolean>;

		/**
		 * A boolean state indicating whether the current value is falsy.
		 * The value is memoized per state instance for efficiency.
		 */
		readonly falsy: State<boolean>;

		/**
		 * Returns a state that falls back to a computed value when this state is null.
		 * Otherwise, returns the original value.
		 * @param getValue Function invoked to compute the fallback value when needed.
		 * @returns A new state with the original or fallback value.
		 */
		or<TFallback> (getValue: () => TFallback): RecomputableState<Exclude<T, Nullish> | TFallback>;

		/**
		 * Returns a boolean state that is true when this state equals the provided value.
		 * Uses strict equality (===) for comparison.
		 * @param compareValue The value to compare against the current state value.
		 * @returns A new state that is true when the values are strictly equal, false otherwise.
		 */
		equals (compareValue: T): State<boolean>;
	}
}

const truthyStates = new WeakMap<State<unknown>, State<boolean>>();
const falsyStates = new WeakMap<State<unknown>, State<boolean>>();

const createOwnedState = State as unknown as <T>(owner: Owner, initialValue: T, options?: StateOptions<T>) => State<T>;
const createOwnerlessState = State as unknown as <T>(initialValue: T, options?: StateOptions<T>) => State<T>;

let patched = false;

function createMappedState<T, TMapped> (
	source: State<T>,
	owner: Owner | null,
	mapValue: Mapper<T, TMapped>,
): RecomputableState<TMapped> {
	const graphOption = {
		graph: source.getGraph(),
	};
	const mapped = (owner
		? createOwnedState(owner, mapValue(source.value) as Exclude<TMapped, undefined>, graphOption as StateOptions<Exclude<TMapped, undefined>>)
		: createOwnerlessState(mapValue(source.value) as Exclude<TMapped, undefined>, graphOption as StateOptions<Exclude<TMapped, undefined>>)
	) as unknown as RecomputableState<TMapped>;
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

/**
 * Extends the State class with mapping and transformation methods.
 * This extension adds the {@link StateExtensions.map}, {@link StateExtensions.truthy},
 * {@link StateExtensions.falsy}, and {@link StateExtensions.or} methods to all State instances.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export default function mappingExtension (): void {
	if (patched) {
		return;
	}

	patched = true;

	const StateClass = State.extend<unknown>();
	const prototype = StateClass.prototype;

	prototype.map = function map<TMapped> (ownerOrMapValue: Owner | (Mapper<unknown, TMapped>), maybeMapValue?: Mapper<unknown, TMapped>): RecomputableState<TMapped> {
		if (ownerOrMapValue instanceof Owner) {
			return createMappedState(this, ownerOrMapValue, maybeMapValue!);
		}

		return createMappedState(this, null, ownerOrMapValue);
	};

	Object.defineProperty(prototype, "truthy", {
		configurable: true,
		enumerable: false,
		get (this: State<unknown>): State<boolean> {
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
		get (this: State<unknown>): State<boolean> {
			let mapped = falsyStates.get(this);

			if (!mapped) {
				mapped = createMappedState(this, this, (value) => !value);
				falsyStates.set(this, mapped);
			}

			return mapped;
		},
	});

	prototype.or = function or<TFallback> (getValue: () => TFallback): RecomputableState<unknown | TFallback> {
		return createMappedState<unknown, unknown | TFallback>(this, this, (value) => {
			if (value === null) {
				return getValue();
			}

			return value;
		});
	};

	prototype.equals = function equals (compareValue: unknown): State<boolean> {
		return createMappedState(this, this, (value) => value === compareValue);
	};
}