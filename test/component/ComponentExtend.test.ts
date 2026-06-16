import { describe, expect, it } from "vitest";
import { Component, type ComponentExtensionFactory } from "../../src/component/Component";

interface BadgeExtensions {
	readonly label: string;
	root (): Badge;
	setLabel (label: string): this;
}

interface Badge extends Component<HTMLDivElement>, BadgeExtensions { }

interface CounterExtensions {
	increment (): this;
	value (): number;
}

interface ActiveExtensions {
	activate (): this;
	activateAgain (): this;
}

describe("Component.extend", () => {
	it("assigns instance extensions and returns the same narrowed component", () => {
		const component = Component("div");
		const badge: Badge = component.extend<BadgeExtensions>(root => ({
			label: "ready",
			root (): Badge {
				return root;
			},
			setLabel (label: string): Badge {
				root.text.set(label);
				return root;
			},
		}));

		try {
			expect(badge).toBe(component);
			expect(badge.label).toBe("ready");
			expect(badge.root()).toBe(badge);
			expect(badge.setLabel("Saved")).toBe(badge);
			expect(badge.element.textContent).toBe("Saved");
		} finally {
			badge.remove();
		}
	});

	it("passes the final component type into the extension factory", () => {
		const component = Component("div");
		let receivedRoot: (Component & CounterExtensions) | null = null;
		const counter = component.extend<CounterExtensions>(root => {
			let count = 0;
			receivedRoot = root;

			return {
				increment (): Component & CounterExtensions {
					count += 1;
					return root;
				},
				value (): number {
					return count;
				},
			};
		});

		try {
			expect(receivedRoot).toBe(component);
			expect(counter.increment().increment().value()).toBe(2);
		} finally {
			counter.remove();
		}
	});

	it("contextually types method this as the extended component", () => {
		const component = Component("button");
		const active = component.extend<ActiveExtensions>(() => ({
			activate () {
				this.attribute.set("data-active", "true");
				return this;
			},
			activateAgain () {
				return this.activate();
			},
		}));

		try {
			expect(active.activateAgain()).toBe(active);
			expect(active.element.getAttribute("data-active")).toBe("true");
		} finally {
			active.remove();
		}
	});

	it("preserves component manipulator chaining after extension", () => {
		const component = Component("button")
			.extend<ActiveExtensions>(root => ({
				activate (): Component<HTMLButtonElement> & ActiveExtensions {
					root.attribute.set("data-active", "true");
					return root;
				},
				activateAgain (): Component<HTMLButtonElement> & ActiveExtensions {
					return root.activate();
				},
			}))
			.attribute.set("type", "button")
			.activate();

		try {
			expect(component.element.getAttribute("type")).toBe("button");
			expect(component.element.getAttribute("data-active")).toBe("true");
		} finally {
			component.remove();
		}
	});

	it("rejects non-function extension factories", () => {
		const component = Component("div");

		try {
			expect(() => {
				component.extend(null as unknown as ComponentExtensionFactory<Component, object>);
			}).toThrow("Component.extend requires an extension factory function.");
		} finally {
			component.remove();
		}
	});

	it("rejects extension factories that do not return objects", () => {
		const component = Component("div");

		try {
			expect(() => {
				component.extend(() => undefined as unknown as object);
			}).toThrow("Component.extend extension factories must return an object.");
		} finally {
			component.remove();
		}
	});

	it("rejects extension after disposal", () => {
		const component = Component("div");

		component.remove();

		expect(() => {
			component.extend(() => ({}));
		}).toThrow("Disposed components cannot be modified.");
	});
});
