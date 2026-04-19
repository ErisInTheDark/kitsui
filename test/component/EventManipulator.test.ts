import { describe, expect, it } from "vitest";
import { Component } from "../../src/component/Component";
import { EventManipulator } from "../../src/component/EventManipulator";
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

describe("EventManipulator", () => {
	it("memoizes the event manipulator on component getters", () => {
		const component = mountedComponent("button");

		expect(component.event).toBeInstanceOf(EventManipulator);
		expect(component.event).toBe(component.event);
	});

	it("adds owned listeners and augments native events with the host component", () => {
		const component = mountedComponent("button");
		let receivedComponent: Component | undefined;

		component.event.owned.on.click((event) => {
			receivedComponent = event.component;
			event.component.attribute.add("data-clicked");
		});

		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(receivedComponent).toBe(component);
		expect(component.element.hasAttribute("data-clicked")).toBe(true);
	});

	it("removes listeners when their explicit owner is disposed", () => {
		const component = mountedComponent("button");
		const owner = mountedComponent("section");
		let calls = 0;
		const listener = () => {
			calls += 1;
		};

		component.event.on.click(owner, listener);
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);

		owner.remove();
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);
	});

	it("removes listeners through off and owned.off", () => {
		const component = mountedComponent("button");
		let calls = 0;
		const listener = () => {
			calls += 1;
		};

		component.event.owned.on.click(listener);
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);

		component.event.off.click(listener);
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);

		component.event.owned.on.click(listener);
		component.event.owned.off.click(listener);
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);
	});

	it("supports reactive listener sources and listener replacement", async () => {
		const component = mountedComponent("button");
		const listener = State<((event: MouseEvent & { component: Component }) => void) | null>(component, null);
		const calls: string[] = [];

		component.event.owned.on.click(listener);
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toEqual([]);

		listener.set((event) => {
			calls.push(`first:${event.component.element.tagName}`);
		});
		await flushEffects();
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toEqual(["first:BUTTON"]);

		listener.set(null);
		await flushEffects();
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toEqual(["first:BUTTON"]);

		listener.set((event) => {
			calls.push(`second:${event.component.element.tagName}`);
		});
		await flushEffects();
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toEqual(["first:BUTTON", "second:BUTTON"]);

		component.event.off.click(listener);
		listener.set((event) => {
			calls.push(`third:${event.component.element.tagName}`);
		});
		await flushEffects();
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toEqual(["first:BUTTON", "second:BUTTON"]);
	});

	it("removes explicit-owner and reactive listeners when the host component is removed", async () => {
		const component = mountedComponent("button");
		const explicitOwner = mountedComponent("section");
		const sourceOwner = mountedComponent("div");
		const reactive = State<((event: MouseEvent & { component: Component }) => void) | null>(sourceOwner, null);
		const calls: string[] = [];

		component.event.on.click(explicitOwner, () => {
			calls.push("explicit");
		});
		reactive.set((event) => {
			calls.push(`reactive:${event.component.element.tagName}`);
		});
		await flushEffects();
		component.event.owned.on.click(reactive);
		await flushEffects();

		component.remove();
		component.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(calls).toEqual([]);

		explicitOwner.remove();
		sourceOwner.remove();
	});
});