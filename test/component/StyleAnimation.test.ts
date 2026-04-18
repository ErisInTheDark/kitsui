import { beforeEach, describe, expect, it } from "vitest";
import { Style, StyleAnimation, StyleSelector, elements, mountStylesheet, unmountStylesheet, whenHover, type StyleDefinition } from "../../src/component/Style";
import placeExtension from "../../src/component/extensions/placeExtension";

placeExtension();

describe("StyleAnimation", () => {
	beforeEach(() => {
		document.head.innerHTML = "";
	});

	it("creates unique suffixed animation names", () => {
		const first = StyleAnimation("fade-in", {
			from: { opacity: 0 },
			to: { opacity: 1 },
		});
		const second = StyleAnimation("fade-in", {
			from: { opacity: 0 },
			to: { opacity: 1 },
		});

		expect(first.name).toMatch(/^fade-in-\d+$/u);
		expect(second.name).toMatch(/^fade-in-\d+$/u);
		expect(first.name).not.toBe(second.name);
	});

	it("mounts keyframes automatically when used in a style definition", () => {
		const fade = StyleAnimation("style-animation-basic", {
			from: { opacity: 0 },
			to: { opacity: 1 },
		});

		Style.Class("style-animation-class", {
			animationDuration: "1s",
			animationName: [fade],
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(`@keyframes ${fade.name} {`);
		expect(styleText).toContain("from { opacity: 0 }");
		expect(styleText).toContain("to { opacity: 1 }");
		expect(styleText).toContain(`.style-animation-class { animation-duration: 1s; animation-name: ${fade.name} }`);
	});

	it("serializes multiple animation markers in animationName", () => {
		const fadeIn = StyleAnimation("multi-fade-in", {
			"0%": { opacity: 0 },
			"100%": { opacity: 1 },
		});
		const fadeOut = StyleAnimation("multi-fade-out", {
			from: { opacity: 1 },
			to: { opacity: 0 },
		});

		Style.Class("style-animation-multi", {
			animationDuration: "1s, 2s",
			animationName: [fadeIn, fadeOut],
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(`animation-name: ${fadeIn.name}, ${fadeOut.name}`);
	});

	it("auto-mounts animations used in nested hover selectors", () => {
		const pulse = StyleAnimation("nested-pulse", {
			from: { opacity: 0.5 },
			to: { opacity: 1 },
		});

		Style.Class("style-animation-hover", {
			...whenHover({
				animationDuration: "150ms",
				animationName: [pulse],
			}),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(`@keyframes ${pulse.name} {`);
		expect(styleText).toContain(`.style-animation-hover:hover { animation-duration: 150ms; animation-name: ${pulse.name} }`);
	});

	it("auto-mounts animations used in descendant element selectors", () => {
		const fade = StyleAnimation("nested-descendant-fade", {
			from: { opacity: 0 },
			to: { opacity: 1 },
		});

		Style.Class("style-animation-descendant", {
			...elements("section", {
				animationDuration: "200ms",
				animationName: [fade],
			}),
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(`@keyframes ${fade.name} {`);
		expect(styleText).toContain(`.style-animation-descendant section { animation-duration: 200ms; animation-name: ${fade.name} }`);
	});

	it("removes animation keyframes on stylesheet teardown and remount", () => {
		const fade = StyleAnimation("teardown-fade", {
			from: { opacity: 0 },
			to: { opacity: 1 },
		});

		Style.Class("style-animation-teardown", {
			animationDuration: "1s",
			animationName: [fade],
		});

		const styleTextBefore = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
		expect(styleTextBefore).toContain(`@keyframes ${fade.name} {`);

		unmountStylesheet();
		mountStylesheet();

		const styleTextAfter = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
		expect(styleTextAfter).not.toContain(`@keyframes ${fade.name} {`);
	});

	it("auto-mounts animations used in a mounted StyleSelector with a single marker", () => {
		const fade = StyleAnimation("selector-fade", {
			from: { opacity: 0 },
			to: { opacity: 1 },
		});

		StyleSelector("::view-transition-new(docs-main)", {
			animationName: fade,
			animationDuration: "200ms",
		}).appendTo(document.head);

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText).toContain(`@keyframes ${fade.name} {`);
		expect(styleText).toContain(`animation-name: ${fade.name}`);
	});

	it("does not carry over StyleSelector rootRules or animation keyframes from a previous unmount cycle", () => {
		// Simulate first build: create an animation used in a StyleSelector, then unmount
		const fadeFirst = StyleAnimation("cross-build-fade", {
			from: { opacity: 0 },
			to: { opacity: 1 },
		});
		StyleSelector("::view-transition-old(docs-main)", {
			animationName: fadeFirst,
		}).appendTo(document.head);

		const styleTextFirst = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
		expect(styleTextFirst).toContain(`::view-transition-old(docs-main) { animation-name: ${fadeFirst.name} }`);
		expect(styleTextFirst).toContain(`@keyframes ${fadeFirst.name} {`);

		unmountStylesheet();
		document.head.innerHTML = "";
		mountStylesheet();

		// Simulate second build: nothing new is registered
		const styleTextSecond = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
		expect(styleTextSecond).not.toContain(`::view-transition-old(docs-main)`);
		expect(styleTextSecond).not.toContain(`@keyframes ${fadeFirst.name} {`);
	});

	it("re-registers keyframes for a module-level marker reused after an unmount cycle", () => {
		// Simulate a module-level animation created once and reused across two builds
		const moduleFade = StyleAnimation("module-level-fade", {
			from: { opacity: 0 },
			to: { opacity: 1 },
		});

		// First build
		StyleSelector("::view-transition-new(docs-content)", {
			animationName: moduleFade,
		}).appendTo(document.head);
		expect(document.querySelector("style[data-kitsui-styles='true']")?.textContent).toContain(`@keyframes ${moduleFade.name} {`);

		// Tear down and start fresh (simulates next page build)
		unmountStylesheet();
		document.head.innerHTML = "";
		mountStylesheet();

		// Second build: same marker reused
		StyleSelector("::view-transition-new(docs-content)", {
			animationName: moduleFade,
		}).appendTo(document.head);

		const styleTextSecond = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
		expect(styleTextSecond).toContain(`@keyframes ${moduleFade.name} {`);
		expect(styleTextSecond).toContain(`animation-name: ${moduleFade.name}`);
	});

	it("accepts \"none\" as animationName and rejects other raw strings and raw animation shorthand", () => {
		Style.Class("style-animation-name-none", { animationName: "none" });
		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
		expect(styleText).toContain(".style-animation-name-none { animation-name: none }");

		const validNone: StyleDefinition = { animationName: "none" };
		// @ts-expect-error raw CSS animation shorthand should not be assignable
		const invalidAnimation: StyleDefinition = { animation: "fade-in 1s ease" };
		// @ts-expect-error raw string animationName other than "none" should not be assignable
		const invalidAnimationName: StyleDefinition = { animationName: "fade-in" };

		expect(Boolean(validNone) || Boolean(invalidAnimation) || Boolean(invalidAnimationName)).toBe(true);
	});
});
