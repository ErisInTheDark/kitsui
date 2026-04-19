import { Owner, State } from "../state/State";
import type { Component } from "./Component";
type HostedEvent<TEvent extends Event, THost extends Owner, THostKey extends string> = TEvent & {
    readonly [KEY in THostKey]: THost;
};
type EventListenerFor<THost extends Owner, THostKey extends string, TEvent extends Event> = (event: HostedEvent<TEvent, THost, THostKey>) => unknown;
type EventListenerInputFor<THost extends Owner, THostKey extends string, TEvent extends Event> = EventListenerFor<THost, THostKey, TEvent> | State<EventListenerFor<THost, THostKey, TEvent> | null | undefined> | null | undefined;
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
/** A DOM event augmented with the owning Component on `.component`. */
export type ComponentEvent<TEvent extends Event, THost extends Component = Component> = HostedEvent<TEvent, THost, "component">;
/** A component event listener that receives the owning Component on the event object. */
export type ComponentEventListener<THost extends Component, TEvent extends Event> = EventListenerFor<THost, "component", TEvent>;
/** A direct or reactive event-listener input accepted by component event APIs. */
export type EventListenerInput<THost extends Component, TEvent extends Event> = EventListenerInputFor<THost, "component", TEvent>;
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
    readonly off: EventOffProxy<THost>;
}
/**
 * Manages event listeners for a host owner with automatic cleanup and reactive listener support.
 *
 * For Components, this powers the fluent `component.event.on.*`, `.off.*`, and `.owned.on.*` APIs.
 */
export declare class EventManipulator<THost extends Owner = Component, THostKey extends string = "component", TEventMap = ComponentHTMLElementEventMap> {
    private readonly owner;
    private readonly target;
    private readonly hostPropertyName;
    readonly on: EventOnProxyFor<THost, THostKey, TEventMap>;
    readonly off: EventOffProxyFor<THost, THostKey, TEventMap>;
    readonly owned: {
        readonly on: OwnedEventOnProxyFor<THost, THostKey, TEventMap>;
        readonly off: EventOffProxyFor<THost, THostKey, TEventMap>;
    };
    private readonly listenerRecords;
    constructor(owner: THost, target: EventTarget, hostPropertyName?: THostKey);
    private releaseAllListeners;
    private createOnProxy;
    private createOwnedOnProxy;
    private createOffProxy;
    private installListener;
    private replaceListener;
    private removeListener;
    private ensureActive;
}
export {};
