import { beforeEach, describe, expect, it } from "vitest";
import { Style, StyleAnimation, elements, mountStylesheet, unmountStylesheet, whenHover, type StyleDefinition } from "../../src/component/Style";
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

	/** Verifies keyframe bodies use the shared declaration serializer without reordering properties. */
	it("preserves keyframe declaration order in serialized bodies", () => {
		const fade = StyleAnimation("style-animation-order", {
			from: {
				borderRadius: "8px",
				backgroundColor: "#fff",
			},
		});

		Style.Class("style-animation-order-class", {
			animationDuration: "1s",
			animationName: [fade],
		});

		const styleText = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";

		expect(styleText, "keyframe declaration bodies should preserve the original property order").toContain(`from { border-radius: 8px; background-color: #fff }`);
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

	it("auto-mounts animations used in nested selectors", () => {
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

	it("auto-mounts animations used in descendant selectors", () => {
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

	it("removes animation keyframes on stylesheet teardown", () => {
		const fade = StyleAnimation("teardown-fade", {
			from: { opacity: 0 },
			to: { opacity: 1 },
		});

		Style.Class("style-animation-teardown", {
			animationDuration: "1s",
			animationName: [fade],
		});

		const styleTextBeforeUnmount = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
		expect(styleTextBeforeUnmount).toContain(`@keyframes ${fade.name} {`);

		unmountStylesheet();
		mountStylesheet();

		const styleTextAfterRemount = document.querySelector("style[data-kitsui-styles='true']")?.textContent ?? "";
		expect(styleTextAfterRemount).not.toContain(`@keyframes ${fade.name} {`);
	});

	it("omits raw animation and raw string animationName from StyleDefinition typing", () => {
		// @ts-expect-error raw CSS animation shorthand should not be assignable
		const invalidAnimation: StyleDefinition = { animation: "fade-in 1s ease" };
		// @ts-expect-error raw string animationName should not be assignable
		const invalidAnimationName: StyleDefinition = { animationName: "fade-in" };

		expect(Boolean(invalidAnimation) || Boolean(invalidAnimationName)).toBe(true);
	});
});
