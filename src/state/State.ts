import { cancelNextTickCheck, isNextTickCheckScheduled, scheduleNextTickCheck } from "../utility/nextTickCheck";

/**
 * Function invoked during cleanup to release resources.
 */
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

/** Queued links of states that share one batching scope, waiting for the next flush. */
interface StateGraph {
	pending: StateLink<unknown>[];
	scheduled: boolean;
}

interface StateNotification<T> {
	force: boolean;
	immediateLinks: StateLink<T>[] | null;
	previousValue: T;
	value: T;
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
		pending: [],
		scheduled: false,
	};
}

function flushGraph (graph: StateGraph): void {
	graph.scheduled = false;
	const links = graph.pending;
	if (links.length === 0) {
		return;
	}

	graph.pending = [];

	// Snapshot every delivery before any listener runs; listeners may queue the same links again for the next flush.
	const count = links.length;
	const originals = new Array<unknown>(count);
	const finals = new Array<unknown>(count);
	const deliver = new Array<boolean>(count);
	for (let index = 0; index < count; index++) {
		const link = links[index];
		link.queued = false;
		originals[index] = link.pendingOriginalValue;
		finals[index] = link.pendingFinalValue;
		deliver[index] = link.forcePendingEmit || !link.equals(link.pendingOriginalValue, link.pendingFinalValue);
		link.forcePendingEmit = false;
		link.pendingOriginalValue = undefined;
		link.pendingFinalValue = undefined;
	}

	let failed = false;
	let firstError: unknown;
	for (let index = 0; index < count; index++) {
		const link = links[index];
		if (!deliver[index] || link.source === null) {
			continue;
		}

		try {
			link.notify(finals[index], originals[index]);
		} catch (error) {
			if (!failed) {
				failed = true;
				firstError = error;
			}
		}
	}

	if (failed) {
		throw firstError;
	}
}

function scheduleGraphFlush (graph: StateGraph): void {
	if (graph.scheduled) {
		return;
	}

	graph.scheduled = true;
	const flush = () => flushGraph(graph);

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
 * A node in an owner's cleanup list. Subclasses carry their own data instead of closures,
 * so registering cleanup work allocates one object and unregistering is O(1).
 * @internal
 */
export abstract class CleanupLink {
	cleanupOwner: OwnerClass | null = null;
	previousCleanup: CleanupLink | null = null;
	nextCleanup: CleanupLink | null = null;

	/** Runs once when the owner this link is registered on disposes. */
	abstract runCleanup (): void;

	/** Unregisters this link from its owner without running it. */
	releaseCleanup (): void {
		const owner = this.cleanupOwner;
		if (owner) {
			unlinkCleanup(owner, this);
		}
	}
}

class FunctionCleanupLink extends CleanupLink {
	constructor (private readonly cleanupFunction: CleanupFunction) {
		super();
	}

	runCleanup (): void {
		this.cleanupFunction();
	}
}

/** One half of a cleanup registered on two owners: whichever disposes first releases the other half. */
class PairedCleanupLink extends CleanupLink {
	partner: PairedCleanupLink | null = null;

	constructor (private readonly cleanupFunction: CleanupFunction | null) {
		super();
	}

	runCleanup (): void {
		this.partner?.releaseCleanup();
		this.cleanupFunction?.();
	}
}

/**
 * Disposes a target owner when the owner it is registered on disposes.
 * @internal
 */
export class DisposeLink extends CleanupLink {
	constructor (private readonly target: OwnerClass) {
		super();
	}

	runCleanup (): void {
		this.target.dispose();
	}
}

/**
 * Registers a cleanup link on an owner. If the owner is already disposed, the link runs immediately.
 * @internal
 */
export function linkCleanup (owner: OwnerClass, link: CleanupLink): void {
	if (owner["disposedValue"]) {
		link.runCleanup();
		return;
	}

	link.cleanupOwner = owner;
	const tail = owner["cleanupTail"];
	link.previousCleanup = tail;
	if (tail) {
		tail.nextCleanup = link;
	} else {
		owner["cleanupHead"] = link;
	}
	owner["cleanupTail"] = link;
}

function unlinkCleanup (owner: OwnerClass, link: CleanupLink): void {
	if (link.cleanupOwner !== owner) {
		return;
	}

	link.cleanupOwner = null;
	if (owner["disposedValue"]) {
		// Disposal detached the list and walks it through the saved links; marking the link inactive is enough.
		return;
	}

	const previous = link.previousCleanup;
	const next = link.nextCleanup;
	if (previous) {
		previous.nextCleanup = next;
	} else {
		owner["cleanupHead"] = next;
	}
	if (next) {
		next.previousCleanup = previous;
	} else {
		owner["cleanupTail"] = previous;
	}
	link.previousCleanup = null;
	link.nextCleanup = null;
}

/**
 * Implements the shared disposal lifecycle for owner-aware resources.
 * @group Owner
 */
abstract class OwnerClass {
	private abortController: AbortController | null = null;
	private cleanupHead: CleanupLink | null = null;
	private cleanupTail: CleanupLink | null = null;
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

		try {
			try {
				this.abortController?.abort();
			} catch (error) {
				failed = true;
				firstError = error;
			}

			try {
				this.beforeDispose();
			} catch (error) {
				if (!failed) {
					failed = true;
					firstError = error;
				}
			}

			let link = this.cleanupHead;
			this.cleanupHead = null;
			this.cleanupTail = null;
			while (link) {
				const next = link.nextCleanup;
				link.previousCleanup = null;
				link.nextCleanup = null;
				const active = link.cleanupOwner === this;
				link.cleanupOwner = null;
				if (active) {
					try {
						link.runCleanup();
					} catch (error) {
						if (!failed) {
							failed = true;
							firstError = error;
						}
					}
				}
				link = next;
			}

			try {
				this.afterDispose();
			} catch (error) {
				if (!failed) {
					failed = true;
					firstError = error;
				}
			}
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
		if (!(ownerOrCleanupFunction instanceof OwnerClass) || ownerOrCleanupFunction === this) {
			const cleanupFunction = ownerOrCleanupFunction instanceof OwnerClass
				? maybeCleanupFunction as CleanupFunction
				: ownerOrCleanupFunction;
			if (this.disposedValue) {
				cleanupFunction();
				return noop;
			}

			const link = new FunctionCleanupLink(cleanupFunction);
			linkCleanup(this, link);
			return () => link.releaseCleanup();
		}

		const owner = ownerOrCleanupFunction;
		if (owner.disposed) {
			return noop;
		}

		const cleanupFunction = maybeCleanupFunction as CleanupFunction;
		if (this.disposedValue) {
			cleanupFunction();
			return noop;
		}

		const runLink = new PairedCleanupLink(cleanupFunction);
		const releaseLink = new PairedCleanupLink(null);
		runLink.partner = releaseLink;
		releaseLink.partner = runLink;
		linkCleanup(this, runLink);
		linkCleanup(owner, releaseLink);

		return () => {
			runLink.releaseCleanup();
			releaseLink.releaseCleanup();
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
// A proxy keeps `Owner()` callable while `class X extends Owner` constructs exactly like `extends OwnerClass`,
// which lets V8 share one hidden class per subclass instead of deriving a fresh one per instance.
export const Owner = new Proxy(OwnerClass, {
	apply: () => Reflect.construct(OwnerClass, []),
}) as unknown as OwnerConstructor;

/**
 * Whether a value is an owner. Prefer this over `instanceof Owner` in hot paths.
 * @internal
 */
export function isOwner (value: unknown): value is Owner {
	return value instanceof OwnerClass;
}

const orphanedStateErrorMessage = "States must have an owner before the next tick.";

/**
 * A subscription of one listener-like target to a state's changes.
 * Immediate links are notified synchronously on every change; queued links are batched per state graph.
 * A link is also a cleanup link, so the owner that bounds the subscription can release it without a closure.
 * @internal
 */
export abstract class StateLink<T> extends CleanupLink {
	source: StateClass<T> | null = null;
	queued = false;
	forcePendingEmit = false;
	pendingOriginalValue: T | undefined = undefined;
	pendingFinalValue: T | undefined = undefined;
	equals: StateEqualityFunction<T> = Object.is;

	constructor (readonly immediate: boolean) {
		super();
	}

	/** Receives a change from the source state. */
	abstract notify (value: T, previousValue: T): void;

	runCleanup (): void {
		this.unsubscribe();
	}

	/** Stops receiving changes and releases the owner registration. Idempotent. */
	unsubscribe (): void {
		const source = this.source;
		this.source = null;
		if (source) {
			detachLink(source, this);
		}
		this.releaseCleanup();
	}
}

class ListenerLink<T> extends StateLink<T> {
	constructor (immediate: boolean, private readonly listener: StateListener<T>) {
		super(immediate);
	}

	notify (value: T, previousValue: T): void {
		this.listener(value, previousValue);
	}
}

function attachLink<T> (state: StateClass<T>, link: StateLink<T>): void {
	link.source = state;
	if (link.immediate) {
		const links = state["immediateLinks"];
		if (links === null) {
			state["immediateLinks"] = [link];
		} else if (state["immediateLinksShared"]) {
			state["immediateLinks"] = [...links, link];
			state["immediateLinksShared"] = false;
		} else {
			links.push(link);
		}
		return;
	}

	link.equals = state["equalityFunction"];
	const links = state["queuedLinks"];
	if (links === null) {
		state["queuedLinks"] = [link];
	} else {
		links.push(link);
	}
}

function removeFromLinks<T> (links: StateLink<T>[], link: StateLink<T>, copy: boolean): StateLink<T>[] | null {
	const index = links.indexOf(link);
	if (index < 0) {
		return links;
	}

	if (links.length === 1) {
		return null;
	}

	if (copy) {
		return links.filter(candidate => candidate !== link);
	}

	links.splice(index, 1);
	return links;
}

function detachLink<T> (state: StateClass<T>, link: StateLink<T>): void {
	if (link.immediate) {
		const links = state["immediateLinks"];
		if (links !== null) {
			const shared = state["immediateLinksShared"];
			state["immediateLinks"] = removeFromLinks(links, link, shared);
			if (shared) {
				state["immediateLinksShared"] = false;
			}
		}
		return;
	}

	// A queued link may still sit in the graph's pending list; the flush skips it once its source is cleared.
	const links = state["queuedLinks"];
	if (links !== null) {
		state["queuedLinks"] = removeFromLinks(links, link, false);
	}
}

/** @group State */
class StateClass<T> extends OwnerClass {
	private owner: Owner | null;
	private ownerLink: DisposeLink | null = null;
	private isImplicitOwner = false;
	private mutable = true;
	private requiresExplicitOwner = false;
	private implicitOwnerDependents: Set<StateClass<unknown>> | null = null;
	private currentValue: T;
	// Members that accept T are typed `any` so State<T> stays covariant (a State<string> is usable as a State<string | null>).
	private equalityFunction: StateEqualityFunction<any>;
	private readonly fixFunction: StateFixFunction<any>;
	private graph: StateGraph | null;
	private immediateLinks: StateLink<any>[] | null = null;
	/** True while a notification in progress iterates `immediateLinks`; edits then copy the array instead of mutating it. */
	private immediateLinksShared = false;
	private queuedLinks: StateLink<any>[] | null = null;
	private notifying = false;
	private pendingNotifications: StateNotification<any>[] | null = null;

	constructor (owner: Owner | null, initialValue: T, options: StateInternalOptions<T> = {}, requiresOwner = true) {
		super();
		assertDefinedStateValue(initialValue);
		this.owner = owner;
		this.fixFunction = options.fix ?? ident;
		this.currentValue = fixStateValue(this.fixFunction, initialValue);
		this.equalityFunction = options.equals ?? Object.is;
		this.graph = options.graph ?? null;

		if (owner) {
			this.ownerLink = new DisposeLink(this);
			linkCleanup(owner, this.ownerLink);
		}
		else if (requiresOwner) {
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
		return this.graph ??= createStateGraph();
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
		const fixedValue = fixStateValue(this.fixFunction, nextValue);

		if (this.equalityFunction(this.currentValue, fixedValue)) {
			return this.currentValue;
		}

		return this.commit(fixedValue, false);
	}

	private commit (nextValue: T, force: boolean): T {
		const previousValue = this.currentValue;
		this.currentValue = nextValue;
		const immediateLinks = this.immediateLinks;

		if (this.notifying) {
			if (immediateLinks !== null) {
				this.immediateLinksShared = true;
			}
			(this.pendingNotifications ??= []).push({ force, immediateLinks, previousValue, value: nextValue });
			return this.currentValue;
		}

		if (immediateLinks === null && this.queuedLinks === null) {
			return this.currentValue;
		}

		this.notifying = true;
		if (immediateLinks !== null) {
			this.immediateLinksShared = true;
		}

		try {
			this.deliver(immediateLinks, force, previousValue, nextValue);

			let notifications = this.pendingNotifications;
			while (notifications !== null) {
				this.pendingNotifications = null;
				for (const notification of notifications) {
					this.deliver(notification.immediateLinks, notification.force, notification.previousValue, notification.value);
				}
				notifications = this.pendingNotifications;
			}
		} finally {
			this.notifying = false;
			this.pendingNotifications = null;
			this.immediateLinksShared = false;
		}

		return this.currentValue;
	}

	private deliver (immediateLinks: StateLink<any>[] | null, force: boolean, previousValue: T, value: T): void {
		if (immediateLinks !== null) {
			for (const link of immediateLinks) {
				if (link.source === this) {
					link.notify(value, previousValue);
				}
			}
		}

		const queuedLinks = this.queuedLinks;
		if (queuedLinks === null) {
			return;
		}

		const graph = this.getGraph();
		for (const link of queuedLinks) {
			if (!link.queued) {
				link.queued = true;
				link.forcePendingEmit = force;
				link.pendingOriginalValue = previousValue;
				link.pendingFinalValue = value;
				link.equals = this.equalityFunction;
				graph.pending.push(link as StateLink<unknown>);
				scheduleGraphFlush(graph);
				continue;
			}

			link.forcePendingEmit ||= force;
			link.pendingFinalValue = value;
		}
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
		return this.commit(fixStateValue(this.fixFunction, nextValue === undefined ? this.currentValue : nextValue), true);
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

		const link = new ListenerLink(true, listener);
		attachLink(this, link);
		return () => link.unsubscribe();
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

		const link = new ListenerLink(false, listener);
		attachLink(this, link);
		return () => link.unsubscribe();
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
		const link = new ListenerLink(true, listener);
		this._link(owner, link);
		return () => link.unsubscribe();
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
		const link = new ListenerLink(false, listener);
		this._link(owner, link);
		return () => link.unsubscribe();
	}

	/**
	 * Attaches a subscription link bounded by an owner, with the same ownership effects as `subscribe`.
	 * @internal
	 */
	_link (owner: Owner, link: StateLink<any>): void {
		this.setImplicitOwnerCandidate(owner);
		if (!this.disposed) {
			attachLink(this, link);
		}
		linkCleanup(owner, link);
	}

	/** @internal */
	_registerImplicitOwnerDependent (dependent: State.Readonly<unknown>): CleanupFunction {
		const dependentState = dependent as StateClass<unknown>;

		if (this.disposed || dependentState.disposed) {
			return noop;
		}

		(this.implicitOwnerDependents ??= new Set()).add(dependentState);

		if (this.isImplicitOwner && this.owner !== null) {
			dependentState.setImplicitOwnerCandidate(this.owner);
		}

		return () => {
			this.implicitOwnerDependents?.delete(dependentState);
		};
	}

	protected beforeDispose (): void {
		cancelNextTickCheck(this);
		this.ownerLink?.releaseCleanup();
		this.ownerLink = null;

		const immediateLinks = this.immediateLinks;
		const queuedLinks = this.queuedLinks;
		this.immediateLinks = null;
		this.queuedLinks = null;
		this.implicitOwnerDependents = null;

		if (immediateLinks !== null) {
			for (const link of immediateLinks) {
				link.source = null;
				link.releaseCleanup();
			}
		}

		if (queuedLinks !== null) {
			for (const link of queuedLinks) {
				link.source = null;
				link.releaseCleanup();
			}
		}
	}

	private static checkOrphan (state: StateClass<unknown>): void {
		if (state.disposed || state.owner !== null) {
			return;
		}

		throw new Error(orphanedStateErrorMessage);
	}

	private refreshOrphanCheck (): void {
		if (this.disposed || this.owner !== null) {
			cancelNextTickCheck(this);
			return;
		}

		if (!isNextTickCheckScheduled(this)) {
			scheduleNextTickCheck(this as StateClass<unknown>, StateClass.checkOrphan);
		}
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
			this.ownerLink?.releaseCleanup();
			this.ownerLink = null;
			this.owner = null;
			this.isImplicitOwner = false;
			this.requiresExplicitOwner = true;
			this.refreshOrphanCheck();
			this.notifyImplicitOwnerDependents(candidate);
			return;
		}

		this.owner = candidate;
		this.isImplicitOwner = true;
		this.ownerLink = new DisposeLink(this);
		linkCleanup(candidate, this.ownerLink);
		cancelNextTickCheck(this);
		this.notifyImplicitOwnerDependents(candidate);
	}

	private notifyImplicitOwnerDependents (candidate: Owner): void {
		if (this.implicitOwnerDependents === null) {
			return;
		}

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

function fixStateValue<T> (fix: StateFixFunction<T>, value: T): T {
	return fix(value) ?? value;
}

interface StateClass<T> extends State.Readonly<T>, StateExtensions<T> { }

/** A state with a fixed value: updates are ignored and it needs no owner. */
class ReadonlyStateClass<T> extends StateClass<T> {
	constructor (value: T) {
		super(null, value, {}, false);
		this["mutable"] = false;
	}

	override set (nextValue: T): T {
		return nextValue;
	}

	override update (): T {
		return this.value;
	}

	override clear (): T {
		return this.value;
	}
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
	if (ownerOrValue instanceof OwnerClass && arguments.length >= 2) {
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
	return new ReadonlyStateClass(value as WidenStateValue<T>) as State.Readonly<WidenStateValue<T>>;
};
