/**
 * Function invoked during cleanup to release resources.
 */
export type CleanupFunction = () => void;

/**
 * Checks if two state values are considered equal.
 * @param currentValue The current state value.
 * @param nextValue The next state value.
 * @returns True if the values are equal, false otherwise.
 */
export type StateEqualityFunction<T> = (currentValue: T, nextValue: T) => boolean;

/**
 * Callback invoked when state value changes.
 * @param value The new state value.
 * @param previousValue The previous state value.
 */
export type StateListener<T> = (value: T, previousValue: T) => void;

/**
 * Function that transforms the current state value into a new value.
 * @param currentValue The current state value.
 * @returns The transformed state value.
 */
export type StateUpdater<T> = (currentValue: T) => T;

/**
 * Options for creating a new state instance.
 */
export interface StateOptions<T> {
	/**
	 * Custom equality function for comparing state values.
	 * Defaults to `Object.is` if not provided.
	 */
	equals?: StateEqualityFunction<T>;
}

/**
 * Protocol interface for extending State with additional methods and properties.
 * Modules can augment this interface to add custom behavior to all State instances.
 * @example
 * declare module "./State" {
 *   interface StateExtensions<T> {
 *     map<TMapped>(owner: Owner, fn: (val: T) => TMapped): State<TMapped>;
 *   }
 * }
 */
export interface StateExtensions<T> { }

/**
 * Constructor type for extending the State class with custom methods.
 * Used with {@link State.extend} to access and modify the State prototype.
 */
export type ExtendableStateClass<T = unknown> = (abstract new (...args: never[]) => State<T>) & {
	prototype: State<T>;
};

interface StateGraph {
	pendingListeners: Set<QueuedStateListenerRecord<unknown>>;
	scheduled: boolean;
}

interface ImmediateStateListenerRecord<T> {
	active: boolean;
	listener: StateListener<T>;
}

interface QueuedStateListenerRecord<T> {
	active: boolean;
	graph: StateGraph;
	listener: StateListener<T>;
	pending: boolean;
	pendingOriginalValue: T;
	pendingFinalValue: T;
	equals: StateEqualityFunction<T>;
}

/** @hidden */
type StateInternalOptions<T> = StateOptions<T> & {
	graph?: StateGraph;
};

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

function createStateGraph (): StateGraph {
	return {
		pendingListeners: new Set<QueuedStateListenerRecord<unknown>>(),
		scheduled: false,
	};
}

function scheduleGraphFlush (graph: StateGraph): void {
	if (graph.scheduled) {
		return;
	}

	graph.scheduled = true;
	const flush = () => {
		graph.scheduled = false;
		const pendingListeners = [...graph.pendingListeners];
		graph.pendingListeners.clear();

		for (const pendingListener of pendingListeners) {
			pendingListener.pending = false;

			if (!pendingListener.active) {
				continue;
			}

			if (pendingListener.equals(pendingListener.pendingOriginalValue, pendingListener.pendingFinalValue)) {
				continue;
			}

			pendingListener.listener(pendingListener.pendingFinalValue, pendingListener.pendingOriginalValue);
		}
	};

	const schedulerRef = globalThis as typeof globalThis & {
		scheduler?: {
			yield?: () => Promise<unknown>;
		};
	};

	if (typeof schedulerRef.scheduler?.yield === "function") {
		void schedulerRef.scheduler.yield().then(flush);
		return;
	}

	queueMicrotask(flush);
}

/**
 * Abstract base class for managing cleanup functions and resource disposal.
 * Owners can register cleanup functions that are invoked when the owner is disposed,
 * enabling a predictable lifecycle for dependent resources.
 */
export abstract class Owner {
	private readonly cleanupFunctions = new Set<CleanupFunction>();
	private disposedValue = false;

	/** @hidden */
	constructor () { }

	/**
	 * Whether this owner has been disposed.
	 * @readonly
	 */
	get disposed (): boolean {
		return this.disposedValue;
	}

	/**
	 * Disposes this owner and invokes all registered cleanup functions.
	 * Once disposed, an owner cannot be used again.
	 * Subsequent calls to `dispose()` are no-ops.
	 */
	dispose (): void {
		if (this.disposedValue) {
			return;
		}

		this.disposedValue = true;
		this.beforeDispose();

		const cleanupFunctions = [...this.cleanupFunctions];
		this.cleanupFunctions.clear();

		for (const cleanupFunction of cleanupFunctions) {
			cleanupFunction();
		}

		this.afterDispose();
	}

	/**
	 * Registers a cleanup function to be invoked when this owner is disposed.
	 * If the owner is already disposed, the cleanup function is invoked immediately.
	 * @param cleanupFunction Function to invoke during cleanup.
	 * @returns A function that unregisters the cleanup function. Calling it prevents the cleanup function from being invoked later.
	 */
	onCleanup (cleanupFunction: CleanupFunction): CleanupFunction {
		if (this.disposedValue) {
			cleanupFunction();
			return noop;
		}

		let active = true;
		const registeredCleanup = () => {
			if (!active) {
				return;
			}

			active = false;
			this.cleanupFunctions.delete(registeredCleanup);
			cleanupFunction();
		};

		this.cleanupFunctions.add(registeredCleanup);

		return () => {
			if (!active) {
				return;
			}

			active = false;
			this.cleanupFunctions.delete(registeredCleanup);
		};
	}

	/**
	 * Hook invoked before cleanup functions run during disposal.
	 * Subclasses may override to perform custom pre-disposal logic.
	 * @protected
	 */
	protected beforeDispose (): void {
		// Subclasses may override.
	}

	/**
	 * Hook invoked after all cleanup functions have run during disposal.
	 * Subclasses may override to perform custom post-disposal logic.
	 * @protected
	 */
	protected afterDispose (): void {
		// Subclasses may override.
	}
}

const orphanedStateErrorMessage = "States must have an owner before the next tick.";

/** @group State */
class StateClass<T> extends Owner {
	private owner: Owner | null;
	private releaseOwner: CleanupFunction = noop;
	private isImplicitOwner = false;
	private requiresExplicitOwner = false;
	private orphanCheckId: ReturnType<typeof setTimeout> | null = null;
	private currentValue: T;
	private equalityFunction: StateEqualityFunction<T>;
	private readonly graph: StateGraph;
	private readonly immediateListeners = new Set<ImmediateStateListenerRecord<T>>();
	private readonly queuedListeners = new Set<QueuedStateListenerRecord<T>>();

	constructor (owner: Owner | null, initialValue: T, options: StateInternalOptions<T> = {}) {
		super();
		this.owner = owner;
		this.currentValue = initialValue;
		this.equalityFunction = options.equals ?? Object.is;
		this.graph = options.graph ?? createStateGraph();

		if (owner) {
			this.releaseOwner = owner.onCleanup(() => {
				this.dispose();
			});
		}
		else {
			this.refreshOrphanCheck();
		}
	}

	/**
	 * Returns the owner that manages this state's lifecycle, or null if ownerless.
	 */
	getOwner (): Owner | null {
		return this.owner;
	}

	/**
	 * The current state value. Changes to this value trigger listeners.
	 */
	get value (): T {
		return this.currentValue;
	}

	/**
	 * Returns the internal state graph used for batching queued listeners.
	 * This is typically used internally by extensions and should not be accessed directly.
	 * @internal
	 */
	getGraph (): StateGraph {
		return this.graph;
	}

	/**
	 * Updates the state to a new value.
	 * If the new value is equal to the current value (by the equality function),
	 * the value is unchanged and no listeners are invoked.
	 * Immediate listeners are invoked synchronously; queued listeners are batched and called asynchronously.
	 * @param nextValue The new value for this state.
	 * @returns The new state value.
	 * @throws If the state has been disposed.
	 */
	set (nextValue: T): T {
		this.ensureActive();

		if (this.equalityFunction(this.currentValue, nextValue)) {
			return this.currentValue;
		}

		const previousValue = this.currentValue;
		this.currentValue = nextValue;

		for (const listenerRecord of [...this.immediateListeners]) {
			if (!listenerRecord.active) {
				continue;
			}

			listenerRecord.listener(this.currentValue, previousValue);
		}

		for (const listenerRecord of this.queuedListeners) {
			if (!listenerRecord.active) {
				continue;
			}

			if (!listenerRecord.pending) {
				listenerRecord.pending = true;
				listenerRecord.pendingOriginalValue = previousValue;
				listenerRecord.pendingFinalValue = this.currentValue;
				listenerRecord.equals = this.equalityFunction;
				listenerRecord.graph.pendingListeners.add(listenerRecord as QueuedStateListenerRecord<unknown>);
				scheduleGraphFlush(listenerRecord.graph);
				continue;
			}

			listenerRecord.pendingFinalValue = this.currentValue;
		}

		return this.currentValue;
	}

	/**
	 * Updates the state by applying a function to the current value.
	 * @param updater Function that transforms the current value to a new value.
	 * @returns The new state value.
	 * @throws If the state has been disposed.
	 */
	update (updater: StateUpdater<T>): T {
		this.ensureActive();
		return this.set(updater(this.currentValue));
	}

	/**
	 * Sets a new equality function for comparing state values.
	 * This affects all subsequent calls to `set()` but does not re-evaluate existing listeners.
	 * @param equals Custom equality function.
	 * @returns This state instance for method chaining.
	 * @throws If the state has been disposed.
	 */
	setEquality (equals: StateEqualityFunction<T>): this {
		this.ensureActive();
		this.equalityFunction = equals;
		return this;
	}

	/**
	 * Subscribes to synchronous state changes without binding to an owner.
	 * The listener is invoked immediately (synchronously) whenever the state value changes.
	 * Use this for quick derivations and computed values. If the state is disposed, returns a no-op unsubscribe function.
	 * @param listener Function called with (newValue, previousValue) on each change.
	 * @returns Function to unsubscribe the listener.
	 */
	subscribeImmediateUnbound (listener: StateListener<T>): CleanupFunction {
		if (this.disposed) {
			return noop;
		}

		const listenerRecord: ImmediateStateListenerRecord<T> = {
			active: true,
			listener,
		};
		this.immediateListeners.add(listenerRecord);

		return () => {
			if (!listenerRecord.active) {
				return;
			}

			listenerRecord.active = false;
			this.immediateListeners.delete(listenerRecord);
		};
	}

	/**
	 * Subscribes to asynchronous state changes without binding to an owner.
	 * Listeners are batched and invoked together in microtasks, receiving only the original and final values.
	 * Multiple state changes between listener invocations are coalesced.
	 * Use this for side effects that can tolerate slight delays. If the state is disposed, returns a no-op unsubscribe function.
	 * @param listener Function called with (finalValue, originalValue) after batched changes.
	 * @returns Function to unsubscribe the listener.
	 */
	subscribeUnbound (listener: StateListener<T>): CleanupFunction {
		if (this.disposed) {
			return noop;
		}

		const listenerRecord: QueuedStateListenerRecord<T> = {
			active: true,
			equals: this.equalityFunction,
			graph: this.graph,
			listener,
			pending: false,
			pendingFinalValue: this.currentValue,
			pendingOriginalValue: this.currentValue,
		};
		this.queuedListeners.add(listenerRecord);

		return () => {
			if (!listenerRecord.active) {
				return;
			}

			listenerRecord.active = false;
			if (listenerRecord.pending) {
				listenerRecord.pending = false;
				this.graph.pendingListeners.delete(listenerRecord as QueuedStateListenerRecord<unknown>);
			}

			this.queuedListeners.delete(listenerRecord);
		};
	}

	/**
	 * Subscribes to synchronous state changes with automatic cleanup via an owner.
	 * The listener is invoked immediately (synchronously) whenever the state value changes.
	 * The subscription is automatically cleaned up when the owner is disposed.
	 * @param owner The owner that will manage the subscription lifecycle.
	 * @param listener Function called with (newValue, previousValue) on each change.
	 * @returns Function to unsubscribe (also triggered automatically when owner is disposed).
	 */
	subscribeImmediate (owner: Owner, listener: StateListener<T>): CleanupFunction {
		this.setImplicitOwnerCandidate(owner);
		const unsubscribe = this.subscribeImmediateUnbound(listener);
		let active = true;

		const releaseOwner = owner.onCleanup(() => {
			if (!active) {
				return;
			}

			active = false;
			unsubscribe();
		});

		return () => {
			if (!active) {
				return;
			}

			active = false;
			releaseOwner();
			unsubscribe();
		};
	}

	/**
	 * Subscribes to asynchronous state changes with automatic cleanup via an owner.
	 * Listeners are batched and invoked together in microtasks, receiving only the original and final values.
	 * The subscription is automatically cleaned up when the owner is disposed.
	 * @param owner The owner that will manage the subscription lifecycle.
	 * @param listener Function called with (finalValue, originalValue) after batched changes.
	 * @returns Function to unsubscribe (also triggered automatically when owner is disposed).
	 */
	subscribe (owner: Owner, listener: StateListener<T>): CleanupFunction {
		this.setImplicitOwnerCandidate(owner);
		const unsubscribe = this.subscribeUnbound(listener);
		let active = true;

		const releaseOwner = owner.onCleanup(() => {
			if (!active) {
				return;
			}

			active = false;
			unsubscribe();
		});

		return () => {
			if (!active) {
				return;
			}

			active = false;
			releaseOwner();
			unsubscribe();
		};
	}

	protected beforeDispose (): void {
		this.clearOrphanCheck();
		this.releaseOwner();
		this.releaseOwner = noop;

		for (const listenerRecord of this.immediateListeners) {
			listenerRecord.active = false;
		}

		for (const listenerRecord of this.queuedListeners) {
			listenerRecord.active = false;
			if (listenerRecord.pending) {
				listenerRecord.pending = false;
				this.graph.pendingListeners.delete(listenerRecord as QueuedStateListenerRecord<unknown>);
			}
		}

		this.immediateListeners.clear();
		this.queuedListeners.clear();
	}

	private clearOrphanCheck (): void {
		if (this.orphanCheckId === null) {
			return;
		}

		clearTimeout(this.orphanCheckId);
		this.orphanCheckId = null;
	}

	private refreshOrphanCheck (): void {
		if (this.disposed || this.owner !== null) {
			this.clearOrphanCheck();
			return;
		}

		if (this.orphanCheckId !== null) {
			return;
		}

		this.orphanCheckId = setTimeout(() => {
			this.orphanCheckId = null;

			if (this.disposed || this.owner !== null) {
				return;
			}

			throw new Error(orphanedStateErrorMessage);
		}, 0);
	}

	private setImplicitOwnerCandidate (candidate: Owner): void {
		if (candidate instanceof StateClass) {
			return;
		}

		if (this.requiresExplicitOwner) {
			return;
		}

		if (this.owner !== null && !this.isImplicitOwner) {
			return;
		}

		if (this.owner === candidate) {
			return;
		}

		if (this.isImplicitOwner) {
			this.releaseOwner();
			this.releaseOwner = noop;
			this.owner = null;
			this.isImplicitOwner = false;
			this.requiresExplicitOwner = true;
			this.refreshOrphanCheck();
			return;
		}

		this.owner = candidate;
		this.isImplicitOwner = true;
		this.releaseOwner = candidate.onCleanup(() => {
			this.dispose();
		});
		this.clearOrphanCheck();
	}

	private ensureActive (): void {
		if (this.disposed) {
			throw new Error("Disposed states cannot be modified.");
		}
	}
}

interface StateClass<T> extends StateExtensions<T> { }

/**
 * Reactive state container that notifies listeners when the value changes.
 * State instances are always owned by an {@link Owner} and are disposed when the owner is disposed.
 *
 * @example Creating and subscribing to state:
 * ```
 * const owner = new MyOwner();
 * const count = State(owner, 0);
 *
 * // Immediate listener invoked synchronously
 * count.subscribeImmediate(owner, (value, previous) => {
 *   console.log(`Count changed from ${previous} to ${value}`);
 * });
 *
 * count.set(1); // Logs: "Count changed from 0 to 1"
 * ```
 *
 * @example Using state updates and custom equality:
 * ```
 * const items = State(owner, [], {
 *   equals: (a, b) => JSON.stringify(a) === JSON.stringify(b)
 * });
 *
 * items.update(current => [...current, newItem]);
 * ```
 */
/** @group State */
export type State<T> = StateClass<T>;

/** @group State */
type StateConstructor = {
	<T> (initialValue: T, options?: StateOptions<T>): State<T>;
	<T> (owner: Owner, initialValue: T, options?: StateOptions<T>): State<T>;
	new <T>(initialValue: T, options?: StateOptions<T>): State<T>;
	new <T>(owner: Owner, initialValue: T, options?: StateOptions<T>): State<T>;
	prototype: State<unknown>;
	extend<T = unknown> (): ExtendableStateClass<T>;
};

/**
 * Creates a reactive state container with an initial value.
 *
 * When called with an owner, the state is automatically disposed when the owner is disposed.
 *
 * When called without an owner, the state must gain an owner before the next tick.
 * If the ownerless state is subscribed to by a non-State owner (e.g., a Component),
 * that owner becomes the implicit owner. If a different non-State owner later subscribes,
 * the implicit owner is cleared and an explicit owner is required.
 *
 * @param owner The owner responsible for disposing the state.
 * @param initialValue The initial state value.
 * @param options Configuration options.
 * @returns A new state instance.
 *
 * @example
 * ```
 * const counter = State(owner, 0);
 * console.log(counter.value); // 0
 * counter.set(1);
 * console.log(counter.value); // 1
 * ```
 *
 * @example Ownerless state with implicit owner:
 * ```
 * const count = State(0);
 * // count must gain an owner before the next tick.
 * Component("div").use(count, (value, component) => {
 *   // The component is now count's implicit owner.
 * });
 * ```
 * @group State
 */
export const State = function State<T> (ownerOrValue: Owner | T, valueOrOptions?: T | StateOptions<T>, options?: StateOptions<T>): State<T> {
	if (ownerOrValue instanceof Owner && arguments.length >= 2) {
		return new StateClass(ownerOrValue, valueOrOptions as T, (options ?? {}) as StateInternalOptions<T>);
	}

	return new StateClass(null, ownerOrValue as T, ((arguments.length >= 2 ? valueOrOptions : undefined) ?? {}) as StateInternalOptions<T>);
} as StateConstructor;

State.prototype = StateClass.prototype;

/**
 * Returns the underlying State class for prototype extension.
 * This allows modules to add custom methods and properties to all State instances.
 *
 * @returns The ExtendableStateClass constructor, whose prototype can be modified.
 *
 * @example
 * ```
 * const StateClass = State.extend<number>();
 * StateClass.prototype.double = function() {
 *   return this.value * 2;
 * };
 *
 * const num = State(owner, 5);
 * num.double(); // 10
 * ```
 */
State.extend = function extend<T = unknown> (): ExtendableStateClass<T> {
	return StateClass as ExtendableStateClass<T>;
};