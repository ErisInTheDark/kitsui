import { Component, Draggable, DropTarget, State, Style, type DraggableExtensions } from "kitsui";

const itemStyle = Style.Class("drop-item", {
	cursor: "grab",
	margin: "8px 4px",
	padding: "8px 12px",
	width: "max-content",
})

const slotStyle = Style.Class("drop-slot", {
	border: "2px dashed #64748b",
	display: "block",
	minHeight: "64px",
	padding: "16px",
})

const hoveringStyle = Style.Class("drop-slot-hovering", {
	background: "#8882",
	borderColor: "#16a34a",
})

const exampleStyle = Style.Class("drop-target-example", {
	alignItems: "flex-start",
	display: "flex",
	flexDirection: "column",
	gap: "8px",
})

interface ItemRowExtensions {
	readonly itemLabel: string;
}

interface ItemRow extends Component, DraggableExtensions, ItemRowExtensions {}

function ItemRow (this: Component | void, label: string): ItemRow {
	return Component(this ?? "button", ItemRow)
		.extend<ItemRowExtensions>(() => ({
			itemLabel: label,
		}))
		.class.add(itemStyle)
		.text.set(label)
		.and(Draggable)
}

export default function DropTargetExample (): Component {
	const root = Component()
		.class.add(exampleStyle)
	const equipped = State<string | null>(root, null)

	ItemRow("Health charm").appendTo(root)
	ItemRow("Power charm").appendTo(root)

	Component()
		.class.add(slotStyle)
		.and(DropTarget, {
			accepts: ({ draggable }) => Boolean(draggable.as(ItemRow)),
			drop: ({ draggable }) => {
				const dropped = draggable.as(ItemRow)
				if (!dropped) return

				equipped.set(dropped.itemLabel)
			},
		})
		.use(slot => slot.class.bind(slot.dropTarget.hovering, hoveringStyle))
		.text.set(equipped.or(() => "Drop an item here"))
		.appendTo(root)

	return root
}
