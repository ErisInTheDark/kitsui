# kitsui

kitsui is a DOM-first UI library built around owned `Component` and `State` objects. A `Component` wraps a real `HTMLElement`; a `State` is an owned reactive value.

## Preferred Style

- Write small factory functions that return a `Component`.
- Build most structure in one fluent chain, then use targeted manipulators for classes, attributes, and ARIA.
- Create `State` inside the component or owner that should dispose it.
- Use derived state and conditional helpers instead of manual DOM bookkeeping.
- Prefer `Style` objects over raw class strings once styling becomes reusable.

## A Typical Component

```js
import { Component, State, Style } from "kitsui"

const counterStyle = Style.Class("counter", {
	alignItems: "center",
	display: "flex",
	gap: 8,
})

function Counter() {
	const root = Component("section").class.add(counterStyle)
	
	const count = State(root, 0)
	const doubled = count.map(root, (value) => value * 2)
	const countText = count.map(root, (value) => `Count: ${value}`)
	const doubledText = doubled.map(root, (value) => `Double: ${value}`)
	const atLimit = count.map(root, (value) => value >= 10)

	const value = Component("output")
		.text.set(countText)
		.appendTo(root)

	const button = Component("button")
		.text.set("Increment")
		.attribute.set("type", "button")
		.attribute.bind(atLimit, "disabled")
		.event.owned.on.click(() => {
			count.update((value) => value + 1);
		})
		.appendTo(root)
		
	const note = Component("small")
		.text.set(doubledText)
		.appendToWhen(count.truthy, root)

	return root
}

Counter().appendTo(document.body);
```

This style keeps ownership simple: `root` owns the state and child components, so removing `root` also disposes the whole subtree.

## State-Driven Rendering

Use `use(state, render)` when you already have a component and want state to mutate it. Use `append`, `prepend`, or `insert` with a stateful component selection when the state should swap whole child selections.

```js
const list = Component("ul")
const rows = State(list, null)
const alpha = Component("li").text.set("alpha")
const beta = Component("li").text.set("beta")

list.append(rows);

rows.set([
	alpha,
	beta,
])

rows.set(null)
```

Use `appendWhen`, `prependWhen`, and `insertWhen` when a specific child should be shown and hidden without being recreated each time. kitsui parks the node off-DOM until it is shown again, and disposes it when the returned cleanup runs or the owner is removed.

## Placement And Movement

`appendTo`, `prependTo`, and `insertTo` move an existing component relative to another component, node, or placement marker. Their `*When` variants make placement conditional. `place` is the low-level escape hatch when the location itself is reactive.

```js
const root = Component("section")
const left = Component("div").appendTo(root)
const right = Component("div").appendTo(root)
const side = State(root, "left")
const badge = Component("span").text.set("moving")

badge.place(root, (Place) => {
	const leftPlace = Place().appendTo(left)
	const rightPlace = Place().appendTo(right)
	return side.map(root, (value) => value === "left" ? leftPlace : rightPlace)
})
```

## Styles, Classes, Attributes

`Style` registers reusable CSS classes. `Style({ ... })` creates reusable style definition fragments that can be spread into multiple class definitions to reduce duplication. `component.class` applies and removes those `Style` objects, including reactive style selections. `component.attribute` manages both valueless and valued attributes, including reactive names and values.

```js
const baseCard = Style({
	borderRadius: 8,
	padding: 12,
})

const card = Style.Class("card", {
	...baseCard,
	$accent: "#0a7",
	border: "1px solid $accent",
})

const raised = Style.after(card).Class("card-raised", {
	...baseCard,
	boxShadow: "0 2px 12px rgba(0, 0, 0, 0.15)",
})

const panel = Component("section")
	.class.add(card)
	.use((panel) => {
		const elevated = State(panel, false)
		const selected = State(panel, false)

		panel
			.class.bind(elevated, raised)
			.attribute.set("data-kind", "card")
			.attribute.bind(selected, { name: "aria-selected", value: "true" })
	});
```

If you need ARIA-specific helpers, `component.aria` provides typed wrappers around common ARIA attributes such as role, label, references, booleans, `current`, and `live`.

## Derived State

The mapping extension is central to succinct code:

- `state.map(owner, fn)` creates a derived state owned by `owner`.
- `state.truthy` and `state.falsy` provide memoized boolean states.
- `state.or(getValue)` replaces `null` and `undefined` with a lazily computed fallback.

Prefer these over ad hoc listeners when the result is still state.

## Key API Surface

`Component`

- `Component(tagNameOrElement)`, `Component.wrap(element)`, `Component.extend()`
- Instance methods: `append`, `prepend`, `insert`, `appendWhen`, `prependWhen`, `insertWhen`, `clear`, `setAttribute`, `use`, `setOwner`, `getOwner`, `remove`
- Extension methods: `appendTo`, `prependTo`, `insertTo`, `appendToWhen`, `prependToWhen`, `insertToWhen`, `place`
- Accessors: `class`, `attribute`, `aria`, `text`, `event`

`State` and `Owner`

- `State(owner, initialValue, options?)`, `State.extend()`
- State methods: `set`, `update`, `setEquality`, `subscribeImmediate`, `subscribe`, `subscribeImmediateUnbound`, `subscribeUnbound`
- Derived-state helpers: `map`, `truthy`, `falsy`, `or`
- Lifecycle from `Owner`: `onCleanup`, `dispose`, `disposed`

`Style` and Manipulators

- `Style(definition)` (reusable fragment), `Style.Class(className, definition)`, `Style.after(...styles).Class(className, definition)`
- `ClassManipulator`: `add`, `remove`, `bind`, `addFrom`
- `AttributeManipulator`: `add`, `set`, `remove`, `bind`
- `TextManipulator`: `set`, `bind`
- `EventManipulator`: `on`, `off`, `owned`
- `AriaManipulator`: typed ARIA helpers layered on top of attributes

`Useful exported types`

- Components: `ComponentRender`, `ComponentChild`, `AppendableComponentChild`, `ComponentSelection`, `ComponentSelectionState`, `InsertWhere`, `InsertableNode`, `InsertableSelection`, `InsertableComponentChild`, `ExtendableComponentClass`
- Text: `TextValue`, `TextSelection`, `TextInput`, `TextSource`
- State: `CleanupFunction`, `StateOptions`, `StateListener`, `StateUpdater`, `StateEqualityFunction`, `ExtendableStateClass`
- Styling and attributes: `StyleDefinition`, `StyleValue`, `StyleInput`, `StyleSelection`, `Falsy`, `AttributeEntry`, `AttributeNameInput`, `AttributeNameSelection`, `AttributeValue`, `AttributeValueInput`, `AttributeValueSelection`
- Placement: `Place`, `PlaceSource`, `PlacementTarget`, `PlacerFunction`
- ARIA: the entrypoint also re-exports the typed ARIA unions and inputs used by `AriaManipulator`, including roles, booleans, references, `current`, and `live`

## Writing Succinct kitsui Code

- Return `Component` instances from factory functions.
- Let ownership do cleanup work for you.
- Use `use(state, render)` for local view updates and derived state for reusable logic.
- Reach for `appendWhen` and stateful child selections before manual `subscribe` plus DOM mutation.
- Keep low-level DOM access for event handlers and genuinely custom behavior; let kitsui handle lifecycle and placement.