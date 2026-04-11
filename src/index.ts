/**
 * @fileoverview Main entry point for kitsui.
 *
 * Exports the public API: Component, State, and their associated manipulators and types.
 *
 * **Side effect:** Registers internal extensions (place and mapping) on module import.
 * These enable advanced features and should not be manually invoked.
 */

import placeExtension from "./component/extensions/placeExtension";
import mappingExtension from "./state/extensions/mappingExtension";

placeExtension();
mappingExtension();

export { AriaManipulator } from "./component/AriaManipulator";
export type {
    AriaBooleanInput,
    AriaBooleanMixed,
    AriaBooleanMixedInput,
    AriaCurrent,
    AriaCurrentInput,
    AriaLive,
    AriaLiveInput,
    AriaReference,
    AriaReferenceInput,
    AriaReferenceSelection,
    AriaRole,
    AriaRoleInput,
    AriaText,
    AriaTextInput,
    AriaValueSource
} from "./component/AriaManipulator";
export { AttributeManipulator } from "./component/AttributeManipulator";
export type {
    AttributeEntry,
    AttributeNameInput,
    AttributeNameSelection,
    AttributeValue,
    AttributeValueInput,
    AttributeValueSelection
} from "./component/AttributeManipulator";
export { ClassManipulator } from "./component/ClassManipulator";
export type { Falsy, StyleInput, StyleSelection } from "./component/ClassManipulator";
export { Component } from "./component/Component";
export type {
    AppendableComponentChild,
    ComponentChild,
    ComponentOptions,
    ComponentRender,
    ComponentSelection,
    ComponentSelectionState,
    ExtendableComponentClass,
    InsertWhere,
    InsertableComponentChild, InsertableNode, InsertableSelection
} from "./component/Component";
export type { Place, PlaceSource, PlacementTarget, PlacerFunction } from "./component/extensions/placeExtension";
export { Style } from "./component/Style";
export type { StyleDefinition, StyleValue } from "./component/Style";
export { Owner, State } from "./state/State";
export type {
    CleanupFunction,
    ExtendableStateClass,
    StateEqualityFunction,
    StateListener,
    StateOptions,
    StateUpdater
} from "./state/State";

