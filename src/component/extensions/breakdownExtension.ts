import { Owner, State, type CleanupFunction } from "../../state/State";
import { Component, type ComponentStaticExtensions } from "../Component";

type BreakdownPartBuilder<TPart> = (state: State<TPart>) => Component;
type StatelessBreakdownPartBuilder = () => Component;
type BreakdownPartRegistrar = {
	<TPart> (key: PropertyKey, value: TPart, build: BreakdownPartBuilder<TPart>): Component;
	(key: PropertyKey, build: StatelessBreakdownPartBuilder): Component;
};
type BreakdownRenderer<TValue> = (Part: BreakdownPartRegistrar, value: TValue) => void;

type BreakdownConstructor = {
	<TValue> (owner: Owner, state: State<TValue>, breakdown: BreakdownRenderer<TValue>): CleanupFunction;
};

type PartRecord<TPart = unknown> = {
	component: Component;
	state?: State<TPart>;
};

declare module "../Component" {
	interface ComponentStaticExtensions {
		/**
		 * Breaks a source state into keyed reusable parts owned by the provided owner.
		 *
		 * Each unique key creates a component once. Later breakdown passes reuse that component,
		 * update its per-part state, and let callers reposition it through normal placement APIs.
		 *
		 * Parts omitted from a later pass are removed and their part state is disposed.
		 *
		 * @param owner The owner that explicitly owns every created part.
		 * @param state The source state to break down on each update.
		 * @param breakdown Called immediately and on each source update to register keyed parts.
		 * @returns A cleanup function that stops the breakdown and disposes its parts.
		 */
		Breakdown: BreakdownConstructor;
	}
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

const createOwnedState = State as unknown as <T>(owner: Owner, initialValue: T) => State<T>;

let componentClass: ReturnType<typeof Component.extend> | null = null;
let patched = false;

function getComponentClass (): ReturnType<typeof Component.extend> {
	componentClass ??= Component.extend();
	return componentClass;
}

function isStateLike<TValue> (value: unknown): value is State<TValue> {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const maybeState = value as Partial<State<TValue>>;
	return "value" in maybeState && typeof maybeState.subscribe === "function";
}

function isBreakdownKey (value: unknown): value is PropertyKey {
	return typeof value === "string" || typeof value === "number" || typeof value === "symbol";
}

function validateCreatedPartComponent (component: unknown): Component {
	if (!(component instanceof getComponentClass())) {
		throw new TypeError("Component.Breakdown part builders must return a Component.");
	}

	if (component.getOwner() !== null) {
		throw new Error("Component.Breakdown part builders must return an ownerless Component.");
	}

	if (component.element.parentNode !== null) {
		throw new Error("Component.Breakdown part builders must return an unplaced Component.");
	}

	return component;
}

/**
 * Registers the static Component.Breakdown helper.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export default function breakdownExtension (): void {
	if (patched) {
		return;
	}

	patched = true;

	const ComponentWithBreakdown = Component as typeof Component & ComponentStaticExtensions;
	const Breakdown = function Breakdown<TValue> (owner: Owner, state: State<TValue>, breakdown: BreakdownRenderer<TValue>): CleanupFunction {
		if (!(owner instanceof Owner)) {
			throw new TypeError("Component.Breakdown requires an Owner as the first argument.");
		}

		if (!isStateLike<TValue>(state)) {
			throw new TypeError("Component.Breakdown requires a State as the second argument.");
		}

		if (typeof breakdown !== "function") {
			throw new TypeError("Component.Breakdown requires a breakdown function as the third argument.");
		}

		const parts = new Map<PropertyKey, PartRecord>();
		let active = true;
		let latestValue = state.value;
		let rendering = false;
		let rerenderQueued = false;
		let releaseOwnerCleanup: CleanupFunction = noop;
		let releaseStateSubscription: CleanupFunction = noop;

		const removePart = (key: PropertyKey, record: PartRecord | undefined = parts.get(key)) => {
			if (!record || parts.get(key) !== record) {
				return;
			}

			parts.delete(key);
			record.state?.dispose();
			record.component.remove();
		};

		const cleanup = () => {
			if (!active) {
				return;
			}

			active = false;
			releaseOwnerCleanup();
			releaseStateSubscription();

			for (const [key, record] of [...parts]) {
				removePart(key, record);
			}
		};

		const render = () => {
			if (!active) {
				return;
			}

			if (rendering) {
				rerenderQueued = true;
				return;
			}

			rendering = true;

			try {
				do {
					rerenderQueued = false;
					const currentValue = latestValue;
					const seenKeys = new Set<PropertyKey>();

					const Part: BreakdownPartRegistrar = <TPart> (key: PropertyKey, valueOrBuild: TPart | StatelessBreakdownPartBuilder, maybeBuild?: BreakdownPartBuilder<TPart>): Component => {
						if (!isBreakdownKey(key)) {
							throw new TypeError("Component.Breakdown part keys must be strings, numbers, or symbols.");
						}

						const isStateless = maybeBuild === undefined;
						const build = (isStateless ? valueOrBuild : maybeBuild) as StatelessBreakdownPartBuilder | BreakdownPartBuilder<TPart>;

						if (typeof build !== "function") {
							throw new TypeError("Component.Breakdown parts require a builder function.");
						}

						if (seenKeys.has(key)) {
							throw new Error(`Component.Breakdown registered the key ${String(key)} more than once in a single pass.`);
						}

						seenKeys.add(key);

						const existing = parts.get(key) as PartRecord<TPart> | undefined;
						if (existing) {
							if (!isStateless) {
								existing.state?.set(valueOrBuild as TPart);
							}
							return existing.component;
						}

						let component: Component;
						let partState: State<TPart> | undefined;

						try {
							if (isStateless) {
								component = validateCreatedPartComponent((build as StatelessBreakdownPartBuilder)());
							}
							else {
								partState = createOwnedState(owner, valueOrBuild as Exclude<TPart, undefined>) as unknown as State<TPart>;
								component = validateCreatedPartComponent((build as BreakdownPartBuilder<TPart>)(partState!));
							}
						} catch (error) {
							partState?.dispose();
							throw error;
						}

						component.setOwner(owner);
						const record: PartRecord<TPart> = {
							component,
							state: partState,
						};
						parts.set(key, record);

						const releaseComponentCleanup = component.onCleanup(() => {
							if (parts.get(key) !== record) {
								return;
							}

							parts.delete(key);
							partState?.dispose();
						});

						partState?.onCleanup(() => {
							releaseComponentCleanup();
						});

						return component;
					};

					breakdown(Part, currentValue);

					for (const [key, record] of [...parts]) {
						if (seenKeys.has(key)) {
							continue;
						}

						removePart(key, record);
					}
				} while (active && rerenderQueued);
			} finally {
				rendering = false;
			}
		};

		releaseOwnerCleanup = owner.onCleanup(cleanup);
		releaseStateSubscription = state.subscribe(owner, (value) => {
			latestValue = value;
			render();
		});

		render();
		return cleanup;
	} as BreakdownConstructor;

	ComponentWithBreakdown.Breakdown = Breakdown;
}