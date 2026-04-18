import { Owner, State } from "../../state/State";
import type { Falsy } from "../ClassManipulator";
import { Component, type InsertWhere } from "../Component";
import { Marker } from "../Marker";
/** A placement target: a DOM node, Component, Place marker, or null/falsy. */
export type PlacementTarget = Node | Component | Marker | Place | Falsy;
/** A DOM parent node that can host appended or prepended placements. */
export type PlacementParent = ParentNode & Node;
/** @group Place */
type PlaceConstructor = {
    (): Place;
    new (): Place;
    prototype: Place;
};
/** A function that receives a Place constructor and returns State<Place | null> for reactive placement. */
export type PlacerFunction = (Place: PlaceConstructor) => State<Place | null>;
declare module "../Component" {
    interface ComponentExtensions {
        /**
         * Appends this component to the end of the target component or DOM parent.
         * Sets this component's owner to the target component, or the nearest wrapped ancestor for raw DOM parents.
         * @param target The target component or DOM parent.
         * @returns This component for chaining.
         * @throws If this or the target component is disposed.
         */
        appendTo(target: PlacementContainer): this;
        /**
         * Conditionally appends this component based on a boolean state.
         * Automatically removes the component when the state becomes false.
         * @param state The boolean state that controls visibility.
         * @param target The target component or DOM parent.
         * @returns This component for chaining.
         */
        appendToWhen(state: State<boolean>, target: PlacementContainer): this;
        /**
         * Prepends this component to the start of the target component or DOM parent.
         * Sets this component's owner to the target component, or the nearest wrapped ancestor for raw DOM parents.
         * @param target The target component or DOM parent.
         * @returns This component for chaining.
         * @throws If this or the target component is disposed.
         */
        prependTo(target: PlacementContainer): this;
        /**
         * Conditionally prepends this component based on a boolean state.
         * Automatically removes the component when the state becomes false.
         * @param state The boolean state that controls visibility.
         * @param target The target component or DOM parent.
         * @returns This component for chaining.
         */
        prependToWhen(state: State<boolean>, target: PlacementContainer): this;
        /**
         * Inserts this component before or after a reference node, component, or place.
         * Sets the owner based on the target's owner if applicable.
         * @param where \"before\" or \"after\" the target.
         * @param target The reference node, component, place, or null.
         * @returns This component for chaining.
         * @throws If this component is disposed or target's parent is not a valid insert location.
         */
        insertTo(where: InsertWhere, target: PlacementTarget): this;
        /**
         * Conditionally inserts this component based on a boolean state.
         * Automatically removes the component when the state becomes false.
         * @param state The boolean state that controls visibility.
         * @param where \"before\" or \"after\" the target.
         * @param target The reference node, component, place, or null.
         * @returns This component for chaining.
         */
        insertToWhen(state: State<boolean>, where: InsertWhere, target: PlacementTarget): this;
        /**
         * Manually controls component placement with a reactive placer function.
         * The placer receives a Place constructor and returns State<Place | null> that controls where the component is inserted.
         * @param owner The owner who manages the placement lifecycle.
         * @param placer A function that produces State<Place | null> determining the component's location.
         * @returns This component for chaining.
         * @throws If this component is disposed.
         */
        place(owner: Owner, placer: PlacerFunction): this;
    }
}
declare module "../Marker" {
    interface MarkerExtensions {
        appendTo(target: PlacementContainer): this;
        prependTo(target: PlacementContainer): this;
        insertTo(where: InsertWhere, target: PlacementTarget): this;
    }
}
type PlacementContainer = Component | PlacementParent;
/**
 * A placement marker representing a location in the DOM that components can be moved to.
 * @property marker The comment node used as a DOM anchor for this placement.
 * @property owner The owner responsible for managing this placement.
 * @group Place
 */
declare class PlaceClass {
    readonly owner: Owner;
    readonly marker: Marker;
    constructor(owner: Owner, marker: Marker);
    /**
     * Moves this placement marker to the end of the target component or DOM parent.
     * @param target The target component or DOM parent.
     * @returns This place for chaining.
     */
    appendTo(target: PlacementContainer): this;
    /**
     * Moves this placement marker to the start of the target component or DOM parent.
     * @param target The target component or DOM parent.
     * @returns This place for chaining.
     */
    prependTo(target: PlacementContainer): this;
    /**
     * Moves this placement marker before or after a reference node/component/place.
     * @param where "before" or "after" the target.
     * @param target The reference node, component, or place.
     * @returns This place for chaining, or this unchanged if target does not exist.
     * @throws If the target's parent is not a valid insert location.
     */
    insertTo(where: InsertWhere, target: PlacementTarget): this;
    /**
     * Removes this placement marker from the DOM.
     */
    remove(): void;
}
/**
 * A placement marker that anchors component positioning in the DOM.
 * @group Place
 */
export type Place = PlaceClass;
/**
 * Registers Component placement extensions (appendTo, insertTo, place, etc.).
 * Safe to call multiple times; extension is registered only once.
 * Patches Component.prototype with placement control methods.
 */
export default function placeExtension(): void;
export {};
