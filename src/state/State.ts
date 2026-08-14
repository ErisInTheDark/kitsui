/**
 * Function invoked during cleanup to release resources.
 */
import { scheduleTimeoutPromise, type DeferredTimeoutHandle } from "../utility/timeoutPromise";
import { runCleanupSteps } from "../utility/cleanup";

export type CleanupFunction = () => void;

type IsAny<T> = 0 extends (1 & T) ? true : false;

type RejectUndefined<T> = IsAny<T> extends true ? T : [undefined] extends [T] ? never : T;

type WidenStateValue<T> = [T] extends [string]
	? string
	: [T] extends [number]
		? number
		: [T] extends [boolean]
			? boolean
			: [T] extends [bigint]
				? bigint
				: [T] extends [symbol]
					? symbol
					: T;

/**
 * Checks if two state values are considered equal.
 * @param currentValue The current state value.
 * @param nextValue The next state value.
 * @returns True if the values are equal, false otherwise.
 */
export type StateEqualityFunction<T> = (currentValue: T, nextValue: T) => boolean;

/**
 * Adjusts a candidate state value before it is stored, compared, or emitted.
 * @param value The candidate value produced during construction, `set()`, or resolved by `update()`.
 * @returns A replacement state value, or `undefined` to keep the candidate as-is.
 */
export type StateFixFunction<T> = (value: T) => T | void;

/**
 * Callback invoked when state value changes.
 * @param value The new state value.
 * @param previousValue The previous state value.
 */
export type StateListener<T> = (value: T, previousValue: T) => void;

/**
 * Function that transforms the current state value into a new value.
 * @param currentValue The current state value.
 * @returns The transformed state value, or `undefined` to keep the current value.
 */
export type StateUpdater<T> = (currentValue: T) => T | void;

/**
 * Options for creating a new state instance.
 */
export interface StateOptions<T> {
	/**
	 * Custom equality function for comparing state values.
	 * Defaults to `Object.is` if not provided.
	 */
	equals?: StateEqualityFunction<T>;
	/**
	 * Adjusts candidate state values after construction, `set()`, or `update()` resolves them.
	 * Runs before equality checks, storage, and listener emission.
	 * 
	 * Like a state updater, it can return a replacement value or `undefined` to keep the candidate value.
	 */
	fix?: StateFixFunction<T>;
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
 * A marker interface for module-level State static extensions.
 * Extend this interface to add static methods to the State constructor function.
 */
export interface StateStaticExtensions { }

export namespace State {
	/** Public readonly-looking state surface for derived or internally-owned state values. */
	export interface Readonly<T> extends StateExtensions<T> {
		readonly disposed: boolean;
		readonly value: T;
		getOwner (): Owner | null;
		isMutable (): this is State<T>;
		subscribe (owner: Owner, listener: StateListener<T>): CleanupFunction;
		subscribeImmediate (owner: Owner, listener: StateListener<T>): CleanupFunction;
		subscribeUnbound (listener: StateListener<T>): CleanupFunction;
		subscribeImmediateUnbound (listener: StateListener<T>): CleanupFunction;
	}
}

type MutableStateConstructor = Omit<StateConstructor, "prototype"> & {
	prototype: State<unknown>;
};

/**
 * Constructor type for extending the State class with custom methods.
 * Used with {@link State.extend} to access and modify the State prototype.
 */
export type ExtendableStateClass = MutableStateConstructor & StateStaticExtensions;

interface StateGraph {
	pendingListeners: Set<QueuedStateListenerRecord<unknown>>;
	scheduled: boolean;
}

interface ImmediateStateListenerRecord<T> {
	active: boolean;
	listener: StateListener<T>;
}

interface StateNotification<T> {
	force: boolean;
	immediateListeners: ImmediateStateListenerRecord<T>[];
	previousValue: T;
	value: T;
}

interface QueuedStateListenerRecord<T> {
	active: boolean;
	forcePendingEmit: boolean;
	listener: StateListener<T>;
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

const ident = <T>(value: T): T => value;

function assertDefinedStateValue (value: unknown): void {
	if (value !== undefined) {
		return;
	}

	throw new TypeError("State values cannot be undefined.");
}

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
		const pendingDeliveries = [...graph.pendingListeners].map(record => ({
			equals: record.equals,
			finalValue: record.pendingFinalValue,
			force: record.forcePendingEmit,
			originalValue: record.pendingOriginalValue,
			record,
		}));
		graph.pendingListeners.clear();
		for (const { record } of pendingDeliveries) {
			record.forcePendingEmit = false;
		}

		runCleanupSteps(pendingDeliveries.map(({ equals, finalValue, force, originalValue, record }) => () => {
			if (!record.active) {
				return;
			}

			if (!force && equals(originalValue, finalValue)) {
				return;
			}

			record.listener(finalValue, originalValue);
		}));
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
 * Implements the shared disposal lifecycle for owner-aware resources.
 * @group Owner
 */
abstract class OwnerClass {
	private abortController: AbortController | null = null;
	private readonly cleanupFunctions = new Set<CleanupFunction>();
	private disposingValue = false;
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
	 * Whether this owner is currently executing its synchronous disposal lifecycle.
	 * This remains true through pre-disposal hooks, cleanup functions, and post-disposal hooks.
	 * @readonly
	 */
	get disposing (): boolean {
		return this.disposingValue;
	}

	/**
	 * An abort signal for work scoped to this owner's lifetime.
	 * The signal is created lazily, keeps a stable identity, and aborts synchronously when the owner is disposed.
	 * @readonly
	 */
	get signal (): AbortSignal {
		if (this.abortController === null) {
			this.abortController = new AbortController();

			if (this.disposedValue) {
				this.abortController.abort();
			}
		}

		return this.abortController.signal;
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
		this.disposingValue = true;
		let firstError: unknown;
		let failed = false;
		const settle = (callback: () => void) => {
			try {
				callback();
			} catch (error) {
				if (!failed) {
					failed = true;
					firstError = error;
				}
			}
		};

		try {
			settle(() => this.abortController?.abort());
			settle(() => this.beforeDispose());

			const cleanupFunctions = [...this.cleanupFunctions];
			this.cleanupFunctions.clear();

			for (const cleanupFunction of cleanupFunctions) {
				settle(cleanupFunction);
			}

			settle(() => this.afterDispose());
		}
		finally {
			this.disposingValue = false;
		}

		if (failed) {
			throw firstError;
		}
	}

	/**
	 * Registers a cleanup function to be invoked when this owner is disposed.
	 * If the owner is already disposed, the cleanup function is invoked immediately.
	 * @param cleanupFunction Function to invoke during cleanup.
	 * @returns A function that unregisters the cleanup function. Calling it prevents the cleanup function from being invoked later.
	 */
	onCleanup (cleanupFunction: CleanupFunction): CleanupFunction;
	/**
	 * Registers a cleanup function to be invoked when this owner is disposed, while binding the registration to another owner.
	 * If the registration owner is disposed first, the cleanup function is unregistered without being invoked.
	 * @param owner Owner that manages the cleanup registration lifetime.
	 * @param cleanupFunction Function to invoke during cleanup.
	 * @returns A function that unregisters the cleanup function from both owners.
	 */
	onCleanup (owner: Owner, cleanupFunction: CleanupFunction): CleanupFunction;
	onCleanup (ownerOrCleanupFunction: Owner | CleanupFunction, maybeCleanupFunction?: CleanupFunction): CleanupFunction {
		if (!(ownerOrCleanupFunction instanceof OwnerClass)) {
			return this.registerCleanup(ownerOrCleanupFunction);
		}

		const owner = ownerOrCleanupFunction;
		const cleanupFunction = maybeCleanupFunction as CleanupFunction;
		if (owner === this) {
			return this.registerCleanup(cleanupFunction);
		}

		if (owner.disposed) {
			return noop;
		}

		let active = true;
		let releaseOwner: CleanupFunction = noop;
		const releaseCleanup = this.registerCleanup(() => {
			if (!active) {
				return;
			}

			active = false;
			releaseOwner();
			cleanupFunction();
		});

		if (!active) {
			return noop;
		}

		const release = () => {
			if (!active) {
				return;
			}

			active = false;
			releaseCleanup();
			releaseOwner();
		};

		releaseOwner = owner.onCleanup(release);
		if (!active) {
			releaseOwner();
			return noop;
		}

		return release;
	}

	private registerCleanup (cleanupFunction: CleanupFunction): CleanupFunction {
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

/**
 * A disposable lifetime for a living scope and its owner-aware resources.
 * @group Owner
 */
export type Owner = OwnerClass;

/** @group Owner */
type OwnerConstructor = (abstract new () => Owner) & {
	(): Owner;
	prototype: Owner;
};

/**
 * Creates an owner for a living scope that does not have an owning {@link Component}.
 *
 * Pass the owner to {@link State} and other owner-aware APIs so the resources in the
 * scope share one lifetime. Dispose the owner when the scope ends.
 *
 * Integration libraries can accept an owner and use {@link Owner.onCleanup} to bind
 * external teardown to the same scope. Application code usually only passes the
 * owner to the integration.
 *
 * @returns A new owner for the scope.
 *
 * @example
 * ```
 * const session = Owner();
 * const status = State(session, "connecting");
 * const label = status.map(session, value => `Status: ${value}`);
 *
 * label.subscribe(session, value => {
 *   console.log(value);
 * });
 *
 * session.dispose();
 * ```
 *
 * @group Owner
 */
export const Owner = function Owner (): Owner {
	return Reflect.construct(OwnerClass, [], new.target ?? OwnerClass) as Owner;
} as OwnerConstructor;

Owner.prototype = OwnerClass.prototype;

const orphanedStateErrorMessage = "States must have an owner before the next tick.";

function getEqualityFunction<T> (state: State<T>): StateEqualityFunction<T> {
	return state["equalityFunction"] as StateEqualityFunction<T>;
}

function getFixFunction<T> (state: State<T>): StateFixFunction<T> {
	return state["fixFunction"] as StateFixFunction<T>;
}

function fixStateValue<T> (fix: StateFixFunction<T>, value: T): T {
	return fix(value) ?? value;
}

function getImmediateListeners<T> (state: State<T>): Set<ImmediateStateListenerRecord<T>> {
	return state["immediateListeners"] as Set<ImmediateStateListenerRecord<T>>;
}

function getQueuedListeners<T> (state: State<T>): Set<QueuedStateListenerRecord<T>> {
	return state["queuedListeners"] as Set<QueuedStateListenerRecord<T>>;
}

/** @group State */
class StateClass<T> extends Owner {
	private owner: Owner | null;
	private releaseOwner: CleanupFunction = noop;
	private isImplicitOwner = false;
	private mutable = true;
	private requiresExplicitOwner = false;
	private readonly implicitOwnerDependents = new Set<StateClass<unknown>>();
	private orphanCheckId: DeferredTimeoutHandle | null = null;
	private currentValue: T;
	/** @deprecated Use getEqualityFunction(this) */
	private equalityFunction: StateEqualityFunction<any>;
	/** @deprecated Use getFixFunction(this) */
	private fixFunction: StateFixFunction<any>;
	private readonly graph: StateGraph;
	/** @deprecated Use getImmediateListeners(this) */
	private readonly immediateListeners = new Set<ImmediateStateListenerRecord<any>>();
	/** @deprecated Use getQueuedListeners(this) */
	private readonly queuedListeners = new Set<QueuedStateListenerRecord<any>>();
	private notificationQueue: StateNotification<any>[] | null = null;

	constructor (owner: Owner | null, initialValue: T, options: StateInternalOptions<T> = {}) {
		super();
		assertDefinedStateValue(initialValue);
		this.owner = owner;
		this.fixFunction = options.fix ?? ident;
		this.currentValue = fixStateValue(this.fixFunction, initialValue);
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
	 * Whether the public state reference can be safely treated as mutable.
	 */
	isMutable (): this is State<T> {
		return this.mutable;
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
		assertDefinedStateValue(nextValue);
		const fixedValue = fixStateValue(getFixFunction(this), nextValue);

		if (getEqualityFunction(this)(this.currentValue, fixedValue)) {
			return this.currentValue;
		}

		return this.commit(fixedValue, false);
	}

	private commit (nextValue: T, forceNotify: boolean): T {
		const previousValue = this.currentValue;
		this.currentValue = nextValue;
		const notification: StateNotification<T> = {
			force: forceNotify,
			immediateListeners: [...getImmediateListeners(this)],
			previousValue,
			value: nextValue,
		};
		if (this.notificationQueue) {
			this.notificationQueue.push(notification);
			return this.currentValue;
		}

		const notificationQueue = [notification];
		this.notificationQueue = notificationQueue;
		try {
			for (const change of notificationQueue) {
				for (const listenerRecord of change.immediateListeners) {
					if (listenerRecord.active) listenerRecord.listener(change.value, change.previousValue);
				}

				for (const listenerRecord of getQueuedListeners(this)) {
					if (!listenerRecord.active) continue;
					if (!this.graph.pendingListeners.has(listenerRecord as QueuedStateListenerRecord<unknown>)) {
						listenerRecord.forcePendingEmit = change.force;
						listenerRecord.pendingOriginalValue = change.previousValue;
						listenerRecord.pendingFinalValue = change.value;
						listenerRecord.equals = getEqualityFunction(this);
						this.graph.pendingListeners.add(listenerRecord as QueuedStateListenerRecord<unknown>);
						scheduleGraphFlush(this.graph);
						continue;
					}

					listenerRecord.forcePendingEmit ||= change.force;
					listenerRecord.pendingFinalValue = change.value;
				}
			}
		} finally {
			this.notificationQueue = null;
		}

		return this.currentValue;
	}

	/**
	 * Replaces the internal state value without checking disposal or notifying listeners.
	 * This is intended for silent state resets during disposal and cleanup flows.
	 * @param nextValue The new value for this state.
	 * @returns The stored state value.
	 */
	clear (nextValue: T): T {
		assertDefinedStateValue(nextValue);
		this.currentValue = nextValue;
		return this.currentValue;
	}

	/**
	 * Updates the state by applying a function to the current value.
	 * Returning `undefined` keeps the current value, which is still passed through `fix()` and emitted to listeners.
	 * Unlike {@link set}, `update` always notifies listeners, even when the effective value is unchanged.
	 * @param updater Function that transforms the current value to a new value.
	 * @returns The stored state value after the update.
	 * @throws If the state has been disposed.
	 */
	update (updater: StateUpdater<T>): T {
		this.ensureActive();
		const nextValue = updater(this.currentValue);
		return this.commit(fixStateValue(getFixFunction(this), nextValue === undefined ? this.currentValue : nextValue), true);
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
		getImmediateListeners(this).add(listenerRecord);

		return () => {
			if (!listenerRecord.active) {
				return;
			}

			listenerRecord.active = false;
			getImmediateListeners(this).delete(listenerRecord);
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
			equals: getEqualityFunction(this),
			forcePendingEmit: false,
			listener,
			pendingFinalValue: this.currentValue,
			pendingOriginalValue: this.currentValue,
		};
		getQueuedListeners(this).add(listenerRecord);

		return () => {
			if (!listenerRecord.active) {
				return;
			}

			listenerRecord.active = false;
			this.graph.pendingListeners.delete(listenerRecord as QueuedStateListenerRecord<unknown>);

			getQueuedListeners(this).delete(listenerRecord);
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

	_registerImplicitOwnerDependent (dependent: State.Readonly<unknown>): CleanupFunction {
		const dependentState = dependent as StateClass<unknown>;

		if (this.disposed || dependentState.disposed) {
			return noop;
		}

		this.implicitOwnerDependents.add(dependentState);

		if (this.isImplicitOwner && this.owner !== null) {
			dependentState.setImplicitOwnerCandidate(this.owner);
		}

		return () => {
			this.implicitOwnerDependents.delete(dependentState);
		};
	}

	protected beforeDispose (): void {
		this.clearOrphanCheck();
		this.releaseOwner();
		this.releaseOwner = noop;

		for (const listenerRecord of getImmediateListeners(this)) {
			listenerRecord.active = false;
		}

		for (const listenerRecord of getQueuedListeners(this)) {
			listenerRecord.active = false;
			this.graph.pendingListeners.delete(listenerRecord as QueuedStateListenerRecord<unknown>);
		}

		getImmediateListeners(this).clear();
		getQueuedListeners(this).clear();
		this.implicitOwnerDependents.clear();
	}

	private clearOrphanCheck (): void {
		if (this.orphanCheckId === null) {
			return;
		}

		this.orphanCheckId.cancel();
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

		this.orphanCheckId = scheduleTimeoutPromise(() => {
			this.orphanCheckId = null;

			if (this.disposed || this.owner !== null) {
				return;
			}

			throw new Error(orphanedStateErrorMessage);
		});
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
			this.notifyImplicitOwnerDependents(candidate);
			return;
		}

		this.owner = candidate;
		this.isImplicitOwner = true;
		this.releaseOwner = candidate.onCleanup(() => {
			this.dispose();
		});
		this.clearOrphanCheck();
		this.notifyImplicitOwnerDependents(candidate);
	}

	private notifyImplicitOwnerDependents (candidate: Owner): void {
		for (const dependent of this.implicitOwnerDependents) {
			dependent.setImplicitOwnerCandidate(candidate);
		}
	}

	private ensureActive (): void {
		if (this.disposed) {
			throw new Error("Disposed states cannot be modified.");
		}
	}
}

interface StateClass<T> extends State.Readonly<T>, StateExtensions<T> { }

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
	<T> (owner: Owner, initialValue: RejectUndefined<T>, options?: StateOptions<WidenStateValue<T>>): State<WidenStateValue<T>>;
	new <T>(owner: Owner, initialValue: RejectUndefined<T>, options?: StateOptions<WidenStateValue<T>>): State<WidenStateValue<T>>;
	<T> (initialValue: RejectUndefined<T>, options?: StateOptions<WidenStateValue<T>>): State<WidenStateValue<T>>;
	new <T>(initialValue: RejectUndefined<T>, options?: StateOptions<WidenStateValue<T>>): State<WidenStateValue<T>>;
	prototype: State.Readonly<unknown>;
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
	extend<T = unknown> (): ExtendableStateClass;
	/**
	 * Creates a new State instance that can never change.
	 * The returned state has a fixed value and ignores all updates. 
	 * It is not associated with any owner and does not require disposal.
	 * @param value The fixed value for the readonly state.
	 * @returns A new readonly state instance with the specified value.
	 */
	Readonly<T> (value: RejectUndefined<T>): State.Readonly<WidenStateValue<T>>;
}

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
} as unknown as StateConstructor & StateStaticExtensions;

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
State.extend = function extend (): ExtendableStateClass {
	return StateClass as unknown as ExtendableStateClass;
};

/**
 * Creates a new State instance that can never change.
 * The returned state has a fixed value and ignores all updates. 
 * It is not associated with any owner and does not require disposal.
 * @param value The fixed value for the readonly state.
 * @returns A new readonly state instance with the specified value.
 */
State.Readonly = function Readonly<T> (value: RejectUndefined<T>): State.Readonly<WidenStateValue<T>> {
	const readonlyState = new StateClass(null, value as WidenStateValue<T>);
	readonlyState["clearOrphanCheck"]();
	readonlyState["mutable"] = false;
	readonlyState.clear = () => readonlyState.value;
	readonlyState.set = ident;
	readonlyState.update = () => readonlyState.value;
	return readonlyState as State.Readonly<WidenStateValue<T>>;
};
