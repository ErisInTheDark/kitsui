import { Owner, State } from "../State";

type Nullish = null | undefined;

declare module "../State" {
	interface StateExtensions<TValue> {
		map<TMapped> (owner: Owner, mapValue: (value: TValue) => TMapped): State<TMapped>;
		readonly truthy: State<boolean>;
		readonly falsy: State<boolean>;
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