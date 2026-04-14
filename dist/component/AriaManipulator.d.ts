import { Owner, type CleanupFunction } from "../state/State";
import type { AttributeManipulator } from "./AttributeManipulator";
import type { Falsy } from "./ClassManipulator";
import type { Component } from "./Component";
/**
 * Valid ARIA role values.
 * @see https://www.w3.org/TR/wai-aria-1.2/#role_definitions
 */
export type AriaRole = "alert" | "alertdialog" | "application" | "article" | "banner" | "blockquote" | "button" | "caption" | "cell" | "checkbox" | "code" | "columnheader" | "combobox" | "complementary" | "contentinfo" | "definition" | "deletion" | "dialog" | "directory" | "document" | "emphasis" | "feed" | "figure" | "form" | "generic" | "grid" | "gridcell" | "group" | "heading" | "img" | "insertion" | "link" | "list" | "listbox" | "listitem" | "log" | "main" | "marquee" | "math" | "menu" | "menubar" | "menuitem" | "menuitemcheckbox" | "menuitemradio" | "meter" | "navigation" | "none" | "note" | "option" | "paragraph" | "presentation" | "progressbar" | "radio" | "radiogroup" | "region" | "row" | "rowgroup" | "rowheader" | "scrollbar" | "search" | "searchbox" | "separator" | "slider" | "spinbutton" | "status" | "strong" | "subscript" | "superscript" | "switch" | "tab" | "table" | "tablist" | "tabpanel" | "term" | "textbox" | "time" | "timer" | "toolbar" | "tooltip" | "tree" | "treegrid" | "treeitem";
/**
 * Source for a reactive ARIA value. Use this interface to provide dynamic/reactive ARIA attributes
 * that update in response to state changes.
 *
 * @template TValue The type of the reactive value.
 * @property value The current value.
 * @property subscribe Register a reactive listener that runs when the value changes. Must return a cleanup function.
 */
export interface AriaValueSource<TValue> {
    readonly value: TValue;
    subscribe(owner: Owner, listener: (value: TValue) => void): CleanupFunction;
}
/** ARIA text value: a string or falsy value. */
export type AriaText = string | null | undefined;
/** ARIA text input: static text or a reactive source. */
export type AriaTextInput = AriaText | AriaValueSource<AriaText>;
/** ARIA role input: static role or a reactive source. */
export type AriaRoleInput = AriaRole | null | undefined | AriaValueSource<AriaRole | null | undefined>;
/** ARIA boolean input: static boolean or a reactive source. */
export type AriaBooleanInput = boolean | null | undefined | AriaValueSource<boolean | null | undefined>;
/** ARIA mixed boolean value: true, false, "mixed", or falsy. */
export type AriaBooleanMixed = boolean | "mixed" | null | undefined;
/** ARIA mixed boolean input: static value or a reactive source. */
export type AriaBooleanMixedInput = AriaBooleanMixed | AriaValueSource<AriaBooleanMixed>;
/** ARIA current value: true, or a specific page location type. */
export type AriaCurrent = boolean | "page" | "step" | "location" | "date" | "time" | null | undefined;
/** ARIA current input: static value or a reactive source. */
export type AriaCurrentInput = AriaCurrent | AriaValueSource<AriaCurrent>;
/** ARIA live region politeness level. */
export type AriaLive = "off" | "polite" | "assertive" | null | undefined;
/** ARIA live input: static value or a reactive source. */
export type AriaLiveInput = AriaLive | AriaValueSource<AriaLive>;
/** ARIA reference: an element ID string, HTMLElement, component with element, or falsy. */
export type AriaReference = string | HTMLElement | {
    readonly element: HTMLElement;
} | Falsy;
/** ARIA reference selection: a single reference or iterable of references. */
export type AriaReferenceSelection = AriaReference | Iterable<AriaReference>;
/** ARIA reference input: static selection or a reactive source. */
export type AriaReferenceInput = AriaReferenceSelection | AriaValueSource<AriaReferenceSelection>;
/**
 * Fluent builder for setting ARIA attributes on an element.
 *
 * All methods accept static values or reactive sources (AriaValueSource).
 * Methods return the owning Component to enable fluent chaining.
 * Internally uses an AttributeManipulator to apply changes.
 */
export declare class AriaManipulator {
    private readonly owner;
    private readonly attribute;
    constructor(owner: Component, attribute: AttributeManipulator);
    /**
     * Set the ARIA role.
     * @param value The role value or reactive source.
     */
    role(value: AriaRoleInput): Component;
    /**
     * Set the ARIA label.
     * @param value The label text or reactive source.
     */
    label(value: AriaTextInput): Component;
    /**
     * Set the ARIA description.
     * @param value The description text or reactive source.
     */
    description(value: AriaTextInput): Component;
    /**
     * Set the ARIA role description.
     * @param value The role description text or reactive source.
     */
    roleDescription(value: AriaTextInput): Component;
    /**
     * Set aria-labelledby: elements that label this element.
     * @param value Element reference(s) or reactive source.
     */
    labelledBy(value: AriaReferenceInput): Component;
    /**
     * Set aria-describedby: elements that describe this element.
     * @param value Element reference(s) or reactive source.
     */
    describedBy(value: AriaReferenceInput): Component;
    /**
     * Set aria-controls: elements controlled by this element.
     * @param value Element reference(s) or reactive source.
     */
    controls(value: AriaReferenceInput): Component;
    /**
     * Set aria-details: elements that provide details for this element.
     * @param value Element reference(s) or reactive source.
     */
    details(value: AriaReferenceInput): Component;
    /**
     * Set aria-owns: elements owned by this element.
     * @param value Element reference(s) or reactive source.
     */
    owns(value: AriaReferenceInput): Component;
    /**
     * Set aria-flowto: elements that follow this element.
     * @param value Element reference(s) or reactive source.
     */
    flowTo(value: AriaReferenceInput): Component;
    /**
     * Set aria-hidden: whether this element is hidden from assistive technology.
     * @param value The boolean value or reactive source.
     */
    hidden(value: AriaBooleanInput): Component;
    /**
     * Set aria-disabled: whether this element is disabled.
     * @param value The boolean value or reactive source.
     */
    disabled(value: AriaBooleanInput): Component;
    /**
     * Set aria-expanded: whether this element is expanded.
     * @param value The boolean value or reactive source.
     */
    expanded(value: AriaBooleanInput): Component;
    /**
     * Set aria-busy: whether this element is busy/loading.
     * @param value The boolean value or reactive source.
     */
    busy(value: AriaBooleanInput): Component;
    /**
     * Set aria-selected: whether this element is selected.
     * @param value The boolean value or reactive source.
     */
    selected(value: AriaBooleanInput): Component;
    /**
     * Set aria-checked: whether this element is checked (true, false, or "mixed").
     * @param value The boolean/mixed value or reactive source.
     */
    checked(value: AriaBooleanMixedInput): Component;
    /**
     * Set aria-pressed: whether this element is pressed (true, false, or "mixed").
     * @param value The boolean/mixed value or reactive source.
     */
    pressed(value: AriaBooleanMixedInput): Component;
    /**
     * Set aria-current: mark this element or one of its descendants as the current page/step/location.
     * @param value The current value (true, false, or a location type) or reactive source.
     */
    current(value: AriaCurrentInput): Component;
    /**
     * Set aria-live: announce dynamic content updates (off, polite, or assertive).
     * @param value The politeness level or reactive source.
     */
    live(value: AriaLiveInput): Component;
    private set;
}
