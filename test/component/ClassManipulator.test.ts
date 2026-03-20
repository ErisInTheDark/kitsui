import { describe, expect, it, vi } from "vitest";
import { ClassManipulator } from "../../src/component/ClassManipulator";
import { Component } from "../../src/component/Component";
import { Style } from "../../src/component/Style";
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

describe("ClassManipulator", () => {
	it("adds and removes style classes", () => {
		const component = mountedComponent("div");
		const card = Style("class-manipulator-card", { color: "red" });

		expect(component.class).toBeInstanceOf(ClassManipulator);

		component.class.add(card);
		expect(component.element.classList.contains(card.className)).toBe(true);

		component.class.remove(card);
		expect(component.element.classList.contains(card.className)).toBe(false);
	});

	it("ignores all falsy static inputs", () => {
		const component = mountedComponent("div");
		const card = Style("class-manipulator-falsy-card", { color: "red" });

		component.class.add(false, null, undefined, 0, 0n, "", card);
		expect(component.element.classList.contains(card.className)).toBe(true);

		component.class.remove(false, null, undefined, 0, 0n, "", card);
		expect(component.element.classList.contains(card.className)).toBe(false);
	});

	it("binds classes to boolean state", async () => {
		const component = mountedComponent("div");
		const active = Style("class-manipulator-active", { color: "green" });
		const state = State(component, false);
		const cleanup = component.class.bind(state, active);

		expect(component.element.classList.contains(active.className)).toBe(false);

		state.set(true);
		await flushEffects();
		expect(component.element.classList.contains(active.className)).toBe(true);

		cleanup();
		expect(component.element.classList.contains(active.className)).toBe(false);
	});

	it("adds styles from a style-selection state", async () => {
		const component = mountedComponent("div");
		const primary = Style("class-manipulator-state-add-primary", { color: "red" });
		const secondary = Style("class-manipulator-state-add-secondary", { color: "blue" });
		const selection = State<Style | Array<Style | null> | null>(component, null);

		component.class.add(selection);
		expect(component.element.className).toBe("");

		selection.set(primary);
		await flushEffects();
		expect(component.element.classList.contains(primary.className)).toBe(true);

		selection.set([secondary, null, primary]);
		await flushEffects();
		expect(component.element.classList.contains(primary.className)).toBe(true);
		expect(component.element.classList.contains(secondary.className)).toBe(true);

		selection.set(null);
		await flushEffects();
		expect(component.element.className).toBe("");
	});

	it("removes styles from a style-selection state", async () => {
		const component = mountedComponent("div");
		const primary = Style("class-manipulator-state-remove-primary", { color: "red" });
		const secondary = Style("class-manipulator-state-remove-secondary", { color: "blue" });
		const selection = State<Style | Array<Style | null> | null>(component, primary);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		component.class.add(primary, secondary);
		component.class.remove(selection);

		expect(component.element.classList.contains(primary.className)).toBe(false);
		expect(component.element.classList.contains(secondary.className)).toBe(true);

		selection.set([secondary, null]);
		await flushEffects();
		expect(component.element.classList.contains(primary.className)).toBe(false);
		expect(component.element.classList.contains(secondary.className)).toBe(false);
		expect(errorSpy).toHaveBeenCalledTimes(2);

		errorSpy.mockRestore();
	});

	it("binds boolean presence for styles from a style-selection state", async () => {
		const component = mountedComponent("div");
		const primary = Style("class-manipulator-state-bind-primary", { color: "red" });
		const secondary = Style("class-manipulator-state-bind-secondary", { color: "blue" });
		const visible = State(component, false);
		const selection = State<Style | Array<Style | null> | null>(component, primary);
		const cleanup = component.class.bind(visible, selection, false, null);

		expect(component.element.className).toBe("");

		visible.set(true);
		await flushEffects();
		expect(component.element.classList.contains(primary.className)).toBe(true);

		selection.set([secondary, null]);
		await flushEffects();
		expect(component.element.classList.contains(primary.className)).toBe(false);
		expect(component.element.classList.contains(secondary.className)).toBe(true);

		visible.set(false);
		await flushEffects();
		expect(component.element.className).toBe("");

		cleanup();
	});

	it("replaces a binding when add is called for the same style", async () => {
		const component = mountedComponent("div");
		const style = Style("class-manipulator-bind-then-add", { color: "purple" });
		const state = State(component, false);

		component.class.bind(state, style);
		state.set(true);
		await flushEffects();
		expect(component.element.classList.contains(style.className)).toBe(true);

		component.class.add(style);
		state.set(false);
		await flushEffects();

		expect(component.element.classList.contains(style.className)).toBe(true);
	});

	it("replaces a binding when remove is called for the same style", async () => {
		const component = mountedComponent("div");
		const style = Style("class-manipulator-bind-then-remove", { color: "orange" });
		const state = State(component, true);

		component.class.bind(state, style);
		expect(component.element.classList.contains(style.className)).toBe(true);

		component.class.remove(style);
		state.set(true);
		await flushEffects();

		expect(component.element.classList.contains(style.className)).toBe(false);
	});

	it("replaces a static add when a binding is applied for the same style", async () => {
		const component = mountedComponent("div");
		const style = Style("class-manipulator-add-then-bind", { color: "brown" });
		const state = State(component, false);

		component.class.add(style);
		expect(component.element.classList.contains(style.className)).toBe(true);

		component.class.bind(state, style);
		expect(component.element.classList.contains(style.className)).toBe(false);

		state.set(true);
		await flushEffects();
		expect(component.element.classList.contains(style.className)).toBe(true);
	});

	it("adds classes from another owner until that owner is disposed", () => {
		const component = mountedComponent("div");
		const owner = mountedComponent("section");
		const elevated = Style("class-manipulator-elevated", { boxShadow: "0 0 1px black" });

		component.class.addFrom(owner, elevated);
		expect(component.element.classList.contains(elevated.className)).toBe(true);

		owner.remove();
		expect(component.element.classList.contains(elevated.className)).toBe(false);
	});

	it("adds styles from a style-selection state until the external owner is disposed", async () => {
		const component = mountedComponent("div");
		const owner = mountedComponent("section");
		const primary = Style("class-manipulator-state-add-from-primary", { color: "red" });
		const secondary = Style("class-manipulator-state-add-from-secondary", { color: "blue" });
		const selection = State<Style | Array<Style | null> | null>(component, primary);

		component.class.addFrom(owner, selection);
		expect(component.element.classList.contains(primary.className)).toBe(true);

		selection.set([secondary, null]);
		await flushEffects();
		expect(component.element.classList.contains(primary.className)).toBe(false);
		expect(component.element.classList.contains(secondary.className)).toBe(true);

		owner.remove();
		expect(component.element.className).toBe("");
	});

	it("replaces addFrom ownership when add is called for the same style", () => {
		const component = mountedComponent("div");
		const owner = mountedComponent("section");
		const style = Style("class-manipulator-add-from-then-add", { position: "sticky" });

		component.class.addFrom(owner, style);
		component.class.add(style);
		owner.remove();

		expect(component.element.classList.contains(style.className)).toBe(true);
	});

	it("logs an error and replaces an existing determiner when a style-selection state takes control", async () => {
		const component = mountedComponent("div");
		const style = Style("class-manipulator-state-replaces-bind", { color: "red" });
		const visible = State(component, true);
		const selection = State<Style | null>(component, style);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		component.class.bind(visible, style);
		component.class.add(selection);

		visible.set(false);
		await flushEffects();

		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(component.element.classList.contains(style.className)).toBe(true);

		errorSpy.mockRestore();
	});

	it("lets a style-selection state replace bind ownership for the same style", async () => {
		const component = mountedComponent("div");
		const primary = Style("class-manipulator-state-owns-primary", { color: "red" });
		const secondary = Style("class-manipulator-state-owns-secondary", { color: "blue" });
		const visible = State(component, true);
		const selection = State<Style | null>(component, primary);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		component.class.bind(visible, primary);
		component.class.add(selection);

		visible.set(false);
		selection.set(secondary);
		await flushEffects();

		expect(component.element.classList.contains(primary.className)).toBe(false);
		expect(component.element.classList.contains(secondary.className)).toBe(true);

		errorSpy.mockRestore();
	});
});