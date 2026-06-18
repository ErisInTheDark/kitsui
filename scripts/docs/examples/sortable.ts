import { Component, Sortable, State, Style, type DraggableExtensions } from "kitsui";

interface Item {
	readonly id: string;
	readonly label: string;
}

const ItemTransfer = Sortable.Transfer<Item>("items")

const listStyle = Style.Class("sortable-list", {
	border: "2px solid #8884",
	display: "flex",
	flexDirection: "column",
	gap: "8px",
	margin: "8px 0",
	padding: "16px",
})

const rowStyle = Style.Class("sortable-row", {
	cursor: "grab",
	padding: "8px 12px",
})

const placeholderStyle = Style.Class("sortable-placeholder", {
	border: "1px dashed #0284c7",
	display: "block",
	minHeight: "36px",
})

const exampleStyle = Style.Class("sortable-example", {
	display: "grid",
	gap: "12px",
})

function renderItem (item: State.Readonly<Item>, _key: string, _index: number): Component {
	return Component("button")
		.class.add(rowStyle)
		.text.set(item.map(value => value.label))
}

function placeholder (_component: Component & DraggableExtensions, _key: string): Component {
	return Component()
		.class.add(placeholderStyle)
}

export default function SortableExample (): Component {
	const items = State([
		{ id: "alpha", label: "Alpha" },
		{ id: "beta", label: "Beta" },
		{ id: "gamma", label: "Gamma" },
	])
	const selected = State([
		{ id: "delta", label: "Delta" },
	])
	const sortableOptions = {
		key: (item: Item) => item.id,
		placeholder,
		render: renderItem,
		transfer: ItemTransfer,
	}

	return Component()
		.class.add(exampleStyle)
		.append(Component()
			.class.add(listStyle)
			.and(Sortable, items, sortableOptions))
		.append(Component()
			.class.add(listStyle)
			.and(Sortable, selected, sortableOptions))
}
