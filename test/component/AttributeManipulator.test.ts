import { describe, expect, it, vi } from "vitest";
import { AttributeManipulator } from "../../src/component/AttributeManipulator";
import { Component } from "../../src/component/Component";
import { State } from "../../src/state/State";

function mountedComponent (tagName: string = "div"): Component {
	return Component(tagName).mount(document.body);
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

describe("AttributeManipulator", () => {
	it("memoizes the attribute manipulator on component getters", () => {
		const component = mountedComponent("button");

		expect(component.attribute).toBeInstanceOf(AttributeManipulator);
		expect(component.attribute).toBe(component.attribute);
	});

	it("adds and removes valueless attributes", () => {
		const component = mountedComponent("button");

		component.attribute.add("disabled", "hidden");

		expect(component.element.hasAttribute("disabled")).toBe(true);
		expect(component.element.getAttribute("disabled")).toBe("");
		expect(component.element.hasAttribute("hidden")).toBe(true);

		component.attribute.remove("hidden", "disabled");

		expect(component.element.hasAttribute("disabled")).toBe(false);
		expect(component.element.hasAttribute("hidden")).toBe(false);
	});

	it("ignores falsy names and supports iterable name selections", () => {
		const component = mountedComponent("div");

		component.attribute.add(false, null, undefined, 0, 0n, "", ["role", null, "tabindex"]);

		expect(component.element.hasAttribute("role")).toBe(true);
		expect(component.element.hasAttribute("tabindex")).toBe(true);
	});

	it("sets a single attribute from a direct name and value", () => {
		const component = mountedComponent("button");

		component.attribute.set("type", "button");

		expect(component.element.getAttribute("type")).toBe("button");
	});

	it("sets multiple attributes from entry objects", () => {
		const component = mountedComponent("button");

		component.attribute.set(
			{ name: "type", value: "button" },
			{ name: "aria-label", value: "Save" },
		);

		expect(component.element.getAttribute("type")).toBe("button");
		expect(component.element.getAttribute("aria-label")).toBe("Save");
	});

	it("updates attributes when the name state changes", async () => {
		const component = mountedComponent("div");
		const attributeName = State<string | null>(component, "aria-label");

		component.attribute.set({ name: attributeName, value: "Ready" });
		expect(component.element.getAttribute("aria-label")).toBe("Ready");

		attributeName.set("title");
		await flushEffects();

		expect(component.element.hasAttribute("aria-label")).toBe(false);
		expect(component.element.getAttribute("title")).toBe("Ready");
	});

	it("updates attributes when the value state changes and removes them on null", async () => {
		const component = mountedComponent("div");
		const value = State<string | null>(component, "alpha");

		component.attribute.set({ name: "data-mode", value });
		expect(component.element.getAttribute("data-mode")).toBe("alpha");

		value.set("beta");
		await flushEffects();
		expect(component.element.getAttribute("data-mode")).toBe("beta");

		value.set(null);
		await flushEffects();
		expect(component.element.hasAttribute("data-mode")).toBe(false);
	});

	it("adds attributes from a state-driven name selection", async () => {
		const component = mountedComponent("button");
		const names = State<string | Array<string | null> | null>(component, null);

		component.attribute.add(names);
		expect(component.element.attributes).toHaveLength(0);

		names.set(["disabled", null, "hidden"]);
		await flushEffects();
		expect(component.element.hasAttribute("disabled")).toBe(true);
		expect(component.element.hasAttribute("hidden")).toBe(true);

		names.set("title");
		await flushEffects();
		expect(component.element.hasAttribute("disabled")).toBe(false);
		expect(component.element.hasAttribute("hidden")).toBe(false);
		expect(component.element.hasAttribute("title")).toBe(true);
	});

	it("removes attributes from a state-driven name selection", async () => {
		const component = mountedComponent("button");
		const names = State<string | Array<string | null> | null>(component, "disabled");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		component.attribute.add("disabled", "hidden");
		component.attribute.remove(names);

		expect(component.element.hasAttribute("disabled")).toBe(false);
		expect(component.element.hasAttribute("hidden")).toBe(true);

		names.set(["hidden", null]);
		await flushEffects();
		expect(component.element.hasAttribute("hidden")).toBe(false);
		expect(errorSpy).toHaveBeenCalledTimes(2);

		errorSpy.mockRestore();
	});

	it("binds valueless attributes to a boolean state", async () => {
		const component = mountedComponent("button");
		const visible = State(component, false);
		const cleanup = component.attribute.bind(visible, "disabled", "hidden");

		expect(component.element.hasAttribute("disabled")).toBe(false);

		visible.set(true);
		await flushEffects();
		expect(component.element.hasAttribute("disabled")).toBe(true);
		expect(component.element.hasAttribute("hidden")).toBe(true);

		cleanup();
		expect(component.element.hasAttribute("disabled")).toBe(false);
		expect(component.element.hasAttribute("hidden")).toBe(false);
	});

	it("binds valued attributes with dynamic values to a boolean state", async () => {
		const component = mountedComponent("button");
		const enabled = State(component, false);
		const label = State<string | null>(component, "Save");

		const cleanup = component.attribute.bind(enabled, { name: "aria-label", value: label });

		expect(component.element.hasAttribute("aria-label")).toBe(false);

		enabled.set(true);
		await flushEffects();
		expect(component.element.getAttribute("aria-label")).toBe("Save");

		label.set("Submit");
		await flushEffects();
		expect(component.element.getAttribute("aria-label")).toBe("Submit");

		enabled.set(false);
		await flushEffects();
		expect(component.element.hasAttribute("aria-label")).toBe(false);

		cleanup();
	});

	it("binds valued attributes with dynamic names", async () => {
		const component = mountedComponent("button");
		const enabled = State(component, true);
		const names = State<string | Array<string | null> | null>(component, "aria-label");

		component.attribute.bind(enabled, { name: names, value: "Save" });
		expect(component.element.getAttribute("aria-label")).toBe("Save");

		names.set(["title", null]);
		await flushEffects();
		expect(component.element.hasAttribute("aria-label")).toBe(false);
		expect(component.element.getAttribute("title")).toBe("Save");
	});

	it("logs an error when a state-driven attribute source replaces an existing determiner", () => {
		const component = mountedComponent("button");
		const names = State<string | null>(component, "disabled");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		component.attribute.add("disabled");
		component.attribute.add(names);

		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(component.element.hasAttribute("disabled")).toBe(true);

		errorSpy.mockRestore();
	});

	it("logs an error when a state-driven value source replaces an existing determiner", async () => {
		const component = mountedComponent("button");
		const value = State<string | null>(component, "first");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		component.attribute.set("aria-label", "static");
		component.attribute.set({ name: "aria-label", value });

		value.set("second");
		await flushEffects();
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(component.element.getAttribute("aria-label")).toBe("second");

		errorSpy.mockRestore();
	});

	it("stops responding to attribute states once the component is removed", () => {
		const component = mountedComponent("button");
		const value = State<string | null>(component, "Save");

		component.attribute.set({ name: "aria-label", value });
		component.remove();

		expect(() => {
			value.set("Submit");
		}).toThrow("Disposed states cannot be modified.");
		expect(component.element.getAttribute("aria-label")).toBeNull();
	});
});
