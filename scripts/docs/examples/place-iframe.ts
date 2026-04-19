import { Component, State, Style } from "kitsui";

const shellStyle = Style.Class("place-iframe-example", {
	display: "grid",
	gap: "12px",
	padding: "16px",
})

const controlsStyle = Style.Class("place-iframe-example-controls", {
	display: "flex",
	flexWrap: "wrap",
	gap: "8px",
})

const columnsStyle = Style.Class("place-iframe-example-columns", {
	display: "grid",
	gap: "12px",
	gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
})

const frameStyle = Style.Class("place-iframe-example-frame", {
	border: "0",
	minHeight: "180px",
	width: "100%"
})

type Destination = "left" | "right" | "parked";

export default function PlaceIframeExample (): Component {
	const root = Component("div")
		.class.add(shellStyle)

	const destination = new State<Destination>(root, "left")

	Component("p")
		.text.set("This moves one iframe between explicit place() markers. In browsers with moveBefore(), a modern DOM API for moving connected nodes without recreating them, the playing frame can keep its browsing context while it moves.")
		.appendTo(root)

	const controls = Component("div")
		.class.add(controlsStyle)
		.appendTo(root)

	for (const target of ["left", "right", "parked"] as const) {
		Component("button")
			.attribute.set("type", "button")
			.text.set(target === "parked" ? "Park" : `Move ${target}`)
			.event.owned.on.click(() => destination.set(target))
			.appendTo(controls)
	}

	const columns = Component("div")
		.class.add(columnsStyle)
		.appendTo(root)

	const left = Component("section")
		.append(Component("h2").text.set("Left slot"))
		.appendTo(columns)

	const right = Component("section")
		.append(Component("h2").text.set("Right slot"))
		.appendTo(columns)

	 Component("iframe")
		.class.add(frameStyle)
		.attribute.set("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share")
		.attribute.add("allowfullscreen")
		.attribute.set("loading", "lazy")
		.attribute.set("referrerpolicy", "strict-origin-when-cross-origin")
		.attribute.set("src", "https://www.youtube.com/embed/5OSKkrCBU8s?rel=0")
		.attribute.set("title", "place() moveBefore demo video")
		.place(root, (Place) => {
			const leftPlace = Place().appendTo(left)
			const rightPlace = Place().appendTo(right)

			return destination.map(root, (value) => {
				if (value === "left") {
					return leftPlace
				}

				if (value === "right") {
					return rightPlace
				}

				return null
			})
		})

	return root
}