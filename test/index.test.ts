import { describe, expect, it } from "vitest";
import * as kitsui from "../src/index";

describe("kitsui entrypoint", () => {
	it("re-exports the core building blocks", () => {
		expect(kitsui).toHaveProperty("AttributeManipulator");
		expect(kitsui).toHaveProperty("Component");
		expect(kitsui).toHaveProperty("ClassManipulator");
		expect(kitsui).toHaveProperty("EventManipulator");
		expect(kitsui).toHaveProperty("GenericClaimManipulator");
		expect(kitsui).toHaveProperty("GenericPropertyManipulator");
		expect(kitsui).toHaveProperty("OwnerManipulator");
		expect(kitsui).toHaveProperty("State");
		expect(kitsui).toHaveProperty("StyleManipulator");
		expect(kitsui).toHaveProperty("Style");
		expect(kitsui).toHaveProperty("whenDisabled");
		expect(kitsui).toHaveProperty("whenStuck");
		expect(kitsui).toHaveProperty("TextManipulator");
	});

	it("initializes the registered component and state extensions", () => {
		const component = kitsui.Component("div").appendTo(document.body);
		const state = kitsui.State<string | null>(component, null);

		expect(typeof component.place).toBe("function");
		expect(typeof component.appendTo).toBe("function");
		expect(component.event).toBe(component.event);
		expect(component.text).toBe(component.text);
		expect(typeof state.map).toBe("function");
		expect(state.truthy).toBeInstanceOf(kitsui.State);
	});
});