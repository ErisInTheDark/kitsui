import { Component, State, Style } from "kitsui";

const countStyle = Style.Class("counter-count", {
	fontSize: "48px",
	textAlign: "center",
})

const wrapStyle = Style.Class("counter-wrap", {
	alignItems: "center",
	display: "flex",
	flexDirection: "column",
	gap: "16px",
	padding: "32px",
})

export default function Counter (): Component {
	const counter = Component("div")
		.class.add(wrapStyle)
		
	const count = new State(counter, 0)

	Component("p")
		.class.add(countStyle)
		.text.set(count.map((n: number) => String(n)))
		.appendTo(counter)

	Component("button")
		.text.set("Increment")
		.event.owned.on.click(() => count.update(count => count + 1))
		.appendTo(counter)

	Component("button")
		.text.set("Decrement")
		.event.owned.on.click(() => count.update(count => count - 1))
		.appendTo(counter)

	return counter
}
