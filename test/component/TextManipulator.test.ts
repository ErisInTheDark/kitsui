import { describe, expect, it } from "vitest";
import { Component } from "../../src/component/Component";
import placeExtension from "../../src/component/extensions/placeExtension";
import { TextManipulator } from "../../src/component/TextManipulator";
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

describe("TextManipulator", () => {
	it("memoizes the text manipulator on component getters", () => {
		const component = mountedComponent();

		expect(component.text).toBeInstanceOf(TextManipulator);
		expect(component.text).toBe(component.text);
	});

	it("sets direct text values and clears nullish selections", () => {
		const component = mountedComponent();

		component.text.set("alpha");
		expect(component.element.textContent).toBe("alpha");

		component.text.set(0);
		expect(component.element.textContent).toBe("0");

		component.text.set(false);
		expect(component.element.textContent).toBe("false");

		component.text.set(null);
		expect(component.element.textContent).toBe("");
	});

	it("updates text from reactive sources", async () => {
		const component = mountedComponent();
		const value = State<string | null>(component, "alpha");

		component.text.set(value);
		expect(component.element.textContent).toBe("alpha");

		value.set("beta");
		await flushEffects();
		expect(component.element.textContent).toBe("beta");

		value.set(null);
		await flushEffects();
		expect(component.element.textContent).toBe("");
	});

	it("binds text visibility to a boolean state", async () => {
		const component = mountedComponent();
		const visible = State(component, false);
		const value = State<string | null>(component, "alpha");
		component.text.bind(visible, value);

		expect(component.element.textContent).toBe("");

		visible.set(true);
		await flushEffects();
		expect(component.element.textContent).toBe("alpha");

		value.set("beta");
		await flushEffects();
		expect(component.element.textContent).toBe("beta");

		visible.set(false);
		await flushEffects();
		expect(component.element.textContent).toBe("");

		value.set("gamma");
		await flushEffects();
		expect(component.element.textContent).toBe("");

		visible.set(true);
		await flushEffects();
		expect(component.element.textContent).toBe("gamma");

		component.text.set(null);
		expect(component.element.textContent).toBe("");
	});

	it("binds visibility with direct text values", async () => {
		const component = mountedComponent();
		const visible = State(component, false);
		component.text.bind(visible, "static text");

		expect(component.element.textContent).toBe("");

		visible.set(true);
		await flushEffects();
		expect(component.element.textContent).toBe("static text");

		visible.set(false);
		await flushEffects();
		expect(component.element.textContent).toBe("");

		component.text.set(null);
	});

	it("disposes managed children when setting text content", () => {
		const host = mountedComponent();
		const child = Component("span");

		host.append(child);
		host.text.set("done");

		expect(child.disposed).toBe(true);
		expect(host.element.textContent).toBe("done");
	});
});