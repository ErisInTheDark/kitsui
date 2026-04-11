import { Owner, State } from "../State";

type Nullish = null | undefined;

declare module "../State" {
	interface StateExtensions<TValue> {
		/**
		 * Creates a new state containing the mapped value of this state.
		 * The mapped state subscribes to changes in the source and automatically updates.
		 * @param owner The owner responsible for managing the mapped state's lifecycle.
		 * @param mapValue Function that transforms each value from the source state.
		 * @returns A new state with the transformed values.
		 */
		map<TMapped> (owner: Owner, mapValue: (value: TValue) => TMapped): State<TMapped>;

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
		 * Returns a state that falls back to a computed value when this state is null or undefined.
		 * Otherwise, returns the original value.
		 * @param getValue Function invoked to compute the fallback value when needed.
		 * @returns A new state with the original or fallback value.
		 */
		or<TFallback> (getValue: () => TFallback): State<Exclude<TValue, Nullish> | TFallback>;
	}
}

const truthyStates = new WeakMap<State<unknown>, State<boolean>>();
const falsyStates = new WeakMap<State<unknown>, State<boolean>>();

let patched = false;

function createMappedState<TValue, TMapped> (
	source: State<TValue>,
	owner: Owner,
	mapValue: (value: TValue) => TMapped,
): State<TMapped> {
	const mapped = State(owner, mapValue(source.value), {
		graph: source.getGraph(),
	} as Parameters<typeof State>[2]);
	const releaseSourceSubscription = source.subscribeImmediate(mapped, (value) => {
		mapped.set(mapValue(value));
	});
	const releaseSourceCleanup = source.onCleanup(() => {
		mapped.dispose();
	});

	mapped.onCleanup(() => {
		releaseSourceCleanup();
		releaseSourceSubscription();
	});

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
	type StatePrototype = State<unknown> & {
		map<TMapped> (owner: Owner, mapValue: (value: unknown) => TMapped): State<TMapped>;
		or<TFallback> (getValue: () => TFallback): State<TFallback | unknown>;
	};
	const prototype = StateClass.prototype as StatePrototype;

	prototype.map = function map<TMapped> (owner: Owner, mapValue: (value: unknown) => TMapped): State<TMapped> {
		return createMappedState(this, owner, mapValue);
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

	prototype.or = function or<TFallback> (getValue: () => TFallback): State<unknown | TFallback> {
		return createMappedState<unknown, unknown | TFallback>(this, this, (value) => {
			if (value === null || value === undefined) {
				return getValue();
			}

			return value;
		});
	};
}