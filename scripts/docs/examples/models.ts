import { Component, Fields, Owner, State, Style } from "@inthedark/kitsui";

const shellStyle = Style.Class("models-example", {
	display: "grid",
	gap: "12px",
	padding: "16px",
})

const rowStyle = Style.Class("models-example-row", {
	alignItems: "center",
	display: "flex",
	gap: "8px",
})

// Derived bodies can't name the class being declared, so they read the instance through an interface.
interface SwordFields {
	sharpness: number
	runes: number
	readonly damage: number
}

class Sword extends Fields.define(Owner, "Sword", {
	state: { sharpness: 3, runes: 0 },
	derived: {
		damage: { reads: ["sharpness", "runes"], get: (sword: SwordFields) => sword.sharpness * 2 + sword.runes * 5 },
		rating: { reads: ["damage"], get: (sword: SwordFields) => sword.damage >= 20 ? "legendary" : sword.damage >= 10 ? "fine" : "rusty" },
	},
}) { }

function Stepper (label: string, value: State<number>): Component {
	const row = Component().class.add(rowStyle)
	Component("span").text.set(value.map(current => `${label}: ${current}`)).appendTo(row)
	Component("button")
		.attribute.set("type", "button")
		.text.set("+1")
		.event.owned.on.click(() => value.update(current => current + 1))
		.appendTo(row)
	return row
}

export default function ModelsExample (): Component {
	const root = Component().class.add(shellStyle)
	const sword = new Sword()
	root.onCleanup(() => sword.dispose())

	Component("p")
		.text.set("A model's fields are plain slots; $x makes a real State on first use, and derived values cache until what they read changes.")
		.appendTo(root)

	Stepper("Sharpness", sword.$sharpness).appendTo(root)
	Stepper("Runes", sword.$runes).appendTo(root)

	Component("p")
		.text.set(State.Group(root, { damage: sword.$damage, rating: sword.$rating }).map(({ damage, rating }) => `Damage ${damage}, ${rating}`))
		.appendTo(root)

	// A plugin: while the whetstone is on, every sword hits harder. Disposing its owner unloads it.
	let whetstone: Owner | null = null
	root.onCleanup(() => whetstone?.dispose())
	Component("button")
		.attribute.set("type", "button")
		.text.set("Toggle whetstone (+4 damage)")
		.event.owned.on.click(() => {
			if (whetstone) {
				whetstone.dispose()
				whetstone = null
				return
			}
			whetstone = Owner()
			Sword.compose.damage(whetstone, (_sword, damage) => damage + 4)
		})
		.appendTo(root)

	return root
}
