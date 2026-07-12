import { Owner, State, type CleanupFunction } from "../state/State";
import type { Component } from "./Component";

type HostedEvent<TEvent extends Event, THost extends Owner, THostKey extends string> = TEvent & {
	readonly [KEY in THostKey]: THost;
};

type EventListenerFor<THost extends Owner, THostKey extends string, TEvent extends Event> = (event: HostedEvent<TEvent, THost, THostKey>) => unknown;

type EventListenerInputFor<THost extends Owner, THostKey extends string, TEvent extends Event> = EventListenerFor<THost, THostKey, TEvent> | State.Readonly<EventListenerFor<THost, THostKey, TEvent> | null> | null | undefined;

type EventMapValue<TEventMap, TEventName extends keyof TEventMap & string> = TEventMap[TEventName] extends Event ? TEventMap[TEventName] : Event;

type EventOnProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
	[KEventName in keyof TEventMap & string]: (owner: Owner, listener: EventListenerInputFor<THost, THostKey, EventMapValue<TEventMap, KEventName>>) => THost;
};

type EventOffProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
	[KEventName in keyof TEventMap & string]: (listener: EventListenerInputFor<THost, THostKey, EventMapValue<TEventMap, KEventName>>) => THost;
};

type OwnedEventOnProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
	[KEventName in keyof TEventMap & string]: (listener: EventListenerInputFor<THost, THostKey, EventMapValue<TEventMap, KEventName>>) => THost;
};

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

type ListenerKey = object;
type EventListenerValue<THost extends Owner, THostKey extends string, TEvent extends Event> = EventListenerFor<THost, THostKey, TEvent> | null | undefined;

/** Proxy of owner-bound event registration methods keyed by event name. */
export type EventOnProxy<THost extends Component> = EventOnProxyFor<THost, "component", ComponentHTMLElementEventMap>;

/** Proxy of event-removal methods keyed by event name. */
export type EventOffProxy<THost extends Component> = EventOffProxyFor<THost, "component", ComponentHTMLElementEventMap>;

/** Proxy of event registration methods that implicitly use the host Component as the owner. */
export type OwnedEventOnProxy<THost extends Component> = OwnedEventOnProxyFor<THost, "component", ComponentHTMLElementEventMap>;

/** Fluent interface exposed by `event.owned` for self-owned event listeners. */
export interface OwnedEventManipulator<THost extends Component> {
	readonly on: OwnedEventOnProxy<THost>;
	readonly off: EventOffProxy<THost>;
}

interface ListenerRecord {
	cleanup: CleanupFunction;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

function isListenerSource<THost extends Owner, THostKey extends string, TEvent extends Event> (
	value: EventListenerInputFor<THost, THostKey, TEvent>,
): value is State.Readonly<EventListenerFor<THost, THostKey, TEvent> | null> {

	return value instanceof State;
}

function resolveListenerValue<THost extends Owner, THostKey extends string, TEvent extends Event> (
	value: unknown,
): EventListenerFor<THost, THostKey, TEvent> | null | undefined {
	if (value === null || value === undefined) {
		return value;
	}

	if (typeof value === "function") {
		return value as EventListenerFor<THost, THostKey, TEvent>;
	}

	throw new TypeError("Unsupported listener source value.");
}


function isListenerKey<THost extends Owner, THostKey extends string, TEvent extends Event> (
	value: EventListenerInputFor<THost, THostKey, TEvent>,
): boolean {
	return typeof value === "function" || isListenerSource(value);
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

/**
 * Manages event listeners for a host owner with automatic cleanup and reactive listener support.
 * 
 * For Components, this powers the fluent `component.event.on.*`, `.off.*`, and `.owned.on.*` APIs,
 * along with typed custom-event authoring through `.emit.*` and `.dispatch.*`.
 */
export class EventManipulator<THost extends Owner = Component, THostKey extends string = "component", TEventMap = ComponentHTMLElementEventMap> {
	readonly dispatch: EventDispatchProxyFor<TEventMap>;
	readonly emit: EventDispatchProxyFor<TEventMap>;
	readonly on: EventOnProxyFor<THost, THostKey, TEventMap>;
	readonly off: EventOffProxyFor<THost, THostKey, TEventMap>;
	readonly owned: {
		readonly on: OwnedEventOnProxyFor<THost, THostKey, TEventMap>;
		readonly off: EventOffProxyFor<THost, THostKey, TEventMap>;
	};
 
	private readonly listenerRecords = new Map<string, Map<ListenerKey, ListenerRecord>>();

	constructor (
		private readonly owner: THost,
		private readonly target: EventTarget,
		private readonly hostPropertyName: THostKey = "component" as THostKey,
	) {
		this.emit = this.createDispatchProxy();
		this.dispatch = this.emit;
		this.on = this.createOnProxy(false);
		this.off = this.createOffProxy();
		this.owned = {
			off: this.off,
			on: this.createOwnedOnProxy(),
		};
		this.owner.onCleanup(() => {
			this.releaseAllListeners();
		});
	}

	private createDispatchProxy (): EventDispatchProxyFor<TEventMap> {
		return new Proxy({}, {
			get: (_, eventName) => {
				if (typeof eventName !== "string") {
					return undefined;
				}

				return (detail?: unknown, options?: EventDispatchOptions<CustomEvent>) => {
					this.ensureEmittable();

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

	private releaseAllListeners (): void {
		const cleanups: CleanupFunction[] = [];

		for (const eventRecords of this.listenerRecords.values()) {
			for (const record of eventRecords.values()) {
				cleanups.push(record.cleanup);
			}
		}

		for (const cleanup of cleanups) {
			cleanup();
		}
	}

	private createOnProxy (useOwnedOwner: boolean): EventOnProxyFor<THost, THostKey, TEventMap> {
		return new Proxy({}, {
			get: (_, eventName) => {
				if (typeof eventName !== "string") {
					return undefined;
				}

				return (ownerOrListener: Owner | EventListenerInputFor<THost, THostKey, Event>, maybeListener?: EventListenerInputFor<THost, THostKey, Event>) => {
					const resolvedOwner = useOwnedOwner ? this.owner : ownerOrListener as Owner;
					const listener = (useOwnedOwner ? ownerOrListener : maybeListener) as EventListenerInputFor<THost, THostKey, Event>;
					this.installListener(eventName as keyof TEventMap & string, resolvedOwner, listener);
					return this.owner;
				};
			},
		}) as EventOnProxyFor<THost, THostKey, TEventMap>;
	}

	private createOwnedOnProxy (): OwnedEventOnProxyFor<THost, THostKey, TEventMap> {
		return new Proxy({}, {
			get: (_, eventName) => {
				if (typeof eventName !== "string") {
					return undefined;
				}

				return (listener: EventListenerInputFor<THost, THostKey, Event>) => {
					this.installListener(eventName as keyof TEventMap & string, this.owner, listener);
					return this.owner;
				};
			},
		}) as OwnedEventOnProxyFor<THost, THostKey, TEventMap>;
	}

	private createOffProxy (): EventOffProxyFor<THost, THostKey, TEventMap> {
		return new Proxy({}, {
			get: (_, eventName) => {
				if (typeof eventName !== "string") {
					return undefined;
				}

				return (listener: EventListenerInputFor<THost, THostKey, Event>) => {
					this.removeListener(eventName as keyof TEventMap & string, listener);
					return this.owner;
				};
			},
		}) as EventOffProxyFor<THost, THostKey, TEventMap>;
	}

	private installListener<TEventName extends keyof TEventMap & string> (
		eventName: TEventName,
		owner: Owner,
		listener: EventListenerInputFor<THost, THostKey, EventMapValue<TEventMap, TEventName>>,
	): void {
		this.ensureActive();

		if (!isListenerKey(listener)) {
			return;
		}

		const key = listener as ListenerKey;
		this.replaceListener(eventName, key, owner, listener);
	}

	private replaceListener<TEventName extends keyof TEventMap & string> (
		eventName: TEventName,
		key: ListenerKey,
		owner: Owner,
		listener: EventListenerInputFor<THost, THostKey, EventMapValue<TEventMap, TEventName>>,
	): void {
		const eventRecords = this.listenerRecords.get(eventName) ?? new Map<ListenerKey, ListenerRecord>();
		this.listenerRecords.set(eventName, eventRecords);
		eventRecords.get(key)?.cleanup();

		let cleanup = noop;
		let active = true;
		let releaseDom = noop;
		let releaseOwner = noop;
		let releaseSource = noop;

		const trackedCleanup = () => {
			if (!active) {
				return;
			}

			active = false;
			releaseSource();
			releaseOwner();
			releaseDom();
			eventRecords.delete(key);
			if (eventRecords.size === 0) {
				this.listenerRecords.delete(eventName);
			}
			cleanup();
		};

		const applyResolvedListener = (nextListener: EventListenerValue<THost, THostKey, EventMapValue<TEventMap, TEventName>>) => {
			releaseOwner();
			releaseDom();

			if (!nextListener) {
				releaseOwner = noop;
				releaseDom = noop;
				return;
			}

			const handleEvent = (event: EventMapValue<TEventMap, TEventName>) => {
				nextListener(defineHostedEvent(event, this.owner, this.hostPropertyName));
			};

			this.target.addEventListener(eventName, handleEvent as EventListener);
			releaseDom = () => {
				this.target.removeEventListener(eventName, handleEvent as EventListener);
			};
			releaseOwner = owner.onCleanup(trackedCleanup);
		};

		eventRecords.set(key, { cleanup: trackedCleanup });

		if (isListenerSource(listener)) {
			releaseSource = listener.subscribe(owner, (nextValue) => {
				applyResolvedListener(resolveListenerValue<THost, THostKey, EventMapValue<TEventMap, TEventName>>(nextValue));
			});
			applyResolvedListener(resolveListenerValue<THost, THostKey, EventMapValue<TEventMap, TEventName>>(listener.value));
			return;
		}

		applyResolvedListener(resolveListenerValue<THost, THostKey, EventMapValue<TEventMap, TEventName>>(listener));
	}

	private removeListener<TEventName extends keyof TEventMap & string> (
		eventName: TEventName,
		listener: EventListenerInputFor<THost, THostKey, EventMapValue<TEventMap, TEventName>>,
	): void {
		if (!isListenerKey(listener)) {
			return;
		}

		this.listenerRecords.get(eventName)?.get(listener as ListenerKey)?.cleanup();
	}

	private ensureActive (): void {
		if (this.owner.disposed) {
			throw new Error("Disposed owners cannot be modified.");
		}
	}

	private ensureEmittable (): void {
		if (this.owner.disposed && !this.owner.disposing) {
			throw new Error("Disposed owners cannot be modified.");
		}
	}
}
