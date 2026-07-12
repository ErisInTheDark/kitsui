import type {
	CleanupFunction,
	ComponentBuilderFunction,
	ComponentChild,
	SortableExtensions,
	SortableOptions,
	SortableTransfer,
	QueryExpression,
	StyleValue,
} from "kitsui";
import { Component, Draggable, DropTarget, Sortable, State, Style, mediaQuery } from "kitsui";

const host = Component("div");
const state = State(host, 0);
const mapped = state.map(value => value + 1);
const staticReadonly = State.Readonly({ count: 1 });
const readonlySource: State.Readonly<number> = state;
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
mapped.value.toFixed();
mapped.recompute();
mapped.subscribe(host, value => value.toFixed());
// @ts-expect-error mapped state should not expose public set
mapped.set(2);
// @ts-expect-error mapped state should not expose public update
mapped.update(value => value + 1);
state.truthy.recompute();
state.falsy.recompute();
state.or(() => 1).recompute();
state.equals(0).recompute();
state.notEquals(0).recompute();
staticReadonly.value.count.toFixed();
staticReadonly.subscribe(host, value => value.count.toFixed());
// @ts-expect-error static readonly state should not expose recompute
staticReadonly.recompute();
// @ts-expect-error static readonly state should not expose public set
staticReadonly.set({ count: 2 });
// @ts-expect-error static readonly state should not expose public update
staticReadonly.update(value => ({ count: value.count + 1 }));
if (readonlySource instanceof State) {
	readonlySource.value.toFixed();
	readonlySource satisfies State.Readonly<number>;
	// @ts-expect-error instanceof State should narrow to readonly before mutable checks.
	readonlySource.set(1);

	if (readonlySource.isMutable()) {
		readonlySource.set(1);
		readonlySource.update(value => value + 1);
	}
}
void Style;
void publicTypes;

const mediaExpression: QueryExpression = "(width <= 60rem)";
mediaQuery(mediaExpression, { display: "block" });
// @ts-expect-error media query expressions must be enclosed in parentheses.
mediaQuery("width <= 60rem", { display: "none" });

// @ts-expect-error a container must select at least one capability before it can be named.
Style.Container.name("missing-capability");

const sizeContainer = Style.Container.inlineSize.name("size-container");
Style.Class("size-container-class", { ...sizeContainer });
sizeContainer.query("(inline-size > 30rem)", { display: "grid" });
// @ts-expect-error style queries require the style capability.
sizeContainer.style("(--density: compact)", { gap: "4px" });
// @ts-expect-error scroll-state queries require the scrollState capability.
sizeContainer.stuck("top", { top: 0 });

const styleContainer = Style.Container.style.name("style-container");
styleContainer.style("(--density: compact)", { gap: "4px" });
styleContainer.styleProperty("$density", "compact", { gap: "4px" });
// @ts-expect-error size queries require the size capability.
styleContainer.query("(inline-size > 30rem)", { display: "grid" });

const scrollContainer = Style.Container.scrollState.name("scroll-container");
scrollContainer.scrollState("(stuck: top)", { top: 0 });
scrollContainer.stuck({ top: 0 });
scrollContainer.stuck("top", { top: 0 });
scrollContainer.snapped("inline", { outlineWidth: "1px" });
scrollContainer.scrollable("block-end", { overflowY: "auto" });
scrollContainer.scrolled("block-start", { opacity: 0.8 });
// @ts-expect-error style-property shortcuts require the style capability.
scrollContainer.styleProperty("$density", "compact", { gap: "4px" });

const fullContainer = Style.Container.size.inlineSize.style.scrollState.name("full-container");
fullContainer.query("(width > 30rem)", {
	...fullContainer.style("(--density: compact)", {
		...fullContainer.stuck("top", { display: "grid" }),
	}),
});
// @ts-expect-error finalized containers do not expose the factory finalizer.
fullContainer.name("renamed-container");
// @ts-expect-error finalized containers do not expose size factory getters.
void fullContainer.size;
// @ts-expect-error finalized containers do not expose inline-size factory getters.
void fullContainer.inlineSize;
// @ts-expect-error size capabilities are selected through closed getters, not arbitrary string arguments.
Style.Container.size("block-size");

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

const draggableHost = Component("div").and(Draggable, {
	threshold: 4,
});
draggableHost.draggable.phase.subscribe(draggableHost, phase => {
	phase satisfies "idle" | "pending" | "dragging";
});
const plainDragEventHost = Component();
// @ts-expect-error Drag events should only be exposed by Draggable components.
plainDragEventHost.event.owned.on.DragStart(() => undefined);
draggableHost.event.owned.on.DragStart(event => {
	event.component.draggable.cancel();
	event.detail.component.draggable.cancel();
	event.detail.position.current.x.toFixed();
});

const dropTargetHost = Component("div").and(DropTarget, {
	accepts: ({ draggable }) => draggable.is(Draggable),
	drop: ({ position }) => {
		position.x satisfies number;
	},
});
dropTargetHost.dropTarget.hovering.subscribe(dropTargetHost, hovering => {
	hovering satisfies boolean;
});

if (false) {
	// @ts-expect-error DropTarget requires accepts.
	Component("div").and(DropTarget, {
		drop: () => {},
	});
	// @ts-expect-error DropTarget requires drop.
	Component("div").and(DropTarget, {
		accepts: () => true,
	});
}

const ItemTransfer = Sortable.Transfer<{ id: string; label: string }>("items");
const typedTransfer: SortableTransfer<{ id: string; label: string }> = ItemTransfer;
const incompatibleTransfer = Sortable.Transfer<{ id: number; label: string }>("other-items");
// @ts-expect-error transfer token item types should not be interchangeable.
const rejectedTransfer: SortableTransfer<{ id: string; label: string }> = incompatibleTransfer;
interface SortableItem {
	id: string;
	label: string;
}
const defaultKeySortableHost = Sortable<SortableItem>([
	{ id: "default", label: "Default" },
], {
	placeholder: (_component, key) => {
		key satisfies number;
		return Component("li");
	},
	render: (item, key, index) => {
		item.value.id.toUpperCase();
		key satisfies number;
		index.toFixed();
		return Component("li");
	},
});
const directAndSortableHost = Component("ul").and(Sortable, [
	{ id: "direct", label: "Direct" },
], {
	key: item => item.id,
	placeholder: (component, key) => {
		key satisfies string;
		component.draggable.cancel();
		return Component("li");
	},
	render: (item, key, index) => {
		item.value.label.toUpperCase();
		key satisfies string;
		index.toFixed();
		return Component("li");
	},
	transfer: ItemTransfer,
});
const typedSortable = Sortable as ComponentBuilderFunction<
	[readonly SortableItem[], SortableOptions<SortableItem, Component, string>],
	Component & SortableExtensions<SortableItem, Component, string>
>;
const sortableHost = Component("ul").and(typedSortable, [
	{ id: "a", label: "Alpha" },
], {
	key: item => item.id,
	placeholder: (component, key) => {
		key satisfies string;
		component.draggable.cancel();
		return Component("li");
	},
	render: (item, key, index) => {
		item.value.label.toUpperCase();
		key satisfies string;
		index.toFixed();
		// @ts-expect-error Sortable render receives readonly item state.
		item.set({ id: "b", label: "Beta" });
		return Component("li");
	},
	transfer: ItemTransfer,
});

void typedTransfer;
void rejectedTransfer;
void defaultKeySortableHost;
void directAndSortableHost;
void sortableHost;
