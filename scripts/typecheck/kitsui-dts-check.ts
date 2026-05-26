import type { CleanupFunction, ComponentBuilderFunction, ComponentChild, StyleValue } from "kitsui";
import { Component, State, Style } from "kitsui";

const host = Component("div");
const state = State(host, 0);
const publicTypes: {
	child: ComponentChild;
	cleanup: CleanupFunction;
	style: StyleValue;
} = {
	child: host,
	cleanup: () => undefined,
	style: "red",
};

void state;
void Style;
void publicTypes;

type ButtonComponent = Component<HTMLButtonElement> & {
	press (): void;
};

const Button: ComponentBuilderFunction<[string], ButtonComponent> = function Button (this: Component | void, label: string): ButtonComponent {
	const component = this
		? Component(this, Button)
		: Component("button", Button);

	component.text.set(label);

	return Object.assign(component, {
		press (): void {
			component.element.click();
		},
	}) as ButtonComponent;
};

const standaloneButton = Button("Save");
const composedButton = Component("button").and(Button, "Save");
const maybeButton = Component("div").as(Button);

standaloneButton.press();
composedButton.press();

if (composedButton.is(Button)) {
	composedButton.press();
}

maybeButton?.press();
