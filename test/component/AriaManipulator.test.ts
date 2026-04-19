import { describe, expect, it } from "vitest";
import { AriaManipulator } from "../../src/component/AriaManipulator";
import { Component } from "../../src/component/Component";
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

describe("AriaManipulator", () => {
	it("memoizes the aria manipulator on component getters", () => {
		const component = mountedComponent("button");

		expect(component.aria).toBeInstanceOf(AriaManipulator);
		expect(component.aria).toBe(component.aria);
	});

	it("aliases role and text-based aria attributes to the attribute manipulator", async () => {
		const component = mountedComponent("button");
		const role = State<"button" | "tab" | null>(component, "button");
		const label = State<string | null>(component, "Save");

		component.aria
			.role(role)
			.aria.label(label)
			.aria.description("Persists the form")
			.aria.expanded(false);

		expect(component.element.getAttribute("role")).toBe("button");
		expect(component.element.getAttribute("aria-label")).toBe("Save");
		expect(component.element.getAttribute("aria-description")).toBe("Persists the form");
		expect(component.element.getAttribute("aria-expanded")).toBe("false");

		role.set("tab");
		label.set(null);
		await flushEffects();

		expect(component.element.getAttribute("role")).toBe("tab");
		expect(component.element.hasAttribute("aria-label")).toBe(false);
	});

	it("converts component and element references into idref attributes", () => {
		const component = mountedComponent("button");
		const label = mountedComponent("span");
		const description = document.createElement("p");
		document.body.append(description);

		component.aria.labelledBy([label, description]).aria.describedBy(description);

		expect(label.element.id).toMatch(/^kitsui-aria-ref-/);
		expect(description.id).toMatch(/^kitsui-aria-ref-/);
		expect(component.element.getAttribute("aria-labelledby")).toBe(`${label.element.id} ${description.id}`);
		expect(component.element.getAttribute("aria-describedby")).toBe(description.id);
	});

	it("updates idref attributes from stateful reference selections", async () => {
		const component = mountedComponent("button");
		const primary = mountedComponent("span");
		const secondary = mountedComponent("span");
		const references = State<typeof primary | Array<typeof primary | typeof secondary | null> | null>(component, primary);

		component.aria.controls(references);
		expect(component.element.getAttribute("aria-controls")).toBe(primary.element.id);

		references.set([secondary, null, primary]);
		await flushEffects();

		expect(component.element.getAttribute("aria-controls")).toBe(`${secondary.element.id} ${primary.element.id}`);

		references.set(null);
		await flushEffects();

		expect(component.element.hasAttribute("aria-controls")).toBe(false);
	});
});