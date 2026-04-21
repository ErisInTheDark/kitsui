import { describe, expect, it } from "vitest";
import { Component } from "../../src/component/Component";
import { type StyleValue } from "../../src/component/Style";
import { StyleManipulator, type StyleAttributeDefinition } from "../../src/component/StyleManipulator";
import placeExtension from "../../src/component/extensions/placeExtension";
import { State } from "../../src/state/State";

placeExtension();

function mountedComponent<NAME extends keyof HTMLElementTagNameMap = "div">(tagName: NAME = "div" as NAME): Component<HTMLElementTagNameMap[NAME]> {
	return Component(tagName).appendTo(document.body);
}

async function flushEffects (): Promise<void> {
	const schedulerRef = globalThis as typeof globalThis & {
		scheduler?: {
			yield?: () => Promise<unknown>;
		};
	};

	if (typeof schedulerRef.scheduler?.yield === "function") {
		await schedulerRef.scheduler.yield();
		return;
	}

	await Promise.resolve();
}

describe("StyleManipulator", () => {
	it("memoizes the style manipulator on component getters", () => {
		const component = mountedComponent("div");

		expect(component.style, "component.style should create a StyleManipulator instance").toBeInstanceOf(StyleManipulator);
		expect(component.style, "component.style should return the same memoized instance").toBe(component.style);
	});

	it("sets standard and custom inline style properties", () => {
		const component = mountedComponent("div");

		component.style.set({
			backgroundColor: "rebeccapurple",
			$cardGap: "12px",
			color: "white",
		});

		expect(component.element.style.getPropertyValue("background-color"), "standard CSS properties should be written as inline styles").toBe("rebeccapurple");
		expect(component.element.style.getPropertyValue("--card-gap"), "custom $properties should map to CSS custom properties").toBe("12px");
		expect(component.element.style.getPropertyValue("color"), "direct CSS properties should remain available as inline styles").toBe("white");
	});

	it("removes inline styles when direct property values are nullish", () => {
		const component = mountedComponent("div");

		component.style.set({
			backgroundColor: null,
			borderColor: undefined,
			color: "rebeccapurple",
		});

		expect(component.element.style.getPropertyValue("color"), "non-nullish properties should still be written").toBe("rebeccapurple");
		expect(component.element.style.getPropertyValue("background-color"), "null values should remove the inline style property").toBe("");
		expect(component.element.style.getPropertyValue("border-color"), "undefined values should remove the inline style property").toBe("");
	});

	it("updates inline styles from property states and removes them when the state becomes nullish", async () => {
		const component = mountedComponent("div");
		const color = State<StyleValue | null | undefined>(component, "rebeccapurple");
		const gap = State<StyleValue | null | undefined>(component, "12px");

		component.style.set({
			color,
			$cardGap: gap,
		});

		expect(component.element.style.getPropertyValue("color"), "initial state value should be written to the inline style").toBe("rebeccapurple");
		expect(component.element.style.getPropertyValue("--card-gap"), "initial custom property state should be written to the inline style").toBe("12px");

		color.set("slateblue");
		gap.set("16px");
		await flushEffects();

		expect(component.element.style.getPropertyValue("color"), "state updates should propagate to the inline style").toBe("slateblue");
		expect(component.element.style.getPropertyValue("--card-gap"), "custom property state updates should propagate to the inline style").toBe("16px");

		color.set(null);
		gap.set(undefined);
		await flushEffects();

		expect(component.element.style.getPropertyValue("color"), "null state values should remove the inline style property").toBe("");
		expect(component.element.style.getPropertyValue("--card-gap"), "undefined state values should remove the inline style property").toBe("");
	});

	it("replaces previously controlled styles when a state-driven definition changes", async () => {
		const component = mountedComponent("div");
		const definition = State<StyleAttributeDefinition | null | undefined>(component, {
			backgroundColor: "white",
			color: "rebeccapurple",
			$cardGap: "12px",
		});

		component.style.set(definition);
		expect(component.element.style.getPropertyValue("color"), "initial definition should apply its controlled properties").toBe("rebeccapurple");
		expect(component.element.style.getPropertyValue("background-color"), "initial definition should apply all controlled properties").toBe("white");
		expect(component.element.style.getPropertyValue("--card-gap"), "initial custom properties should be applied from the definition").toBe("12px");

		definition.set({
			borderColor: "black",
			color: "slateblue",
		});
		await flushEffects();

		expect(component.element.style.getPropertyValue("color"), "the new definition should replace the previous property set").toBe("slateblue");
		expect(component.element.style.getPropertyValue("border-color"), "the new definition should apply newly controlled properties").toBe("black");
		expect(component.element.style.getPropertyValue("background-color"), "properties removed from the definition should be cleared").toBe("");
		expect(component.element.style.getPropertyValue("--card-gap"), "custom properties removed from the definition should be cleared").toBe("");
	});

	it("replaces earlier property subscriptions when set is called again", async () => {
		const component = mountedComponent("div");
		const firstColor = State<StyleValue | null | undefined>(component, "rebeccapurple");
		const firstGap = State<StyleValue | null | undefined>(component, "12px");
		const secondColor = State<StyleValue | null | undefined>(component, "slateblue");

		component.style.set({
			color: firstColor,
			$cardGap: firstGap,
		});
		expect(component.element.style.getPropertyValue("color"), "the first style set should apply its color value").toBe("rebeccapurple");
		expect(component.element.style.getPropertyValue("--card-gap"), "the first style set should apply its custom property value").toBe("12px");

		component.style.set({
			color: secondColor,
		});
		expect(component.element.style.getPropertyValue("color"), "a later set call should replace the previous property subscriptions").toBe("slateblue");
		expect(component.element.style.getPropertyValue("--card-gap"), "a later set call should remove properties that are no longer controlled").toBe("");

		firstColor.set("tomato");
		firstGap.set("16px");
		await flushEffects();

		expect(component.element.style.getPropertyValue("color"), "earlier subscriptions should no longer affect the inline style after replacement").toBe("slateblue");
		expect(component.element.style.getPropertyValue("--card-gap"), "removed subscriptions should stay removed after their source updates").toBe("");

		secondColor.set("royalblue");
		await flushEffects();

		expect(component.element.style.getPropertyValue("color"), "the replacement subscription should remain active").toBe("royalblue");
	});

	it("expands variable shorthand in inline style values", () => {
		const component = mountedComponent("div");

		component.style.set({
			$spacing: "8px",
			$spacingPair: "$spacing $spacing",
			$resolvedBorderWidth: "${borderWidth: $spacing}",
			marginTop: "$spacing",
		});

		expect(component.element.style.getPropertyValue("--spacing"), "custom properties should still be written alongside shorthand expansion").toBe("8px");
		expect(component.element.style.getPropertyValue("margin-top"), "variable shorthand should expand to CSS custom property references").toBe("var(--spacing)");
		expect(component.element.style.getPropertyValue("--spacing-pair"), "multiple shorthand variables in one value should each be expanded").toBe("var(--spacing) var(--spacing)");
		expect(component.element.style.getPropertyValue("--resolved-border-width"), "fallback shorthand values should also allow nested variable shorthand").toBe("var(--border-width, var(--spacing))");
	});

	it("throws when trying to set styles on a disposed component", () => {
		const component = mountedComponent("div");
		component.remove();

		expect(() => {
			component.style.set({ color: "rebeccapurple" });
		}).toThrow("Disposed components cannot be modified.");
	});

	it("enforces the public StyleAttributeDefinition typing contract", () => {
		// @ts-expect-error nested selector keys are only valid on stylesheet style definitions
		const invalidNestedSelector: StyleAttributeDefinition = { "{&:hover}": { color: "rebeccapurple" } };
		// @ts-expect-error animation shorthand is not part of inline style manipulator definitions
		const invalidAnimation: StyleAttributeDefinition = { animation: "fade-in 1s ease" };
		// @ts-expect-error animationName is not part of inline style manipulator definitions
		const invalidAnimationName: StyleAttributeDefinition = { animationName: "fade-in" };

		const acceptedCustomProperty: StyleAttributeDefinition = { $cardGap: "12px" };
		const acceptedStateSource = null as unknown as State<StyleValue | null | undefined>;
		const acceptedStateValue: StyleAttributeDefinition = {
			color: acceptedStateSource,
		};

		expect(Boolean(invalidNestedSelector) || Boolean(invalidAnimation) || Boolean(invalidAnimationName) || Boolean(acceptedCustomProperty) || Boolean(acceptedStateValue)).toBe(true);
	});
});
