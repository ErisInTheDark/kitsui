import { describe, expect, it, vi } from "vitest";
import { Component, Draggable, DropTarget, type DragInputReceiver, type DraggableComponent } from "../../src";
import { handleDropTargetDrop, resolveDropTarget } from "../../src/component/DropTarget";

function mountedComponent<NAME extends keyof HTMLElementTagNameMap = "div"> (tagName: NAME = "div" as NAME): Component<HTMLElementTagNameMap[NAME]> {
	return Component(tagName).appendTo(document.body);
}

function externalDraggable (): {
	component: DraggableComponent;
	receiver: DragInputReceiver;
} {
	let receiver: DragInputReceiver | undefined;
	const component = mountedComponent().and(Draggable, {
		input: (_component, nextReceiver) => {
			receiver = nextReceiver;
		},
	});

	return {
		component,
		get receiver () {
			return receiver!;
		},
	};
}

describe("DropTarget", () => {
	it("adds a dropTarget namespace and is idempotent", () => {
		const options = {
			accepts: () => true,
			drop: () => {},
		};
		const component = mountedComponent().and(DropTarget, options);
		const first = component.dropTarget;
		const composed = component.and(DropTarget, options);

		try {
			expect(composed.dropTarget).toBe(first);
			expect(first.accepting.value).toBe(false);
			expect(first.hovering.value).toBe(false);
			expect(first.draggable.value).toBeNull();
		}
		finally {
			component.remove();
		}
	});

	it("requires accepts and drop functions", () => {
		const target = mountedComponent();

		try {
			expect(() => target.and(DropTarget, { drop: () => {} } as never)).toThrow("accepts function");
			expect(() => target.and(DropTarget, { accepts: () => true } as never)).toThrow("drop function");
		}
		finally {
			target.remove();
		}
	});

	it("sets accepting, hovering, and draggable for an accepting target", () => {
		const drag = externalDraggable();
		const target = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop: () => {},
		});

		try {
			drag.receiver.start({
				position: { x: 0, y: 0 },
				source: { type: "external" },
			});
			drag.receiver.move({
				position: { x: 1, y: 1 },
				target,
			});

			expect(target.dropTarget.accepting.value).toBe(true);
			expect(target.dropTarget.hovering.value).toBe(true);
			expect(target.dropTarget.draggable.value).toBe(drag.component);
		}
		finally {
			drag.component.remove();
			target.remove();
		}
	});

	it("refreshes accepting while the drag moves", () => {
		const drag = externalDraggable();
		const target = mountedComponent().and(DropTarget, {
			accepts: ({ position }) => position.x > 5,
			drop: () => {},
		});

		try {
			drag.receiver.start({
				position: { x: 0, y: 0 },
				source: { type: "external" },
			});
			expect(target.dropTarget.accepting.value).toBe(false);

			drag.receiver.move({
				position: { x: 10, y: 0 },
				target,
			});

			expect(target.dropTarget.accepting.value).toBe(true);
			expect(target.dropTarget.hovering.value).toBe(true);
		}
		finally {
			drag.component.remove();
			target.remove();
		}
	});

	it("prefers the deepest hovered component from an explicit target", () => {
		const drag = externalDraggable();
		const outerDrop = vi.fn(() => true);
		const innerDrop = vi.fn(() => true);
		const outer = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop: outerDrop,
		});
		const inner = Component("div").and(DropTarget, {
			accepts: () => true,
			drop: innerDrop,
		});

		try {
			outer.append(inner);
			const resolved = resolveDropTarget(drag.component, { x: 0, y: 0 }, { type: "external" }, inner);

			expect(resolved?.target).toBe(inner);
			expect(resolved?.drop()).toBeUndefined();
			expect(innerDrop).toHaveBeenCalledOnce();
			expect(outerDrop).not.toHaveBeenCalled();
		}
		finally {
			drag.component.remove();
			outer.remove();
		}
	});

	it("prefers the deepest hovered component from querySelectorAll hover order", () => {
		const drag = externalDraggable();
		const outerDrop = vi.fn(() => true);
		const innerDrop = vi.fn(() => true);
		const outer = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop: outerDrop,
		});
		const inner = Component("div").and(DropTarget, {
			accepts: () => true,
			drop: innerDrop,
		});
		const querySelectorAll = vi.spyOn(document, "querySelectorAll").mockImplementation((selector: string) => {
			if (selector === ":hover") {
				return [outer.element, inner.element] as unknown as NodeListOf<Element>;
			}

			return [] as unknown as NodeListOf<Element>;
		});

		try {
			outer.append(inner);
			const resolved = resolveDropTarget(drag.component, { x: 0, y: 0 }, { type: "pointer", pointerId: 1, pointerType: "mouse" });

			expect(resolved?.target).toBe(inner);
			expect(resolved?.drop()).toBeUndefined();
			expect(innerDrop).toHaveBeenCalledOnce();
			expect(outerDrop).not.toHaveBeenCalled();
		}
		finally {
			querySelectorAll.mockRestore();
			drag.component.remove();
			outer.remove();
		}
	});

	it("treats an accepting DropTarget as handled regardless of drop return value", () => {
		const drag = externalDraggable();
		const trueDrop = vi.fn(() => true);
		const falseDrop = vi.fn(() => false);
		const voidDrop = vi.fn(() => undefined);
		const handled = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop: trueDrop,
		});
		const falseReturn = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop: falseDrop,
		});
		const voidReturn = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop: voidDrop,
		});

		try {
			expect(handleDropTargetDrop(null, drag.component, { x: 0, y: 0 }, { type: "external" }, handled)).toBe(true);
			expect(handleDropTargetDrop(null, drag.component, { x: 0, y: 0 }, { type: "external" }, falseReturn)).toBe(true);
			expect(handleDropTargetDrop(null, drag.component, { x: 0, y: 0 }, { type: "external" }, voidReturn)).toBe(true);
			expect(trueDrop).toHaveBeenCalledOnce();
			expect(falseDrop).toHaveBeenCalledOnce();
			expect(voidDrop).toHaveBeenCalledOnce();
		}
		finally {
			drag.component.remove();
			handled.remove();
			falseReturn.remove();
			voidReturn.remove();
		}
	});

	it("does not install document listeners when resolving without registered targets", () => {
		const drag = externalDraggable();
		const addEventListener = vi.spyOn(document, "addEventListener");

		try {
			expect(resolveDropTarget(drag.component, { x: 0, y: 0 }, { type: "external" })).toBeNull();
			expect(addEventListener).not.toHaveBeenCalledWith("DragStart", expect.any(Function));
			expect(addEventListener).not.toHaveBeenCalledWith("DragMove", expect.any(Function));
			expect(addEventListener).not.toHaveBeenCalledWith("DragEnd", expect.any(Function));
			expect(addEventListener).not.toHaveBeenCalledWith("DragCancel", expect.any(Function));
		}
		finally {
			addEventListener.mockRestore();
			drag.component.remove();
		}
	});

	it("unregisters disposed targets", () => {
		const drag = externalDraggable();
		const drop = vi.fn(() => true);
		const target = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop,
		});

		target.remove();

		try {
			expect(resolveDropTarget(drag.component, { x: 0, y: 0 }, { type: "external" }, target)).toBeNull();
			expect(drop).not.toHaveBeenCalled();
		}
		finally {
			drag.component.remove();
		}
	});
});
