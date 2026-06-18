import { Component, Draggable, Style } from "kitsui";

const boxStyle = Style.Class("draggable-box", {
	background: "#2563eb",
	color: "white",
	cursor: "grab",
	padding: "12px 16px",
	userSelect: "none",
	width: "max-content",
})

const activeStyle = Style.Class("draggable-box-active", {
	cursor: "grabbing",
	opacity: "0.75",
})

const exampleStyle = Style.Class("draggable-example", {
	alignItems: "flex-start",
	display: "flex",
	flexWrap: "wrap",
	gap: "8px",
})

export default function DraggableExample (): Component {
	const box = Component("button")
		.class.add(boxStyle)
		.text.set("Drag me")
		.and(Draggable, { threshold: 4 })
	const keyboardBox = Component("button")
		.class.add(boxStyle)
		.text.set("Hold Space drag")
		.and(Draggable, {
			input: KeyboardPointerInput,
			threshold: 4,
		})

	box.class.bind(box.draggable.active, activeStyle)
	keyboardBox.class.bind(keyboardBox.draggable.active, activeStyle)

	return Component()
		.class.add(exampleStyle)
		.append(box)
		.append(keyboardBox)
}

export const KeyboardPointerInput = Draggable.Input((component, receiver) => {
	const documentRef = component.element.ownerDocument
	const source = { id: "keyboard-pointer", type: "external" } as const
	let dragging = false
	let hovering = false
	let position: DragPoint | null = null

	const currentPosition = (): DragPoint => position ?? componentCenter(component)

	const targetAt = (point: DragPoint): Component | undefined => {
		const element = documentRef.elementFromPoint?.(point.x, point.y)

		return element instanceof HTMLElement ? element.component : undefined
	}

	const handlePointerMove = (event: PointerEvent) => {
		position = {
			x: event.clientX,
			y: event.clientY,
		}

		if (!dragging) return

		receiver.move({
			event,
			position,
			source,
			target: targetAt(position),
		})
	}

	const handlePointerEnter = (event: PointerEvent) => {
		hovering = true
		position = {
			x: event.clientX,
			y: event.clientY,
		}
	}

	const handlePointerLeave = () => {
		hovering = false
	}

	const cancelDrag = (event?: KeyboardEvent) => {
		const point = currentPosition()
		event?.preventDefault()
		dragging = false
		receiver.cancel({
			event,
			position: point,
			source,
			target: targetAt(point),
		})
	}

	const handleDocumentKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape" && dragging) {
			cancelDrag(event)
			return
		}

		if (event.key !== " " || event.repeat || dragging || !hovering) return

		const point = currentPosition()
		event.preventDefault()
		position = point
		dragging = receiver.start({
			event,
			position: point,
			source,
			target: targetAt(point),
		})
	}

	const handleKeyUp = (event: KeyboardEvent) => {
		if (event.key !== " " || !dragging) return

		const point = currentPosition()
		event.preventDefault()
		dragging = false
		receiver.end({
			event,
			position: point,
			source,
			target: targetAt(point),
		})
	}

	component.element.addEventListener("pointerenter", handlePointerEnter)
	component.element.addEventListener("pointerleave", handlePointerLeave)
	documentRef.addEventListener("keydown", handleDocumentKeyDown)
	documentRef.addEventListener("keyup", handleKeyUp)
	documentRef.addEventListener("pointermove", handlePointerMove)

	return () => {
		component.element.removeEventListener("pointerenter", handlePointerEnter)
		component.element.removeEventListener("pointerleave", handlePointerLeave)
		documentRef.removeEventListener("keydown", handleDocumentKeyDown)
		documentRef.removeEventListener("keyup", handleKeyUp)
		documentRef.removeEventListener("pointermove", handlePointerMove)

		if (dragging) {
			cancelDrag()
		}
	}
})

interface DragPoint {
	readonly x: number;
	readonly y: number;
}

function componentCenter (component: Component): DragPoint {
	const rect = component.element.getBoundingClientRect()

	return {
		x: rect.left + rect.width / 2,
		y: rect.top + rect.height / 2,
	}
}
