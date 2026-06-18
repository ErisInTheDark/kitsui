import { describe, expect, it, vi } from "vitest";
import { Component, type ComponentBuilderFunction } from "../../src/component/Component";
import compositionExtension from "../../src/component/extensions/compositionExtension";
import placeExtension from "../../src/component/extensions/placeExtension";
import { State } from "../../src/state/State";

compositionExtension();
placeExtension();

type ButtonComponent = Component<HTMLButtonElement> & {
	press (): void;
};

function Button (this: Component | void, label: string): ButtonComponent {
	const component = Component(this ?? "button", Button);

	component.text.set(label);

	return Object.assign(component, {
		press (): void {
			component.element.toggleAttribute("data-pressed");
		},
	}) as ButtonComponent;
}

type ToggleComponent = Component & {
	toggle (): void;
};

function Toggle (this: Component | void): ToggleComponent {
	const component = Component(this ?? "span", Toggle);

	return Object.assign(component, {
		toggle (): void {
			component.element.toggleAttribute("data-active");
		},
	}) as ToggleComponent;
}

describe("compositionExtension", () => {
	it("marks standalone builders through Component(source, builder)", () => {
		const button = Button("Save");

		try {
			expect(button.is(Button)).toBe(true);
			expect(button.as(Button)).toBe(button);
			expect(button.element.tagName).toBe("BUTTON");
			expect(button.element.textContent).toBe("Save");
		} finally {
			button.remove();
		}
	});

	it("composes the current component with builder params through and", () => {
		const host = Component("button");
		const composed = host.and(Button, "Save");

		try {
			expect(composed).toBe(host);
			expect(composed.is(Button)).toBe(true);
			expect(composed.as(Button)).toBe(composed);
			expect(composed.element.textContent).toBe("Save");
		} finally {
			composed.remove();
		}
	});

	it("chains composed builders and preserves their APIs", () => {
		const composed = Component("button")
			.and(Button, "Save")
			.and(Toggle);

		try {
			composed.press();
			composed.toggle();

			expect(composed.element.hasAttribute("data-pressed")).toBe(true);
			expect(composed.element.hasAttribute("data-active")).toBe(true);
			expect(composed.is(Button)).toBe(true);
			expect(composed.is(Toggle)).toBe(true);
		} finally {
			composed.remove();
		}
	});

	it("types use callbacks as the current composed component", () => {
		const setup = Component("button")
			.and(Button, "Save")
			.use((target) => {
				target.press();
			});
		const render = Component("button")
			.and(Button, "Send");
		const active = State(render, true);

		try {
			render.use(active, (value, target) => {
				if (value) {
					target.press();
				}
			});

			expect(setup.element.hasAttribute("data-pressed")).toBe(true);
			expect(render.element.hasAttribute("data-pressed")).toBe(true);
		} finally {
			setup.remove();
			render.remove();
		}
	});

	it("skips duplicate builder applications", () => {
		const builder = vi.fn(function Counted (this: Component | void, label: string) {
			const component = Component(this ?? "button", builder);

			component.text.set(label);
			return component as Component<HTMLButtonElement>;
		}) as unknown as ComponentBuilderFunction<[string], Component<HTMLButtonElement>>;
		const component = Component("button")
			.and(builder, "first")
			.and(builder, "second");

		try {
			expect(builder).toHaveBeenCalledTimes(1);
			expect(component.element.textContent).toBe("first");
		} finally {
			component.remove();
		}
	});

	it("does not mark standalone builders unless they pass their identity to Component", () => {
		function Unmarked (this: Component | void): Component {
			return this ?? Component("div");
		}

		const component = Unmarked();

		try {
			expect(component.is(Unmarked)).toBe(false);
		} finally {
			component.remove();
		}
	});

	it("rejects non-function builders", () => {
		const component = Component("div");

		expect(() => {
			component.and(null as unknown as ComponentBuilderFunction);
		}).toThrow("Component.and requires a builder function.");

		component.remove();
	});

	it("rejects builders that do not return components", () => {
		const component = Component("div");

		expect(() => {
			component.and((function Invalid () {
				return undefined as unknown as Component;
			}) as ComponentBuilderFunction);
		}).toThrow("Component builders must return a Component.");

		component.remove();
	});

	it("rejects builders that replace the composed component", () => {
		const component = Component("div");
		const replacement = Component("span");

		try {
			expect(() => {
				component.and(function Replacement () {
					return replacement;
				});
			}).toThrow("Component.and builders must return the component they were called on.");
		} finally {
			component.remove();
			replacement.remove();
		}
	});

	it("rejects composition after disposal", () => {
		const component = Component("div");

		component.remove();

		expect(() => {
			component.and(Toggle);
		}).toThrow("Disposed components cannot be modified.");
	});
});
