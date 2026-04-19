import { Owner, type CleanupFunction } from "../state/State";
import { EventManipulator } from "./EventManipulator";
declare global {
    interface Node {
        readonly marker: Marker | undefined;
    }
}
/** Lifecycle event map emitted by Marker instances. */
export interface MarkerEventMap {
    Mount: CustomEvent;
    Dispose: CustomEvent;
}
/** Marker interface for module augmentation of instance-level Marker APIs. */
export interface MarkerExtensions {
}
/** Marker interface for module augmentation of static Marker APIs. */
export interface MarkerStaticExtensions {
}
/** Constructor type exposed by `Marker.extend()` for prototype augmentation. */
export type ExtendableMarkerClass = MarkerConstructor & MarkerStaticExtensions;
/** Definition object consumed by `Marker.builder()` to create marker factories. */
export interface MarkerBuilderDefinition<A extends any[]> {
    id(...args: A): string;
    build(marker: Marker, ...args: A): CleanupFunction;
}
/** @group Marker */
type MarkerConstructor = {
    (id: string): Marker;
    new (id: string): Marker;
    prototype: Marker;
    extend(): ExtendableMarkerClass;
    builder<A extends any[]>(definition: MarkerBuilderDefinition<A>): (...args: A) => Marker;
};
/** @group Marker */
declare class MarkerClass extends Owner {
    readonly node: Comment;
    private explicitOwner;
    private releaseExplicitOwner;
    private mounted;
    private orphanCheckId;
    constructor(id: string);
    get event(): EventManipulator<this, "marker", MarkerEventMap>;
    remove(): void;
    setOwner(owner: Owner | null): this;
    getOwner(): Owner | null;
    use(onMount: () => CleanupFunction | undefined, onDispose?: () => unknown): this;
    protected beforeDispose(): void;
    protected afterDispose(): void;
    /** @internal */
    private dispatchMount;
    private ensureActive;
    private clearOrphanCheck;
    /** @internal */
    refreshOrphanCheck(): void;
    private isManaged;
}
interface MarkerClass extends MarkerExtensions {
}
/** @group Marker */
export type Marker = MarkerClass;
/** @group Marker */
export declare const Marker: MarkerConstructor & MarkerStaticExtensions;
export {};
