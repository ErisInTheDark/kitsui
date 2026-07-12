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

interface WidgetCommitEvent extends CustomEvent<{
	readonly value: string;
}> {
	readonly source: "user" | "api";
}

interface WidgetEvents {
	WidgetCommit: WidgetCommitEvent;
	WidgetRefresh: CustomEvent<void>;
}

interface WidgetComponent extends Component.WithEvents<WidgetEvents> {}

function mountedWidget (): WidgetComponent {
	return mountedComponent("button") as unknown as WidgetComponent;
}

describe("EventManipulator", () => {
	it("memoizes the event manipulator on component getters", () => {
		const component = mountedComponent("button");

		expect(component.event).toBeInstanceOf(EventManipulator);
		expect(component.event).toBe(component.event);
	});

	it("emits typed custom events through identical emit and dispatch proxies", () => {
		const parent = mountedComponent("section");
		const component = Component("button").appendTo(parent) as unknown as WidgetComponent;
		const received: WidgetCommitEvent[] = [];
		const phases: string[] = [];
		let bubbledValue: string | undefined;

		parent.element.addEventListener("WidgetCommit", (event) => {
			bubbledValue = (event as WidgetCommitEvent).detail.value;
		});
		component.event.owned.on.WidgetCommit((event) => {
			phases.push(`listener:${event.source}`);
			received.push(event);
			if (event.detail.value === "first") {
				event.preventDefault();
			}
		});

		expect(component.event.emit).toBe(component.event.dispatch);
		expect(component.event.emit.WidgetCommit({ value: "first" }, {
			cancelable: true,
			composed: true,
			tweak: (event) => {
				phases.push("tweak:api");
				Object.defineProperty(event, "source", { value: "api" });
			},
		})).toBe(false);

		expect(received).toHaveLength(1);
		expect(received[0]?.detail).toEqual({ value: "first" });
		expect(received[0]?.bubbles).toBe(false);
		expect(received[0]?.cancelable).toBe(true);
		expect(received[0]?.composed).toBe(true);
		expect(bubbledValue).toBeUndefined();
		expect(phases).toEqual(["tweak:api", "listener:api"]);

		expect(component.event.dispatch.WidgetCommit({ value: "second" }, {
			bubbles: true,
			tweak: (event) => {
				Object.defineProperty(event, "source", { value: "user" });
			},
		})).toBe(true);
		expect(received).toHaveLength(2);
		expect(bubbledValue).toBe("second");
	});

	it("supports detail-free custom events", () => {
		const component = mountedWidget();
		let calls = 0;

		component.event.owned.on.WidgetRefresh(() => {
			calls += 1;
		});
		component.event.emit.WidgetRefresh();

		expect(calls).toBe(1);
	});

	it("emits final custom events synchronously while disposing", () => {
		const component = mountedWidget();
		const lifecycle: Array<readonly [boolean, boolean]> = [];
		let receivedValue: string | undefined;
		let listenerError: unknown;

		component.event.owned.on.WidgetCommit((event) => {
			receivedValue = event.detail.value;
		});
		component.event.owned.on.Dispose(() => {
			lifecycle.push([component.disposed, component.disposing]);
			component.event.emit.WidgetCommit({ value: "final" }, {
				tweak: event => Object.defineProperty(event, "source", { value: "api" }),
			});

			try {
				component.event.owned.on.WidgetRefresh(() => undefined);
			}
			catch (error) {
				listenerError = error;
			}
		});

		component.remove();

		expect(lifecycle).toEqual([[true, true]]);
		expect(receivedValue).toBe("final");
		expect(listenerError).toEqual(new Error("Disposed owners cannot be modified."));
		expect(component.disposing).toBe(false);
	});

	it("rejects emission after disposal finishes before tweaking the event", () => {
		const component = mountedWidget();
		const event = component.event;
		let tweaked = false;

		component.remove();

		expect(() => event.emit.WidgetCommit({ value: "late" }, {
			tweak: () => {
				tweaked = true;
			},
		})).toThrow("Disposed owners cannot be modified.");
		expect(tweaked).toBe(false);
	});

	it("exposes custom event names and detail shapes at the type boundary", () => {
		const component = mountedWidget();

		if (false) {
			component.event.emit.WidgetCommit({ value: "valid" }, {
				tweak: event => event.source,
			});
			// @ts-expect-error WidgetCommit requires a string value.
			component.event.emit.WidgetCommit({ value: 1 });
			// @ts-expect-error Native DOM events are not custom event authoring methods.
			component.event.emit.click();
		}

		expect(component).toBeInstanceOf(Component);
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
