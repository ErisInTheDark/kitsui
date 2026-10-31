import { beforeEach, describe, expect, it } from "vitest";
import { Component } from "../../src/component/Component";
import { Style, StyleRoot, StyleSelector, whenHover, type StyleDefinition } from "../../src/component/Style";
import { StyleTokens } from "../../src/component/StyleTokens";
import placeExtension from "../../src/component/extensions/placeExtension";

placeExtension();

function styleText (): string {
	return document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
}

describe("StyleTokens", () => {
	beforeEach(() => {
		document.head.innerHTML = "";
		document.body.innerHTML = "";
	});

	it("exposes each token as its own typed reference", () => {
		const Density = StyleTokens({ $blockHeight: "26px", $buttonSlideWidth2: "40px" });
		const blockHeight: "$blockHeight" = Density.$blockHeight;

		expect(blockHeight).toBe("$blockHeight");
		expect(Density.$buttonSlideWidth2).toBe("$buttonSlideWidth2");

		Style.Class("tokens-reference", { height: Density.$blockHeight, width: `[${Density.$buttonSlideWidth2} * 2]` });
		expect(styleText()).toContain(".tokens-reference { height: var(--block-height); width: calc(var(--button-slide-width-2) * 2) }");
	});

	it("declares base values when spread", () => {
		const Density = StyleTokens({ $blockHeight: "26px", $gap: "6px", $buttonSlideWidth2: "40px" });
		const Z = StyleTokens({ $zDialog: 100 });

		StyleRoot({ ...Density, ...Z }).appendTo(document.head);

		expect(styleText()).toContain(":root { --block-height: 26px; --gap: 6px; --button-slide-width-2: 40px; --z-dialog: 100 }");
	});

	it("lets explicit values and later spreads win over earlier spreads", () => {
		const Density = StyleTokens({ $gap: "6px", $blockHeight: "26px" });
		const Compact = StyleTokens({ $gap: "2px" });

		StyleSelector(".tokens-explicit", { ...Density, $gap: "10px" }).appendTo(document.head);
		StyleSelector(".tokens-later-spread", { ...Density, ...Compact }).appendTo(document.head);

		expect(styleText()).toContain(".tokens-explicit { --gap: 10px; --block-height: 26px }");
		expect(styleText()).toContain(".tokens-later-spread { --gap: 2px; --block-height: 26px }");
	});

	it("does not copy its methods into spread definitions", () => {
		const Density = StyleTokens({ $gap: "6px" });

		expect(Object.keys({ ...Density })).toEqual(["$gap"]);
	});

	it("resolves spread tokens inside nested selectors", () => {
		const Density = StyleTokens({ $gap: "6px" });

		Style.Class("tokens-nested", { ...whenHover({ ...Density }) });

		expect(styleText()).toContain(".tokens-nested:hover { --gap: 6px }");
	});

	it("overrides tokens within a class or selector scope", () => {
		const Density = StyleTokens({ $blockHeight: "26px", $gap: "6px" });

		Style.Class("tokens-menu-density", { ...Density.override({ $blockHeight: "58px" }), padding: Density.$gap });
		StyleSelector(":root.tokens-no-opacity", Density.override({ $gap: Density.$blockHeight })).appendTo(document.head);

		expect(styleText()).toContain(".tokens-menu-density { --block-height: 58px; padding: var(--gap) }");
		expect(styleText()).toContain(":root.tokens-no-opacity { --gap: var(--block-height) }");
	});

	it("applies overrides and spread base values as inline styles", () => {
		const Density = StyleTokens({ $blockHeight: "26px", $gap: "6px" });
		const overridden = Component("div").appendTo(document.body);
		const based = Component("div").appendTo(document.body);

		overridden.style.set(Density.override({ $gap: "2px" }));
		based.style.set({ ...Density });

		expect(overridden.element.style.getPropertyValue("--gap")).toBe("2px");
		expect(based.element.style.getPropertyValue("--block-height")).toBe("26px");
		expect(based.element.style.getPropertyValue("--gap")).toBe("6px");
	});

	it("extends a set with tokens that reference earlier ones", () => {
		const Colors = StyleTokens({ $lime: "#a3e635" })
			.extend(tokens => ({ $good: tokens.$lime }))
			.extend(tokens => ({ $success: tokens.$good }));

		StyleSelector(".tokens-chain", { ...Colors }).appendTo(document.head);

		expect(Colors.$success).toBe("$success");
		expect(styleText()).toContain(".tokens-chain { --lime: #a3e635; --good: var(--lime); --success: var(--good) }");
	});

	it("leaves the base set unchanged when extended", () => {
		const Base = StyleTokens({ $gap: "6px" });
		Base.extend(tokens => ({ $blockPaddingX: tokens.$gap }));

		expect(Object.keys({ ...Base })).toEqual(["$gap"]);
		expect(Object.isFrozen(Base)).toBe(true);
	});

	it("rejects tokens that are not $ names or that redefine a token", () => {
		const Density = StyleTokens({ $gap: "6px" });

		// @ts-expect-error tokens must be $ names
		expect(() => StyleTokens({ gap: "6px" })).toThrow("must be a '$' name");
		// @ts-expect-error extend cannot redefine a token
		expect(() => Density.extend(() => ({ $gap: "2px" }))).toThrow("already defined");
	});

	it("rejects unknown tokens at compile time", () => {
		const Density = StyleTokens({ $gap: "6px" });

		// @ts-expect-error unknown token reference
		void Density.$gapp;
		// @ts-expect-error unknown token override
		void Density.override({ $gapp: "2px" });
		// @ts-expect-error extend cannot reference unknown tokens
		void Density.extend(tokens => ({ $blockPaddingX: tokens.$gapp }));

		const definition: StyleDefinition = { ...Density, ...Density.override({ $gap: "2px" }) };
		expect(definition).toBeDefined();
	});
});
