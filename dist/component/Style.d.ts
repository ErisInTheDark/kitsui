import { Marker } from "../component/Marker";
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
export type StyleDefinition = ({
    [KEY in keyof CSSStyleDeclaration as CSSStyleDeclaration[KEY] extends string ? KEY extends "animation" | "animationName" ? never : KEY : never]?: StyleValue | null | undefined;
} & {
    [KEY in `$${string}`]?: StyleValue | null | undefined;
} & {
    animationName?: readonly AnimationMarker[] | AnimationMarker | "none" | null | undefined;
});
type StyleClassConstructor = {
    (className: string, definition: StyleDefinition): Style.Class;
    new (className: string, definition: StyleDefinition): Style.Class;
    prototype: Style.Class;
};
/** @group Style.Class */
declare class StyleClass {
    readonly className: string;
    readonly afterClassNames: readonly string[];
    readonly definition: Readonly<StyleDefinition>;
    readonly cssText: string;
    constructor(className: string, definition: StyleDefinition, cssText: string, afterClassNames: readonly string[]);
    toString(): string;
}
/** @hidden */
export declare function mountStylesheet(): void;
/** @hidden */
export declare function unmountStylesheet(): void;
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
export declare function Style(definition: StyleDefinition): StyleDefinition;
export declare namespace Style {
    /** @group Style.Class */
    type Class = StyleClass;
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
    const Class: StyleClassConstructor & {
        prototype: StyleClass;
    };
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
    function after(...classes: Style.Class[]): {
        Class(className: string, definition: StyleDefinition): Style.Class;
    };
}
/**
 * Registers a named keyframes animation and returns a marker exposing the generated animation name.
 *
 * The returned marker owns the injected keyframes rule and removes it again when disposed.
 * @param name The base name to use when generating a unique animation identifier.
 * @param keyframes The keyframe steps to register for the animation.
 * @returns A marker whose `.name` property contains the generated animation name.
 */
export declare function StyleAnimation(name: string, keyframes: KeyframesDefinition): AnimationMarker;
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
export declare const StyleReset: (definition: StyleDefinition) => Marker;
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
export declare const StyleRoot: (definition: StyleDefinition) => Marker;
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
export declare const StyleSelector: (selector: string, definition: StyleDefinition) => Marker;
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
export declare const StyleImport: (url: string) => Marker;
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
export declare const StyleFontFace: (definition: FontFaceDefinition) => Marker;
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
export declare function elements(tagName: keyof HTMLElementTagNameMap, definition: StyleDefinition): StyleDefinition;
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
export declare const whenFirst: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenNotFirst: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenAfterSelf: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenLast: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenNotLast: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenMiddle: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenEmpty: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenFull: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenOdd: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenEven: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenHover: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenHoverSelf: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenActive: (definition: StyleDefinition) => StyleDefinition;
/**
 * Creates a spreadable pseudo-class selector that matches only when the element itself
 * is active, excluding cases where only a descendant is active.
 * Produces `:active:not(:has(:active))`.
 *
 * @param definition - CSS properties to apply when the element itself is active.
 * @returns A spreadable `StyleDefinition` entry.
 */
export declare const whenActiveSelf: (definition: StyleDefinition) => StyleDefinition;
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
export declare const whenFocus: (definition: StyleDefinition) => StyleDefinition;
/**
 * Creates a spreadable pseudo-class selector that matches only when the element itself
 * has keyboard focus, excluding cases where only a descendant has focus.
 * Produces `:focus-visible:not(:has(:focus-visible))`.
 *
 * @param definition - CSS properties to apply when the element itself has keyboard focus.
 * @returns A spreadable `StyleDefinition` entry.
 */
export declare const whenFocusSelf: (definition: StyleDefinition) => StyleDefinition;
/**
 * Creates a spreadable pseudo-class selector that matches when the element contains
 * any focused descendant (including programmatic focus via `:focus`).
 * Produces `:has(:focus)`.
 *
 * @param definition - CSS properties to apply when a descendant has any focus.
 * @returns A spreadable `StyleDefinition` entry.
 */
export declare const whenFocusAny: (definition: StyleDefinition) => StyleDefinition;
/**
 * Creates a spreadable pseudo-class selector that matches only when the element itself
 * has focus (any type), excluding cases where only a descendant has focus.
 * Produces `:focus:not(:has(:focus))`.
 *
 * @param definition - CSS properties to apply when the element itself has focus.
 * @returns A spreadable `StyleDefinition` entry.
 */
export declare const whenFocusAnySelf: (definition: StyleDefinition) => StyleDefinition;
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
export declare const pseudoBefore: (definition: StyleDefinition) => StyleDefinition;
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
export declare const pseudoAfter: (definition: StyleDefinition) => StyleDefinition;
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
export declare function lightScheme(definition: StyleDefinition): StyleDefinition;
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
export declare function darkScheme(definition: StyleDefinition): StyleDefinition;
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
export declare function whenStuck(container: Style.Class, definition: StyleDefinition): StyleDefinition;
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
export declare function whenOpen(definition: StyleDefinition): StyleDefinition;
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
export declare function whenClosed(definition: StyleDefinition): StyleDefinition;
export {};
