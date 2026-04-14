import { Owner, type CleanupFunction } from "../state/State";
import type { Component } from "./Component";
export type ComponentEvent<TEvent extends Event, THost extends Component = Component> = TEvent & {
    readonly component: THost;
};
export type ComponentEventListener<THost extends Component, TEvent extends Event> = (event: ComponentEvent<TEvent, THost>) => unknown;
export interface EventListenerSource<THost extends Component, TEvent extends Event> {
    readonly value: ComponentEventListener<THost, TEvent> | null | undefined;
    subscribe(owner: Owner, listener: (value: ComponentEventListener<THost, TEvent> | null | undefined) => void): CleanupFunction;
}
export type EventListenerInput<THost extends Component, TEvent extends Event> = ComponentEventListener<THost, TEvent> | EventListenerSource<THost, TEvent> | null | undefined;
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
export declare class EventManipulator<THost extends Component = Component> {
    private readonly owner;
    private readonly element;
    readonly on: EventOnProxy<THost>;
    readonly off: EventOffProxy<THost>;
    readonly owned: OwnedEventManipulator<THost>;
    private readonly listenerRecords;
    constructor(owner: THost, element: HTMLElement);
    private releaseAllListeners;
    private createOnProxy;
    private createOwnedOnProxy;
    private createOffProxy;
    private installListener;
    private replaceListener;
    private removeListener;
    private ensureActive;
}
