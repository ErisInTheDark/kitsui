import { Component, State, Style } from "kitsui";

const shellStyle = Style.Class("append-when-example", {
	display: "grid",
	gap: "12px",
	padding: "16px",
})

const rowStyle = Style.Class("append-when-example-row", {
	display: "grid",
	gap: "12px",
	gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
})

const noteStyle = Style.Class("append-when-example-note", {
	fontStyle: "italic",
})

export default function AppendWhenExample (): Component {
	const root = Component("div")
		.class.add(shellStyle)

	const visible = new State(root, false)

	Component("button")
		.attribute.set("type", "button")
		.text.set(visible.map(v => v ? "Hide" : "Show"))
		.event.owned.on.click(() => visible.set(!visible.value))
		.appendTo(root)

	const examplesRow = Component("div")
		.class.add(rowStyle)
		.appendTo(root)

	Component("section")
		.append(Component("h2")
			.text.set("appendWhen()")
		)
		.append(Component("p")
			.text.set("The detail panel is parked off-DOM when hidden, then moved back to the same spot when shown again."),
		)
		.appendWhen(visible, Component("p")
			.class.add(noteStyle)
			// appendWhen() also has prependWhen() and insertWhen() variants when you need the child at the start or relative to this component.
			.text.set("This paragraph is controlled by appendWhen(). It is not recreated on every toggle.")
		)
		.append(Component("p")
			.text.set("This footer stays in place so you can see where the conditional child is reinserted.")
		)
		.appendTo(examplesRow)

	const appendToTarget = Component("section")
		.append(Component("h2")
			.text.set("appendToWhen()")
		)
		.append(Component("p")
			.text.set("The badge below is a single component. appendToWhen() moves it into this target when the state is true.")
		)
		.appendTo(examplesRow)

	Component("p")
		.class.add(noteStyle)
		.text.set("Moved with appendToWhen()")
		// appendToWhen() also has prependToWhen() and insertToWhen() variants when the target should start with the node or place it before/after a reference.
		.appendToWhen(visible, appendToTarget)

	return root
}