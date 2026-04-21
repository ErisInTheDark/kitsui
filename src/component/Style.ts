import { Marker } from "../component/Marker";
import { Owner } from "../state/State";
import Arrays from "../utility/Arrays";
import { expandVariableAccessShorthand, toCssPropertyName } from "./styleValue";

/**
 * A CSS property value that can be a string or number.
 * Numbers are serialized as plain numbers without any unit suffix.
 */
export type StyleValue = string | number;

/** A mounted animation marker whose generated `name` can be referenced in style definitions. */
export interface AnimationMarker extends Marker {
	readonly name: string;
}

/** Keyframe definitions keyed by percentage selectors such as `from`, `to`, or `50%`. */
export type KeyframesDefinition = Record<string, StyleDefinition | null | undefined>;

/**
 * CSS style property definition. Supports:
 * - Standard CSS properties (camelCase, e.g., `backgroundColor`)
 * - Custom CSS variables (prefixed with `$`, e.g., `$cardGap` becomes `--card-gap`)
 * - Variable shorthand in values (e.g., `gap: "$cardGap"` or `gap: "${varName: fallback}"`)
 * 
 * Properties with `null` or `undefined` values are filtered during serialization.
 */
export type StyleDefinition = (
	& { [KEY in keyof CSSStyleDeclaration as CSSStyleDeclaration[KEY] extends string ? KEY extends "animation" | "animationName" ? never : KEY : never]?: StyleValue | null | undefined }
	& { [KEY in `$${string}`]?: StyleValue | null | undefined }
	& { [KEY in `{${string}}`]?: StyleDefinition | null | undefined }
	& { animationName?: readonly AnimationMarker[] | AnimationMarker | "none" | null | undefined }
);

type StyleClassConstructor = {
	(className: string, definition: StyleDefinition): Style.Class;
	new(className: string, definition: StyleDefinition): Style.Class;
	prototype: Style.Class;
};

const styleRegistry = new Map<string, Style.Class>();
const styleOrder: Style.Class[] = [];
const importRules: string[] = [];
const fontFaceRules: string[] = [];
const animationRules = new Map<string, string>();

interface AnimationMarkerData {
	keyframes: KeyframesDefinition;
	name: string;
}
const animationMarkerData = new WeakMap<Marker, AnimationMarkerData>();

const resetRules: string[] = [];
const rootRules: string[] = [];
let styleElement: HTMLStyleElement | null = null;
const animationMarkerOwner = new class StyleAnimationOwner extends Owner { }();

function isNestedDefinition (key: string, value: unknown): value is StyleDefinition {
	return typeof value === "object" && value !== null && key.startsWith("{");
}

function isAnimationMarker (value: unknown): value is AnimationMarker {
	return value instanceof Marker && animationMarkerData.has(value);
}

function isAnimationMarkers (value: unknown): value is readonly AnimationMarker[] {
	return Array.isArray(value) && value.length > 0 && value.every(isAnimationMarker);
}

function toAnimationMarkersArray (value: unknown): readonly AnimationMarker[] | null {
	if (isAnimationMarker(value)) return [value];
	if (isAnimationMarkers(value)) return value;
	return null;
}

function serializeStylePropertyValue (propertyName: string, value: StyleValue | readonly AnimationMarker[]): string {
	if (propertyName === "animationName") {
		const markers = toAnimationMarkersArray(value);
		if (markers) return markers.map(marker => animationMarkerData.get(marker)!.name).join(", ");
	}

	return String(expandVariableAccessShorthand(value as StyleValue));
}

function serializeDeclarationBody (definition: StyleDefinition): string {
	return Object.entries(definition)
		.filter((entry): entry is [string, StyleValue | readonly AnimationMarker[]] => entry[1] !== undefined && entry[1] !== null && !isNestedDefinition(entry[0], entry[1]))
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([propertyName, value]) => `${toCssPropertyName(propertyName)}: ${serializeStylePropertyValue(propertyName, value)}`)
		.join("; ");
}

function serializeKeyframesRule (name: string, definition: KeyframesDefinition): string {
	const keyframes = Object.entries(definition)
		.filter((entry): entry is [string, StyleDefinition] => entry[1] !== undefined && entry[1] !== null)
		.map(([keyframeName, keyframeDefinition]) => `${keyframeName} { ${serializeDeclarationBody(keyframeDefinition)} }`)
		.join("\n");

	return `@keyframes ${name} {\n${keyframes}\n}`;
}

function ensureAnimationMarkerMounted (marker: AnimationMarker): void {
	if (typeof document === "undefined") {
		return;
	}

	const data = animationMarkerData.get(marker)!;
	// Always re-register keyframes if missing (handles post-unmount scenarios where the
	// Marker mounted-flag prevents the build callback from re-firing).
	if (!animationRules.has(data.name)) {
		animationRules.set(data.name, serializeKeyframesRule(data.name, data.keyframes));
	}

	if (marker.node.isConnected) {
		return;
	}

	marker.appendTo(document.head ?? document.documentElement);
}

function autoMountAnimationMarkers (definition: StyleDefinition): void {
	for (const [key, value] of Object.entries(definition)) {
		if (value === undefined || value === null) {
			continue;
		}

		if (isNestedDefinition(key, value)) {
			autoMountAnimationMarkers(value);
			continue;
		}

		if (key === "animationName") {
			const markers = toAnimationMarkersArray(value);
			if (markers) {
				for (const marker of markers) {
					ensureAnimationMarkerMounted(marker);
				}
			}
		}
	}
}

function serializeRules (selector: string, definition: StyleDefinition): string[] {
	autoMountAnimationMarkers(definition);
	const rules: string[] = [];
	const ownProperties: [string, StyleValue | readonly AnimationMarker[]][] = [];

	for (const [key, value] of Object.entries(definition)) {
		if (value === undefined || value === null) {
			continue;
		}

		if (isNestedDefinition(key, value)) {
			const parts = key
				.slice(1, -1)
				.replaceAll("&", selector)
				.split("} {")
				.reverse();
			let innerRules = serializeRules(parts.shift()!, value).join("\n");
			for (const part of parts) {
				innerRules = `${part} {\n${innerRules}\n}`;
			}
			rules.push(innerRules!);
			continue;
		}

		ownProperties.push([key, value as StyleValue | readonly AnimationMarker[]]);
	}

	if (ownProperties.length > 0) {
		const body = ownProperties
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([propertyName, value]) => `${toCssPropertyName(propertyName)}: ${serializeStylePropertyValue(propertyName, value)}`)
			.join("; ");
		rules.unshift(`${selector} { ${body} }`);
	}

	return rules;
}

function serializeDefinition (className: string, definition: StyleDefinition): string {
	return serializeRules(`.${className}`, definition).join("\n");
}

function getStyleElement (): HTMLStyleElement | null {
	if (typeof document === "undefined") {
		return null;
	}

	if (styleElement?.isConnected) {
		return styleElement;
	}

	styleElement = null;

	styleElement = document.querySelector("style[data-kitsui-styles='true']");

	if (styleElement instanceof HTMLStyleElement) {
		return styleElement;
	}

	styleElement = document.createElement("style");
	styleElement.setAttribute("data-kitsui-styles", "true");
	(document.head ?? document.documentElement).append(styleElement);
	return styleElement;
}

/** @group Style.Class */
class StyleClass {
	readonly className: string;
	readonly afterClassNames: readonly string[];
	readonly definition: Readonly<StyleDefinition>;
	readonly cssText: string;

	constructor (className: string, definition: StyleDefinition, cssText: string, afterClassNames: readonly string[]) {
		this.afterClassNames = [...afterClassNames];
		this.className = className;
		this.definition = Object.freeze({ ...definition });
		this.cssText = cssText;
	}

	toString (): string {
		return this.className;
	}
}

function renderStyleSheet (): void {
	const styleElement = getStyleElement();

	if (!styleElement) {
		return;
	}

	const parts: string[] = [];

	if (importRules.length > 0)
		parts.push(importRules.join("\n"));

	if (resetRules.length > 0)
		parts.push(resetRules.join("\n"));

	if (fontFaceRules.length > 0)
		parts.push(fontFaceRules.join("\n"));

	if (animationRules.size > 0)
		parts.push([...animationRules.values()].join("\n"));

	if (rootRules.length > 0)
		parts.push(rootRules.join("\n"));

	for (const style of styleOrder)
		parts.push(style.cssText);

	styleElement.textContent = parts.join("\n");

	if (parts.length > 0)
		styleElement.append(document.createTextNode("\n"));
}

/** @hidden */
export function mountStylesheet (): void {
	renderStyleSheet();
}

/** @hidden */
export function unmountStylesheet (): void {
	styleElement = null;
	animationRules.clear();
	importRules.length = 0;
	resetRules.length = 0;
	rootRules.length = 0;
	fontFaceRules.length = 0;
}

function insertStyleInOrder (style: StyleClass): void {
	if (style.afterClassNames.length === 0) {
		styleOrder.push(style);
		return;
	}

	let insertionIndex = -1;

	for (const afterClassName of style.afterClassNames) {
		const styleIndex = styleOrder.findIndex((entry) => entry.className === afterClassName);

		if (styleIndex === -1) {
			throw new Error(`Style '${style.className}' cannot be ordered after unknown style '${afterClassName}'.`);
		}

		insertionIndex = Math.max(insertionIndex, styleIndex);
	}

	styleOrder.splice(insertionIndex + 1, 0, style);
}

function createStyle (
	className: string,
	definition: StyleDefinition,
	afterStyles: readonly Style.Class[] = [],
): Style.Class {
	const cssText = serializeDefinition(className, definition);
	const afterClassNames = afterStyles.map((style) => style.className);
	const existingStyle = styleRegistry.get(className);

	if (existingStyle) {
		const sameAfterStyles = existingStyle.afterClassNames.length === afterClassNames.length
			&& existingStyle.afterClassNames.every((value, index) => value === afterClassNames[index]);

		if (existingStyle.cssText !== cssText || !sameAfterStyles) {
			throw new Error(`Style '${className}' is already registered with different rules.`);
		}

		return existingStyle;
	}

	const style = new StyleClass(className, definition, cssText, afterClassNames);
	styleRegistry.set(className, style);
	insertStyleInOrder(style);
	renderStyleSheet();
	return style;
}

/**
 * Creates a reusable style definition fragment that can be spread into other definitions.
 * Use this to reduce duplicate properties between multiple CSS class rules.
 *
 * @param definition - CSS property definitions to reuse.
 * @returns The same definition, typed as a `StyleDefinition`.
 *
 * @example
 * const flexColumn = Style({ display: "flex", flexDirection: "column" });
 * const card = Style.Class("card", { ...flexColumn, padding: "12px" });
 * const sidebar = Style.Class("sidebar", { ...flexColumn, width: "200px" });
 */
export function Style (definition: StyleDefinition): StyleDefinition {
	return definition;
}

export namespace Style {
	/** @group Style.Class */
	export type Class = StyleClass;
	/**
	 * Creates or retrieves a CSS stylesheet entry with the given class name and style definition.
	 * Can be called with or without the `new` keyword.
	 *
	 * The style is immediately registered in a `<style>` element and available for use.
	 * CSS property names are converted from camelCase to kebab-case.
	 * Custom variables are prefixed with `$` in the definition and become `--` in CSS.
	 *
	 * @param className - Unique identifier for the style class. Must be unique or identical rules.
	 * @param definition - CSS property definitions to register.
	 * @returns The registered Style instance with a `.className` property.
	 * @throws If `className` is already registered with different rules.
	 *
	 * @example
	 * const cardStyle = Style.Class("card", { backgroundColor: "#fff", borderRadius: "8px" });
	 * // className: "card", renders: .card { background-color: #fff; border-radius: 8px }
	 * @group Style.Class
	 */
	export const Class = Object.assign(
		function Class (className: string, definition: StyleDefinition): Style.Class {
			return createStyle(className, definition);
		} as StyleClassConstructor,
		{ prototype: StyleClass.prototype },
	)

	/**
	 * Creates styles that will be rendered after the given dependency styles.
	 * Useful for ensuring CSS specificity or cascading order when styles depend on others.
	 *
	 * @param classes - One or more Style instances that this style should be ordered after.
	 * @returns An object with a `Class` method for defining the dependent style.
	 *
	 * @example
	 * const base = Style.Class("base", { color: "black" });
	 * const accent = Style.after(base).Class("accent", { color: "red" });
	 * // In the stylesheet, .base appears before .accent
	 */
	export function after (...classes: Style.Class[]) {
		return {
			Class (className: string, definition: StyleDefinition): Style.Class {
				return createStyle(className, definition, classes);
			},
		};
	}
}

let markerIdCounter = 0;
let animationIdCounter = 0;

const styleAnimationBuilder = Marker.builder<[definition: AnimationMarkerData]>({
	id (definition) {
		return `kitsui:style-animation-${definition.name}`;
	},
	build (marker, definition) {
		const rule = serializeKeyframesRule(definition.name, definition.keyframes);
		animationRules.set(definition.name, rule);
		renderStyleSheet();

		return () => {
			animationRules.delete(definition.name);
			renderStyleSheet();
		};
	},
});

/**
 * Registers a named keyframes animation and returns a marker exposing the generated animation name.
 * 
 * The returned marker owns the injected keyframes rule and removes it again when disposed.
 * @param name The base name to use when generating a unique animation identifier.
 * @param keyframes The keyframe steps to register for the animation.
 * @returns A marker whose `.name` property contains the generated animation name.
 */
export function StyleAnimation (name: string, keyframes: KeyframesDefinition): AnimationMarker {
	const suffixedName = `${name}-${++animationIdCounter}`;
	const marker = styleAnimationBuilder({ keyframes, name: suffixedName }) as AnimationMarker;
	animationMarkerData.set(marker, { keyframes, name: suffixedName });
	marker.setOwner(animationMarkerOwner);
	Object.defineProperty(marker, "name", {
		configurable: true,
		enumerable: true,
		get: () => suffixedName,
	});
	return marker;
}
/**
 * Registers global CSS reset rules that, when mounted, are are placed before all other styles 
 * in the generated stylesheet. The definition uses the `*` (universal) selector.
 * Supports nested selectors such as `pseudoBefore` and `pseudoAfter`
 * for targeting `*::before` and `*::after`.
 *
 * @param definition - CSS properties and nested selectors for the universal reset.
 *
 * @example
 * StyleReset({
 *   boxSizing: "border-box",
 *   margin: "0",
 *   padding: "0",
 *   ...pseudoBefore({ boxSizing: "border-box" }),
 *   ...pseudoAfter({ boxSizing: "border-box" }),
 * }).appendTo(document.head);
 * // When mounted, generates (at start of stylesheet):
 * // * { box-sizing: border-box; margin: 0; padding: 0 }
 * // *::before { box-sizing: border-box }
 * // *::after { box-sizing: border-box }
 */
export const StyleReset = Marker.builder<[definition: StyleDefinition]>({
	id (definition) { 
		return `kitsui:style-reset-${markerIdCounter++}`;
	},
	build (marker, definition) {
		const rules = serializeRules("*", definition);
		resetRules.push(...rules);
		renderStyleSheet();
		return () => { 
			Arrays.spliceBy(resetRules, rules);
			renderStyleSheet();
		}
	},
})

/**
 * Registers :root rules that, when mounted, are placed before all other styles 
 * in the generated stylesheet. The definition uses the `:root` selector.
 *
 * @param definition - CSS properties for the :root selector.
 *
 * @example
 * StyleRoot({
 *  colorScheme: "light dark",
 * }).appendTo(document.head);
 * // When mounted, generates (at start of stylesheet):
 * // :root { color-scheme: light dark }
 */
export const StyleRoot = Marker.builder<[definition: StyleDefinition]>({
	id (definition) { 
		return `kitsui:style-root-${markerIdCounter++}`;
	},
	build (marker, definition) {
		const rules = serializeRules(":root", definition);
		rootRules.push(...rules);
		renderStyleSheet();
		return () => { 
			Arrays.spliceBy(rootRules, rules);
			renderStyleSheet();
		}
	},
})

/**
 * Registers rules by CSS selector that, when mounted, are are placed before all other styles 
 * in the generated stylesheet. The definition uses the specified selector.
 * 
 * This is functionally an escape hatch and should be avoided where possible.
 * It exists to allow styling things like view transitions.
 *
 * @param definition - CSS properties for the specified selector.
 *
 * @example
 * StyleSelector({
 *  "::view-transition-group(root)": {
 *    animationDuration: "0.15s",
 *  },
 * }).appendTo(document.head);
 * // When mounted, generates (at start of stylesheet):
 * // ::view-transition-group(root) { animation-duration: 0.15s }
 */
export const StyleSelector = Marker.builder<[selector: string, definition: StyleDefinition]>({
	id (definition) { 
		return `kitsui:style-selector-${markerIdCounter++}`;
	},
	build (marker, selector, definition) {
		const rules = serializeRules(selector, definition);
		rootRules.push(...rules);
		renderStyleSheet();
		return () => { 
			Arrays.spliceBy(rootRules, rules);
			renderStyleSheet();
		}
	},
})

/**
 * Registers a stylesheet import rule that, when mounted, is placed at the very start of the generated stylesheet.
 * Import rules are placed before reset rules, root rules, font-face declarations, and all other styles.
 * This is commonly used to load external stylesheets such as Google Fonts.
 *
 * @param url - The URL to import.
 *
 * @example
 * StyleImport("https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap").appendTo(document.head);
	* // When mounted, generates an import rule for that URL at the start of the stylesheet.
 */
export const StyleImport = Marker.builder<[url: string]>({
	id (url) {
		return `kitsui:style-import-${markerIdCounter++}`;
	},
	build (marker, url) {
		const rule = `@import url("${url}");`;

		importRules.push(rule);
		renderStyleSheet();

		return () => {
			Arrays.spliceOut(importRules, rule);
			renderStyleSheet();
		}
	}
});

/**
 * A CSS `@font-face` definition. Extends `StyleDefinition` with required
 * `fontFamily` and `src` properties, plus @font-face-specific descriptors
 * that are not part of the standard CSSStyleDeclaration.
 */
export type FontFaceDefinition = StyleDefinition & {
	fontFamily: string;
	src: string;
	fontDisplay?: "auto" | "block" | "swap" | "fallback" | "optional";
	unicodeRange?: string;
};

/**
 * Registers a `@font-face` rule that, when mounted, is placed in the generated stylesheet.
 * Font-face rules are placed after reset rules and before regular class styles.
 *
 * @param definition - CSS properties for the @font-face rule. Must include `fontFamily` and `src`.
 *
 * @example
 * StyleFontFace({
 *   fontFamily: "'Inter'",
 *   src: "url(https://fonts.gstatic.com/s/inter/v20/...woff2) format('woff2')",
 *   fontWeight: 400,
 *   fontStyle: "normal",
 *   fontDisplay: "swap",
 * });
 * // Generates: @font-face { font-display: swap; font-family: 'Inter'; font-style: normal; font-weight: 400; src: url(...) format('woff2') }
 */
export const StyleFontFace = Marker.builder<[definition: FontFaceDefinition]>({
	id (definition) {
		return `kitsui:font-face-${markerIdCounter++}`;
	},
	build (marker, definition) {
		const properties = Object.entries(definition)
			.filter((entry): entry is [string, StyleValue] => entry[1] !== undefined && entry[1] !== null)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([propertyName, value]) => `${toCssPropertyName(propertyName)}: ${String(expandVariableAccessShorthand(value))}`)
			.join("; ");
		const rule = `@font-face { ${properties} }`;

		fontFaceRules.push(rule);
		renderStyleSheet();

		return () => {
			Arrays.spliceOut(fontFaceRules, rule);
			renderStyleSheet();
		}
	}
});

function spreadableSelector (selector: string, definition: StyleDefinition): StyleDefinition {
	selector = selector.includes("&") ? selector : `&${selector}`;
	return { [`{${selector}}`]: definition } as unknown as StyleDefinition;
}

function spreadableQuery (query: string, definition: StyleDefinition): StyleDefinition
function spreadableQuery (query: string, selector: string, definition: StyleDefinition): StyleDefinition
function spreadableQuery (query: string, selectorOrDefinition: string | StyleDefinition, definition?: StyleDefinition): StyleDefinition {
	definition = typeof selectorOrDefinition === "string" ? definition! : selectorOrDefinition;
	const selector = typeof selectorOrDefinition === "string" ? selectorOrDefinition : "&";
	query = query.startsWith("@") ? query.slice(1) : query;
	return { [`{@${query}} {${selector}}`]: definition } as unknown as StyleDefinition;
}

/**
 * Creates a spreadable descendant element-type selector for use inside a `StyleDefinition`.
 * The returned object has a single key prefixed with `~` that the Style serializer
 * converts into a descendant CSS selector.
 * 
 * @param tagName - An HTML element tag name.
 * @param definition - CSS properties (and further nested selectors) for the descendant.
 * 
 * @example
 * Style.Class("article", {
 *   color: "#ccc",
 *   ...elements("h1", { color: "#fff", fontSize: "22px" }),
 * });
 * // .article { color: #ccc }
 * // .article h1 { color: #fff; font-size: 22px }
 */
export function elements (tagName: keyof HTMLElementTagNameMap, definition: StyleDefinition): StyleDefinition {
	return spreadableSelector(`& ${tagName}`, definition);
};

function state (selector: string) {
	selector = selector.startsWith(":") ? selector : `:${selector}`;
	return function (definition: StyleDefinition): StyleDefinition {
		return spreadableSelector(selector, definition);
	}
}

/**
 * Creates a spreadable pseudo-class selector that matches the first child element.
 * Produces the CSS pseudo-class `:first-child`.
 *
 * @param definition - CSS properties to apply when the element is the first child.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("item", {
 *   margin: "8px 0",
 *   ...whenFirst({ marginTop: "0" }),
 * });
 * // .item { margin: 8px 0 }
 * // .item:first-child { margin-top: 0 }
 */
export const whenFirst = state("first-child");

/**
 * Creates a spreadable pseudo-class selector that matches all elements except the first child.
 * Produces the CSS pseudo-class `:not(:first-child)`.
 *
 * @param definition - CSS properties to apply when the element is not the first child.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("item", {
 *   ...whenNotFirst({ borderTop: "1px solid #333" }),
 * });
 * // .item:not(:first-child) { border-top: 1px solid #333 }
 */
export const whenNotFirst = state("not(:first-child)");

/**
 * Creates a spreadable pseudo-class selector that matches when the element is immediately preceded by a sibling of the same class.
 * Produces the CSS selector `.class + :where(.class)` (same specificity as other spreadable selectors)
 * 
 * @param definition - CSS properties to apply when the element follows a sibling of the same class.
 * @returns A spreadable `StyleDefinition` entry.
 * 
 * @example
 * Style.Class("item", {
 *   margin: "8px 0",
 *  ...whenAfterSelf({ marginTop: "0" }),
 * });
 * // .item { margin: 8px 0 }
 * // .item + :where(.item) { margin-top: 0 }
 */
export const whenAfterSelf = function (definition: StyleDefinition): StyleDefinition {
	return spreadableSelector("& + :where(&)", definition);
}

/**
 * Creates a spreadable pseudo-class selector that matches the last child element.
 * Produces the CSS pseudo-class `:last-child`.
 *
 * @param definition - CSS properties to apply when the element is the last child.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("item", {
 *   ...whenLast({ marginBottom: "0" }),
 * });
 * // .item:last-child { margin-bottom: 0 }
 */
export const whenLast = state("last-child");

/**
 * Creates a spreadable pseudo-class selector that matches all elements except the last child.
 * Produces the CSS pseudo-class `:not(:last-child)`.
 *
 * @param definition - CSS properties to apply when the element is not the last child.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("item", {
 *   ...whenNotLast({ borderBottom: "1px solid #333" }),
 * });
 * // .item:not(:last-child) { border-bottom: 1px solid #333 }
 */
export const whenNotLast = state("not(:last-child)");

/**
 * Creates a spreadable pseudo-class selector that matches elements that are neither the
 * first nor last child.
 * Produces the CSS pseudo-class `:not(:first-child, :last-child)`.
 *
 * @param definition - CSS properties to apply when the element is a middle child.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("item", {
 *   ...whenMiddle({ opacity: "0.8" }),
 * });
 * // .item:not(:first-child, :last-child) { opacity: 0.8 }
 */
export const whenMiddle = state("not(:first-child, :last-child)");

/**
 * Creates a spreadable pseudo-class selector that matches elements with no children.
 * Produces the CSS pseudo-class `:empty`.
 *
 * @param definition - CSS properties to apply when the element is empty.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("slot", {
 *   ...whenEmpty({ display: "none" }),
 * });
 * // .slot:empty { display: none }
 */
export const whenEmpty = state("empty");

/**
 * Creates a spreadable pseudo-class selector that matches elements with at least one child.
 * Produces the CSS pseudo-class `:not(:empty)`.
 *
 * @param definition - CSS properties to apply when the element has children.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("slot", {
 *   ...whenFull({ padding: "12px" }),
 * });
 * // .slot:not(:empty) { padding: 12px }
 */
export const whenFull = state("not(:empty)");

/**
 * Creates a spreadable pseudo-class selector that matches odd-numbered children.
 * Produces the CSS pseudo-class `:nth-child(odd)`.
 *
 * @param definition - CSS properties to apply to odd-numbered children.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("row", {
 *   ...whenOdd({ background: "#111" }),
 * });
 * // .row:nth-child(odd) { background: #111 }
 */
export const whenOdd = state("nth-child(odd)");

/**
 * Creates a spreadable pseudo-class selector that matches even-numbered children.
 * Produces the CSS pseudo-class `:nth-child(even)`.
 *
 * @param definition - CSS properties to apply to even-numbered children.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("row", {
 *   ...whenEven({ background: "#0a0a0a" }),
 * });
 * // .row:nth-child(even) { background: #0a0a0a }
 */
export const whenEven = state("nth-child(even)");

/**
 * Creates a spreadable pseudo-class selector that matches when the element or any
 * descendant is hovered.
 * Produces the CSS pseudo-class `:hover`.
 *
 * @param definition - CSS properties to apply on hover.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("button", {
 *   background: "#222",
 *   ...whenHover({ background: "#333" }),
 * });
 * // .button { background: #222 }
 * // .button:hover { background: #333 }
 */
export const whenHover = state("hover");

/**
 * Creates a spreadable pseudo-class selector that matches only when the element itself
 * is hovered, excluding cases where only a descendant is hovered.
 * Produces `:hover:not(:has(:hover))`.
 *
 * @param definition - CSS properties to apply when the element itself is hovered.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("card", {
 *   ...whenHoverSelf({ outline: "1px solid #a3e635" }),
 * });
 * // .card:hover:not(:has(:hover)) { outline: 1px solid #a3e635 }
 */
export const whenHoverSelf = state("hover:not(:has(:hover))");

/**
 * Creates a spreadable pseudo-class selector that matches when the element or any
 * descendant is in an active (pressed) state.
 * Produces the CSS pseudo-class `:active`.
 *
 * @param definition - CSS properties to apply during activation.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("button", {
 *   ...whenActive({ transform: "scale(0.98)" }),
 * });
 * // .button:active { transform: scale(0.98) }
 */
export const whenActive = state("active");

/**
 * Creates a spreadable pseudo-class selector that matches only when the element itself
 * is active, excluding cases where only a descendant is active.
 * Produces `:active:not(:has(:active))`.
 *
 * @param definition - CSS properties to apply when the element itself is active.
 * @returns A spreadable `StyleDefinition` entry.
 */
export const whenActiveSelf = state("active:not(:has(:active))");

/**
 * Creates a spreadable pseudo-class selector that matches when the element contains
 * a keyboard-focused (`:focus-visible`) descendant.
 * Produces `:has(:focus-visible)`.
 *
 * @param definition - CSS properties to apply when a descendant has keyboard focus.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("form-group", {
 *   ...whenFocus({ borderColor: "#a3e635" }),
 * });
 * // .form-group:has(:focus-visible) { border-color: #a3e635 }
 */
export const whenFocus = state("has(:focus-visible)");

/**
 * Creates a spreadable pseudo-class selector that matches only when the element itself
 * has keyboard focus, excluding cases where only a descendant has focus.
 * Produces `:focus-visible:not(:has(:focus-visible))`.
 *
 * @param definition - CSS properties to apply when the element itself has keyboard focus.
 * @returns A spreadable `StyleDefinition` entry.
 */
export const whenFocusSelf = state("focus-visible:not(:has(:focus-visible))");

/**
 * Creates a spreadable pseudo-class selector that matches when the element contains
 * any focused descendant (including programmatic focus via `:focus`).
 * Produces `:has(:focus)`.
 *
 * @param definition - CSS properties to apply when a descendant has any focus.
 * @returns A spreadable `StyleDefinition` entry.
 */
export const whenFocusAny = state("has(:focus)");

/**
 * Creates a spreadable pseudo-class selector that matches only when the element itself
 * has focus (any type), excluding cases where only a descendant has focus.
 * Produces `:focus:not(:has(:focus))`.
 *
 * @param definition - CSS properties to apply when the element itself has focus.
 * @returns A spreadable `StyleDefinition` entry.
 */
export const whenFocusAnySelf = state("focus:not(:has(:focus))");

function pseudo (name: string) {
	const selector  = name.startsWith("::") ? name : `::${name}`;
	return function (definition: StyleDefinition): StyleDefinition {
		return spreadableSelector(selector, definition);
	}
}

/**
 * Creates a spreadable `::before` pseudo-element selector for use inside a `StyleDefinition`.
 * Produces the CSS pseudo-element `::before`.
 *
 * @param definition - CSS properties for the `::before` pseudo-element.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("divider", {
 *   ...pseudoBefore({ content: "''", display: "block", height: "1px", background: "#333" }),
 * });
 * // .divider::before { background: #333; content: ''; display: block; height: 1px }
 */
export const pseudoBefore = pseudo("before");

/**
 * Creates a spreadable `::after` pseudo-element selector for use inside a `StyleDefinition`.
 * Produces the CSS pseudo-element `::after`.
 *
 * @param definition - CSS properties for the `::after` pseudo-element.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("badge", {
 *   ...pseudoAfter({ content: "''", position: "absolute", inset: "0", borderRadius: "inherit" }),
 * });
 * // .badge::after { border-radius: inherit; content: ''; inset: 0; position: absolute }
 */
export const pseudoAfter = pseudo("after");

/**
 * Creates a spreadable `@media (prefers-color-scheme: light)` wrapper
 * for use inside a `StyleDefinition`. The enclosed properties only apply
 * when the user's operating system or browser is set to a light color scheme.
 *
 * @param definition - CSS properties to apply under the light color scheme.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("card", {
 *   background: "#1a1a1a",
 *   color: "#e4e4e4",
 *   ...lightScheme({ background: "#f5f5f5", color: "#1a1a1a" }),
 * });
 * // .card { background: #1a1a1a; color: #e4e4e4 }
 * // @media (prefers-color-scheme: light) {
 * // .card { background: #f5f5f5; color: #1a1a1a }
 * // }
 */
export function lightScheme (definition: StyleDefinition): StyleDefinition {
	return spreadableQuery(`@media (prefers-color-scheme: light)`, definition);
}

/**
 * Creates a spreadable `@media (prefers-color-scheme: dark)` wrapper
 * for use inside a `StyleDefinition`. The enclosed properties only apply
 * when the user's operating system or browser is set to a dark color scheme.
 *
 * @param definition - CSS properties to apply under the dark color scheme.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("card", {
 *   background: "#f5f5f5",
 *   color: "#1a1a1a",
 *   ...darkScheme({ background: "#1a1a1a", color: "#e4e4e4" }),
 * });
 * // .card { background: #f5f5f5; color: #1a1a1a }
 * // @media (prefers-color-scheme: dark) {
 * // .card { background: #1a1a1a; color: #e4e4e4 }
 * // }
 */
export function darkScheme (definition: StyleDefinition): StyleDefinition {
	return spreadableQuery(`@media (prefers-color-scheme: dark)`, definition);
}

/**
 * Creates a spreadable `@container scroll-state(...)` wrapper that applies styles
 * when a scroll container is stuck on any edge (`left`, `right`, `top`, or `bottom`).
 *
 * This uses the CSS Scroll-Driven Animations `scroll-state` query syntax:
 * `@container scroll-state((stuck: left) or (stuck: right) or (stuck: top) or (stuck: bottom))`.
 *
 * @param definition - CSS properties to apply when the container is stuck.
 * @returns A spreadable `StyleDefinition` entry.
 *
 * @example
 * Style.Class("sticky-shadow", {
 *   ...whenStuck(containerClass, { boxShadow: "0 1px 0 rgba(255,255,255,0.08)" }),
 * });
 * // @container scroll-state((stuck: left) or (stuck: right) or (stuck: top) or (stuck: bottom)) {
 * // .sticky-shadow { box-shadow: 0 1px 0 rgba(255,255,255,0.08) }
 * // }
 */
export function whenStuck (container: Style.Class, definition: StyleDefinition): StyleDefinition {
	if (!container.definition.containerName) {
		throw new Error(`Class '${container.className}' cannot be used in whenStuck because it does not have a container name defined.`);
	}
	
	return spreadableQuery(`@container ${container.definition.containerName} scroll-state((stuck: left) or (stuck: right) or (stuck: top) or (stuck: bottom))`, definition);
}

/**
 * Creates a spreadable pseudo-class selector that matches when the element is in an open state,
 * such as a `<details>` element that is toggled open.
 * Produces the CSS pseudo-class `:open`.
 * 
 * @param definition - CSS properties to apply when the element is open.
 * @returns A spreadable `StyleDefinition` entry.
 * 
 * @example
 * Style.Class("details", {
 *   ...whenOpen({ borderColor: "#a3e635" }),
 * });
 * // .details:open { border-color: #a3e635 }
 */
export function whenOpen (definition: StyleDefinition): StyleDefinition {
	return spreadableSelector(":open", definition);
}

/**
 * Creates a spreadable pseudo-class selector that matches when the element is in a closed state,
 * such as a `<details>` element that is toggled closed.
 * Produces the CSS pseudo-class `:not(:open)`.
 * 
 * @param definition - CSS properties to apply when the element is closed.
 * @returns A spreadable `StyleDefinition` entry.
 * 
 * @example
 * Style.Class("details", {
 *   ...whenClosed({ borderColor: "#e4e4e4" }),
 * });
 * // .details:not(:open) { border-color: #e4e4e4 }
 */
export function whenClosed (definition: StyleDefinition): StyleDefinition {
	return spreadableSelector(":not(:open)", definition);
}
