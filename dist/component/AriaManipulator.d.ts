import { Owner, type CleanupFunction } from "../state/State";
import type { AttributeManipulator } from "./AttributeManipulator";
import type { Falsy } from "./ClassManipulator";
export type AriaRole = "alert" | "alertdialog" | "application" | "article" | "banner" | "blockquote" | "button" | "caption" | "cell" | "checkbox" | "code" | "columnheader" | "combobox" | "complementary" | "contentinfo" | "definition" | "deletion" | "dialog" | "directory" | "document" | "emphasis" | "feed" | "figure" | "form" | "generic" | "grid" | "gridcell" | "group" | "heading" | "img" | "insertion" | "link" | "list" | "listbox" | "listitem" | "log" | "main" | "marquee" | "math" | "menu" | "menubar" | "menuitem" | "menuitemcheckbox" | "menuitemradio" | "meter" | "navigation" | "none" | "note" | "option" | "paragraph" | "presentation" | "progressbar" | "radio" | "radiogroup" | "region" | "row" | "rowgroup" | "rowheader" | "scrollbar" | "search" | "searchbox" | "separator" | "slider" | "spinbutton" | "status" | "strong" | "subscript" | "superscript" | "switch" | "tab" | "table" | "tablist" | "tabpanel" | "term" | "textbox" | "time" | "timer" | "toolbar" | "tooltip" | "tree" | "treegrid" | "treeitem";
export interface AriaValueSource<TValue> {
    readonly value: TValue;
    subscribe(owner: Owner, listener: (value: TValue) => void): CleanupFunction;
}
export type AriaText = string | null | undefined;
export type AriaTextInput = AriaText | AriaValueSource<AriaText>;
export type AriaRoleInput = AriaRole | null | undefined | AriaValueSource<AriaRole | null | undefined>;
export type AriaBooleanInput = boolean | null | undefined | AriaValueSource<boolean | null | undefined>;
export type AriaBooleanMixed = boolean | "mixed" | null | undefined;
export type AriaBooleanMixedInput = AriaBooleanMixed | AriaValueSource<AriaBooleanMixed>;
export type AriaCurrent = boolean | "page" | "step" | "location" | "date" | "time" | null | undefined;
export type AriaCurrentInput = AriaCurrent | AriaValueSource<AriaCurrent>;
export type AriaLive = "off" | "polite" | "assertive" | null | undefined;
export type AriaLiveInput = AriaLive | AriaValueSource<AriaLive>;
export type AriaReference = string | HTMLElement | {
    readonly element: HTMLElement;
} | Falsy;
export type AriaReferenceSelection = AriaReference | Iterable<AriaReference>;
export type AriaReferenceInput = AriaReferenceSelection | AriaValueSource<AriaReferenceSelection>;
export declare class AriaManipulator {
    private readonly attribute;
    constructor(attribute: AttributeManipulator);
    role(value: AriaRoleInput): this;
    label(value: AriaTextInput): this;
    description(value: AriaTextInput): this;
    roleDescription(value: AriaTextInput): this;
    labelledBy(value: AriaReferenceInput): this;
    describedBy(value: AriaReferenceInput): this;
    controls(value: AriaReferenceInput): this;
    details(value: AriaReferenceInput): this;
    owns(value: AriaReferenceInput): this;
    flowTo(value: AriaReferenceInput): this;
    hidden(value: AriaBooleanInput): this;
    disabled(value: AriaBooleanInput): this;
    expanded(value: AriaBooleanInput): this;
    busy(value: AriaBooleanInput): this;
    selected(value: AriaBooleanInput): this;
    checked(value: AriaBooleanMixedInput): this;
    pressed(value: AriaBooleanMixedInput): this;
    current(value: AriaCurrentInput): this;
    live(value: AriaLiveInput): this;
    private set;
}
