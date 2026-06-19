import type {
	CleanupFunction,
	ComponentBuilderFunction,
	ComponentChild,
	SortableExtensions,
	SortableOptions,
	SortableTransfer,
	StyleValue,
} from "kitsui";
import { Component, Draggable, DropTarget, Sortable, State, Style } from "kitsui";

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
