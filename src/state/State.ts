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
export type StateEqualityFunction<TValue> = (currentValue: TValue, nextValue: TValue) => boolean;

/**
 * Callback invoked when state value changes.
 * @param value The new state value.
 * @param previousValue The previous state value.
 */
export type StateListener<TValue> = (value: TValue, previousValue: TValue) => void;

/**
 * Function that transforms the current state value into a new value.
 * @param currentValue The current state value.
 * @returns The transformed state value.
 */
export type StateUpdater<TValue> = (currentValue: TValue) => TValue;

/**
 * Options for creating a new state instance.
 */
export interface StateOptions<TValue> {
	/**
	 * Custom equality function for comparing state values.
	 * Defaults to `Object.is` if not provided.
	 */
	equals?: StateEqualityFunction<TValue>;
}

/**
 * Protocol interface for extending State with additional methods and properties.
 * Modules can augment this interface to add custom behavior to all State instances.
 * @example
 * declare module "./State" {
 *   interface StateExtensions<TValue> {
 *     map<TMapped>(owner: Owner, fn: (val: TValue) => TMapped): State<TMapped>;
 *   }
 * }
 */
export interface StateExtensions<TValue> { }

/**
 * Constructor type for extending the State class with custom methods.
 * Used with {@link State.extend} to access and modify the State prototype.
 */
export type ExtendableStateClass<TValue = unknown> = (abstract new (...args: never[]) => State<TValue>) & {
	prototype: State<TValue>;
};

interface StateGraph {
	pendingListeners: Set<QueuedStateListenerRecord<unknown>>;
	scheduled: boolean;
}

interface ImmediateStateListenerRecord<TValue> {
	active: boolean;
	listener: StateListener<TValue>;
}

interface QueuedStateListenerRecord<TValue> {
	active: boolean;
	graph: StateGraph;
	listener: StateListener<TValue>;
	pending: boolean;
	pendingOriginalValue: TValue;
	pendingFinalValue: TValue;
	equals: StateEqualityFunction<TValue>;
}

type StateInternalOptions<TValue> = StateOptions<TValue> & {
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

class StateClass<TValue> extends Owner {
	private readonly owner: Owner;
	private releaseOwner: CleanupFunction = noop;
	private currentValue: TValue;
	private equals: StateEqualityFunction<TValue>;
	private readonly graph: StateGraph;
	private readonly immediateListeners = new Set<ImmediateStateListenerRecord<TValue>>();
	private readonly queuedListeners = new Set<QueuedStateListenerRecord<TValue>>();

	constructor (owner: Owner, initialValue: TValue, options: StateInternalOptions<TValue> = {}) {
		super();
		this.owner = owner;
		this.currentValue = initialValue;
		this.equals = options.equals ?? Object.is;
		this.graph = options.graph ?? createStateGraph();
		this.releaseOwner = owner.onCleanup(() => {
			this.dispose();
		});
	}

	/**
	 * Returns the owner that manages this state's lifecycle.
	 */
	getOwner (): Owner {
		return this.owner;
	}

	/**
	 * The current state value. Changes to this value trigger listeners.
	 */
	get value (): TValue {
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
	set (nextValue: TValue): TValue {
		this.ensureActive();

		if (this.equals(this.currentValue, nextValue)) {
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
				listenerRecord.equals = this.equals;
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
	update (updater: StateUpdater<TValue>): TValue {
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
	setEquality (equals: StateEqualityFunction<TValue>): this {
		this.ensureActive();
		this.equals = equals;
		return this;
	}

	/**
	 * Subscribes to synchronous state changes without binding to an owner.
	 * The listener is invoked immediately (synchronously) whenever the state value changes.
	 * Use this for quick derivations and computed values. If the state is disposed, returns a no-op unsubscribe function.
	 * @param listener Function called with (newValue, previousValue) on each change.
	 * @returns Function to unsubscribe the listener.
	 */
	subscribeImmediateUnbound (listener: StateListener<TValue>): CleanupFunction {
		if (this.disposed) {
			return noop;
		}

		const listenerRecord: ImmediateStateListenerRecord<TValue> = {
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
	subscribeUnbound (listener: StateListener<TValue>): CleanupFunction {
		if (this.disposed) {
			return noop;
		}

		const listenerRecord: QueuedStateListenerRecord<TValue> = {
			active: true,
			equals: this.equals,
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
	subscribeImmediate (owner: Owner, listener: StateListener<TValue>): CleanupFunction {
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
	subscribe (owner: Owner, listener: StateListener<TValue>): CleanupFunction {
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

	private ensureActive (): void {
		if (this.disposed) {
			throw new Error("Disposed states cannot be modified.");
		}
	}
}

interface StateClass<TValue> extends StateExtensions<TValue> { }

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
export type State<TValue> = StateClass<TValue>;

type StateConstructor = {
	<TValue> (owner: Owner, initialValue: TValue, options?: StateOptions<TValue>): State<TValue>;
	new <TValue>(owner: Owner, initialValue: TValue, options?: StateOptions<TValue>): State<TValue>;
	prototype: State<unknown>;
	extend<TValue = unknown> (): ExtendableStateClass<TValue>;
};

/**
 * Creates a reactive state container with an initial value.
 * State is managed by an owner and is automatically disposed when the owner is disposed.
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
 */
export const State = function State<TValue> (owner: Owner, initialValue: TValue, options: StateOptions<TValue> = {}): State<TValue> {
	return new StateClass(owner, initialValue, options);
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
State.extend = function extend<TValue = unknown> (): ExtendableStateClass<TValue> {
	return StateClass as ExtendableStateClass<TValue>;
};