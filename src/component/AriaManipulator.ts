import { State, type CleanupFunction } from "../state/State";
import type { AttributeManipulator, AttributeValueInput } from "./AttributeManipulator";
import type { Falsy } from "./ClassManipulator";
import type { Component } from "./Component";

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

/** ARIA text value: a string or falsy value. */
export type AriaText = string | null | undefined;
/** ARIA text input: static text or a reactive State. */
export type AriaTextInput = AriaText | State<string | null>;
/** ARIA role input: static role or a reactive State. */
export type AriaRoleInput = AriaRole | null | undefined | State<AriaRole | null>;
/** ARIA boolean input: static boolean or a reactive State. */
export type AriaBooleanInput = boolean | null | undefined | State<boolean | null>;
/** ARIA mixed boolean value: true, false, "mixed", or falsy. */
export type AriaBooleanMixed = boolean | "mixed" | null | undefined;
/** ARIA mixed boolean input: static value or a reactive State. */
export type AriaBooleanMixedInput = AriaBooleanMixed | State<boolean | "mixed" | null>;
/** ARIA current value: true, or a specific page location type. */
export type AriaCurrent = boolean | "page" | "step" | "location" | "date" | "time" | null | undefined;
/** ARIA current input: static value or a reactive State. */
export type AriaCurrentInput = AriaCurrent | State<boolean | "page" | "step" | "location" | "date" | "time" | null>;
/** ARIA live region politeness level. */
export type AriaLive = "off" | "polite" | "assertive" | null | undefined;
/** ARIA live input: static value or a reactive State. */
export type AriaLiveInput = AriaLive | State<"off" | "polite" | "assertive" | null>;
/** ARIA reference: an element ID string, HTMLElement, component with element, or falsy. */
export type AriaReference = string | HTMLElement | { readonly element: HTMLElement } | Falsy;
/** ARIA reference selection: a single reference or iterable of references. */
export type AriaReferenceSelection = AriaReference | Iterable<AriaReference>;
/** ARIA reference input: static selection or a reactive State. */
export type AriaReferenceInput = AriaReferenceSelection | State<AriaReferenceSelection>;

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

let generatedAriaReferenceId = 0;
const mappedReferenceStatesByOwner = new WeakMap<Component, WeakMap<State<AriaReferenceSelection>, State<string | null>>>();

function isValueSource<TValue> (value: unknown): value is State<TValue> {
	return value instanceof State;
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
 * (which may be reactive States). Handles resolving and normalizing element references to ID tokens.
 * @internal
 */
function toReferenceValueInput (owner: Component, value: AriaReferenceInput): AttributeValueInput {
	if (owner.disposed) {
		throw new Error("Disposed components cannot be modified.");
	}

	if (!(value instanceof State)) {
		return resolveReferenceSelection(value as AriaReferenceSelection);
	}

	const cachedBySource = mappedReferenceStatesByOwner.get(owner);
	const cachedMapped = cachedBySource?.get(value as State<AriaReferenceSelection>);
	if (cachedMapped) {
		return cachedMapped;
	}

	const mappedValue = State(owner, resolveReferenceSelection(value.value as AriaReferenceSelection));
	const bySource = cachedBySource ?? new WeakMap<State<AriaReferenceSelection>, State<string | null>>();
	if (!cachedBySource) {
		mappedReferenceStatesByOwner.set(owner, bySource);
		owner.onCleanup(() => {
			mappedReferenceStatesByOwner.delete(owner);
		});
	}

	bySource.set(value as State<AriaReferenceSelection>, mappedValue);

	value.subscribe(mappedValue, (nextValue) => {
		mappedValue.set(resolveReferenceSelection(nextValue as AriaReferenceSelection));
	});

	return mappedValue;
}

/**
 * Fluent builder for setting ARIA attributes on an element.
 * 
 * All methods accept static values or reactive States (State).
 * Methods return the owning Component to enable fluent chaining.
 * Internally uses an AttributeManipulator to apply changes.
 */
export class AriaManipulator<OWNER extends Component> {
	constructor (
		private readonly owner: OWNER,
		private readonly attribute: AttributeManipulator<OWNER>,
	) { }

	/**
	 * Set the ARIA role.
	 * @param value The role value or reactive State.
	 */
	role (value: AriaRoleInput): OWNER {
		return this.set("role", value);
	}

	/**
	 * Set the ARIA label.
	 * @param value The label text or reactive State.
	 */
	label (value: AriaTextInput): OWNER {
		return this.set("aria-label", value);
	}

	/**
	 * Set the ARIA description.
	 * @param value The description text or reactive State.
	 */
	description (value: AriaTextInput): OWNER {
		return this.set("aria-description", value);
	}

	/**
	 * Set the ARIA role description.
	 * @param value The role description text or reactive State.
	 */
	roleDescription (value: AriaTextInput): OWNER {
		return this.set("aria-roledescription", value);
	}

	/**
	 * Set aria-labelledby: elements that label this element.
	 * @param value Element reference(s) or reactive State.
	 */
	labelledBy (value: AriaReferenceInput): OWNER {
		return this.set("aria-labelledby", toReferenceValueInput(this.owner, value));
	}

	/**
	 * Set aria-describedby: elements that describe this element.
	 * @param value Element reference(s) or reactive State.
	 */
	describedBy (value: AriaReferenceInput): OWNER {
		return this.set("aria-describedby", toReferenceValueInput(this.owner, value));
	}

	/**
	 * Set aria-controls: elements controlled by this element.
	 * @param value Element reference(s) or reactive State.
	 */
	controls (value: AriaReferenceInput): OWNER {
		return this.set("aria-controls", toReferenceValueInput(this.owner, value));
	}

	/**
	 * Set aria-details: elements that provide details for this element.
	 * @param value Element reference(s) or reactive State.
	 */
	details (value: AriaReferenceInput): OWNER {
		return this.set("aria-details", toReferenceValueInput(this.owner, value));
	}

	/**
	 * Set aria-owns: elements owned by this element.
	 * @param value Element reference(s) or reactive State.
	 */
	owns (value: AriaReferenceInput): OWNER {
		return this.set("aria-owns", toReferenceValueInput(this.owner, value));
	}

	/**
	 * Set aria-flowto: elements that follow this element.
	 * @param value Element reference(s) or reactive State.
	 */
	flowTo (value: AriaReferenceInput): OWNER {
		return this.set("aria-flowto", toReferenceValueInput(this.owner, value));
	}

	/**
	 * Set aria-hidden: whether this element is hidden from assistive technology.
	 * @param value The boolean value or reactive State.
	 */
	hidden (value: AriaBooleanInput): OWNER {
		return this.set("aria-hidden", value);
	}

	/**
	 * Set aria-disabled: whether this element is disabled.
	 * @param value The boolean value or reactive State.
	 */
	disabled (value: AriaBooleanInput): OWNER {
		return this.set("aria-disabled", value);
	}

	/**
	 * Set aria-expanded: whether this element is expanded.
	 * @param value The boolean value or reactive State.
	 */
	expanded (value: AriaBooleanInput): OWNER {
		return this.set("aria-expanded", value);
	}

	/**
	 * Set aria-busy: whether this element is busy/loading.
	 * @param value The boolean value or reactive State.
	 */
	busy (value: AriaBooleanInput): OWNER {
		return this.set("aria-busy", value);
	}

	/**
	 * Set aria-selected: whether this element is selected.
	 * @param value The boolean value or reactive State.
	 */
	selected (value: AriaBooleanInput): OWNER {
		return this.set("aria-selected", value);
	}

	/**
	 * Set aria-checked: whether this element is checked (true, false, or "mixed").
	 * @param value The boolean/mixed value or reactive State.
	 */
	checked (value: AriaBooleanMixedInput): OWNER {
		return this.set("aria-checked", value);
	}

	/**
	 * Set aria-pressed: whether this element is pressed (true, false, or "mixed").
	 * @param value The boolean/mixed value or reactive State.
	 */
	pressed (value: AriaBooleanMixedInput): OWNER {
		return this.set("aria-pressed", value);
	}

	/**
	 * Set aria-current: mark this element or one of its descendants as the current page/step/location.
	 * @param value The current value (true, false, or a location type) or reactive State.
	 */
	current (value: AriaCurrentInput): OWNER {
		return this.set("aria-current", value);
	}

	/**
	 * Set aria-live: announce dynamic content updates (off, polite, or assertive).
	 * @param value The politeness level or reactive State.
	 */
	live (value: AriaLiveInput): OWNER {
		return this.set("aria-live", value);
	}

	private set (name: string, value: AttributeValueInput): OWNER {
		this.attribute.set(name, value);
		return this.owner;
	}
}