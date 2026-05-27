# kitsui

kitsui is a DOM-first UI library built around owned `Component` and `State` objects. A `Component` wraps a real `HTMLElement`; a `State` is an owned reactive value.

Think of kitsui like react but with less magic. Every possible effect is explicitly declared and controlled by you. No virtual DOM, no reconciliation, no hidden state.

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
- Use derived state, manipulators, and conditional placement before manual `subscribe` plus DOM mutation.
- Build most static structure in one fluent chain.
- Use `component.class`, `component.style`, `component.attribute`, `component.aria`, `component.text`, and `component.event` for DOM effects.
- Use `event.owned` for handlers that should be cleaned up with the component.
- Use `Style.Class` for reusable, selectable, or shared styles. Use `component.style` for dynamic or reactive inline properties.
- Keep direct DOM access inside event handlers or genuinely custom behavior.

## Reusable Components

Reusable component files should exactly match the component name and default-export the component function. Use one local symbol as both the interface name and function name, then export it once with `export default Name`.

Do not force assignability with `as Name` in the return statement. Give the function an explicit return type and let `Object.assign(...)` typecheck the result.

Custom component methods should return `this` unless there is a strong reason to return something else.

```ts
import { Component } from "kitsui"

interface Button extends Component<HTMLButtonElement> {
	setBusy (busy: boolean): this
	setLabel (label: string): this
}

function Button (this: Component | void, label: string): Button {
	const button = Component(this ?? "button", Button)
		.attribute.set("type", "button")

	const labelText = Component("span")
		.text.set(label)
		.appendTo(button)

	return Object.assign(button, {
		setBusy (this: Button, busy: boolean): this {
			this.attribute.toggle("disabled", busy)
			return this
		},

		setLabel (this: Button, label: string): this {
			labelText.text.set(label)
			return this
		},
	})
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
kitsui parks nodes off-DOM when conditions are not met, then disposes them when the owner is removed.

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

## Feature Index

- [`Component`](./Component.html): `append`, `prepend`, `insert`, conditional variants, `clear`, `use`, `and`, `is`, `as`, `remove`, `extend`.
- Placement extensions: `appendTo`, `prependTo`, `insertTo`, conditional variants, and `place`.
- Manipulators: [`ClassManipulator`](./ClassManipulator.html), [`StyleManipulator`](./StyleManipulator.html), [`AttributeManipulator`](./AttributeManipulator.html), [`TextManipulator`](./TextManipulator.html), [`EventManipulator`](./EventManipulator.html), [`AriaManipulator`](./AriaManipulator.html).
- [`State`](./State.html): `set`, `update`, equality options, subscriptions, `map`, `truthy`, `falsy`, `or`, `Group`, `extend`.
- [`Style`](./Style.html): fragments, classes, ordered classes with `after`, variables, nested selectors, media queries, pseudo selectors, animation helpers, and sticky helpers.
- ARIA: typed helpers for roles, labels, references, booleans, `current`, and `live`.
- Docs examples: [counter](./playground.html?example=counter.ts), [composition](./playground.html?example=composition.ts), [append-when](./playground.html?example=append-when.ts), [bind-manipulators](./playground.html?example=bind-manipulators.ts), [place-iframe](./playground.html?example=place-iframe.ts), [state-group](./playground.html?example=state-group.ts), [mount-dispose](./playground.html?example=mount-dispose.ts).
