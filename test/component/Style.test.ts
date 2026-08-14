import { beforeEach, describe, expect, it } from "vitest";
import { Marker } from "../../src/component/Marker";
import { Style, StyleAnimation, StyleFontFace, StyleImport, StyleReset, StyleRoot, StyleSelector, darkScheme, elements, lightScheme, mediaQuery, pseudoAfter, pseudoBefore, resetStyles, whenAfterSelf, whenDisabled, whenFirst, whenHover, type QueryExpression } from "../../src/component/Style";
import placeExtension from "../../src/component/extensions/placeExtension";

placeExtension();

describe("Style", () => {
	beforeEach(() => {
		document.head.innerHTML = "";
	});

	it("creates reusable style definition fragments for spreading", () => {
		const fragment = Style({ display: "flex", gap: "8px" });
		const style = Style.Class("style-spread-fragment", { ...fragment, color: "red" });
		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(style.className).toBe("style-spread-fragment");
		expect(styleText).toContain(".style-spread-fragment { display: flex; gap: 8px; color: red }");
	});

	it("can be constructed with or without new", () => {
		const withNew = new Style.Class("style-with-new", { color: "red" });
		const withoutNew = Style.Class("style-without-new", { color: "blue" });

		expect(withNew).toBeInstanceOf(Style.Class);
		expect(withoutNew).toBeInstanceOf(Style.Class);
	});

	it("registers CSS immediately when created", () => {
		const style = Style.Class("card-box", { borderRadius: "8px", backgroundColor: "#fff" });
		const styleElement = document.querySelector("style[data-kitsui-styles='true']");

		expect(style.className).toBe("card-box");
		expect(styleElement?.textContent).toContain(".card-box { border-radius: 8px; background-color: #fff }");
	});

	it("serializes custom property names and variable shorthand values", () => {
		Style.Class("style-variable-shorthand", {
			$cardGap: "12px",
			gap: "$cardGap",
			padding: "calc($cardGap * 2)",
		});

		const styleElement = document.querySelector("style[data-kitsui-styles='true']");

		expect(styleElement?.textContent).toContain(".style-variable-shorthand { --card-gap: 12px; gap: var(--card-gap); padding: calc(var(--card-gap) * 2) }");
	});

	it("serializes calculation shorthand and escaped grid line names", () => {
		Style.Class("style-calculation-shorthand", {
			$cardGap: "12px",
			gridTemplateColumns: "[[sidebar-start]] [100% - $cardGap] [[sidebar-end]]",
			width: "[min(100%, 40rem) - $cardGap]",
		});

		const styleElement = document.querySelector("style[data-kitsui-styles='true']");

		expect(styleElement?.textContent).toContain(".style-calculation-shorthand { --card-gap: 12px; grid-template-columns: [sidebar-start] calc(100% - var(--card-gap)) [sidebar-end]; width: calc(min(100%, 40rem) - var(--card-gap)) }");
	});

	/** Verifies negative variable shorthand serializes as a calc() expression and still expands inside operator contexts. */
	it("serializes negative variable shorthand values", () => {
		Style.Class("style-negative-variable-shorthand", {
			$cssVarName: "8px",
			$scaleFactor: "2",
			paddingTop: "-$cssVarName",
			marginTop: "calc(10px + -$cssVarName)",
			marginBottom: "calc(10px % -$cssVarName)",
			$product: "calc(10 * -$scaleFactor)",
			$quotient: "calc(10 / -$scaleFactor)",
		});

		const styleElement = document.querySelector("style[data-kitsui-styles='true']");

		expect(styleElement?.textContent, "negative variable shorthand should serialize as a calc() expression that multiplies the referenced CSS variable by -1").toContain("padding-top: calc(-1 * var(--css-var-name))");
		expect(styleElement?.textContent, "negative shorthand inside an operator context should expand to a nested calc() around the referenced CSS variable").toContain("margin-top: calc(10px + calc(-1 * var(--css-var-name)))");
		expect(styleElement?.textContent, "negative shorthand after the modulo operator should expand to a nested calc() around the referenced CSS variable").toContain("margin-bottom: calc(10px % calc(-1 * var(--css-var-name)))");
		expect(styleElement?.textContent, "negative shorthand after multiplication should expand to a nested calc() around the referenced CSS variable").toContain("--product: calc(10 * calc(-1 * var(--scale-factor)))");
		expect(styleElement?.textContent, "negative shorthand after division should expand to a nested calc() around the referenced CSS variable").toContain("--quotient: calc(10 / calc(-1 * var(--scale-factor)))");
	});

	it("supports nested fallback variable shorthand", () => {
		Style.Class("style-variable-fallback", {
			color: "${brandColor: ${fallbackColor: blue}}",
		});

		const styleElement = document.querySelector("style[data-kitsui-styles='true']");

		expect(styleElement?.textContent).toContain(".style-variable-fallback { color: var(--brand-color, var(--fallback-color, blue)) }");
	});

	it("reuses an existing style for identical rules", () => {
		const first = Style.Class("shared-style", { color: "red" });
		const second = Style.Class("shared-style", { color: "red" });

		expect(second).toBe(first);
	});

	it("throws when a class name is registered with different rules", () => {
		Style.Class("unique-style", { color: "red" });

		expect(() => {
			Style.Class("unique-style", { color: "blue" });
		}).toThrow(/already registered/i);
	});

	it("resets every stylesheet registration for hot reload", () => {
		StyleImport("https://fonts.example.com/hot-reload.css").appendTo(document.head);
		StyleReset({ boxSizing: "border-box" }).appendTo(document.head);
		StyleFontFace({ fontFamily: "'HotReload'", src: "url(hot-reload.woff2)" }).appendTo(document.head);
		StyleRoot({ colorScheme: "dark" }).appendTo(document.head);
		StyleSelector("::view-transition-new(root)", { opacity: 0 }).appendTo(document.head);
		const animation = StyleAnimation("hot-reload", {
			from: { opacity: 0 },
			to: { opacity: 1 },
		});
		Style.Class("style-hot-reload", {
			animationName: animation,
			color: "red",
		});

		const oldStyleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
		expect(oldStyleText).toContain("hot-reload.css");
		expect(oldStyleText).toContain("* { box-sizing: border-box }");
		expect(oldStyleText).toContain("@font-face { font-family: 'HotReload'; src: url(hot-reload.woff2) }");
		expect(oldStyleText).toContain(":root { color-scheme: dark }");
		expect(oldStyleText).toContain("::view-transition-new(root) { opacity: 0 }");
		expect(oldStyleText).toContain(`@keyframes ${animation.name}`);
		expect(oldStyleText).toContain(".style-hot-reload");

		resetStyles();

		expect(document.querySelector("style[data-kitsui-styles='true']"), "the generated stylesheet should be removed by a full reset").toBeNull();

		const reloadedStyle = Style.Class("style-hot-reload", { color: "blue" });
		const newStyleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(reloadedStyle.definition).toEqual({ color: "blue" });
		expect(newStyleText).toContain(".style-hot-reload { color: blue }");
		expect(newStyleText).not.toContain("hot-reload.css");
		expect(newStyleText).not.toContain("box-sizing: border-box");
		expect(newStyleText).not.toContain("@font-face");
		expect(newStyleText).not.toContain(":root");
		expect(newStyleText).not.toContain("::view-transition-new");
		expect(newStyleText).not.toContain("@keyframes");
	});

	it("keeps stale marker cleanup from removing identical rules registered after a reset", () => {
		const staleImport = StyleImport("https://fonts.example.com/shared.css").appendTo(document.head);

		resetStyles();

		const currentImport = StyleImport("https://fonts.example.com/shared.css").appendTo(document.head);
		staleImport.remove();

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
		expect(styleText).toContain('@import url("https://fonts.example.com/shared.css");');

		currentImport.remove();
	});

	it("can create styles ordered after existing styles", () => {
		const base = Style.Class("style-after-base", { color: "black" });
		const accent = Style.after(base).Class("style-after-accent", { color: "red" });
		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(accent.className).toBe("style-after-accent");
		expect(styleText.indexOf(".style-after-base")).toBeLessThan(styleText.indexOf(".style-after-accent"));
	});

	it("orders styles after the last referenced dependency", () => {
		const first = Style.Class("style-after-first", { color: "black" });
		const second = Style.Class("style-after-second", { color: "gray" });
		Style.after(first, second).Class("style-after-third", { color: "white" });
		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText.indexOf(".style-after-second")).toBeLessThan(styleText.indexOf(".style-after-third"));
	});

	/** Verifies descendant element selectors are emitted from `elements()`. */
	it("renders descendant element selectors", () => {
		Style.Class("style-elements-descendant", {
			...elements("h1", { color: "#fff" }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "descendant element selectors should render with a space between the parent class and tag name").toContain(".style-elements-descendant h1 { color: #fff }");
	});

	/** Verifies pseudo-class selectors are emitted from `whenHover()`. */
	it("renders hover state selectors", () => {
		Style.Class("style-when-hover", {
			...whenHover({ background: "#111" }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "hover state selectors should render with the `:hover` suffix").toContain(".style-when-hover:hover { background: #111 }");
	});

	/** Verifies pseudo-class selectors are emitted from `whenDisabled()`. */
	it("renders disabled state selectors", () => {
		Style.Class("style-when-disabled", {
			...whenDisabled({ opacity: "0.5" }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "disabled state selectors should render with the `:disabled` suffix").toContain(".style-when-disabled:disabled { opacity: 0.5 }");
	});

	/** Verifies pseudo-class selectors are emitted from `whenFirst()`. */
	it("renders first-child state selectors", () => {
		Style.Class("style-when-first", {
			...whenFirst({ marginTop: "0" }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "first-child state selectors should render with the `:first-child` suffix").toContain(".style-when-first:first-child { margin-top: 0 }");
	});

	/** Verifies pseudo-element helpers emit `::before` and `::after` selectors. */
	it("renders pseudo-element helpers", () => {
		Style.Class("style-pseudo-elements", {
			...pseudoBefore({ content: "''" }),
			...pseudoAfter({ content: "''" }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "pseudo-before should render a `::before` rule").toContain(".style-pseudo-elements::before { content: '' }");
		expect(styleText, "pseudo-after should render a `::after` rule").toContain(".style-pseudo-elements::after { content: '' }");
	});

	/** Verifies nested element selectors can themselves contain nested element selectors in declaration order. */
	it("renders recursive nested element selectors", () => {
		Style.Class("style-recursive-nesting", {
			...elements("pre", {
				color: "#eee",
				background: "#111",
				...elements("code", { marginTop: "1rem", background: "none" }),
			}),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "the outer nested element rule should preserve declaration order").toContain(".style-recursive-nesting pre { color: #eee; background: #111 }");
		expect(styleText, "the inner nested element rule should preserve declaration order").toContain(".style-recursive-nesting pre code { margin-top: 1rem; background: none }");
	});

	/** Verifies state helpers can be nested inside element selectors. */
	it("renders element selectors with nested state selectors", () => {
		Style.Class("style-element-state", {
			...elements("a", {
				color: "green",
				...whenHover({ textDecoration: "underline" }),
			}),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "the element selector should render its own rule").toContain(".style-element-state a { color: green }");
		expect(styleText, "the nested hover selector should render under the element selector").toContain(".style-element-state a:hover { text-decoration: underline }");
	});

	/** Verifies null and undefined values are removed from nested selector output. */
	it("filters null and undefined values from nested selector output", () => {
		Style.Class("style-nested-null-filter", {
			color: "red",
			...elements("section", {
				background: null,
				...whenHover({ color: undefined }),
				...pseudoBefore({ content: undefined }),
				...pseudoAfter({ content: null }),
			}),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "the top-level rule should still render when nested values are empty").toContain(".style-nested-null-filter { color: red }");
		expect(styleText, "empty nested selectors should not emit a descendant rule").not.toContain(".style-nested-null-filter section");
	});

	/** Verifies reset rules are emitted with the universal selector ahead of regular styles. */
	it("renders reset rules before regular styles", () => {
		const reset = StyleReset({ boxSizing: "border-box" });
		expect(reset).toBeInstanceOf(Marker);
		reset.appendTo(document.head);
		Style.Class("style-reset-basic-regular", { color: "red" });

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "the reset rule should render with the universal selector").toContain("* { box-sizing: border-box }");
		expect(styleText.indexOf("* { box-sizing: border-box }"), "the reset rule should appear before regular styles in the stylesheet").toBeLessThan(styleText.indexOf(".style-reset-basic-regular"));
	});

	/** Verifies reset rules can include pseudo-element selectors. */
	it("renders reset rules with pseudo-elements", () => {
		StyleReset({
			margin: "0",
			...pseudoBefore({ boxSizing: "border-box" }),
			...pseudoAfter({ boxSizing: "border-box" }),
		}).appendTo(document.head);

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "the reset rule should render on the universal selector").toContain("* { margin: 0 }");
		expect(styleText, "the pseudo-before reset rule should render as `*::before`").toContain("*::before { box-sizing: border-box }");
		expect(styleText, "the pseudo-after reset rule should render as `*::after`").toContain("*::after { box-sizing: border-box }");
	});

	/** Verifies reset rules stay ahead of later regular styles in stylesheet order. */
	it("keeps reset rules before regular styles", () => {
		StyleReset({ padding: "0" }).appendTo(document.head);
		Style.Class("style-reset-order-regular", { color: "red" });

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText.indexOf("* { padding: 0 }"), "the reset rule should be emitted before the regular class rule").toBeLessThan(styleText.indexOf(".style-reset-order-regular"));
	});

	/** Verifies font-face rules are emitted with the required descriptors. */
	it("renders basic font-face rules", () => {
		StyleFontFace({
			fontFamily: "'TestFont'",
			src: "url(test.woff2) format('woff2')",
		}).appendTo(document.head);

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "basic font-face rules should include the family name and source descriptor").toContain("@font-face { font-family: 'TestFont'; src: url(test.woff2) format('woff2') }");
	});

	/** Verifies optional font-face descriptors preserve object declaration order alongside the required fields. */
	it("renders font-face rules with all properties", () => {
		StyleFontFace({
			fontFamily: "'TestFont2'",
			src: "url(test2.woff2)",
			fontWeight: 700,
			fontStyle: "normal",
			fontDisplay: "swap",
		}).appendTo(document.head);

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "font-face rules should serialize all provided descriptors in declaration order").toContain("@font-face { font-family: 'TestFont2'; src: url(test2.woff2); font-weight: 700; font-style: normal; font-display: swap }");
	});

	/** Verifies reset rules, font-face rules, and class rules keep their stylesheet order. */
	it("keeps font-face rules between reset rules and regular styles", () => {
		StyleReset({ margin: "0" }).appendTo(document.head);
		StyleFontFace({
			fontFamily: "'OrderedFont'",
			src: "url(ordered-font.woff2)",
		}).appendTo(document.head);
		Style.Class("style-font-face-order-class", { color: "red" });

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "the reset rule should be present in the stylesheet").toContain("* { margin: 0 }");
		expect(styleText, "the font-face rule should be present in the stylesheet").toContain("@font-face { font-family: 'OrderedFont'; src: url(ordered-font.woff2) }");
		expect(styleText, "the class rule should be present in the stylesheet").toContain(".style-font-face-order-class { color: red }");
		expect(styleText.indexOf("* { margin: 0 }"), "reset rules should appear before font-face rules").toBeLessThan(styleText.indexOf("@font-face { font-family: 'OrderedFont'; src: url(ordered-font.woff2) }"));
		expect(styleText.indexOf("@font-face { font-family: 'OrderedFont'; src: url(ordered-font.woff2) }"), "font-face rules should appear before regular class styles").toBeLessThan(styleText.indexOf(".style-font-face-order-class { color: red }"));
	});

	it("registers @import rules at the very start of the stylesheet", () => {
		const styleImport = StyleImport("https://fonts.example.com/inter.css");
		expect(styleImport).toBeInstanceOf(Marker);
		styleImport.appendTo(document.head);
		StyleReset({ margin: "0" }).appendTo(document.head);
		Style.Class("style-import-order-class", { color: "blue" });

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain('@import url("https://fonts.example.com/inter.css");');
		expect(
			styleText.indexOf('@import url("https://fonts.example.com/inter.css");'),
			"import rules should appear before reset rules",
		).toBeLessThan(styleText.indexOf("* { margin: 0 }"));
	});

	/** Verifies reset rules are only rendered while the component is mounted and are cleaned up on removal. */
	it("renders reset rules on mount and removes them on cleanup", () => {
		const reset = StyleReset({ outlineOffset: "17px" });
		const styleTextBeforeMount = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleTextBeforeMount, "reset rules should not appear before the component is mounted").not.toContain("* { outline-offset: 17px }");

		reset.appendTo(document.head);

		const styleTextAfterMount = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleTextAfterMount, "reset rules should appear after the component is mounted").toContain("* { outline-offset: 17px }");

		reset.remove();

		const styleTextAfterRemove = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleTextAfterRemove, "reset rules should be removed when the component is disposed").not.toContain("* { outline-offset: 17px }");
	});

	/** Verifies lightScheme wraps rules in a prefers-color-scheme: light media query. */
	it("renders lightScheme as a @media (prefers-color-scheme: light) wrapper", () => {
		Style.Class("style-light-scheme", {
			background: "#1a1a1a",
			...lightScheme({ background: "#f5f5f5" }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(".style-light-scheme { background: #1a1a1a }");
		expect(styleText).toContain("@media (prefers-color-scheme: light) {");
		expect(styleText).toContain(".style-light-scheme { background: #f5f5f5 }");
	});

	/** Verifies darkScheme wraps rules in a prefers-color-scheme: dark media query. */
	it("renders darkScheme as a @media (prefers-color-scheme: dark) wrapper", () => {
		Style.Class("style-dark-scheme", {
			background: "#f5f5f5",
			...darkScheme({ background: "#1a1a1a" }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(".style-dark-scheme { background: #f5f5f5 }");
		expect(styleText).toContain("@media (prefers-color-scheme: dark) {");
		expect(styleText).toContain(".style-dark-scheme { background: #1a1a1a }");
	});

	it("renders arbitrary compound media feature expressions", () => {
		Style.Class("style-media-query", {
			padding: "24px",
			...mediaQuery("(width <= 60rem) and (hover: hover)", { padding: "12px" }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(".style-media-query { padding: 24px }");
		expect(styleText).toContain("@media (width <= 60rem) and (hover: hover) {");
		expect(styleText).toMatch(/@media \(width <= 60rem\) and \(hover: hover\) \{\n\.style-media-query \{ padding: 12px \}\n\}/);
	});

	it("rejects media expressions without enclosing parentheses", () => {
		expect(() => mediaQuery("width <= 60rem" as QueryExpression, { color: "red" })).toThrow(/must start with '\(' and end with '\)'/i);
	});

	it("creates spreadable containers without exposing their methods as CSS properties", () => {
		const container = Style.Container.inlineSize.style.scrollState.name("cardHost");

		expect(Object.keys(container)).toEqual(["containerName", "containerType"]);
		expect(Object.isFrozen(container)).toBe(true);
		expect(typeof container.query).toBe("function");
		expect(typeof container.style).toBe("function");
		expect(typeof container.scrollState).toBe("function");

		Style.Class("style-container-owner", { ...container });
		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(".style-container-owner { container-name: cardHost; container-type: inline-size scroll-state }");
		expect(styleText).not.toContain("style-property:");
		expect(styleText).not.toContain("scroll-state:");
	});

	it("serializes every container capability combination", () => {
		expect({ ...Style.Container.size.name("sizeOnlyHost") }).toEqual({
			containerName: "sizeOnlyHost",
			containerType: "size",
		});
		expect({ ...Style.Container.style.name("styleOnlyHost") }).toEqual({
			containerName: "styleOnlyHost",
		});
		expect({ ...Style.Container.scrollState.name("scrollOnlyHost") }).toEqual({
			containerName: "scrollOnlyHost",
			containerType: "scroll-state",
		});
		expect({ ...Style.Container.scrollState.style.inlineSize.name("combinedHost") }).toEqual({
			containerName: "combinedHost",
			containerType: "inline-size scroll-state",
		});
	});

	it("keeps container factory branches immutable and lets the last size getter win", () => {
		const sizedFactory = Style.Container.size;
		const sizeContainer = sizedFactory.name("factorySizeHost");
		const inlineSizeContainer = sizedFactory.inlineSize.name("factoryInlineSizeHost");

		expect(Object.isFrozen(Style.Container)).toBe(true);
		expect(Object.isFrozen(sizedFactory)).toBe(true);
		expect({ ...sizeContainer }).toEqual({
			containerName: "factorySizeHost",
			containerType: "size",
		});
		expect({ ...inlineSizeContainer }).toEqual({
			containerName: "factoryInlineSizeHost",
			containerType: "inline-size",
		});
		expect({ ...Style.Container.inlineSize.size.name("factoryLastSizeHost") }).toEqual({
			containerName: "factoryLastSizeHost",
			containerType: "size",
		});
		expect((Style.Container as unknown as { name?: unknown }).name).toBeUndefined();
		expect((inlineSizeContainer as unknown as { inlineSize?: unknown; name?: unknown; size?: unknown }).name).toBeUndefined();
		expect((inlineSizeContainer as unknown as { inlineSize?: unknown; name?: unknown; size?: unknown }).size).toBeUndefined();
		expect((inlineSizeContainer as unknown as { inlineSize?: unknown; name?: unknown; size?: unknown }).inlineSize).toBeUndefined();
	});

	it("serializes raw size, style, and scroll-state container expressions", () => {
		const container = Style.Container.size.style.scrollState.name("rawHost");

		Style.Class("style-container-raw", {
			...container.query("(30rem < width < 60rem)", { width: "50%" }),
			...container.style("(--density: compact) and (--tone: dark)", { gap: "4px" }),
			...container.scrollState("(stuck: top) and (scrollable: bottom)", { opacity: 0.8 }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain("@container rawHost (30rem < width < 60rem) {");
		expect(styleText).toContain("@container rawHost style((--density: compact) and (--tone: dark)) {");
		expect(styleText).toContain("@container rawHost scroll-state((stuck: top) and (scrollable: bottom)) {");
	});

	it("serializes style-property and scroll-state container shortcuts", () => {
		const container = Style.Container.style.scrollState.name("shortcutHost");

		Style.Class("style-container-shortcuts", {
			...container.styleProperty("$density", "$compactDensity", { gap: "4px" }),
			...container.stuck({ boxShadow: "0 1px black" }),
			...container.stuck("block-start", { top: 0 }),
			...container.snapped("inline", { outlineWidth: "1px" }),
			...container.scrollable("block-end", { overflowY: "auto" }),
			...container.scrolled("top", { opacity: 0.8 }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain("@container shortcutHost style(--density: var(--compact-density)) {");
		expect(styleText).toContain("@container shortcutHost scroll-state((stuck: left) or (stuck: right) or (stuck: top) or (stuck: bottom)) {");
		expect(styleText).toContain("@container shortcutHost scroll-state(stuck: block-start) {");
		expect(styleText).toContain("@container shortcutHost scroll-state(snapped: inline) {");
		expect(styleText).toContain("@container shortcutHost scroll-state(scrollable: block-end) {");
		expect(styleText).toContain("@container shortcutHost scroll-state(scrolled: top) {");
	});

	it("composes mixed container conditions by nesting direct query spreads", () => {
		const container = Style.Container.inlineSize.style.scrollState.name("nestedHost");

		Style.Class("style-container-nested", {
			...container.query("(inline-size > 30rem)", {
				...container.style("(--density: compact)", {
					...container.stuck("top", { display: "grid" }),
				}),
			}),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toMatch(/@container nestedHost \(inline-size > 30rem\) \{\n@container nestedHost style\(\(--density: compact\)\) \{\n@container nestedHost scroll-state\(stuck: top\) \{\n\.style-container-nested \{ display: grid \}\n\}\n\}\n\}/);
	});

	it("rejects invalid container names, capabilities, and raw expressions", () => {
		expect(() => Style.Container.style.name("none")).toThrow(/custom identifier/i);

		const container = Style.Container.inlineSize.style.scrollState.name("expressionHost");
		expect(() => container.query("inline-size > 30rem" as QueryExpression, {})).toThrow(/must start with '\(' and end with '\)'/i);
		expect(() => container.style("--density: compact" as QueryExpression, {})).toThrow(/must start with '\(' and end with '\)'/i);
		expect(() => container.scrollState("stuck: top" as QueryExpression, {})).toThrow(/must start with '\(' and end with '\)'/i);
	});

	/** Verifies at-rules support nested element and state selectors. */
	it("renders at-rules with nested element and state selectors", () => {
		Style.Class("style-media-nested", {
			color: "#ccc",
			...lightScheme({
				color: "#333",
				...elements("h1", { color: "#111" }),
				...whenHover({ color: "#000" }),
			}),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(".style-media-nested { color: #ccc }");
		expect(styleText).toContain("@media (prefers-color-scheme: light) {");
		expect(styleText).toContain(".style-media-nested { color: #333 }");
		expect(styleText).toContain(".style-media-nested h1 { color: #111 }");
		expect(styleText).toContain(".style-media-nested:hover { color: #000 }");
	});

	/** Verifies at-rules can set CSS custom properties. */
	it("renders at-rules with CSS custom property overrides", () => {
		Style.Class("style-media-vars", {
			$bgPage: "#0d0d0d",
			...lightScheme({ $bgPage: "#f5f5f5" }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(".style-media-vars { --bg-page: #0d0d0d }");
		expect(styleText).toContain("@media (prefers-color-scheme: light) {");
		expect(styleText).toContain(".style-media-vars { --bg-page: #f5f5f5 }");
	});

	/** Verifies multiple at-rules in the same definition both render. */
	it("renders multiple at-rules in the same definition", () => {
		Style.Class("style-multi-at-rule", {
			color: "gray",
			...lightScheme({ color: "black" }),
			...darkScheme({ color: "white" }),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(".style-multi-at-rule { color: gray }");
		expect(styleText).toContain("@media (prefers-color-scheme: light) {");
		expect(styleText).toContain("@media (prefers-color-scheme: dark) {");
	});

	/** Verifies whenAfterSelf creates the correct sibling selector. */
	it("renders whenAfterSelf with the correct sibling selector", () => {
		const cls = Style.Class("style-when-after-self", {
			color: "black",
			...whenAfterSelf({ color: "blue" }),
		});

		expect(cls.cssText).toContain(".style-when-after-self { color: black }");
		expect(cls.cssText).toContain(".style-when-after-self + :where(.style-when-after-self) { color: blue }");
	});
});
