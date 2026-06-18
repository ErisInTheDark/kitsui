import { describe, expect, it, vi } from "vitest";
import { Component, Draggable, type DragInputReceiver } from "../../src";

function mountedComponent<NAME extends keyof HTMLElementTagNameMap = "div"> (tagName: NAME = "div" as NAME): Component<HTMLElementTagNameMap[NAME]> {
	return Component(tagName).appendTo(document.body);
}

function pointerEvent (type: string, init: {
	button?: number;
	clientX: number;
	clientY: number;
	pointerId?: number;
	pointerType?: string;
}): PointerEvent {
	const event = new MouseEvent(type, {
		bubbles: true,
		button: init.button ?? 0,
		clientX: init.clientX,
		clientY: init.clientY,
	}) as PointerEvent;

	Object.defineProperties(event, {
		pointerId: { value: init.pointerId ?? 1 },
		pointerType: { value: init.pointerType ?? "mouse" },
	});

	return event;
}

function mockRect (element: HTMLElement, rect: Partial<DOMRectReadOnly>): void {
	const fullRect = {
		bottom: rect.bottom ?? ((rect.top ?? 0) + (rect.height ?? 0)),
		height: rect.height ?? 0,
		left: rect.left ?? 0,
		right: rect.right ?? ((rect.left ?? 0) + (rect.width ?? 0)),
		toJSON: () => ({}),
		top: rect.top ?? 0,
		width: rect.width ?? 0,
		x: rect.x ?? rect.left ?? 0,
		y: rect.y ?? rect.top ?? 0,
	} satisfies DOMRectReadOnly;

	Object.defineProperty(element, "getBoundingClientRect", {
		configurable: true,
		value: () => fullRect,
	});
}

describe("Draggable", () => {
	it("adds a draggable namespace and is idempotent", () => {
		const component = mountedComponent().and(Draggable);
		const first = component.draggable;
		const composed = component.and(Draggable, { threshold: 100 });

		try {
			expect(composed).toBe(component);
			expect(composed.draggable).toBe(first);
			expect(first.phase.value).toBe("idle");
			expect(first.active.value).toBe(false);
			expect(first.pending.value).toBe(false);
		}
		finally {
			component.remove();
		}
	});

	it("uses pointer input with pending and threshold-based drag start", () => {
		const component = mountedComponent().and(Draggable, { threshold: 5 });

		try {
			component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));

			expect(component.draggable.phase.value).toBe("pending");
			expect(component.draggable.pending.value).toBe(true);

			document.dispatchEvent(pointerEvent("pointermove", { clientX: 3, clientY: 4 }));

			expect(component.draggable.phase.value, "movement below threshold should stay pending").toBe("dragging");
			expect(component.draggable.active.value).toBe(true);
			expect(component.draggable.position.value?.offset).toEqual({ x: 3, y: 4 });
		}
		finally {
			component.remove();
		}
	});

	it("keeps movement below threshold pending", () => {
		const component = mountedComponent().and(Draggable, { threshold: 6 });

		try {
			component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 3, clientY: 4 }));

			expect(component.draggable.phase.value).toBe("pending");
			expect(component.draggable.active.value).toBe(false);
		}
		finally {
			component.remove();
		}
	});

	it("respects canStart and exposes cancel/end controls", () => {
		const rejected = mountedComponent().and(Draggable, {
			canStart: () => false,
		});
		const accepted = mountedComponent().and(Draggable);

		try {
			rejected.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			expect(rejected.draggable.phase.value).toBe("idle");

			accepted.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			expect(accepted.draggable.phase.value).toBe("dragging");

			accepted.draggable.cancel();
			expect(accepted.draggable.phase.value).toBe("idle");

			accepted.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			accepted.draggable.end();
			expect(accepted.draggable.phase.value).toBe("idle");
		}
		finally {
			rejected.remove();
			accepted.remove();
		}
	});

	it("cleans pointer capture state when the component is removed", () => {
		const component = mountedComponent().and(Draggable, { threshold: 10 });

		component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
		component.remove();

		expect(component.draggable.phase.disposed).toBe(true);
		expect(() => {
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 10 }));
		}).not.toThrow();
	});

	it("dispatches DragCancel when the component is removed during a drag", () => {
		const component = mountedComponent().and(Draggable);
		const cancel = vi.fn();

		component.element.addEventListener("DragCancel", cancel);
		component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
		component.remove();

		expect(cancel).toHaveBeenCalledOnce();
	});

	it("does not start when DragStartRequested removes the component", () => {
		const component = mountedComponent().and(Draggable);

		component.element.addEventListener("DragStartRequested", () => {
			component.remove();
		});

		expect(() => {
			component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
		}).not.toThrow();
		expect(component.draggable.phase.disposed).toBe(true);
	});

	it("does not dispatch DragMove after DragStart cancels the drag", () => {
		const component = mountedComponent().and(Draggable, { threshold: 4 });
		const events: string[] = [];

		try {
			component.element.addEventListener("DragStart", () => {
				events.push("start");
				component.draggable.cancel();
			});
			component.element.addEventListener("DragMove", () => {
				events.push("move");
			});

			component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 4, clientY: 0 }));

			expect(events).toEqual(["start"]);
			expect(component.draggable.phase.value).toBe("idle");
		}
		finally {
			component.remove();
		}
	});

	it("does not leave pointer tracking when immediate DragStart cancels the drag", () => {
		const component = mountedComponent().and(Draggable);
		const move = vi.fn();

		try {
			component.element.addEventListener("DragStart", () => {
				component.draggable.cancel();
			});
			component.element.addEventListener("DragMove", move);

			component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 0 }));

			expect(component.draggable.phase.value).toBe("idle");
			expect(move).not.toHaveBeenCalled();
		}
		finally {
			component.remove();
		}
	});

	it("continues pointer tracking when DragStart detaches the source element", () => {
		const component = mountedComponent("button").and(Draggable);
		const move = vi.fn();
		const end = vi.fn();
		const capture = vi.fn();

		Object.defineProperty(component.element, "setPointerCapture", {
			configurable: true,
			value: vi.fn(() => {
				throw new Error("source capture should not be used");
			}),
		});
		Object.defineProperty(document.documentElement, "setPointerCapture", {
			configurable: true,
			value: capture,
		});

		try {
			component.element.addEventListener("DragStart", () => {
				component.element.remove();
			});
			component.element.addEventListener("DragMove", move);
			component.element.addEventListener("DragEnd", end);

			expect(() => {
				component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			}).not.toThrow();

			document.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 0 }));
			document.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 0 }));

			expect(capture).toHaveBeenCalledWith(1);
			expect(move).toHaveBeenCalledOnce();
			expect(end).toHaveBeenCalledOnce();
			expect(component.draggable.phase.value).toBe("idle");
		}
		finally {
			component.remove();
		}
	});

	it("creates an inert sanitized clone preview and moves it with the pointer", () => {
		const component = mountedComponent("button").text.set("Drag me").and(Draggable);
		component.element.id = "source-id";
		component.element.setAttribute("onclick", "alert('nope')");
		mockRect(component.element, { height: 20, left: 5, top: 10, width: 80 });

		try {
			component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 15, clientY: 18 }));

			const preview = component.draggable.preview.value;
			expect(preview).toBeDefined();
			expect(preview).not.toBe(component);
			expect(preview!.element.textContent).toBe("Drag me");
			expect(preview!.element.id).toBe("");
			expect(preview!.element.getAttribute("onclick")).toBeNull();
			expect(preview!.element.hasAttribute("inert")).toBe(true);
			expect(preview!.element.getAttribute("aria-hidden")).toBe("true");
			expect(preview!.element.style.position).toBe("fixed");
			expect(preview!.element.style.pointerEvents).toBe("none");
			expect(preview!.element.style.left).toBe("5px");
			expect(preview!.element.style.top).toBe("10px");
			expect(preview!.element.style.width).toBe("80px");
			expect(preview!.element.style.height).toBe("20px");
			expect(preview!.element.parentElement).toBe(document.body);

			document.dispatchEvent(pointerEvent("pointermove", { clientX: 25, clientY: 28 }));

			expect(preview!.element.style.left).toBe("15px");
			expect(preview!.element.style.top).toBe("20px");

			document.dispatchEvent(pointerEvent("pointerup", { clientX: 25, clientY: 28 }));

			expect(component.draggable.preview.value).toBeNull();
			expect(preview!.disposed).toBe(true);
		}
		finally {
			component.remove();
		}
	});

	it("supports custom and disabled drag previews", () => {
		const customPreview = Component("strong").text.set("Custom preview");
		const custom = mountedComponent("button").and(Draggable, {
			renderPreview: () => customPreview,
		});
		const disabled = mountedComponent("button").and(Draggable, {
			renderPreview: false,
		});

		try {
			custom.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			expect(custom.draggable.preview.value).toBe(customPreview);
			custom.draggable.cancel();
			expect(customPreview.disposed).toBe(true);

			disabled.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			expect(disabled.draggable.preview.value).toBeNull();
		}
		finally {
			custom.remove();
			disabled.remove();
		}
	});

	it("rejects placed custom drag previews", () => {
		const placed = mountedComponent("strong");
		const component = mountedComponent("button").and(Draggable, {
			renderPreview: () => placed,
		});

		try {
			expect(() => {
				component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			}).toThrow("Draggable preview must return an ownerless, unplaced Component.");
		}
		finally {
			component.remove();
			placed.remove();
		}
	});

	it("cancels on stable capture lostpointercapture without releasing capture again", () => {
		const component = mountedComponent().and(Draggable);
		const cancel = vi.fn();
		const captureElement = document.documentElement;

		Object.defineProperty(captureElement, "setPointerCapture", {
			configurable: true,
			value: vi.fn(),
		});
		Object.defineProperty(captureElement, "releasePointerCapture", {
			configurable: true,
			value: vi.fn(() => {
				throw new Error("capture already lost");
			}),
		});
		component.element.addEventListener("DragCancel", cancel);

		try {
			component.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));

			expect(() => {
				captureElement.dispatchEvent(pointerEvent("lostpointercapture", { clientX: 0, clientY: 0 }));
			}).not.toThrow();
			expect(cancel).toHaveBeenCalledOnce();
			expect(component.draggable.phase.value).toBe("idle");
		}
		finally {
			component.remove();
		}
	});

	it("supports external adapters and dispatches passive drag events in order", () => {
		let receiver: DragInputReceiver | undefined;
		const cleanup = vi.fn();
		const events: string[] = [];
		const component = mountedComponent().and(Draggable, {
			input: Draggable.Input((_component, nextReceiver) => {
				receiver = nextReceiver;
				return cleanup;
			}),
		});

		try {
			component.element.addEventListener("DragStartRequested", () => events.push("requested"));
			component.element.addEventListener("DragStart", () => events.push("start"));
			component.element.addEventListener("DragMove", () => events.push("move"));
			component.element.addEventListener("DragEnd", () => events.push("end"));

			expect(receiver).toBeDefined();
			expect(receiver!.start({
				position: { x: 1, y: 2 },
				source: { id: "test", type: "external" },
			})).toBe(true);
			receiver!.move({
				position: { x: 4, y: 6 },
			});
			receiver!.end({
				position: { x: 4, y: 6 },
			});

			expect(events).toEqual(["requested", "start", "move", "end"]);
			expect(component.draggable.phase.value).toBe("idle");

			component.remove();
			expect(cleanup).toHaveBeenCalledOnce();
		}
		finally {
			if (!component.disposed) {
				component.remove();
			}
		}
	});

	it("allows only one active drag per document", () => {
		const first = mountedComponent().and(Draggable, { threshold: 10 });
		const second = mountedComponent().and(Draggable);

		try {
			first.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
			second.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));

			expect(first.draggable.phase.value).toBe("pending");
			expect(second.draggable.phase.value).toBe("idle");
		}
		finally {
			first.remove();
			second.remove();
		}
	});
});
