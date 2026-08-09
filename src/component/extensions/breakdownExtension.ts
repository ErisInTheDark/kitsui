import { Owner, State, type CleanupFunction } from "../../state/State";
import { cleanupAndRethrow, runCleanupSteps } from "../../utility/cleanup";
import { Component, type ComponentStaticExtensions } from "../Component";
import { beginDOMTreeTransaction, DOMTree } from "../DOMTree";

type BreakdownPartBuilder<TPart> = (state: State<TPart>) => Component;
type StatelessBreakdownPartBuilder = () => Component;
type BreakdownPartRegistrar = {
	<TPart> (key: PropertyKey, value: TPart, build: BreakdownPartBuilder<TPart>): Component;
	(key: PropertyKey, build: StatelessBreakdownPartBuilder): Component;
};
type BreakdownRenderer<TValue> = (Part: BreakdownPartRegistrar, value: TValue) => void;
type ComponentBreakdownRenderer<TValue, TComponent extends Component = Component> = (
	component: TComponent,
	Part: BreakdownPartRegistrar,
	value: TValue,
) => void;

type BreakdownConstructor = {
	<TValue> (owner: Owner, state: State.Readonly<TValue>, breakdown: BreakdownRenderer<TValue>): CleanupFunction;
};

type PartRecord<TPart = unknown> = {
	component: Component;
	state?: State<TPart>;
};

declare module "../Component" {
	interface ComponentExtensions {
		/**
		 * Renders keyed Components from a State and owns them with this Component.
		 *
		 * The initial render runs synchronously. Later State updates are queued, batched, and coalesced through State.subscribe.
		 * Virtual parent, order, containment, connectivity, and lifecycle intent update synchronously during the handler.
		 * Only physical DOM mutation and Mount wait until the handler returns.
		 * Async handlers, await, and Part or structural calls after the handler returns are unsupported.
		 *
		 * Kitsui structural APIs update the scoped virtual tree during the pass. Raw DOM operations and non-structural manipulators remain physical and immediate.
		 * Part only builds, registers, or reuses a Component; it never places that Component.
		 * Part builders must return an ownerless, unplaced Component root.
		 * The returned root must still be active.
		 * Explicitly place every returned part during each pass to establish its destination and order.
		 *
		 * If the handler throws, recorded structural intents still commit, omission reconciliation is skipped, and there is no rollback.
		 * After a successful pass, omitted parts are disposed and stale or disposed relative references are ignored.
		 * Placement does not transfer Breakdown lifetime.
		 *
		 * Mount fires once after the transaction closes and materializes. It means managed-parent placement, not document connectivity.
		 * Mount listeners run outside the Breakdown transaction, so their structural changes are separate and immediate.
		 * Nested Breakdown calls join the outer transaction.
		 *
		 * @param state The State that supplies each render value.
		 * @param breakdown The render callback.
		 * @returns This Component for chaining.
		 * @throws If a Part builder returns a non-Component, disposed, owned, or already placed root.
		 */
		breakdown<TValue> (this: Component, state: State.Readonly<TValue>, breakdown: ComponentBreakdownRenderer<TValue>): this;
	}

	interface ComponentStaticExtensions {
		/**
		 * Renders keyed Components from a State and owns them with the supplied owner.
		 *
		 * The initial render runs synchronously. Later State updates are queued, batched, and coalesced through State.subscribe.
		 * Virtual parent, order, containment, connectivity, and lifecycle intent update synchronously during the handler.
		 * Only physical DOM mutation and Mount wait until the handler returns.
		 * Async handlers, await, and Part or structural calls after the handler returns are unsupported.
		 *
		 * Kitsui structural APIs update the scoped virtual tree during the pass. Raw DOM operations and non-structural manipulators remain physical and immediate.
		 * Part only builds, registers, or reuses a Component; it never places that Component.
		 * Part builders must return an ownerless, unplaced Component root.
		 * The returned root must still be active.
		 * Explicitly place every returned part during each pass to establish its destination and order.
		 *
		 * If the handler throws, recorded structural intents still commit, omission reconciliation is skipped, and there is no rollback.
		 * After a successful pass, omitted parts are disposed and stale or disposed relative references are ignored.
		 * Placement does not transfer Breakdown lifetime.
		 *
		 * Mount fires once after the transaction closes and materializes. It means managed-parent placement, not document connectivity.
		 * Mount listeners run outside the Breakdown transaction, so their structural changes are separate and immediate.
		 * Nested Breakdown calls join the outer transaction.
		 *
		 * @param owner The Owner responsible for every keyed part.
		 * @param state The State that supplies each render value.
		 * @param breakdown The render callback.
		 * @returns A cleanup function that stops future renders and disposes all parts.
		 * @throws If a Part builder returns a non-Component, disposed, owned, or already placed root.
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

function isStateLike<TValue> (value: unknown): value is State.Readonly<TValue> {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const maybeState = value as Partial<State.Readonly<TValue>>;
	return "value" in maybeState && typeof maybeState.subscribe === "function";
}

function isBreakdownKey (value: unknown): value is PropertyKey {
	return typeof value === "string" || typeof value === "number" || typeof value === "symbol";
}

function validateCreatedPartComponent (component: unknown): Component {
	if (!(component instanceof getComponentClass())) {
		throw new TypeError("Component.Breakdown part builders must return a Component.");
	}

	if (component.disposed) {
		throw new Error("Component.Breakdown part builders must return an active Component.");
	}

	if (component.owner.get() !== null) {
		throw new Error("Component.Breakdown part builders must return an ownerless Component.");
	}

	if (DOMTree.parentOf(component.element) !== null) {
		throw new Error("Component.Breakdown part builders must return an unplaced Component.");
	}

	return component;
}

function ensureActive (component: Component): void {
	if (component.disposed) {
		throw new Error("Disposed components cannot be modified.");
	}
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
	const Breakdown = function Breakdown<TValue> (owner: Owner, state: State.Readonly<TValue>, breakdown: BreakdownRenderer<TValue>): CleanupFunction {
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
			runCleanupSteps([
				() => record.state?.dispose(),
				() => record.component.remove(),
			]);
		};

		const cleanup = () => {
			if (!active) {
				return;
			}

			active = false;
			runCleanupSteps([
				releaseOwnerCleanup,
				releaseStateSubscription,
				...[...parts].map(([key, record]) => () => removePart(key, record)),
			]);
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
					const treeTransaction = beginDOMTreeTransaction();
					let renderError: unknown;
					let renderFailed = false;

					try {
						const Part: BreakdownPartRegistrar = <TPart> (key: PropertyKey, valueOrBuild: TPart | StatelessBreakdownPartBuilder, maybeBuild?: BreakdownPartBuilder<TPart>): Component => {
							if (!isBreakdownKey(key)) {
								throw new TypeError("Component.Breakdown part keys must be strings, numbers, or symbols.");
							}

							const isStateless = maybeBuild === undefined;
							const build = (isStateless ? valueOrBuild : maybeBuild) as StatelessBreakdownPartBuilder | BreakdownPartBuilder<TPart>;

							if (typeof build !== "function") {
								throw new TypeError("Component.Breakdown parts require a builder function.");
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
								cleanupAndRethrow(error, () => partState?.dispose());
							}

							try {
								component.owner.add(owner);
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
							} catch (error) {
								const pendingRecord = parts.get(key);
								if (pendingRecord?.component === component) {
									parts.delete(key);
								}

								cleanupAndRethrow(error, () => runCleanupSteps([
									() => partState?.dispose(),
									() => component.remove(),
								]));
							}

							return component;
						};

						breakdown(Part, currentValue);

						runCleanupSteps([...parts]
							.filter(([key]) => !seenKeys.has(key))
							.map(([key, record]) => () => removePart(key, record)));
					} catch (error) {
						renderFailed = true;
						renderError = error;
					}

					try {
						treeTransaction.commit();
					} catch (commitError) {
						if (!renderFailed) {
							throw commitError;
						}

						try {
							console.error("Breakdown transaction commit failed after render cleanup.", commitError);
						} catch {
							// Preserve the render-side failure when error reporting itself fails.
						}
					}

					if (renderFailed) {
						throw renderError;
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

	const prototype = getComponentClass().prototype as Component;
	prototype.breakdown = function breakdown<TValue> (
		this: Component,
		state: State.Readonly<TValue>,
		breakdown: ComponentBreakdownRenderer<TValue>,
	): Component {
		ensureActive(this);
		Breakdown(this, state, (Part, value) => {
			breakdown(this, Part, value);
		});
		return this;
	};
}
