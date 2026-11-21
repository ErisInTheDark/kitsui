import { isOwner, Owner, State } from "../state/State";
import type { Emitter } from "./Emitter";
import { cellFor, warn, type EventCell, type HandlerInput, type StoredHandler } from "./Subscriptions";

const TARGET = Symbol("event verb target");

export interface View<TTarget> {
	readonly [TARGET]: TTarget;
}

export type ViewConstructor<TTarget> = new (target: TTarget) => object;

/**
 * Builds the view class for one verb. All views of a verb share one `methods` prototype, whose own prototype is a proxy that defines
 * a real property on `methods` the first time an event name is read. Later reads resolve without reaching the proxy, so V8's inline
 * caches treat them like ordinary methods, and a verb costs each scope one small view instead of a proxy and per-event closures.
 * Nothing else is on the chain, so any event name resolves to the event, and the target's symbol key can't collide with one.
 */
export function defineVerb<TTarget> (materialise: (cell: EventCell) => PropertyDescriptor): ViewConstructor<TTarget> {
	const methods = Object.create(new Proxy(Object.create(null) as object, {
		get (_, name, receiver) {
			if (typeof name !== "string") {
				return undefined;
			}

			Object.defineProperty(methods, name, materialise(cellFor(name)));
			return Reflect.get(methods as object, name, receiver) as unknown;
		},
	})) as object;

	function ViewConstructor (this: { [TARGET]: TTarget }, target: TTarget): void {
		this[TARGET] = target;
	}

	ViewConstructor.prototype = methods;
	return ViewConstructor as unknown as ViewConstructor<TTarget>;
}

export function targetOf<TTarget> (view: View<TTarget>): TTarget {
	return view[TARGET];
}

/** One view per verb per target, made on first use. */
export function cachedView<TTarget> (views: Map<object, object>, verb: ViewConstructor<TTarget>, target: TTarget): object {
	let view = views.get(verb);
	if (view === undefined) {
		view = new verb(target);
		views.set(verb, view);
	}

	return view;
}

/**
 * Where subscriptions of some events live: an emitter, a class's subscriptions, or an element's events. The subscribing verbs,
 * `on`, `once`, `off`, `owned`, `next`, `has`, `when`, `limit` and `until`, are shared by all of them and reach only these members.
 * Each scope declares them private, so they stay out of its public type and a subclass can expose its own `subscribe` or `on`;
 * the names are unusual for the same reason.
 */
interface Scope {
	/** What subscribing verbs return. */
	readonly eventHost: unknown;
	/** Whether this fires nothing anymore; `until` subscriptions end at once. */
	eventsClosed (): boolean;
	/** The owner `owned` verbs subscribe with. */
	eventOwner (): unknown;
	subscribeCell (cell: EventCell, owner: unknown, handler: HandlerInput, priority: number | undefined, once: boolean): void;
	unsubscribeCell (cell: EventCell, handler: HandlerInput, priority: number | undefined): void;
	setCellLimit (cell: EventCell, max: number): void;
	hasHandlers (cell: EventCell): boolean;
	/** What `next` resolves with, from the arguments its handler received. */
	nextValue (received: readonly unknown[]): unknown;
}

/** Any scope; its members are private, so only the verbs here read them. */
export type EventScope = object;

function scopeOf (view: View<EventScope>): Scope {
	return view[TARGET] as Scope;
}

const defineOnVerb = (once: boolean): ViewConstructor<EventScope> => defineVerb<EventScope>(cell => ({
	value (this: View<EventScope>, owner: unknown, handler: HandlerInput, priority?: number) {
		const scope = scopeOf(this);
		scope.subscribeCell(cell, owner, handler, priority, once);
		return scope.eventHost;
	},
}));

export const onVerb = defineOnVerb(false);
export const onceVerb = defineOnVerb(true);

export const offVerb = defineVerb<EventScope>(cell => ({
	value (this: View<EventScope>, handler: HandlerInput, priority?: number) {
		const scope = scopeOf(this);
		scope.unsubscribeCell(cell, handler, priority);
		return scope.eventHost;
	},
}));

const defineOwnedOnVerb = (once: boolean): ViewConstructor<EventScope> => defineVerb<EventScope>(cell => ({
	value (this: View<EventScope>, handler: HandlerInput, priority?: number) {
		const scope = scopeOf(this);
		scope.subscribeCell(cell, scope.eventOwner(), handler, priority, once);
		return scope.eventHost;
	},
}));

export const ownedOnVerb = defineOwnedOnVerb(false);
export const ownedOnceVerb = defineOwnedOnVerb(true);

export const nextVerb = defineVerb<EventScope>(cell => ({
	value (this: View<EventScope>, signalInput?: AbortSignal | Owner | null, priority?: number) {
		const scope = scopeOf(this);
		const signal = signalOf(signalInput);
		return new Promise<unknown>((resolve, reject) => {
			if (signal?.aborted) {
				reject(signal.reason as Error);
				return;
			}

			const onAbort = (): void => {
				scope.unsubscribeCell(cell, handler, priority);
				reject(signal?.reason as Error);
			};

			const handler = ((...received: unknown[]) => {
				signal?.removeEventListener("abort", onAbort);
				resolve(scope.nextValue(received));
			}) as StoredHandler;

			// Owned by the host when it's an owner, so a host that goes away takes the waiting subscription with it.
			const owner = scope.eventOwner();
			scope.subscribeCell(cell, isOwner(owner) ? owner : null, handler, priority, true);
			signal?.addEventListener("abort", onAbort, { once: true });
		});
	},
}));

export const hasVerb = defineVerb<EventScope>(cell => ({
	value (this: View<EventScope>) {
		return scopeOf(this).hasHandlers(cell);
	},
}));

export const whenVerb = defineVerb<EventScope>(cell => ({
	get (this: View<EventScope>) {
		return new EventTrigger(scopeOf(this), cell);
	},
}));

export const limitVerb = defineVerb<EventScope>(cell => ({
	value (this: View<EventScope>, max: number) {
		const scope = scopeOf(this);
		scope.setCellLimit(cell, max);
		return scope.eventHost;
	},
}));

/** One event of one scope, as a value that can end an `until` subscription. */
class EventTrigger implements Emitter.EventTrigger {
	constructor (private readonly scope: Scope, private readonly cell: EventCell) { }

	/** The emitter, class or element events this event belongs to. */
	get emitter (): object {
		return this.scope;
	}

	get event (): string {
		return this.cell.name;
	}

	attach (lifetime: Owner, end: StoredHandler): void {
		this.scope.subscribeCell(this.cell, lifetime, end, 0, false);
	}
}

type Trigger = Emitter.Trigger;

/** Subscriptions made through `until`, which all end at the first of its triggers. */
export class UntilSubscriber {
	private readonly lifetime = Owner();
	private readonly end: () => void = () => this.lifetime.dispose();
	private onView: object | null = null;
	private onceView: object | null = null;

	constructor (private readonly scope: Scope) { }

	get on (): object {
		return this.onView ??= new untilOnVerb(this);
	}

	get once (): object {
		return this.onceView ??= new untilOnceVerb(this);
	}

	until (...triggers: Trigger[]): this {
		for (const trigger of triggers) {
			this.attach(trigger);
		}

		return this;
	}

	private attach (trigger: Trigger): void {
		if (this.lifetime.disposed) {
			warn({ event: "until", host: this.scope.eventHost, kind: "until-released" });
		} else if (trigger instanceof EventTrigger) {
			trigger.attach(this.lifetime, this.end as StoredHandler);
		} else if (trigger instanceof State) {
			trigger.subscribeImmediate(this.lifetime, this.end);
		} else if (isThenable(trigger)) {
			void trigger.then(this.end, this.end);
		} else if (isOwner(trigger)) {
			trigger.onCleanup(this.lifetime, this.end);
		} else {
			throw new TypeError("until requires a trigger; null never ends a subscription.");
		}
	}

	subscribeUntil (cell: EventCell, owner: unknown, handler: HandlerInput, priority: number | undefined, once: boolean): unknown {
		const scope = this.scope;
		if (this.lifetime.disposed) {
			warn({ event: cell.name, host: scope.eventHost, kind: "until-released" });
			return scope.eventHost;
		}

		const closed = scope.eventsClosed();
		if (closed) {
			this.lifetime.dispose();
		}

		scope.subscribeCell(cell, owner === null || owner === undefined || closed ? this.lifetime : this.scopeTo(owner), handler, priority, once);
		return scope.eventHost;
	}

	/** A subscription links to one owner, so one ended by both the triggers and `owner` gets its own. Ending it releases the links on both. */
	private scopeTo (owner: unknown): Owner {
		if (!isOwner(owner)) {
			throw new TypeError("An event subscription owner must be an Owner.");
		}

		const scope = Owner();
		const end = () => scope.dispose();
		this.lifetime.onCleanup(scope, end);
		owner.onCleanup(scope, end);
		return scope;
	}
}

const defineUntilOnVerb = (once: boolean): ViewConstructor<UntilSubscriber> => defineVerb<UntilSubscriber>(cell => ({
	value (this: View<UntilSubscriber>, ownerOrHandler: unknown, handlerOrPriority?: HandlerInput | number, priority?: number) {
		// A handler, or a handler state, comes first when no owner is given. An owner is `null` or an Owner that isn't a state.
		return ownerOrHandler === null || isOwner(ownerOrHandler) && !(ownerOrHandler instanceof State)
			? this[TARGET].subscribeUntil(cell, ownerOrHandler, handlerOrPriority as HandlerInput, priority, once)
			: this[TARGET].subscribeUntil(cell, null, ownerOrHandler as HandlerInput, handlerOrPriority as number | undefined, once);
	},
}));

const untilOnVerb = defineUntilOnVerb(false);
const untilOnceVerb = defineUntilOnVerb(true);

/** Starts `until` subscriptions on a scope. */
export function until (scope: EventScope, triggers: readonly Trigger[]): UntilSubscriber {
	return new UntilSubscriber(scope as unknown as Scope).until(...triggers);
}

function isThenable (value: unknown): value is PromiseLike<unknown> {
	return typeof (value as PromiseLike<unknown> | null | undefined)?.then === "function";
}

function signalOf (input: AbortSignal | Owner | null | undefined): AbortSignal | null {
	if (input === null || input === undefined) {
		return null;
	}

	if (input instanceof AbortSignal) {
		return input;
	}

	if (!isOwner(input)) {
		throw new TypeError("next takes an AbortSignal, an Owner, or nothing.");
	}

	return input.signal;
}
