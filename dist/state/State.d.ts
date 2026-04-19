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
export interface StateExtensions<T> {
}
/**
 * A marker interface for module-level State static extensions.
 * Extend this interface to add static methods to the State constructor function.
 */
export interface StateStaticExtensions {
}
/**
 * Constructor type for extending the State class with custom methods.
 * Used with {@link State.extend} to access and modify the State prototype.
 */
export type ExtendableStateClass = StateConstructor & StateStaticExtensions;
interface StateGraph {
    pendingListeners: Set<QueuedStateListenerRecord<unknown>>;
    scheduled: boolean;
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
/**
 * Abstract base class for managing cleanup functions and resource disposal.
 * Owners can register cleanup functions that are invoked when the owner is disposed,
 * enabling a predictable lifecycle for dependent resources.
 */
export declare abstract class Owner {
    private readonly cleanupFunctions;
    private disposedValue;
    /** @hidden */
    constructor();
    /**
     * Whether this owner has been disposed.
     * @readonly
     */
    get disposed(): boolean;
    /**
     * Disposes this owner and invokes all registered cleanup functions.
     * Once disposed, an owner cannot be used again.
     * Subsequent calls to `dispose()` are no-ops.
     */
    dispose(): void;
    /**
     * Registers a cleanup function to be invoked when this owner is disposed.
     * If the owner is already disposed, the cleanup function is invoked immediately.
     * @param cleanupFunction Function to invoke during cleanup.
     * @returns A function that unregisters the cleanup function. Calling it prevents the cleanup function from being invoked later.
     */
    onCleanup(cleanupFunction: CleanupFunction): CleanupFunction;
    /**
     * Hook invoked before cleanup functions run during disposal.
     * Subclasses may override to perform custom pre-disposal logic.
     * @protected
     */
    protected beforeDispose(): void;
    /**
     * Hook invoked after all cleanup functions have run during disposal.
     * Subclasses may override to perform custom post-disposal logic.
     * @protected
     */
    protected afterDispose(): void;
}
/** @group State */
declare class StateClass<T> extends Owner {
    private owner;
    private releaseOwner;
    private isImplicitOwner;
    private requiresExplicitOwner;
    private readonly implicitOwnerDependents;
    private orphanCheckId;
    private currentValue;
    /** @deprecated Use getEqualityFunction(this) */
    private equalityFunction;
    private readonly graph;
    /** @deprecated Use getImmediateListeners(this) */
    private readonly immediateListeners;
    /** @deprecated Use getQueuedListeners(this) */
    private readonly queuedListeners;
    constructor(owner: Owner | null, initialValue: T, options?: StateInternalOptions<T>);
    /**
     * Returns the owner that manages this state's lifecycle, or null if ownerless.
     */
    getOwner(): Owner | null;
    /**
     * The current state value. Changes to this value trigger listeners.
     */
    get value(): T;
    /**
     * Returns the internal state graph used for batching queued listeners.
     * This is typically used internally by extensions and should not be accessed directly.
     * @internal
     */
    getGraph(): StateGraph;
    /**
     * Updates the state to a new value.
     * If the new value is equal to the current value (by the equality function),
     * the value is unchanged and no listeners are invoked.
     * Immediate listeners are invoked synchronously; queued listeners are batched and called asynchronously.
     * @param nextValue The new value for this state.
     * @returns The new state value.
     * @throws If the state has been disposed.
     */
    set(nextValue: T): T;
    /**
     * Updates the state by applying a function to the current value.
     * @param updater Function that transforms the current value to a new value.
     * @returns The new state value.
     * @throws If the state has been disposed.
     */
    update(updater: StateUpdater<T>): T;
    /**
     * Sets a new equality function for comparing state values.
     * This affects all subsequent calls to `set()` but does not re-evaluate existing listeners.
     * @param equals Custom equality function.
     * @returns This state instance for method chaining.
     * @throws If the state has been disposed.
     */
    setEquality(equals: StateEqualityFunction<T>): this;
    /**
     * Subscribes to synchronous state changes without binding to an owner.
     * The listener is invoked immediately (synchronously) whenever the state value changes.
     * Use this for quick derivations and computed values. If the state is disposed, returns a no-op unsubscribe function.
     * @param listener Function called with (newValue, previousValue) on each change.
     * @returns Function to unsubscribe the listener.
     */
    subscribeImmediateUnbound(listener: StateListener<T>): CleanupFunction;
    /**
     * Subscribes to asynchronous state changes without binding to an owner.
     * Listeners are batched and invoked together in microtasks, receiving only the original and final values.
     * Multiple state changes between listener invocations are coalesced.
     * Use this for side effects that can tolerate slight delays. If the state is disposed, returns a no-op unsubscribe function.
     * @param listener Function called with (finalValue, originalValue) after batched changes.
     * @returns Function to unsubscribe the listener.
     */
    subscribeUnbound(listener: StateListener<T>): CleanupFunction;
    /**
     * Subscribes to synchronous state changes with automatic cleanup via an owner.
     * The listener is invoked immediately (synchronously) whenever the state value changes.
     * The subscription is automatically cleaned up when the owner is disposed.
     * @param owner The owner that will manage the subscription lifecycle.
     * @param listener Function called with (newValue, previousValue) on each change.
     * @returns Function to unsubscribe (also triggered automatically when owner is disposed).
     */
    subscribeImmediate(owner: Owner, listener: StateListener<T>): CleanupFunction;
    /**
     * Subscribes to asynchronous state changes with automatic cleanup via an owner.
     * Listeners are batched and invoked together in microtasks, receiving only the original and final values.
     * The subscription is automatically cleaned up when the owner is disposed.
     * @param owner The owner that will manage the subscription lifecycle.
     * @param listener Function called with (finalValue, originalValue) after batched changes.
     * @returns Function to unsubscribe (also triggered automatically when owner is disposed).
     */
    subscribe(owner: Owner, listener: StateListener<T>): CleanupFunction;
    _registerImplicitOwnerDependent(dependent: State<unknown>): CleanupFunction;
    protected beforeDispose(): void;
    private clearOrphanCheck;
    private refreshOrphanCheck;
    private setImplicitOwnerCandidate;
    private notifyImplicitOwnerDependents;
    private ensureActive;
}
interface StateClass<T> extends StateExtensions<T> {
}
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
    <T>(initialValue: T, options?: StateOptions<T>): State<T>;
    <T>(owner: Owner, initialValue: T, options?: StateOptions<T>): State<T>;
    new <T>(initialValue: T, options?: StateOptions<T>): State<T>;
    new <T>(owner: Owner, initialValue: T, options?: StateOptions<T>): State<T>;
    prototype: State<unknown>;
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
    extend<T = unknown>(): ExtendableStateClass;
    /**
     * Creates a new State instance that can never change.
     * The returned state has a fixed value and ignores all updates.
     * It is not associated with any owner and does not require disposal.
     * @param value The fixed value for the readonly state.
     * @returns A new readonly state instance with the specified value.
     */
    Readonly<T>(value: T): State<T>;
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
export declare const State: StateConstructor & StateStaticExtensions;
export {};
