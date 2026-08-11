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
		const color = State<StyleValue | null>(component, "rebeccapurple");
		const gap = State<StyleValue | null>(component, "12px");

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
		gap.set(null);
		await flushEffects();

		expect(component.element.style.getPropertyValue("color"), "null state values should remove the inline style property").toBe("");
		expect(component.element.style.getPropertyValue("--card-gap"), "null state values should remove the inline style property").toBe("");
	});

	it("replaces previously controlled styles when a state-driven definition changes", async () => {
		const component = mountedComponent("div");
		const definition = State<StyleAttributeDefinition | null>(component, {
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

	it("composes independent style concerns across set calls", async () => {
		const component = mountedComponent("div");
		const regionStyle = State<StyleAttributeDefinition | null>(component, {
			$alignBlock: "center",
			$alignInline: "end",
		});
		const scale = State<StyleValue | null>(component, "1");

		component.style.set(regionStyle);
		component.style.set({ $scale: scale });

		expect(component.element.style.getPropertyValue("--align-block"), "the first style concern should keep its block alignment after another concern is added").toBe("center");
		expect(component.element.style.getPropertyValue("--align-inline"), "the first style concern should keep its inline alignment after another concern is added").toBe("end");
		expect(component.element.style.getPropertyValue("--scale"), "the second style concern should apply its independent property").toBe("1");

		regionStyle.set({
			$alignBlock: "stretch",
			$alignInline: "center",
		});
		scale.set("1.25");
		await flushEffects();

		expect(component.element.style.getPropertyValue("--align-block"), "updates from the first style concern should remain active after another set call").toBe("stretch");
		expect(component.element.style.getPropertyValue("--align-inline"), "custom properties from the first concern should continue to update").toBe("center");
		expect(component.element.style.getPropertyValue("--scale"), "updates from the second style concern should remain active").toBe("1.25");
	});

	it("uses the latest set call for conflicting style properties", async () => {
		const component = mountedComponent("div");
		const firstColor = State<StyleValue | null>(component, "rebeccapurple");
		const secondColor = State<StyleValue | null>(component, "slateblue");

		component.style.set({
			color: firstColor,
			$cardGap: "12px",
		});
		component.style.set({
			color: secondColor,
		});

		expect(component.element.style.getPropertyValue("color"), "the later style concern should win when both concerns control the same property").toBe("slateblue");
		expect(component.element.style.getPropertyValue("--card-gap"), "unrelated properties from the earlier concern should remain applied").toBe("12px");

		firstColor.set("tomato");
		await flushEffects();

		expect(component.element.style.getPropertyValue("color"), "updates from an earlier conflicting concern should not overwrite the later active concern").toBe("slateblue");
		expect(component.element.style.getPropertyValue("--card-gap"), "unrelated earlier properties should still be retained after state updates").toBe("12px");

		secondColor.set("royalblue");
		await flushEffects();

		expect(component.element.style.getPropertyValue("color"), "the winning concern should continue to update the conflicting property").toBe("royalblue");
	});

	it("restores an earlier style concern when a later conflicting definition releases a property", async () => {
		const component = mountedComponent("div");
		const baseColor = State<StyleValue | null>(component, "rebeccapurple");
		const overlayStyle = State<StyleAttributeDefinition | null>(component, {
			borderColor: "black",
			color: "slateblue",
		});

		component.style.set({
			backgroundColor: "white",
			color: baseColor,
		});
		component.style.set(overlayStyle);

		expect(component.element.style.getPropertyValue("background-color"), "unrelated properties from the earlier concern should remain applied").toBe("white");
		expect(component.element.style.getPropertyValue("border-color"), "the later concern should apply its own unrelated property").toBe("black");
		expect(component.element.style.getPropertyValue("color"), "the later concern should initially win the conflicting property").toBe("slateblue");

		baseColor.set("tomato");
		await flushEffects();

		expect(component.element.style.getPropertyValue("color"), "an earlier concern should stay hidden while a later concern controls the same property").toBe("slateblue");

		overlayStyle.set({
			borderColor: "purple",
		});
		await flushEffects();

		expect(component.element.style.getPropertyValue("background-color"), "earlier unrelated properties should stay applied after the later definition changes").toBe("white");
		expect(component.element.style.getPropertyValue("border-color"), "properties still controlled by the later definition should update").toBe("purple");
		expect(component.element.style.getPropertyValue("color"), "the earlier concern should resume when the later definition stops controlling the property").toBe("tomato");

		overlayStyle.set(null);
		await flushEffects();

		expect(component.element.style.getPropertyValue("background-color"), "earlier concern properties should remain after the later definition clears").toBe("white");
		expect(component.element.style.getPropertyValue("border-color"), "properties with no remaining concern should be removed").toBe("");
		expect(component.element.style.getPropertyValue("color"), "the restored earlier concern should remain active after the later definition clears").toBe("tomato");
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

	/** Verifies negative variable shorthand also expands inside fallback expressions in inline style values. */
	it("expands negative variable shorthand in inline style values", () => {
		const component = mountedComponent("div");

		component.style.set({
			$cssVarName: "8px",
			$negativeOffset: "-$cssVarName",
			$resolvedFallback: "${fallback: -$cssVarName}",
			$negatedResolvedFallback: "-${fallback: $cssVarName}",
		});

		expect(component.element.style.getPropertyValue("--css-var-name"), "custom properties should still be written alongside shorthand expansion").toBe("8px");
		expect(component.element.style.getPropertyValue("--negative-offset"), "negative variable shorthand should expand to a calc() expression").toBe("calc(-1 * var(--css-var-name))");
		expect(component.element.style.getPropertyValue("--resolved-fallback"), "negative shorthand inside a fallback expression should expand to a nested calc() inside var()").toBe("var(--fallback, calc(-1 * var(--css-var-name)))");
		expect(component.element.style.getPropertyValue("--negated-resolved-fallback"), "negative shorthand should also wrap braced fallback accesses when the negation appears first").toBe("calc(-1 * var(--fallback, var(--css-var-name)))");
	});

	it("throws when trying to set styles on a disposed component", () => {
		const component = mountedComponent("div");
		const style = component.style;
		component.remove();

		expect(() => {
			style.set({ color: "rebeccapurple" });
		}).toThrow("Modifications are not allowed after owner disposal.");
	});

	it("enforces the public StyleAttributeDefinition typing contract", () => {
		// @ts-expect-error nested selector keys are only valid on stylesheet style definitions
		const invalidNestedSelector: StyleAttributeDefinition = { "{&:hover}": { color: "rebeccapurple" } };
		// @ts-expect-error animation shorthand is not part of inline style manipulator definitions
		const invalidAnimation: StyleAttributeDefinition = { animation: "fade-in 1s ease" };
		// @ts-expect-error animationName is not part of inline style manipulator definitions
		const invalidAnimationName: StyleAttributeDefinition = { animationName: "fade-in" };

		const acceptedCustomProperty: StyleAttributeDefinition = { $cardGap: "12px" };
		const acceptedStateSource = null as unknown as State<StyleValue | null>;
		const acceptedStateValue: StyleAttributeDefinition = {
			color: acceptedStateSource,
		};

		expect(Boolean(invalidNestedSelector) || Boolean(invalidAnimation) || Boolean(invalidAnimationName) || Boolean(acceptedCustomProperty) || Boolean(acceptedStateValue)).toBe(true);
	});
});
