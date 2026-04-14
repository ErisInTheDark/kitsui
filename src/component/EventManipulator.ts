import { Owner, type CleanupFunction } from "../state/State";
import type { Component } from "./Component";

export type ComponentEvent<TEvent extends Event, THost extends Component = Component> = TEvent & {
	readonly component: THost;
};

export type ComponentEventListener<THost extends Component, TEvent extends Event> = (event: ComponentEvent<TEvent, THost>) => unknown;

export interface EventListenerSource<THost extends Component, TEvent extends Event> {
	readonly value: ComponentEventListener<THost, TEvent> | null | undefined;
	subscribe (owner: Owner, listener: (value: ComponentEventListener<THost, TEvent> | null | undefined) => void): CleanupFunction;
}

export type EventListenerInput<THost extends Component, TEvent extends Event> = ComponentEventListener<THost, TEvent> | EventListenerSource<THost, TEvent> | null | undefined;

type ListenerKey = object;
type EventListenerValue<THost extends Component, TEvent extends Event> = ComponentEventListener<THost, TEvent> | null | undefined;

export type EventOnProxy<THost extends Component> = {
	[KEventName in keyof HTMLElementEventMap]: (owner: Owner, listener: EventListenerInput<THost, HTMLElementEventMap[KEventName]>) => THost;
};

export type EventOffProxy<THost extends Component> = {
	[KEventName in keyof HTMLElementEventMap]: (listener: EventListenerInput<THost, HTMLElementEventMap[KEventName]>) => THost;
};

export type OwnedEventOnProxy<THost extends Component> = {
	[KEventName in keyof HTMLElementEventMap]: (listener: EventListenerInput<THost, HTMLElementEventMap[KEventName]>) => THost;
};

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

function isListenerSource<THost extends Component, TEvent extends Event> (
	value: EventListenerInput<THost, TEvent>,
): value is EventListenerSource<THost, TEvent> {
	return typeof value === "object"
		&& value !== null
		&& "value" in value
		&& "subscribe" in value
		&& typeof value.subscribe === "function";
}


function isListenerKey<THost extends Component, TEvent extends Event> (
	value: EventListenerInput<THost, TEvent>,
): boolean {
	return typeof value === "function" || isListenerSource(value);
}

function defineComponentEvent<THost extends Component, TEvent extends Event> (event: TEvent, component: THost): ComponentEvent<TEvent, THost> {
	Object.defineProperty(event, "component", {
		configurable: true,
		enumerable: false,
		value: component,
		writable: false,
	});

	return event as ComponentEvent<TEvent, THost>;
}

export class EventManipulator<THost extends Component = Component> {
	readonly on: EventOnProxy<THost>;
	readonly off: EventOffProxy<THost>;
	readonly owned: OwnedEventManipulator<THost>;
 
	private readonly listenerRecords = new Map<keyof HTMLElementEventMap, Map<ListenerKey, ListenerRecord>>();

	constructor (
		private readonly owner: THost,
		private readonly element: HTMLElement,
	) {
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

	private createOnProxy (useOwnedOwner: boolean): EventOnProxy<THost> {
		return new Proxy({}, {
			get: (_, eventName) => {
				if (typeof eventName !== "string") {
					return undefined;
				}

				return (ownerOrListener: Owner | EventListenerInput<THost, Event>, maybeListener?: EventListenerInput<THost, Event>) => {
					const resolvedOwner = useOwnedOwner ? this.owner : ownerOrListener as Owner;
					const listener = (useOwnedOwner ? ownerOrListener : maybeListener) as EventListenerInput<THost, Event>;
					this.installListener(eventName as keyof HTMLElementEventMap, resolvedOwner, listener);
					return this.owner;
				};
			},
		}) as EventOnProxy<THost>;
	}

	private createOwnedOnProxy (): OwnedEventOnProxy<THost> {
		return new Proxy({}, {
			get: (_, eventName) => {
				if (typeof eventName !== "string") {
					return undefined;
				}

				return (listener: EventListenerInput<THost, Event>) => {
					this.installListener(eventName as keyof HTMLElementEventMap, this.owner, listener);
					return this.owner;
				};
			},
		}) as OwnedEventOnProxy<THost>;
	}

	private createOffProxy (): EventOffProxy<THost> {
		return new Proxy({}, {
			get: (_, eventName) => {
				if (typeof eventName !== "string") {
					return undefined;
				}

				return (listener: EventListenerInput<THost, Event>) => {
					this.removeListener(eventName as keyof HTMLElementEventMap, listener);
					return this.owner;
				};
			},
		}) as EventOffProxy<THost>;
	}

	private installListener<TEventName extends keyof HTMLElementEventMap> (
		eventName: TEventName,
		owner: Owner,
		listener: EventListenerInput<THost, HTMLElementEventMap[TEventName]>,
	): void {
		this.ensureActive();

		if (!isListenerKey(listener)) {
			return;
		}

		const key = listener as ListenerKey;
		this.replaceListener(eventName, key, owner, listener);
	}

	private replaceListener<TEventName extends keyof HTMLElementEventMap> (
		eventName: TEventName,
		key: ListenerKey,
		owner: Owner,
		listener: EventListenerInput<THost, HTMLElementEventMap[TEventName]>,
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

		const applyResolvedListener = (nextListener: EventListenerValue<THost, HTMLElementEventMap[TEventName]>) => {
			releaseOwner();
			releaseDom();

			if (!nextListener) {
				releaseOwner = noop;
				releaseDom = noop;
				return;
			}

			const handleEvent = (event: HTMLElementEventMap[TEventName]) => {
				nextListener(defineComponentEvent(event, this.owner));
			};

			this.element.addEventListener(eventName, handleEvent as EventListener);
			releaseDom = () => {
				this.element.removeEventListener(eventName, handleEvent as EventListener);
			};
			releaseOwner = owner.onCleanup(trackedCleanup);
		};

		eventRecords.set(key, { cleanup: trackedCleanup });

		if (isListenerSource(listener)) {
			releaseSource = listener.subscribe(owner, applyResolvedListener);
			applyResolvedListener(listener.value);
			return;
		}

		applyResolvedListener(listener);
	}

	private removeListener<TEventName extends keyof HTMLElementEventMap> (
		eventName: TEventName,
		listener: EventListenerInput<THost, HTMLElementEventMap[TEventName]>,
	): void {
		if (!isListenerKey(listener)) {
			return;
		}

		this.listenerRecords.get(eventName)?.get(listener as ListenerKey)?.cleanup();
	}

	private ensureActive (): void {
		if (this.owner.disposed) {
			throw new Error("Disposed components cannot be modified.");
		}
	}
}