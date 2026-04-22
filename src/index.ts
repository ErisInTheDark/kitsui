/**
 * @fileoverview Main entry point for kitsui.
 *
 * Exports the public API: Component, State, and their associated manipulators and types.
 *
 * **Side effect:** Registers internal extensions (place and mapping) on module import.
 * These enable advanced features and should not be manually invoked.
 */

import placeExtension from "./component/extensions/placeExtension";
import groupExtension from "./state/extensions/groupExtension";
import mappingExtension from "./state/extensions/mappingExtension";

placeExtension();
groupExtension();
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
    AriaTextInput
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
    ComponentChild,
    ComponentChildren,
    ComponentRender,
    ComponentSelection,
    ComponentSelectionState,
    InsertWhere
} from "./component/Component";
export { EventManipulator } from "./component/EventManipulator";
export type { ComponentEvent, ComponentEventListener, EventListenerInput } from "./component/EventManipulator";
export type { Place, PlacementTarget, PlacerFunction } from "./component/extensions/placeExtension";
export { Marker } from "./component/Marker";
export type { ExtendableMarkerClass, MarkerEventMap, MarkerExtensions, MarkerStaticExtensions } from "./component/Marker";
export {
    Style, StyleAnimation, StyleFontFace, StyleImport, StyleReset, StyleRoot, StyleSelector, darkScheme, elements, lightScheme,
    pseudoAfter, pseudoBefore,
    whenActive, whenActiveSelf,
    whenClosed,
    whenDisabled,
    whenEmpty, whenEven,
    whenFirst, whenFocus, whenFocusAny, whenFocusAnySelf, whenFocusSelf, whenFull,
    whenHover, whenHoverSelf,
    whenLast, whenMiddle,
    whenNotFirst, whenNotLast,
    whenOdd,
    whenOpen,
    whenStuck
} from "./component/Style";
export type { AnimationMarker, FontFaceDefinition, KeyframesDefinition, StyleDefinition, StyleValue } from "./component/Style";
export { StyleManipulator } from "./component/StyleManipulator";
export type { StyleAttributeDefinition, StyleAttributeInput, StyleAttributeValue, StyleAttributeValueInput } from "./component/StyleManipulator";
export { TextManipulator } from "./component/TextManipulator";
export type { TextInput, TextSelection, TextValue } from "./component/TextManipulator";
export type { Mapper } from "./state/extensions/mappingExtension";
export { Owner, State } from "./state/State";
export type {
    CleanupFunction,
    ExtendableStateClass,
    StateEqualityFunction,
    StateListener,
    StateOptions,
    StateUpdater
} from "./state/State";

