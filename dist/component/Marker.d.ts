import { Owner, type CleanupFunction } from "../state/State";
import { EventManipulator } from "./EventManipulator";
declare global {
    interface Node {
        readonly marker: Marker | undefined;
    }
}
export interface MarkerEventMap {
    Mount: CustomEvent;
    Dispose: CustomEvent;
}
export interface MarkerExtensions {
}
export interface MarkerStaticExtensions {
}
export type ExtendableMarkerClass = MarkerConstructor & MarkerStaticExtensions;
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
