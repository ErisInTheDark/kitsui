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

const hostAfterParameterizedSetup = host.use((component, label, count) => {
	component.text.set(`${label}:${count.toFixed(0)}`);
}, "ready", 2);

const hostAfterBreakdown = host.breakdown(state, (component, Part, value) => {
	component.attribute.set("data-count", value.toFixed(0));
	component.append(Part("count", value, partState => Component("span").text.set(partState)));
});

void hostAfterParameterizedSetup;
void hostAfterBreakdown;

interface ButtonExtensions {
	press (): this;
}

interface ButtonComponent extends Component, ButtonExtensions { }

const Button: ComponentBuilderFunction<[string], ButtonComponent> = function Button (this: Component | void, label: string): ButtonComponent {
	const component = Component(this ?? "button", Button);

	component.text.set(label);

	return component.extend<ButtonExtensions>(root => ({
		press () {
			root.element.click();
			return root;
		},
	}));
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

const directButton = Component("button").extend<ButtonExtensions>(root => ({
	press () {
		root.element.click();
		return root;
	},
}));

directButton.press().attribute.set("type", "button");
