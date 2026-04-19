import { State } from "../state/State";
import type { AttributeManipulator } from "./AttributeManipulator";
import type { Falsy } from "./ClassManipulator";
import type { Component } from "./Component";
/**
 * Valid ARIA role values.
 * @see https://www.w3.org/TR/wai-aria-1.2/#role_definitions
 */
export type AriaRole = "alert" | "alertdialog" | "application" | "article" | "banner" | "blockquote" | "button" | "caption" | "cell" | "checkbox" | "code" | "columnheader" | "combobox" | "complementary" | "contentinfo" | "definition" | "deletion" | "dialog" | "directory" | "document" | "emphasis" | "feed" | "figure" | "form" | "generic" | "grid" | "gridcell" | "group" | "heading" | "img" | "insertion" | "link" | "list" | "listbox" | "listitem" | "log" | "main" | "marquee" | "math" | "menu" | "menubar" | "menuitem" | "menuitemcheckbox" | "menuitemradio" | "meter" | "navigation" | "none" | "note" | "option" | "paragraph" | "presentation" | "progressbar" | "radio" | "radiogroup" | "region" | "row" | "rowgroup" | "rowheader" | "scrollbar" | "search" | "searchbox" | "separator" | "slider" | "spinbutton" | "status" | "strong" | "subscript" | "superscript" | "switch" | "tab" | "table" | "tablist" | "tabpanel" | "term" | "textbox" | "time" | "timer" | "toolbar" | "tooltip" | "tree" | "treegrid" | "treeitem";
/** ARIA text value: a string or falsy value. */
export type AriaText = string | null | undefined;
/** ARIA text input: static text or a reactive State. */
export type AriaTextInput = AriaText | State<AriaText>;
/** ARIA role input: static role or a reactive State. */
export type AriaRoleInput = AriaRole | null | undefined | State<AriaRole | null | undefined>;
/** ARIA boolean input: static boolean or a reactive State. */
export type AriaBooleanInput = boolean | null | undefined | State<boolean | null | undefined>;
/** ARIA mixed boolean value: true, false, "mixed", or falsy. */
export type AriaBooleanMixed = boolean | "mixed" | null | undefined;
/** ARIA mixed boolean input: static value or a reactive State. */
export type AriaBooleanMixedInput = AriaBooleanMixed | State<AriaBooleanMixed>;
/** ARIA current value: true, or a specific page location type. */
export type AriaCurrent = boolean | "page" | "step" | "location" | "date" | "time" | null | undefined;
/** ARIA current input: static value or a reactive State. */
export type AriaCurrentInput = AriaCurrent | State<AriaCurrent>;
/** ARIA live region politeness level. */
export type AriaLive = "off" | "polite" | "assertive" | null | undefined;
/** ARIA live input: static value or a reactive State. */
export type AriaLiveInput = AriaLive | State<AriaLive>;
/** ARIA reference: an element ID string, HTMLElement, component with element, or falsy. */
export type AriaReference = string | HTMLElement | {
    readonly element: HTMLElement;
} | Falsy;
/** ARIA reference selection: a single reference or iterable of references. */
export type AriaReferenceSelection = AriaReference | Iterable<AriaReference>;
/** ARIA reference input: static selection or a reactive State. */
export type AriaReferenceInput = AriaReferenceSelection | State<AriaReferenceSelection>;
/**
 * Fluent builder for setting ARIA attributes on an element.
 *
 * All methods accept static values or reactive States (State).
 * Methods return the owning Component to enable fluent chaining.
 * Internally uses an AttributeManipulator to apply changes.
 */
export declare class AriaManipulator<OWNER extends Component> {
    private readonly owner;
    private readonly attribute;
    constructor(owner: OWNER, attribute: AttributeManipulator<OWNER>);
    /**
     * Set the ARIA role.
     * @param value The role value or reactive State.
     */
    role(value: AriaRoleInput): OWNER;
    /**
     * Set the ARIA label.
     * @param value The label text or reactive State.
     */
    label(value: AriaTextInput): OWNER;
    /**
     * Set the ARIA description.
     * @param value The description text or reactive State.
     */
    description(value: AriaTextInput): OWNER;
    /**
     * Set the ARIA role description.
     * @param value The role description text or reactive State.
     */
    roleDescription(value: AriaTextInput): OWNER;
    /**
     * Set aria-labelledby: elements that label this element.
     * @param value Element reference(s) or reactive State.
     */
    labelledBy(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-describedby: elements that describe this element.
     * @param value Element reference(s) or reactive State.
     */
    describedBy(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-controls: elements controlled by this element.
     * @param value Element reference(s) or reactive State.
     */
    controls(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-details: elements that provide details for this element.
     * @param value Element reference(s) or reactive State.
     */
    details(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-owns: elements owned by this element.
     * @param value Element reference(s) or reactive State.
     */
    owns(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-flowto: elements that follow this element.
     * @param value Element reference(s) or reactive State.
     */
    flowTo(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-hidden: whether this element is hidden from assistive technology.
     * @param value The boolean value or reactive State.
     */
    hidden(value: AriaBooleanInput): OWNER;
    /**
     * Set aria-disabled: whether this element is disabled.
     * @param value The boolean value or reactive State.
     */
    disabled(value: AriaBooleanInput): OWNER;
    /**
     * Set aria-expanded: whether this element is expanded.
     * @param value The boolean value or reactive State.
     */
    expanded(value: AriaBooleanInput): OWNER;
    /**
     * Set aria-busy: whether this element is busy/loading.
     * @param value The boolean value or reactive State.
     */
    busy(value: AriaBooleanInput): OWNER;
    /**
     * Set aria-selected: whether this element is selected.
     * @param value The boolean value or reactive State.
     */
    selected(value: AriaBooleanInput): OWNER;
    /**
     * Set aria-checked: whether this element is checked (true, false, or "mixed").
     * @param value The boolean/mixed value or reactive State.
     */
    checked(value: AriaBooleanMixedInput): OWNER;
    /**
     * Set aria-pressed: whether this element is pressed (true, false, or "mixed").
     * @param value The boolean/mixed value or reactive State.
     */
    pressed(value: AriaBooleanMixedInput): OWNER;
    /**
     * Set aria-current: mark this element or one of its descendants as the current page/step/location.
     * @param value The current value (true, false, or a location type) or reactive State.
     */
    current(value: AriaCurrentInput): OWNER;
    /**
     * Set aria-live: announce dynamic content updates (off, polite, or assertive).
     * @param value The politeness level or reactive State.
     */
    live(value: AriaLiveInput): OWNER;
    private set;
}
