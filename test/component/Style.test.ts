import { beforeEach, describe, expect, it } from "vitest";
import { Style } from "../../src/component/Style";

describe("Style", () => {
	beforeEach(() => {
		document.head.innerHTML = "";
	});

	it("can be constructed with or without new", () => {
		const withNew = new Style("style-with-new", { color: "red" });
		const withoutNew = Style("style-without-new", { color: "blue" });

		expect(withNew).toBeInstanceOf(Style);
		expect(withoutNew).toBeInstanceOf(Style);
	});

	it("registers CSS immediately when created", () => {
		const style = Style("card-box", { backgroundColor: "#fff", borderRadius: 8 });
		const styleElement = document.querySelector("style[data-kitsui-styles='true']");

		expect(style.className).toBe("card-box");
		expect(styleElement?.textContent).toContain(".card-box { background-color: #fff; border-radius: 8px }");
	});

	it("serializes custom property names and variable shorthand values", () => {
		Style("style-variable-shorthand", {
			$cardGap: 12,
			gap: "$cardGap",
			padding: "calc($cardGap * 2)",
		});

		const styleElement = document.querySelector("style[data-kitsui-styles='true']");

		expect(styleElement?.textContent).toContain(".style-variable-shorthand { --card-gap: 12px; gap: var(--card-gap); padding: calc(var(--card-gap) * 2) }");
	});

	it("supports nested fallback variable shorthand", () => {
		Style("style-variable-fallback", {
			color: "${brandColor: ${fallbackColor: blue}}",
		});

		const styleElement = document.querySelector("style[data-kitsui-styles='true']");

		expect(styleElement?.textContent).toContain(".style-variable-fallback { color: var(--brand-color, var(--fallback-color, blue)) }");
	});

	it("reuses an existing style for identical rules", () => {
		const first = Style("shared-style", { color: "red" });
		const second = Style("shared-style", { color: "red" });

		expect(second).toBe(first);
	});

	it("throws when a class name is registered with different rules", () => {
		Style("unique-style", { color: "red" });

		expect(() => {
			Style("unique-style", { color: "blue" });
		}).toThrow(/already registered/i);
	});

	it("can create styles ordered after existing styles", () => {
		const base = Style("style-after-base", { color: "black" });
		const accent = Style.after(base).create("style-after-accent", { color: "red" });
		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(accent.className).toBe("style-after-accent");
		expect(styleText.indexOf(".style-after-base")).toBeLessThan(styleText.indexOf(".style-after-accent"));
	});

	it("orders styles after the last referenced dependency", () => {
		const first = Style("style-after-first", { color: "black" });
		const second = Style("style-after-second", { color: "gray" });
		Style.after(first, second).create("style-after-third", { color: "white" });
		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText.indexOf(".style-after-second")).toBeLessThan(styleText.indexOf(".style-after-third"));
	});
});