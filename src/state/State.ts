export type CleanupFunction = () => void;
export type StateEqualityFunction<TValue> = (currentValue: TValue, nextValue: TValue) => boolean;
export type StateListener<TValue> = (value: TValue, previousValue: TValue) => void;
export type StateUpdater<TValue> = (currentValue: TValue) => TValue;

export interface StateOptions<TValue> {
	equals?: StateEqualityFunction<TValue>;
}

export interface StateExtensions<TValue> { }

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

export abstract class Owner {
	private readonly cleanupFunctions = new Set<CleanupFunction>();
	private disposedValue = false;

	get disposed (): boolean {
		return this.disposedValue;
	}

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

	protected beforeDispose (): void {
		// Subclasses may override.
	}

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

	getOwner (): Owner {
		return this.owner;
	}

	get value (): TValue {
		return this.currentValue;
	}

	getGraph (): StateGraph {
		return this.graph;
	}

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

	update (updater: StateUpdater<TValue>): TValue {
		this.ensureActive();
		return this.set(updater(this.currentValue));
	}

	setEquality (equals: StateEqualityFunction<TValue>): this {
		this.ensureActive();
		this.equals = equals;
		return this;
	}

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

export type State<TValue> = StateClass<TValue>;

type StateConstructor = {
	<TValue> (owner: Owner, initialValue: TValue, options?: StateOptions<TValue>): State<TValue>;
	new <TValue>(owner: Owner, initialValue: TValue, options?: StateOptions<TValue>): State<TValue>;
	prototype: State<unknown>;
	extend<TValue = unknown> (): ExtendableStateClass<TValue>;
};

export const State = function State<TValue> (owner: Owner, initialValue: TValue, options: StateOptions<TValue> = {}): State<TValue> {
	return new StateClass(owner, initialValue, options);
} as StateConstructor;

State.prototype = StateClass.prototype;
State.extend = function extend<TValue = unknown> (): ExtendableStateClass<TValue> {
	return StateClass as ExtendableStateClass<TValue>;
};