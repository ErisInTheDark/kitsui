import { Owner, State, type CleanupFunction } from "../../state/State";
import type { Falsy } from "../ClassManipulator";
import { Component, type InsertWhere } from "../Component";
export type PlacementTarget = Node | Component | Place | Falsy;
export interface PlaceSource {
    readonly value: Place | null;
    subscribe(owner: Owner, listener: (value: Place | null) => void): CleanupFunction;
}
type PlaceConstructor = {
    (): Place;
    new (): Place;
    prototype: Place;
};
export type PlacerFunction = (Place: PlaceConstructor) => PlaceSource;
declare module "../Component" {
    interface ComponentExtensions {
        appendTo(component: Component): this;
        appendToWhen(state: State<boolean>, component: Component): CleanupFunction;
        prependTo(component: Component): this;
        prependToWhen(state: State<boolean>, component: Component): CleanupFunction;
        insertTo(where: InsertWhere, target: PlacementTarget): this;
        insertToWhen(state: State<boolean>, where: InsertWhere, target: PlacementTarget): CleanupFunction;
        place(owner: Owner, placer: PlacerFunction): CleanupFunction;
    }
}
declare class PlaceClass {
    readonly owner: Owner;
    readonly marker: Comment;
    constructor(owner: Owner, marker: Comment);
    appendTo(component: Component): this;
    prependTo(component: Component): this;
    insertTo(where: InsertWhere, target: PlacementTarget): this;
    remove(): void;
}
export type Place = PlaceClass;
export default function placeExtension(): void;
export {};
