import { Component, State, Style } from "kitsui";

const shellStyle = Style.Class("mount-dispose-example", {
	display: "grid",
	gap: "12px",
	padding: "16px",
})

function Widget (log: State<string[]>): Component {
	const widget = Component("section")
	const ticks = new State(widget, 0)
	let intervalId: number | null = null

	Component("h2")
		.text.set("Lifecycle widget")
		.appendTo(widget)

	Component("p")
		.text.set("Mount starts a timer. Dispose stops it before the element leaves the DOM.")
		.appendTo(widget)

	Component("p")
		.text.set(ticks.map(value => `Ticks while mounted: ${value}`))
		.appendTo(widget)

	widget.event.owned.on.Mount(() => {
		log.update(entries => [...entries, "Mount fired"])
		intervalId = setInterval(() => {
			ticks.update(ticks => ticks + 1)
		}, 1000)
	})

	widget.event.owned.on.Dispose(() => {
		log.update(entries => [...entries, "Dispose fired"])

		if (intervalId !== null) {
			clearInterval(intervalId)
			intervalId = null
		}
	})

	return widget
}

export default function MountDisposeExample (): Component {
	const root = Component("div")
		.class.add(shellStyle)

	const log = new State<string[]>(root, [])
	
	const host = Component("div")
		.appendTo(root)
	
	const widget = State<Component | null>(host, null)
	host.append(widget)

	Component("button")
		.attribute.set("type", "button")
		.text.set(widget.map(current => current ? "Dispose widget" : "Mount widget"))
		.event.owned.on.click(() => {
			if (widget.value) {
				widget.value.remove()
				widget.set(null)
				return
			}

			const newWidget = Widget(log)
			widget.set(newWidget)
		})
		.appendTo(root)

	Component("pre")
		.text.set(log.map(entries => entries.length > 0 ? entries.join("\n") : "Event log is empty."))
		.appendTo(root)

	return root
}