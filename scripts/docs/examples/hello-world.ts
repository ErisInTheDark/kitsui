import { Component, State, Style, whenHover } from "kitsui";

const buttonStyle = Style.Class("counter-button", {
	background: "$accentPrimary",
	border: "none",
	borderRadius: "8px",
	color: "#fff",
	cursor: "pointer",
	fontSize: "16px",
	padding: "8px 18px",
	transition: "opacity 0.15s",
	...whenHover({ opacity: 0.85 }),
})

const countStyle = Style.Class("counter-count", {
	fontSize: "48px",
	fontWeight: 700,
	letterSpacing: "-0.02em",
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
		.class.add(buttonStyle)
		.text.set("Increment")
		.event.owned.on.click(() => count.set(count.value + 1))
		.appendTo(counter)

	Component("button")
		.class.add(buttonStyle)
		.text.set("Decrement")
		.event.owned.on.click(() => count.set(count.value - 1))
		.appendTo(counter)

	return counter
}
