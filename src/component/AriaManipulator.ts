import { Owner, type CleanupFunction } from "../state/State";
import type { AttributeManipulator, AttributeValueInput } from "./AttributeManipulator";
import type { Falsy } from "./ClassManipulator";

/**
 * Valid ARIA role values.
 * @see https://www.w3.org/TR/wai-aria-1.2/#role_definitions
 */
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
	subscribe (owner: Owner, listener: (value: TValue) => void): CleanupFunction;
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
export type AriaReference = string | HTMLElement | { readonly element: HTMLElement } | Falsy;
/** ARIA reference selection: a single reference or iterable of references. */
export type AriaReferenceSelection = AriaReference | Iterable<AriaReference>;
/** ARIA reference input: static selection or a reactive source. */
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

/**
 * Helper to convert AriaReferenceInput (which may be raw references) into AttributeValueInput
 * (which may be reactive sources). Handles resolving and normalizing element references to ID tokens.
 * @internal
 */
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

/**
 * Fluent builder for setting ARIA attributes on an element.
 * 
 * All methods accept static values or reactive sources (AriaValueSource).
 * Methods return `this` to enable method chaining.
 * Internally uses an AttributeManipulator to apply changes.
 */
export class AriaManipulator {
	constructor (private readonly attribute: AttributeManipulator) { }

	/**
	 * Set the ARIA role.
	 * @param value The role value or reactive source.
	 */
	role (value: AriaRoleInput): this {
		return this.set("role", value);
	}

	/**
	 * Set the ARIA label.
	 * @param value The label text or reactive source.
	 */
	label (value: AriaTextInput): this {
		return this.set("aria-label", value);
	}

	/**
	 * Set the ARIA description.
	 * @param value The description text or reactive source.
	 */
	description (value: AriaTextInput): this {
		return this.set("aria-description", value);
	}

	/**
	 * Set the ARIA role description.
	 * @param value The role description text or reactive source.
	 */
	roleDescription (value: AriaTextInput): this {
		return this.set("aria-roledescription", value);
	}

	/**
	 * Set aria-labelledby: elements that label this element.
	 * @param value Element reference(s) or reactive source.
	 */
	labelledBy (value: AriaReferenceInput): this {
		return this.set("aria-labelledby", toReferenceValueInput(value));
	}

	/**
	 * Set aria-describedby: elements that describe this element.
	 * @param value Element reference(s) or reactive source.
	 */
	describedBy (value: AriaReferenceInput): this {
		return this.set("aria-describedby", toReferenceValueInput(value));
	}

	/**
	 * Set aria-controls: elements controlled by this element.
	 * @param value Element reference(s) or reactive source.
	 */
	controls (value: AriaReferenceInput): this {
		return this.set("aria-controls", toReferenceValueInput(value));
	}

	/**
	 * Set aria-details: elements that provide details for this element.
	 * @param value Element reference(s) or reactive source.
	 */
	details (value: AriaReferenceInput): this {
		return this.set("aria-details", toReferenceValueInput(value));
	}

	/**
	 * Set aria-owns: elements owned by this element.
	 * @param value Element reference(s) or reactive source.
	 */
	owns (value: AriaReferenceInput): this {
		return this.set("aria-owns", toReferenceValueInput(value));
	}

	/**
	 * Set aria-flowto: elements that follow this element.
	 * @param value Element reference(s) or reactive source.
	 */
	flowTo (value: AriaReferenceInput): this {
		return this.set("aria-flowto", toReferenceValueInput(value));
	}

	/**
	 * Set aria-hidden: whether this element is hidden from assistive technology.
	 * @param value The boolean value or reactive source.
	 */
	hidden (value: AriaBooleanInput): this {
		return this.set("aria-hidden", value);
	}

	/**
	 * Set aria-disabled: whether this element is disabled.
	 * @param value The boolean value or reactive source.
	 */
	disabled (value: AriaBooleanInput): this {
		return this.set("aria-disabled", value);
	}

	/**
	 * Set aria-expanded: whether this element is expanded.
	 * @param value The boolean value or reactive source.
	 */
	expanded (value: AriaBooleanInput): this {
		return this.set("aria-expanded", value);
	}

	/**
	 * Set aria-busy: whether this element is busy/loading.
	 * @param value The boolean value or reactive source.
	 */
	busy (value: AriaBooleanInput): this {
		return this.set("aria-busy", value);
	}

	/**
	 * Set aria-selected: whether this element is selected.
	 * @param value The boolean value or reactive source.
	 */
	selected (value: AriaBooleanInput): this {
		return this.set("aria-selected", value);
	}

	/**
	 * Set aria-checked: whether this element is checked (true, false, or "mixed").
	 * @param value The boolean/mixed value or reactive source.
	 */
	checked (value: AriaBooleanMixedInput): this {
		return this.set("aria-checked", value);
	}

	/**
	 * Set aria-pressed: whether this element is pressed (true, false, or "mixed").
	 * @param value The boolean/mixed value or reactive source.
	 */
	pressed (value: AriaBooleanMixedInput): this {
		return this.set("aria-pressed", value);
	}

	/**
	 * Set aria-current: mark this element or one of its descendants as the current page/step/location.
	 * @param value The current value (true, false, or a location type) or reactive source.
	 */
	current (value: AriaCurrentInput): this {
		return this.set("aria-current", value);
	}

	/**
	 * Set aria-live: announce dynamic content updates (off, polite, or assertive).
	 * @param value The politeness level or reactive source.
	 */
	live (value: AriaLiveInput): this {
		return this.set("aria-live", value);
	}

	private set (name: string, value: AttributeValueInput): this {
		this.attribute.set(name, value);
		return this;
	}
}