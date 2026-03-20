import { Owner, type CleanupFunction } from "../state/State";
import type { AttributeManipulator, AttributeValueInput } from "./AttributeManipulator";
import type { Falsy } from "./ClassManipulator";

export type AriaRole =
	| "alert"
	| "alertdialog"
	| "application"
	| "article"
	| "banner"
	| "blockquote"
	| "button"
	| "caption"
	| "cell"
	| "checkbox"
	| "code"
	| "columnheader"
	| "combobox"
	| "complementary"
	| "contentinfo"
	| "definition"
	| "deletion"
	| "dialog"
	| "directory"
	| "document"
	| "emphasis"
	| "feed"
	| "figure"
	| "form"
	| "generic"
	| "grid"
	| "gridcell"
	| "group"
	| "heading"
	| "img"
	| "insertion"
	| "link"
	| "list"
	| "listbox"
	| "listitem"
	| "log"
	| "main"
	| "marquee"
	| "math"
	| "menu"
	| "menubar"
	| "menuitem"
	| "menuitemcheckbox"
	| "menuitemradio"
	| "meter"
	| "navigation"
	| "none"
	| "note"
	| "option"
	| "paragraph"
	| "presentation"
	| "progressbar"
	| "radio"
	| "radiogroup"
	| "region"
	| "row"
	| "rowgroup"
	| "rowheader"
	| "scrollbar"
	| "search"
	| "searchbox"
	| "separator"
	| "slider"
	| "spinbutton"
	| "status"
	| "strong"
	| "subscript"
	| "superscript"
	| "switch"
	| "tab"
	| "table"
	| "tablist"
	| "tabpanel"
	| "term"
	| "textbox"
	| "time"
	| "timer"
	| "toolbar"
	| "tooltip"
	| "tree"
	| "treegrid"
	| "treeitem";

export interface AriaValueSource<TValue> {
	readonly value: TValue;
	subscribe (owner: Owner, listener: (value: TValue) => void): CleanupFunction;
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
export type AriaReference = string | HTMLElement | { readonly element: HTMLElement } | Falsy;
export type AriaReferenceSelection = AriaReference | Iterable<AriaReference>;
export type AriaReferenceInput = AriaReferenceSelection | AriaValueSource<AriaReferenceSelection>;

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

let generatedAriaReferenceId = 0;

function isValueSource<TValue> (value: unknown): value is AriaValueSource<TValue> {
	return typeof value === "object"
		&& value !== null
		&& "value" in value
		&& "subscribe" in value
		&& typeof value.subscribe === "function";
}

function isComponentReference (value: unknown): value is { readonly element: HTMLElement } {
	return typeof value === "object"
		&& value !== null
		&& "element" in value
		&& value.element instanceof HTMLElement;
}

function isReferenceIterable (value: AriaReferenceSelection): value is Iterable<AriaReference> {
	return typeof value === "object"
		&& value !== null
		&& !(value instanceof HTMLElement)
		&& !isComponentReference(value)
		&& typeof value !== "string"
		&& Symbol.iterator in value;
}

function ensureReferenceId (element: HTMLElement): string {
	if (!element.id) {
		generatedAriaReferenceId += 1;
		element.id = `kitsui-aria-ref-${generatedAriaReferenceId}`;
	}

	return element.id;
}

function resolveReferenceToken (value: AriaReference): string | null {
	if (!value) {
		return null;
	}

	if (typeof value === "string") {
		return value || null;
	}

	if (value instanceof HTMLElement) {
		return ensureReferenceId(value);
	}

	if (isComponentReference(value)) {
		return ensureReferenceId(value.element);
	}

	throw new TypeError("Unsupported ARIA reference selection.");
}

function resolveReferenceSelection (value: AriaReferenceSelection): string | null {
	if (!value) {
		return null;
	}

	if (typeof value === "string" || value instanceof HTMLElement || isComponentReference(value)) {
		return resolveReferenceToken(value);
	}

	if (!isReferenceIterable(value)) {
		throw new TypeError("Unsupported ARIA reference selection.");
	}

	const references = new Set<string>();

	for (const entry of value) {
		const token = resolveReferenceToken(entry);

		if (!token) {
			continue;
		}

		references.add(token);
	}

	if (references.size === 0) {
		return null;
	}

	return [...references].join(" ");
}

function toReferenceValueInput (value: AriaReferenceInput): AttributeValueInput {
	if (!isValueSource<AriaReferenceSelection>(value)) {
		return resolveReferenceSelection(value);
	}

	return {
		get value () {
			return resolveReferenceSelection(value.value);
		},
		subscribe (owner: Owner, listener: (value: string | null) => void): CleanupFunction {
			return value.subscribe(owner, (nextValue) => {
				listener(resolveReferenceSelection(nextValue));
			});
		},
	};
}

export class AriaManipulator {
	constructor (private readonly attribute: AttributeManipulator) { }

	role (value: AriaRoleInput): this {
		return this.set("role", value);
	}

	label (value: AriaTextInput): this {
		return this.set("aria-label", value);
	}

	description (value: AriaTextInput): this {
		return this.set("aria-description", value);
	}

	roleDescription (value: AriaTextInput): this {
		return this.set("aria-roledescription", value);
	}

	labelledBy (value: AriaReferenceInput): this {
		return this.set("aria-labelledby", toReferenceValueInput(value));
	}

	describedBy (value: AriaReferenceInput): this {
		return this.set("aria-describedby", toReferenceValueInput(value));
	}

	controls (value: AriaReferenceInput): this {
		return this.set("aria-controls", toReferenceValueInput(value));
	}

	details (value: AriaReferenceInput): this {
		return this.set("aria-details", toReferenceValueInput(value));
	}

	owns (value: AriaReferenceInput): this {
		return this.set("aria-owns", toReferenceValueInput(value));
	}

	flowTo (value: AriaReferenceInput): this {
		return this.set("aria-flowto", toReferenceValueInput(value));
	}

	hidden (value: AriaBooleanInput): this {
		return this.set("aria-hidden", value);
	}

	disabled (value: AriaBooleanInput): this {
		return this.set("aria-disabled", value);
	}

	expanded (value: AriaBooleanInput): this {
		return this.set("aria-expanded", value);
	}

	busy (value: AriaBooleanInput): this {
		return this.set("aria-busy", value);
	}

	selected (value: AriaBooleanInput): this {
		return this.set("aria-selected", value);
	}

	checked (value: AriaBooleanMixedInput): this {
		return this.set("aria-checked", value);
	}

	pressed (value: AriaBooleanMixedInput): this {
		return this.set("aria-pressed", value);
	}

	current (value: AriaCurrentInput): this {
		return this.set("aria-current", value);
	}

	live (value: AriaLiveInput): this {
		return this.set("aria-live", value);
	}

	private set (name: string, value: AttributeValueInput): this {
		this.attribute.set(name, value);
		return this;
	}
}