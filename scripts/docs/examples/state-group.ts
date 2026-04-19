import { Component, State, Style } from "kitsui";

const shellStyle = Style.Class("state-group-example", {
	display: "grid",
	gap: "12px",
	padding: "16px",
})

const columnsStyle = Style.Class("state-group-example-columns", {
	display: "grid",
	gap: "12px",
	gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
})

interface RadioGroup extends Component {
	selection: State<string>;
}

function RadioGroup (title: string, options: string[]): RadioGroup {
	const group = Component("fieldset")
	const selection = new State(group, options[0] ?? "")
	const groupName = `${title}-${options.join("-")}`.replace(/[^a-z0-9]+/giu, "-").toLowerCase()

	Component("legend")
		.text.set(title)
		.appendTo(group)

	for (const option of options) {
		const radio = Component("input")
			.attribute.set("type", "radio")
			.attribute.set("name", groupName)
			.attribute.set("value", option)
			.attribute.bind(selection.map(v => v === option), "checked")
			.event.owned.on.change(event => {
				if (event.component.element.checked) {
					selection.set(option)
				}
			})

		Component("label")
			.append(radio, ` ${option}`)
			.appendTo(Component("div").appendTo(group))
	}

	return Object.assign(group, { selection })
}

export default function StateGroupExample (): Component {
	const root = Component("div")
		.class.add(shellStyle)

	Component("p")
		.text.set("State.Group() combines the three selection states into one grouped snapshot.")
		.appendTo(root)

	const subject = RadioGroup("Subject", ["The squirrel", "My compiler", "A robot"])
	const verb = RadioGroup("Verb", ["debugs", "launches", "adopts"])
	const object = RadioGroup("Object", ["three glitter cannons", "the build", "a sandwich"])

	Component("div")
		.class.add(columnsStyle)
		.append(subject, verb, object)
		.appendTo(root)

	Component("p")
		.text.set(State
			.Group(root, {
				subject: subject.selection,
				verb: verb.selection,
				object: object.selection,
			})
			.map(({ subject, verb, object }) => `${subject} ${verb} ${object}.`))
		.appendTo(root)

	return root
}