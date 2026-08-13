# kitsui

kitsui is a DOM-first UI library built around owned `Component` and `State` objects. A `Component` wraps a real `HTMLElement`; a `State` is an owned reactive value.

Think of kitsui like react but with less magic. Every possible effect is explicitly declared and controlled by you. Build and move real Components directly; kitsui does not run an application-wide render cycle behind your code.

## A Typical Component

```ts
import { Component, State, Style } from "kitsui"

const counterStyle = Style.Class("counter", {
	alignItems: "center",
	display: "flex",
	gap: 8,
})

function Counter (): Component {
	const root = Component("section")
		.class.add(counterStyle)

	const count = State(root, 0)

	Component("output")
		.text.set(count.map(value => `Count: ${value}`))
		.appendTo(root)

	Component("button")
		.attribute.set("type", "button")
		.text.set("Increment")
		.event.owned.on.click(() => {
			count.update(value => value + 1)
		})
		.appendTo(root)

	return root
}

Counter().appendTo(document.body)
```

This style keeps ownership simple: `root` owns the state, event cleanup, and child components, so removing `root` disposes the whole subtree.

## Best Practices

- Return `Component` instances from small factory functions.
- Create `State` on the component or owner that should dispose it.
- Use `Owner()` for a living scope that has no owning `Component`, then pass it to every owner-aware API in that scope.
- Use derived state, manipulators, and conditional placement before manual `subscribe` plus DOM mutation.
- Build most static structure in one fluent chain.
- Use `component.class`, `component.style`, `component.attribute`, `component.aria`, `component.text`, and `component.event` for DOM effects.
- Use `event.owned` for handlers that should be cleaned up with the component.
- Use `Style.Class` for reusable, selectable, or shared styles. Use `component.style` for dynamic or reactive inline properties.
- Keep direct DOM access inside event handlers or genuinely custom behavior.

## Reusable Components

Reusable component files should exactly match the component name and default-export the component function. Use one local symbol as both the interface name and function name, then export it once with `export default Name`.

Do not force assignability with `as Name` in the return statement. Give the function an explicit return type and let `component.extend(...)` typecheck the result.

Custom component methods should return `this` unless there is a strong reason to return something else.

```ts
import { Component } from "kitsui"

interface ButtonExtensions {
	setBusy (busy: boolean): this
	setLabel (label: string): this
}

interface Button extends Component<HTMLButtonElement>, ButtonExtensions { }

function Button (this: Component<HTMLButtonElement> | void, label: string): Button {
	const button = Component(this ?? "button", Button)
		.attribute.set("type", "button")

	const labelText = Component("span")
		.text.set(label)
		.appendTo(button)

	return button.extend<ButtonExtensions>(root => ({
		setBusy (busy) {
			root.attribute.toggle("disabled", busy)
			return root
		},

		setLabel (label) {
			labelText.text.set(label)
			return root
		},
	}))
}

export default Button
```

Composable builders must pass their own function identity to the initial `Component(...)` call. `and` injects the current component as `this`, forwards params, and skips builders already applied to that component. `is` and `as` check the same builder identity.

```ts
const standalone = Button("Save")
const composed = Component("button").and(Button, "Save")

if (composed.is(Button)) {
	composed.setBusy(true)
}
```

### Component-Specific Events

Base component events are only for events available on every component, such as `Mount` and `Dispose`. Feature-specific components should expose custom events through `Component.WithEvents<Events>` instead of augmenting the shared component event map.

Custom kitsui component event names should be `PascalCase`, such as `DragStart` or `WidgetCommit`, so they stay distinct from native DOM events like `click` and `pointerdown`.

```ts
import { Component } from "kitsui"

interface WidgetEvents {
	WidgetCommit: CustomEvent<{
		readonly value: string
	}> & {
		readonly source: "user" | "api"
	}
}

interface WidgetExtensions {
	commit (value: string): this
}

interface Widget extends Component.WithEvents<WidgetEvents>, WidgetExtensions { }

function emitWidgetCommit (widget: Widget, value: string): boolean {
	return widget.event.emit.WidgetCommit({ value }, {
		tweak: event => Object.defineProperty(event, "source", {
			value: "api",
		}),
	})
}

declare const widget: Widget

widget.event.owned.on.WidgetCommit(event => {
	event.detail.value.toUpperCase()
	event.source
})
```

`event.emit.*` and `event.dispatch.*` are aliases that construct the mapped `CustomEvent`, run the optional `tweak` callback, and return the target's native `dispatchEvent` result. Native `CustomEvent` defaults are preserved, so kitsui custom events do not bubble unless `bubbles: true` is explicitly supplied. Bubbling does not add the feature event to ancestor component types; an ancestor must still opt into the event map before its typed `event` API exposes that name.

Synchronous `Dispose` handlers may emit final custom notifications while the owner reports both `disposed` and `disposing`. This is a narrow lifecycle window: listener registration and other component mutations remain forbidden, and custom-event emission is rejected again after disposal finishes.

## State And Derived Values

Use short-form derived state when the derived value is consumed immediately. Use owner-explicit derived state when the derived state is reused, grouped, passed around, or otherwise needs an obvious owner.

Keep behavior and UI state consistent. A disabled button should not be the only thing enforcing an invariant.

```ts
const root = Component("section")
const count = State(root, 0)
const atLimit = count.map(root, value => value >= 10)

Component("output")
	.text.set(count.map(value => `Count: ${value}`))
	.appendTo(root)

Component("button")
	.attribute.set("type", "button")
	.attribute.bind(atLimit, "disabled")
	.text.set(atLimit.map(value => value ? "Limit reached" : "Increment"))
	.event.owned.on.click(() => {
		count.update(value => Math.min(value + 1, 10))
	})
	.appendTo(root)

Component("p")
	.text.bind(atLimit, "The counter is capped.")
	.appendTo(root)
```

Use `State.Group(owner, states)` when one derived value needs a coherent snapshot of multiple states. Use `truthy`, `falsy`, and `or(...)` instead of writing repetitive boolean or nullish mapping by hand.

## Standalone Owner Scopes

Use `Owner()` when a living scope does not have an owning `Component`. Pass the owner to `State` and other owner-aware APIs so the whole scope shares one lifetime. Dispose the owner when the scope ends.

```ts
const session = Owner()
const status = State(session, "connecting")
const label = status.map(session, value => `Status: ${value}`)

label.subscribe(session, value => {
	console.log(value)
})

session.dispose()
```

When a scope belongs to a UI subtree, use the `Component` as its owner. Integration helpers for routers, sockets, observers, and other systems can accept an `Owner` and use `owner.onCleanup(...)` internally; ordinary application code usually only passes the owner to the helper.

Every owner exposes a lifetime-bound `signal` for cancellable platform work.

## Manipulator Binding

Use manipulators for reactive DOM effects. A single state can drive text, class, raw attributes, typed ARIA attributes, and events without manual DOM bookkeeping.

```ts
const expandedStyle = Style.Class("panel-expanded", {
	borderColor: "#0f766e",
})

const panel = Component("section")
const expanded = State(panel, false)

Component("button")
	.attribute.set("type", "button")
	.aria.expanded(expanded)
	.text.set(expanded.map(value => value ? "Collapse" : "Expand"))
	.event.owned.on.click(() => {
		expanded.update(value => !value)
	})
	.appendTo(panel)

Component("div")
	.class.bind(expanded, expandedStyle)
	.attribute.bind(expanded, "data-expanded")
	.aria.hidden(expanded.falsy)
	.text.set(expanded.map(value => value ? "Expanded" : "Collapsed"))
	.appendTo(panel)
```

Use `attribute.toggle(name, enabled)` for immediate boolean attribute toggling in imperative methods. Use `attribute.bind(state, name)` when attribute presence should follow state.

## Movement And Placement

Use `appendTo`, `prependTo`, and `insertTo` when an existing component should move relative to another component, node, or marker. Use `appendToWhen`, `prependToWhen`, `insertToWhen`, `appendWhen`, `prependWhen`, and `insertWhen` for conditional placement. Use `place` when the target location itself is reactive.

Keep one active kitsui placement flow per Component or raw Node. If you place it again through another kitsui API, the newer call takes control and the older conditional or selection flow stops moving it. Replacing one Component from a shared selection does not stop its siblings.

Conditional placement keeps hidden nodes alive off-DOM and restores them when their condition becomes true. Removing their lifetime owner disposes them.

```ts
const root = Component("section")
const open = State(root, false)
const details = Component("p")
	.text.set("More detail")
	.appendToWhen(open, root)
```

```ts
const root = Component("section")
const left = Component("div").appendTo(root)
const right = Component("div").appendTo(root)
const side = State<"left" | "right">(root, "left")

const badge = Component("span")
	.text.set("moving")

badge.place(root, (Place) => {
	const leftPlace = Place().appendTo(left)
	const rightPlace = Place().appendTo(right)

	return side.map(value => value === "left" ? leftPlace : rightPlace)
})
```

Use `append`, `prepend`, and `insert` when the owner should select which children are present. State-backed child selections are anchored in place; when the state changes, kitsui replaces and disposes the old selection.

```ts
const root = Component("section")
const view = State<"summary" | "details">(root, "summary")

Component("button")
	.attribute.set("type", "button")
	.text.set("Summary")
	.event.owned.on.click(() => view.set("summary"))
	.appendTo(root)

Component("button")
	.attribute.set("type", "button")
	.text.set("Details")
	.event.owned.on.click(() => view.set("details"))
	.appendTo(root)

root.append(view.map(root, value => {
	if (value === "summary") {
		return Component("p").text.set("Short summary")
	}

	return Component("p").text.set("Full details")
}))
```

## Styling

Use `Style(...)` for reusable style fragments and `Style.Class(...)` for registered CSS classes. Use `Style.after(...)` when order matters between reusable classes.

```ts
const cardBase = Style({
	borderRadius: 8,
	padding: 12,
})

const cardStyle = Style.Class("card", {
	...cardBase,
	$accent: "#0a7",
	border: "1px solid $accent",
})

const raisedStyle = Style.after(cardStyle).Class("card-raised", {
	...cardBase,
	boxShadow: "0 2px 12px rgba(0, 0, 0, 0.15)",
})

const card = Component("button")
const raised = State(card, false)

card
	.attribute.set("type", "button")
	.class.add(cardStyle)
	.class.bind(raised, raisedStyle)
	.style.set({
		$panelAccent: "#0a7",
		borderColor: "$panelAccent",
	})
	.text.set("Hover for elevation")
	.event.owned.on.pointerenter(() => raised.set(true))
	.event.owned.on.pointerleave(() => raised.set(false))
```

String style values support calculation shorthand. Kitsui compiles `[expression]` to `calc(expression)` and expands variable shorthand inside the expression. Double the square brackets when CSS needs literal brackets, such as named grid lines.

```ts
const layoutStyle = Style.Class("layout", {
	$gap: "1rem",
	gridTemplateColumns: "[[content-start]] [100% - ${sidebarWidth: 18rem} - $gap] [[content-end]]",
	width: "[100% - $gap]",
})
```

This emits literal `[content-start]` and `[content-end]` grid line names. The bracketed expressions become `calc(...)` values, and `$gap` plus `${sidebarWidth: 18rem}` become CSS variable references.

## Breakdown

Use `component.breakdown(...)` when a State drives a keyed list or region and each Component should be reused by key.

```ts
interface Todo {
	id: string
	label: string
}

const list = Component("ul")
const todos = State(list, [
	{ id: "first", label: "Write the README" },
])

list.breakdown(todos, (list, Part, todos) => {
	for (const todo of todos) {
		Part(todo.id, () => Component("li"))
			.text.set(todo.label)
			.appendTo(list)
	}
})
```

Use a stable key for each logical item. `Part` returns the same Component while that key remains present. Its builder runs when the key needs a new Component and must return a new, active, ownerless Component that has not been placed yet.

Update and place every returned part during every pass. `Part` never places a Component for you, and the order of your placement calls establishes the rendered order. If a successful pass omits a key, kitsui disposes that part.

Keep the callback synchronous: do not use an async callback, `await`, or delayed `Part` and placement calls. Later State updates are batched and can skip intermediate values, so author each pass from the value supplied to the callback.

Use kitsui placement APIs inside the callback. If you need to inspect the physical DOM, do so after the callback returns. Breakdown continues to own each part even when you place it somewhere else.

## Feature Index

- [`Component`](./Component.html): `append`, `prepend`, `insert`, conditional variants, `clear`, `use`, `and`, `is`, `as`, `remove`, `extend`.
- Breakdown: `component.breakdown(...)` and `Component.Breakdown(...)` for stable keyed rendering from State values.
- Placement extensions: `appendTo`, `prependTo`, `insertTo`, conditional variants, and `place`.
- Manipulators: [`ClassManipulator`](./ClassManipulator.html), [`StyleManipulator`](./StyleManipulator.html), [`AttributeManipulator`](./AttributeManipulator.html), [`TextManipulator`](./TextManipulator.html), [`EventManipulator`](./EventManipulator.html), [`AriaManipulator`](./AriaManipulator.html).
- [`State`](./State.html): `set`, `update`, equality options, subscriptions, `map`, `debounce`, `throttle`, `mapAsync`, `truthy`, `falsy`, `or`, `Group`, `extend`.
- [`Style`](./Style.html): fragments, classes, ordered classes with `after`, variables, nested selectors, media queries, pseudo selectors, animation helpers, and sticky helpers.
- ARIA: typed helpers for roles, labels, references, booleans, `current`, and `live`.
- Docs examples: [counter](./playground.html?example=counter.ts), [composition](./playground.html?example=composition.ts), [append-when](./playground.html?example=append-when.ts), [bind-manipulators](./playground.html?example=bind-manipulators.ts), [place-iframe](./playground.html?example=place-iframe.ts), [state-group](./playground.html?example=state-group.ts), [mount-dispose](./playground.html?example=mount-dispose.ts).
