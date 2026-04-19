import { Component, State, Style } from "kitsui";

const shellStyle = Style.Class("bind-manipulators-example", {
	display: "grid",
	gap: "12px",
	padding: "16px",
})

const activeStyle = Style.Class("bind-manipulators-example-active", {
	fontWeight: 600
})

export default function BindManipulatorsExample (): Component {
	const root = Component("div")
		.class.add(shellStyle)

	const active = new State(root, false)

	Component("button")
		.text.set(active.map(v => v ? "Turn state off" : "Turn state on"))
		.event.owned.on.click(() => active.set(!active.value))
		.appendTo(root)

	Component("p")
		.text.bind(active, "It's on!")
		.appendTo(root)

	Component("details")
		.class.bind(active, activeStyle)
		.attribute.bind(active, "open")
		.append(
			Component("summary").text.set("One state, three effects"),
			Component("p").text.set("This preview gets a bound class and bound attributes when the state is true."),
		)
		.appendTo(root)

	return root
}