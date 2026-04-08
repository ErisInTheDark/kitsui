export type CleanupFunction = () => void;
export type StateEqualityFunction<TValue> = (currentValue: TValue, nextValue: TValue) => boolean;
export type StateListener<TValue> = (value: TValue, previousValue: TValue) => void;
export type StateUpdater<TValue> = (currentValue: TValue) => TValue;
export interface StateOptions<TValue> {
    equals?: StateEqualityFunction<TValue>;
}
export interface StateExtensions<TValue> {
}
export type ExtendableStateClass<TValue = unknown> = (abstract new (...args: never[]) => State<TValue>) & {
    prototype: State<TValue>;
};
interface StateGraph {
    pendingListeners: Set<QueuedStateListenerRecord<unknown>>;
    scheduled: boolean;
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
export declare abstract class Owner {
    private readonly cleanupFunctions;
    private disposedValue;
    get disposed(): boolean;
    dispose(): void;
    onCleanup(cleanupFunction: CleanupFunction): CleanupFunction;
    protected beforeDispose(): void;
    protected afterDispose(): void;
}
declare class StateClass<TValue> extends Owner {
    private readonly owner;
    private releaseOwner;
    private currentValue;
    private equals;
    private readonly graph;
    private readonly immediateListeners;
    private readonly queuedListeners;
    constructor(owner: Owner, initialValue: TValue, options?: StateInternalOptions<TValue>);
    getOwner(): Owner;
    get value(): TValue;
    getGraph(): StateGraph;
    set(nextValue: TValue): TValue;
    update(updater: StateUpdater<TValue>): TValue;
    setEquality(equals: StateEqualityFunction<TValue>): this;
    subscribeImmediateUnbound(listener: StateListener<TValue>): CleanupFunction;
    subscribeUnbound(listener: StateListener<TValue>): CleanupFunction;
    subscribeImmediate(owner: Owner, listener: StateListener<TValue>): CleanupFunction;
    subscribe(owner: Owner, listener: StateListener<TValue>): CleanupFunction;
    protected beforeDispose(): void;
    private ensureActive;
}
interface StateClass<TValue> extends StateExtensions<TValue> {
}
export type State<TValue> = StateClass<TValue>;
type StateConstructor = {
    <TValue>(owner: Owner, initialValue: TValue, options?: StateOptions<TValue>): State<TValue>;
    new <TValue>(owner: Owner, initialValue: TValue, options?: StateOptions<TValue>): State<TValue>;
    prototype: State<unknown>;
    extend<TValue = unknown>(): ExtendableStateClass<TValue>;
};
export declare const State: StateConstructor;
export {};
