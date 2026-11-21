import type { Emitter } from "../event/Emitter";
import { cachedView, hasVerb, limitVerb, nextVerb, offVerb, onceVerb, onVerb, ownedOnceVerb, ownedOnVerb, until, whenVerb, type ViewConstructor } from "../event/SubscribeVerbs";
import { anyHandler, findInstanceList, InstanceSubscriptionList, NO_CLASS, resolveListHandlers, subscribe, type EventCell, type HandlerInput } from "../event/Subscriptions";
import { isOwner, State, type Owner } from "../state/State";
import type { Component } from "./Component";

type HostedEvent<TEvent extends Event, THost extends Owner, THostKey extends string> = TEvent & {
	readonly [KEY in THostKey]: THost;
};

type EventListenerFor<THost extends Owner, THostKey extends string, TEvent extends Event> = (event: HostedEvent<TEvent, THost, THostKey>) => unknown;

type EventListenerInputFor<THost extends Owner, THostKey extends string, TEvent extends Event> = EventListenerFor<THost, THostKey, TEvent> | State.Readonly<EventListenerFor<THost, THostKey, TEvent> | null> | null | undefined;

type EventMapValue<TEventMap, TEventName extends keyof TEventMap & string> = TEventMap[TEventName] extends Event ? TEventMap[TEventName] : Event;

type ListenerInput<THost extends Owner, THostKey extends string, TEventMap, KEventName extends keyof TEventMap & string> = EventListenerInputFor<THost, THostKey, EventMapValue<TEventMap, KEventName>>;

type EventOnProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
	[KEventName in keyof TEventMap & string]: (owner: Owner, listener: ListenerInput<THost, THostKey, TEventMap, KEventName>, priority?: number) => THost;
};

type EventOffProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
	[KEventName in keyof TEventMap & string]: (listener: ListenerInput<THost, THostKey, TEventMap, KEventName>, priority?: number) => THost;
};

type OwnedEventOnProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
	[KEventName in keyof TEventMap & string]: (listener: ListenerInput<THost, THostKey, TEventMap, KEventName>, priority?: number) => THost;
};

type EventNextProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
	[KEventName in keyof TEventMap & string]: (signal?: AbortSignal | Owner | null, priority?: number) => Promise<HostedEvent<EventMapValue<TEventMap, KEventName>, THost, THostKey>>;
};

type EventHasProxyFor<TEventMap> = { [KEventName in keyof TEventMap & string]: () => boolean };

type EventWhenProxyFor<TEventMap> = { readonly [KEventName in keyof TEventMap & string]: Emitter.EventTrigger };

type EventLimitProxyFor<THost extends Owner, TEventMap> = { [KEventName in keyof TEventMap & string]: (max: number) => THost };

type EventUntilOnProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
	[KEventName in keyof TEventMap & string]: {
		(listener: ListenerInput<THost, THostKey, TEventMap, KEventName>, priority?: number): THost;
		(owner: Owner, listener: ListenerInput<THost, THostKey, TEventMap, KEventName>, priority?: number): THost;
	};
};

/** Event listeners limited by `until` triggers. */
export interface EventUntil<THost extends Owner, THostKey extends string, TEventMap> {
	until (...triggers: Emitter.Trigger[]): EventUntil<THost, THostKey, TEventMap>;
	/** `on.x(listener, priority?)` ends at the triggers. `on.x(owner, listener, priority?)` also ends at `owner`. */
	readonly on: EventUntilOnProxyFor<THost, THostKey, TEventMap>;
	/** Like `on`, consumed by the first event it fires for. */
	readonly once: EventUntilOnProxyFor<THost, THostKey, TEventMap>;
}

type CustomEventMapValue<TEventMap, TEventName extends keyof TEventMap & string> = Extract<EventMapValue<TEventMap, TEventName>, CustomEvent>;

type CustomEventDetail<TEvent extends CustomEvent> = TEvent extends CustomEvent<infer TDetail> ? TDetail : never;

type EventDispatchOptions<TEvent extends CustomEvent> = Omit<CustomEventInit<CustomEventDetail<TEvent>>, "detail"> & {
	readonly tweak?: (event: TEvent) => unknown;
};

type EventDispatchArguments<TEvent extends CustomEvent> = undefined extends CustomEventDetail<TEvent>
	? [detail?: CustomEventDetail<TEvent>, options?: EventDispatchOptions<TEvent>]
	: [detail: CustomEventDetail<TEvent>, options?: EventDispatchOptions<TEvent>];

type EventDispatchMethod<TEvent extends CustomEvent> = {
	dispatch (...args: EventDispatchArguments<TEvent>): boolean;
}["dispatch"];

type EventDispatchProxyMap<TEventMap> = {
	[KEventName in keyof TEventMap & string]: EventMapValue<TEventMap, KEventName> extends CustomEvent
		? EventDispatchMethod<CustomEventMapValue<TEventMap, KEventName>>
		: never;
};

type EventDispatchProxyFor<TEventMap> = EventDispatchProxyMap<ComponentHTMLElementEventMap> & EventDispatchProxyMap<TEventMap>;

/** A DOM event augmented with the owning Component on `.component`. */
export type ComponentEvent<TEvent extends Event, THost extends Component = Component> = HostedEvent<TEvent, THost, "component">;

/** A component event listener that receives the owning Component on the event object. */
export type ComponentEventListener<THost extends Component, TEvent extends Event> = EventListenerFor<THost, "component", TEvent>;

/** A direct or reactive event-listener input accepted by component event APIs. */
export type EventListenerInput<THost extends Component, TEvent extends Event> = EventListenerInputFor<THost, "component", TEvent>;

// Keep this aligned with the global Component.ts augmentation so the bundled public d.ts retains Mount/Dispose even after declare global blocks are stripped.
/** Event map for Component hosts, including lifecycle events emitted by kitsui. */
export interface ComponentHTMLElementEventMap extends HTMLElementEventMap {
	Mount: CustomEvent;
	Dispose: CustomEvent;
}

/** Proxy of owner-bound event registration methods keyed by event name. */
export type EventOnProxy<THost extends Component> = EventOnProxyFor<THost, "component", ComponentHTMLElementEventMap>;

/** Proxy of event-removal methods keyed by event name. */
export type EventOffProxy<THost extends Component> = EventOffProxyFor<THost, "component", ComponentHTMLElementEventMap>;

/** Proxy of event registration methods that implicitly use the host Component as the owner. */
export type OwnedEventOnProxy<THost extends Component> = OwnedEventOnProxyFor<THost, "component", ComponentHTMLElementEventMap>;

/** Fluent interface exposed by `event.owned` for self-owned event listeners. */
export interface OwnedEventManipulator<THost extends Component> {
	readonly on: OwnedEventOnProxy<THost>;
	readonly once: OwnedEventOnProxy<THost>;
	readonly off: EventOffProxy<THost>;
}

function defineHostedEvent<THost extends Owner, THostKey extends string, TEvent extends Event> (
	event: TEvent,
	host: THost,
	hostPropertyName: THostKey,
): HostedEvent<TEvent, THost, THostKey> {
	Object.defineProperty(event, hostPropertyName, {
		configurable: true,
		enumerable: false,
		value: host,
		writable: false,
	});

	return event as HostedEvent<TEvent, THost, THostKey>;
}

/** Events whose `stopImmediatePropagation` was called while their kitsui listeners ran. */
const stoppedEvents = new WeakSet<Event>();

function stopImmediately (this: Event): void {
	stoppedEvents.add(this);
	Event.prototype.stopImmediatePropagation.call(this);
}

/** A throwing listener is reported the way the DOM reports one, and the rest still run. */
function report (error: unknown): void {
	if (typeof reportError === "function") {
		reportError(error);
	} else {
		queueMicrotask(() => {
			throw error;
		});
	}
}

/**
 * The listeners of one event on one target. It is also the one native listener for that event, attached while it has any,
 * which runs the listeners in kitsui order: by priority, then subscription order.
 */
class ElementEventList extends InstanceSubscriptionList implements EventListenerObject {
	private attached = false;

	constructor (cell: EventCell, private readonly target: EventTarget, private readonly host: Owner, private readonly hostPropertyName: string) {
		super(cell);
	}

	protected changed (): void {
		super.changed();
		const wanted = this.records.length !== 0;
		if (wanted === this.attached) {
			return;
		}

		this.attached = wanted;
		if (wanted) {
			this.target.addEventListener(this.cell.name, this);
		} else {
			this.target.removeEventListener(this.cell.name, this);
		}
	}

	handleEvent (event: Event): void {
		const handlers = resolveListHandlers(NO_CLASS, this, this.cell);
		if (handlers.length === 0) {
			return;
		}

		const hosted = defineHostedEvent(event, this.host, this.hostPropertyName);
		// With one native listener for all of them, stopping immediate propagation has to be noticed here to skip the rest.
		const guarded = handlers.length > 1;
		if (guarded) {
			Object.defineProperty(event, "stopImmediatePropagation", { configurable: true, value: stopImmediately, writable: true });
		}

		try {
			for (let index = 0; index < handlers.length; index++) {
				const handler = handlers[index].take();
				if (handler === null) {
					continue;
				}

				try {
					handler(hosted);
				} catch (error) {
					report(error);
				}

				if (guarded && stoppedEvents.has(event)) {
					break;
				}
			}
		} finally {
			if (guarded) {
				delete (event as { stopImmediatePropagation?: unknown }).stopImmediatePropagation;
			}
		}
	}
}

/**
 * Manages event listeners for a host owner with automatic cleanup and reactive listener support.
 *
 * For Components, this powers `component.event`. Subscribing reads exactly like an `Emitter`: `on`, `once`, `off`, `owned`, `next`,
 * `has`, `when`, `limit` and `until`, with priorities. Listeners run highest priority first, then in subscription order, and a
 * throwing one is reported without stopping the rest. Typed custom events are authored through `.emit.*` and `.dispatch.*`.
 */
export class EventManipulator<THost extends Owner = Component, THostKey extends string = "component", TEventMap = ComponentHTMLElementEventMap> {
	private emitProxy: EventDispatchProxyFor<TEventMap> | null = null;
	private lists: ElementEventList[] | null = null;
	private cellLimits: Map<EventCell, number> | null = null;
	private verbViews: Map<object, object> | null = null;

	constructor (
		private readonly owner: THost,
		private readonly target: EventTarget,
		private readonly hostPropertyName: THostKey = "component" as THostKey,
	) {
		this.owner.onCleanup(() => {
			for (const list of this.lists ?? []) {
				list.clear();
			}
		});
	}

	get dispatch (): EventDispatchProxyFor<TEventMap> {
		return this.emit;
	}

	get emit (): EventDispatchProxyFor<TEventMap> {
		return this.emitProxy ??= this.createDispatchProxy();
	}

	/** `event.on.x(owner, listener, priority?)`: listens until `owner` disposes. */
	get on (): EventOnProxyFor<THost, THostKey, TEventMap> {
		return this.verbView(onVerb) as EventOnProxyFor<THost, THostKey, TEventMap>;
	}

	/** `event.once.x(owner, listener, priority?)`: like `on`, consumed by the first event it fires for. */
	get once (): EventOnProxyFor<THost, THostKey, TEventMap> {
		return this.verbView(onceVerb) as EventOnProxyFor<THost, THostKey, TEventMap>;
	}

	/** `event.off.x(listener, priority?)`: removes the listener with this listener and priority. */
	get off (): EventOffProxyFor<THost, THostKey, TEventMap> {
		return this.verbView(offVerb) as EventOffProxyFor<THost, THostKey, TEventMap>;
	}

	/** The same listening verbs with the host as the owner. */
	get owned (): {
		readonly on: OwnedEventOnProxyFor<THost, THostKey, TEventMap>;
		readonly once: OwnedEventOnProxyFor<THost, THostKey, TEventMap>;
		readonly off: EventOffProxyFor<THost, THostKey, TEventMap>;
	} {
		return {
			off: this.off,
			on: this.verbView(ownedOnVerb) as OwnedEventOnProxyFor<THost, THostKey, TEventMap>,
			once: this.verbView(ownedOnceVerb) as OwnedEventOnProxyFor<THost, THostKey, TEventMap>,
		};
	}

	/** `await event.next.x(signal?, priority?)`: the next event. An aborted signal or disposed owner rejects with the abort reason. */
	get next (): EventNextProxyFor<THost, THostKey, TEventMap> {
		return this.verbView(nextVerb) as EventNextProxyFor<THost, THostKey, TEventMap>;
	}

	/** `event.has.x()`: whether any kitsui listener would run for this event. */
	get has (): EventHasProxyFor<TEventMap> {
		return this.verbView(hasVerb) as EventHasProxyFor<TEventMap>;
	}

	/** `event.when.x`: a trigger for `until` that fires on this event. */
	get when (): EventWhenProxyFor<TEventMap> {
		return this.verbView(whenVerb) as EventWhenProxyFor<TEventMap>;
	}

	/** `event.limit.x(max)`: how many listeners this event can have before the `possible-leak` warning. */
	get limit (): EventLimitProxyFor<THost, TEventMap> {
		return this.verbView(limitVerb) as EventLimitProxyFor<THost, TEventMap>;
	}

	/** Starts listeners that end at the first of `triggers`: an event from `when`, an owner disposing, a state changing, or a promise settling. */
	until (...triggers: Emitter.Trigger[]): EventUntil<THost, THostKey, TEventMap> {
		return until(this, triggers) as unknown as EventUntil<THost, THostKey, TEventMap>;
	}

	private verbView (verb: ViewConstructor<object>): object {
		return cachedView(this.verbViews ??= new Map(), verb, this);
	}

	private get eventHost (): THost {
		return this.owner;
	}

	private eventsClosed (): boolean {
		return this.owner.disposed;
	}

	private eventOwner (): unknown {
		return this.owner;
	}

	private subscribeCell (cell: EventCell, owner: unknown, listener: HandlerInput, priority: number | undefined, once: boolean): void {
		if (this.owner.disposed) {
			throw new Error("Disposed owners cannot be modified.");
		}

		if (!isOwner(owner)) {
			throw new TypeError("An event listener owner must be an Owner.");
		}

		if (typeof listener !== "function" && !(listener instanceof State)) {
			return;
		}

		let list = findInstanceList(this.lists, cell);
		if (list === undefined) {
			list = new ElementEventList(cell, this.target, this.owner, this.hostPropertyName);
			(this.lists ??= []).push(list);
		}

		subscribe(list, this.cellLimits?.get(cell), owner, listener, priority, once, this.owner);
	}

	private unsubscribeCell (cell: EventCell, listener: HandlerInput, priority = 0): void {
		findInstanceList(this.lists, cell)?.find(listener, priority)?.remove();
	}

	private setCellLimit (cell: EventCell, max: number): void {
		(this.cellLimits ??= new Map()).set(cell, max);
	}

	private hasHandlers (cell: EventCell): boolean {
		return anyHandler(findInstanceList(this.lists, cell)?.records ?? []);
	}

	private nextValue (received: readonly unknown[]): unknown {
		return received[0];
	}

	private createDispatchProxy (): EventDispatchProxyFor<TEventMap> {
		return new Proxy({}, {
			get: (_, eventName) => {
				if (typeof eventName !== "string") {
					return undefined;
				}

				return (detail?: unknown, options?: EventDispatchOptions<CustomEvent>) => {
					if (this.owner.disposed && !this.owner.disposing) {
						throw new Error("Disposed owners cannot be modified.");
					}

					const { tweak, ...init } = options ?? {};
					const event = new CustomEvent(eventName, {
						...init,
						detail,
					});

					tweak?.(event);
					return this.target.dispatchEvent(event);
				};
			},
		}) as EventDispatchProxyFor<TEventMap>;
	}
}
