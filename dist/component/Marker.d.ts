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
/** Constructor type exposed by {@link Marker.extend} for prototype augmentation. */
export type ExtendableMarkerClass = MarkerConstructor & MarkerStaticExtensions;
/** Definition object consumed by {@link Marker.builder} to create marker factories. */
export interface MarkerBuilderDefinition<A extends any[]> {
    /**
     * Returns the identifier text to store in the marker's comment node.
     * @param args The arguments passed into the generated marker factory.
     * @returns The comment text for the created marker.
     */
    id(...args: A): string;
    /**
     * Runs when the marker mounts and may return disposal cleanup.
     * @param marker The marker instance created by the factory.
     * @param args The arguments passed into the generated marker factory.
     * @returns Optional cleanup to run when the marker disposes.
     */
    build(marker: Marker, ...args: A): CleanupFunction;
}
/** @group Marker */
type MarkerConstructor = {
    (id: string): Marker;
    new (id: string): Marker;
    prototype: Marker;
    /**
     * Returns the underlying Marker class for prototype extension.
     * Use this when adding methods through module augmentation.
     */
    extend(): ExtendableMarkerClass;
    /**
     * Creates a marker factory from an id/build definition pair.
     * The returned function creates markers lazily and wires their mount/dispose lifecycle automatically.
     */
    builder<A extends any[]>(definition: MarkerBuilderDefinition<A>): (...args: A) => Marker;
};
/**
 * A wrapper around a DOM comment used where an actual DOM element is not needed.
 * @group Marker
 */
declare class MarkerClass extends Owner {
    /** The underlying DOM comment node that this marker wraps. */
    readonly node: Comment;
    private explicitOwner;
    private releaseExplicitOwner;
    private mounted;
    private orphanCheckId;
    /**
     * Creates a new marker comment with the given identifier text.
     * @param id The comment text to store in the marker node.
     */
    constructor(id: string);
    /** Lazily creates the marker's event manipulator for mount and dispose lifecycle events. */
    get event(): EventManipulator<this, "marker", MarkerEventMap>;
    /** Disposes the marker and removes its comment node from the DOM. */
    remove(): void;
    /**
     * Assigns or clears the explicit owner responsible for disposing this marker.
     * @param owner The owner to bind to this marker, or `null` to clear explicit ownership.
     * @returns This marker for chaining.
     */
    setOwner(owner: Owner | null): this;
    /** Returns the marker's current explicit owner, if one has been assigned. */
    getOwner(): Owner | null;
    /**
     * Registers mount and optional dispose hooks tied to this marker's lifecycle events.
     * @param onMount Called when the marker mounts. May return a cleanup function.
     * @param onDispose Called after the marker disposes.
     * @returns This marker for chaining.
     */
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
/**
 * A wrapper around a DOM comment used where an actual DOM element is not needed.
 * @group Marker
 */
export type Marker = MarkerClass;
/**
 * Creates a new Marker with the given identifier.
 * Markers can be used as lightweight placement anchors and owner-managed lifecycle objects.
 * @group Marker
 */
export declare const Marker: MarkerConstructor & MarkerStaticExtensions;
export {};
