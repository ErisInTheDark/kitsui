import { describe, expect, it, vi } from "vitest";
import { Component, Draggable, DropTarget, Sortable, State, type DragEventDetail, type DragInputReceiver, type DraggableComponent } from "../../src";

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

function sortableOptions<T extends { id: string; label: string }> (rendered: Component[] = []) {
	return {
		key: (item: T) => item.id,
		placeholder: () => Component("i").text.set("placeholder"),
		render: (item: State.Readonly<T>) => {
			const component = Component("div").text.set(item.map(value => value.label));
			rendered.push(component);
			return component;
		},
	};
}

async function flushEffects (): Promise<void> {
	await Promise.resolve();
}

function dragDetail (
	component: DraggableComponent,
	position: { readonly x: number; readonly y: number },
	target?: Component,
): DragEventDetail {
	return {
		component,
		position: {
			current: position,
			delta: { x: 0, y: 0 },
			initial: position,
			offset: { x: 0, y: 0 },
			previous: null,
			source: { type: "external" },
		},
		target,
	};
}

function floatingPreview (label: string, host: Component): HTMLElement | undefined {
	return Array.from(document.body.children).find((element): element is HTMLElement => {
		return element instanceof HTMLElement
			&& element !== host.element
			&& element.textContent === label;
	});
}

describe("Sortable", () => {
	it("adds a sortable namespace, renders raw items, and is idempotent", () => {
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		], sortableOptions(rendered));
		const first = host.sortable;
		const composed = host.and(Sortable, [], sortableOptions());

		try {
			expect(composed.sortable).toBe(first);
			expect(host.element.textContent).toBe("AlphaBeta");
			expect(rendered).toHaveLength(2);
			expect(host.sortable.items.value.map(item => item.id)).toEqual(["a", "b"]);
			expect(host.sortable.preview.value.map(item => item.id)).toEqual(["a", "b"]);
		}
		finally {
			host.remove();
		}
	});

	it("renders and updates state input including mapped readonly input", async () => {
		const owner = mountedComponent();
		const source = State(owner, [
			{ id: "a", label: "Alpha" },
		]);
		const mapped = source.map(items => items.map(item => ({
			...item,
			label: item.label.toUpperCase(),
		})));
		const host = mountedComponent().and(Sortable, mapped, sortableOptions());

		try {
			expect(host.element.textContent).toBe("ALPHA");

			source.set([{ id: "a", label: "Beta" }]);
			await flushEffects();

			expect(host.element.textContent).toBe("BETA");
			expect(host.sortable.items.value[0].label).toBe("BETA");
		}
		finally {
			host.remove();
			owner.remove();
		}
	});

	it("auto-applies Draggable and preserves pre-applied Draggable options", () => {
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
		], {
			key: (item: { id: string }) => item.id,
			placeholder: () => Component("i"),
			render: (item: State.Readonly<{ id: string; label: string }>) => {
				const component = Component("div").and(Draggable, { threshold: 100 }).text.set(item.value.label);
				rendered.push(component);
				return component;
			},
		});

		try {
			const item = rendered[0] as DraggableComponent;
			expect(item.draggable).toBeDefined();

			item.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));

			expect(item.draggable.phase.value, "pre-applied threshold should still win").toBe("pending");
		}
		finally {
			host.remove();
		}
	});

	it("ignores bubbled drag events from nested draggables", () => {
		const child = Component("button").and(Draggable);
		const host = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
		], {
			key: (item: { id: string }) => item.id,
			placeholder: () => Component("i"),
			render: () => Component("div").append(child),
		});

		try {
			child.element.dispatchEvent(new CustomEvent("DragStart", {
				bubbles: true,
				detail: dragDetail(child, { x: 0, y: 0 }),
			}));

			expect(host.sortable.phase.value).toBe("idle");
			expect(host.sortable.dragging.value).toBeNull();
		}
		finally {
			host.remove();
		}
	});

	it("rejects already owned or placed render and placeholder components", () => {
		const owner = mountedComponent();
		const ownedRender = Component("div").appendTo(owner);
		const placedPlaceholder = Component("i").appendTo(owner);

		try {
			expect(() => mountedComponent().and(Sortable, [
				{ id: "a", label: "Alpha" },
			], {
				key: (item: { id: string }) => item.id,
				placeholder: () => Component("i"),
				render: () => ownedRender,
			})).toThrow("ownerless, unplaced");

			const rendered: Component[] = [];
			const host = mountedComponent().and(Sortable, [
				{ id: "a", label: "Alpha" },
			], {
				key: (item: { id: string }) => item.id,
				placeholder: () => placedPlaceholder,
				render: (item: State.Readonly<{ id: string; label: string }>) => {
					const component = Component("div").text.set(item.value.label);
					rendered.push(component);
					return component;
				},
			});

			try {
				expect(() => {
					rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
				}).toThrow("ownerless, unplaced");
			}
			finally {
				host.remove();
			}
		}
		finally {
			owner.remove();
		}
	});

	it("keeps first duplicate keys, ignores later duplicates, and logs", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const host = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
			{ id: "a", label: "Duplicate" },
			{ id: "b", label: "Beta" },
		], sortableOptions());

		try {
			expect(host.sortable.items.value.map(item => item.label)).toEqual(["Alpha", "Beta"]);
			expect(host.element.textContent).toBe("AlphaBeta");
			expect(errorSpy).toHaveBeenCalledWith("Sortable ignored duplicate key a.");
		}
		finally {
			errorSpy.mockRestore();
			host.remove();
		}
	});

	it("commits pointer reorder and removes the placeholder", () => {
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		], sortableOptions(rendered));

		try {
			mockRect(host.element, { height: 40, top: 0, width: 100 });
			mockRect(rendered[0].element, { height: 10, top: 0, width: 100 });
			mockRect(rendered[1].element, { height: 10, top: 10, width: 100 });

			rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 30 }));

			expect(host.sortable.phase.value).toBe("sorting");
			expect(host.sortable.preview.value.map(item => item.id)).toEqual(["b", "a"]);
			expect(host.element.textContent).toContain("placeholder");
			expect(floatingPreview("Alpha", host)).toBeDefined();

			document.dispatchEvent(pointerEvent("pointerup", { clientX: 1, clientY: 30 }));

			expect(host.sortable.items.value.map(item => item.id)).toEqual(["b", "a"]);
			expect(host.sortable.phase.value).toBe("idle");
			expect(host.element.textContent).not.toContain("placeholder");
			expect(floatingPreview("Alpha", host)).toBeUndefined();
		}
		finally {
			host.remove();
		}
	});

	it("reorders with default index keys", () => {
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, ["Alpha", "Beta"], {
			placeholder: () => Component("i").text.set("placeholder"),
			render: (item: State.Readonly<string>) => {
				const component = Component("div").text.set(item);
				rendered.push(component);
				return component;
			},
		});

		try {
			mockRect(host.element, { height: 40, top: 0, width: 100 });
			mockRect(rendered[0].element, { height: 10, top: 0, width: 100 });
			mockRect(rendered[1].element, { height: 10, top: 10, width: 100 });

			rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 30 }));
			document.dispatchEvent(pointerEvent("pointerup", { clientX: 1, clientY: 30 }));

			expect(host.sortable.items.value).toEqual(["Beta", "Alpha"]);
		}
		finally {
			host.remove();
		}
	});

	it("places the placeholder at the preview slot in DOM order", () => {
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
			{ id: "c", label: "Gamma" },
		], sortableOptions(rendered));

		try {
			mockRect(host.element, { height: 60, top: 0, width: 100 });
			mockRect(rendered[0].element, { height: 10, top: 0, width: 100 });
			mockRect(rendered[1].element, { height: 10, top: 10, width: 100 });
			mockRect(rendered[2].element, { height: 10, top: 20, width: 100 });

			rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 16 }));

			expect(host.sortable.preview.value.map(item => item.id)).toEqual(["b", "a", "c"]);
			expect(Array.from(host.element.children).map(element => element.textContent)).toEqual([
				"Beta",
				"placeholder",
				"Gamma",
			]);
			expect(floatingPreview("Alpha", host)).toBeDefined();
		}
		finally {
			host.remove();
		}
	});

	it("removes the placeholder while an accepting DropTarget is hovered", () => {
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		], sortableOptions(rendered));
		const dropTarget = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop: () => {},
		});

		try {
			rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			expect(host.element.textContent).toContain("placeholder");

			rendered[0].element.dispatchEvent(new CustomEvent("DragMove", {
				bubbles: true,
				detail: dragDetail(rendered[0] as DraggableComponent, { x: 20, y: 20 }, dropTarget),
			}));

			expect(host.element.textContent).not.toContain("placeholder");
			expect(host.sortable.preview.value.map(item => item.id)).toEqual(["a", "b"]);
		}
		finally {
			host.remove();
			dropTarget.remove();
		}
	});

	it("keeps an active sort preview when the source changes and the dragged key remains", async () => {
		const owner = mountedComponent();
		const source = State(owner, [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		]);
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, source, sortableOptions(rendered));

		try {
			mockRect(host.element, { height: 60, top: 0, width: 100 });
			mockRect(rendered[0].element, { height: 10, top: 0, width: 100 });
			mockRect(rendered[1].element, { height: 10, top: 10, width: 100 });

			rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 16 }));
			source.set([
				{ id: "a", label: "Alpha" },
				{ id: "b", label: "Beta" },
				{ id: "c", label: "Gamma" },
			]);
			await flushEffects();

			expect(host.sortable.phase.value).toBe("sorting");
			expect(host.sortable.preview.value.map(item => item.id)).toEqual(["b", "a", "c"]);
			expect(host.element.textContent).toContain("placeholder");
		}
		finally {
			host.remove();
			owner.remove();
		}
	});

	it("places new source items by stable neighbors during an active preview", async () => {
		const owner = mountedComponent();
		const source = State(owner, [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
			{ id: "c", label: "Gamma" },
		]);
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, source, sortableOptions(rendered));

		try {
			mockRect(host.element, { height: 60, top: 0, width: 100 });
			mockRect(rendered[0].element, { height: 10, top: 0, width: 100 });
			mockRect(rendered[1].element, { height: 10, top: 10, width: 100 });
			mockRect(rendered[2].element, { height: 10, top: 20, width: 100 });

			rendered[2].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 21 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 0 }));
			source.set([
				{ id: "a", label: "Alpha" },
				{ id: "d", label: "Delta" },
				{ id: "b", label: "Beta" },
				{ id: "c", label: "Gamma" },
			]);
			await flushEffects();

			expect(host.sortable.preview.value.map(item => item.id)).toEqual(["c", "a", "d", "b"]);
		}
		finally {
			host.remove();
			owner.remove();
		}
	});

	it("uses updated dragged item state when the source changes during an active sort", async () => {
		const owner = mountedComponent();
		const source = State(owner, [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		]);
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, source, sortableOptions(rendered));

		try {
			mockRect(host.element, { height: 40, top: 0, width: 100 });
			mockRect(rendered[0].element, { height: 10, top: 0, width: 100 });
			mockRect(rendered[1].element, { height: 10, top: 10, width: 100 });

			rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 30 }));
			source.set([
				{ id: "a", label: "Alpha updated" },
				{ id: "b", label: "Beta" },
			]);
			await flushEffects();

			expect(host.sortable.preview.value.map(item => item.label)).toEqual(["Beta", "Alpha updated"]);

			document.dispatchEvent(pointerEvent("pointerup", { clientX: 1, clientY: 30 }));

			expect(host.sortable.items.value.map(item => item.label)).toEqual(["Beta", "Alpha updated"]);
		}
		finally {
			host.remove();
			owner.remove();
		}
	});

	it("cancels an active sort when the dragged key is removed from the source", async () => {
		const owner = mountedComponent();
		const source = State(owner, [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		]);
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, source, sortableOptions(rendered));

		try {
			rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			source.set([{ id: "b", label: "Beta" }]);
			await flushEffects();

			expect(host.sortable.phase.value).toBe("idle");
			expect(host.sortable.items.value.map(item => item.id)).toEqual(["b"]);
			expect(host.element.textContent).not.toContain("placeholder");
		}
		finally {
			host.remove();
			owner.remove();
		}
	});

	it("cancel leaves committed items unchanged and removes the placeholder", () => {
		const rendered: Component[] = [];
		const host = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		], sortableOptions(rendered));

		try {
			mockRect(host.element, { height: 40, top: 0, width: 100 });
			mockRect(rendered[0].element, { height: 10, top: 0, width: 100 });
			mockRect(rendered[1].element, { height: 10, top: 10, width: 100 });

			rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 30 }));
			host.sortable.cancel();

			expect(host.sortable.items.value.map(item => item.id)).toEqual(["a", "b"]);
			expect(host.sortable.phase.value).toBe("idle");
			expect(host.element.textContent).not.toContain("placeholder");
			expect(Array.from(host.element.children).map(element => element.textContent)).toEqual(["Alpha", "Beta"]);
			expect(floatingPreview("Alpha", host)).toBeUndefined();
		}
		finally {
			host.remove();
		}
	});

	it("lets any accepting DropTarget suppress Sortable fallback", () => {
		const rendered: Component[] = [];
		const trueReturningDrop = vi.fn(() => true);
		const falseReturningDrop = vi.fn(() => false);
		const host = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		], sortableOptions(rendered));
		const trueReturningTarget = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop: trueReturningDrop,
		});
		const falseReturningTarget = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop: falseReturningDrop,
		});

		try {
			mockRect(host.element, { height: 40, top: 0, width: 100 });
			mockRect(rendered[0].element, { height: 10, top: 0, width: 100 });
			mockRect(rendered[1].element, { height: 10, top: 10, width: 100 });

			rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			rendered[0].element.dispatchEvent(new CustomEvent("DragEnd", {
				bubbles: true,
				detail: dragDetail(rendered[0] as DraggableComponent, { x: 20, y: 20 }, trueReturningTarget),
			}));

			expect(trueReturningDrop).toHaveBeenCalledOnce();
			expect(host.sortable.items.value.map(item => item.id)).toEqual(["a", "b"]);
			(rendered[0] as DraggableComponent).draggable.cancel();

			rendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 30 }));
			rendered[0].element.dispatchEvent(new CustomEvent("DragEnd", {
				bubbles: true,
				detail: dragDetail(rendered[0] as DraggableComponent, { x: 1, y: 30 }, falseReturningTarget),
			}));

			expect(falseReturningDrop).toHaveBeenCalledOnce();
			expect(host.sortable.items.value.map(item => item.id)).toEqual(["a", "b"]);
		}
		finally {
			host.remove();
			trueReturningTarget.remove();
			falseReturningTarget.remove();
		}
	});

	it("does not commit a stale sortable target after a claiming DropTarget hover", () => {
		const transfer = Sortable.Transfer<{ id: string; label: string }>("items");
		const sourceRendered: Component[] = [];
		const source = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
		], {
			...sortableOptions(sourceRendered),
			transfer,
		});
		const target = mountedComponent().and(Sortable, [] as Array<{ id: string; label: string }>, {
			...sortableOptions(),
			transfer,
		});
		const claimingDropTarget = mountedComponent().and(DropTarget, {
			accepts: () => true,
			drop: () => false,
		});

		try {
			mockRect(source.element, { height: 20, top: 0, width: 100 });
			mockRect(target.element, { height: 20, top: 30, width: 100 });
			mockRect(sourceRendered[0].element, { height: 10, top: 0, width: 100 });

			sourceRendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 35 }));
			sourceRendered[0].element.dispatchEvent(new CustomEvent("DragMove", {
				bubbles: true,
				detail: dragDetail(sourceRendered[0] as DraggableComponent, { x: 1, y: 60 }, claimingDropTarget),
			}));
			sourceRendered[0].element.dispatchEvent(new CustomEvent("DragEnd", {
				bubbles: true,
				detail: dragDetail(sourceRendered[0] as DraggableComponent, { x: 1, y: 60 }, claimingDropTarget),
			}));

			expect(source.sortable.items.value.map(item => item.id)).toEqual(["a"]);
			expect(target.sortable.items.value).toEqual([]);
		}
		finally {
			source.remove();
			target.remove();
			claimingDropTarget.remove();
		}
	});

	it("supports compatible transfer tokens and rejects incompatible ones", () => {
		const compatible = Sortable.Transfer<{ id: string; label: string }>("items");
		const sourceRendered: Component[] = [];
		const targetRendered: Component[] = [];
		const source = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
		], {
			...sortableOptions(sourceRendered),
			transfer: compatible,
		});
		const target = mountedComponent().and(Sortable, [] as Array<{ id: string; label: string }>, {
			...sortableOptions(targetRendered),
			transfer: compatible,
		});
		const rejected = mountedComponent().and(Sortable, [] as Array<{ id: string; label: string }>, {
			...sortableOptions(),
			transfer: Sortable.Transfer<{ id: string; label: string }>("other"),
		});

		try {
			mockRect(source.element, { height: 20, top: 0, width: 100 });
			mockRect(target.element, { height: 20, top: 30, width: 100 });
			mockRect(rejected.element, { height: 20, top: 60, width: 100 });
			mockRect(sourceRendered[0].element, { height: 10, top: 0, width: 100 });

			sourceRendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 35 }));

			expect(target.sortable.phase.value).toBe("sorting");
			expect(target.sortable.dragging.value).toBe(sourceRendered[0]);
			expect(target.sortable.preview.value.map(item => item.id)).toEqual(["a"]);

			document.dispatchEvent(pointerEvent("pointerup", { clientX: 1, clientY: 35 }));

			expect(source.sortable.items.value).toEqual([]);
			expect(target.sortable.items.value.map(item => item.id)).toEqual(["a"]);
			expect(target.sortable.phase.value).toBe("idle");
			expect(target.sortable.dragging.value).toBeNull();

			targetRendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 35 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 65 }));
			document.dispatchEvent(pointerEvent("pointerup", { clientX: 1, clientY: 65 }));

			expect(rejected.sortable.items.value).toEqual([]);
			expect(target.sortable.items.value.map(item => item.id)).toEqual(["a"]);
		}
		finally {
			source.remove();
			target.remove();
			rejected.remove();
		}
	});

	it("rejects cross-sortable transfer when the target already has the dragged key", () => {
		const transfer = Sortable.Transfer<{ id: string; label: string }>("items");
		const sourceRendered: Component[] = [];
		const source = mountedComponent().and(Sortable, [
			{ id: "a", label: "Source Alpha" },
		], {
			...sortableOptions(sourceRendered),
			transfer,
		});
		const target = mountedComponent().and(Sortable, [
			{ id: "a", label: "Target Alpha" },
		], {
			...sortableOptions(),
			transfer,
		});

		try {
			mockRect(source.element, { height: 20, top: 0, width: 100 });
			mockRect(target.element, { height: 20, top: 30, width: 100 });
			mockRect(sourceRendered[0].element, { height: 10, top: 0, width: 100 });

			sourceRendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 35 }));
			document.dispatchEvent(pointerEvent("pointerup", { clientX: 1, clientY: 35 }));

			expect(source.sortable.items.value.map(item => item.label)).toEqual(["Source Alpha"]);
			expect(target.sortable.items.value.map(item => item.label)).toEqual(["Target Alpha"]);
		}
		finally {
			source.remove();
			target.remove();
		}
	});

	it("respects canTransferOut and canTransferIn policy hooks", () => {
		const transfer = Sortable.Transfer<{ id: string; label: string }>("items");
		const blockedOutRendered: Component[] = [];
		const blockedInRendered: Component[] = [];
		const blockedOutSource = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
		], {
			...sortableOptions(blockedOutRendered),
			canTransferOut: () => false,
			transfer,
		});
		const blockedOutTarget = mountedComponent().and(Sortable, [] as Array<{ id: string; label: string }>, {
			...sortableOptions(),
			transfer,
		});
		const blockedInSource = mountedComponent().and(Sortable, [
			{ id: "b", label: "Beta" },
		], {
			...sortableOptions(blockedInRendered),
			transfer,
		});
		const blockedInTarget = mountedComponent().and(Sortable, [] as Array<{ id: string; label: string }>, {
			...sortableOptions(),
			canTransferIn: () => false,
			transfer,
		});

		try {
			mockRect(blockedOutSource.element, { height: 20, top: 0, width: 100 });
			mockRect(blockedOutTarget.element, { height: 20, top: 30, width: 100 });
			mockRect(blockedOutRendered[0].element, { height: 10, top: 0, width: 100 });

			blockedOutRendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 35 }));
			document.dispatchEvent(pointerEvent("pointerup", { clientX: 1, clientY: 35 }));

			expect(blockedOutSource.sortable.items.value.map(item => item.id)).toEqual(["a"]);
			expect(blockedOutTarget.sortable.items.value).toEqual([]);

			mockRect(blockedInSource.element, { height: 20, top: 60, width: 100 });
			mockRect(blockedInTarget.element, { height: 20, top: 90, width: 100 });
			mockRect(blockedInRendered[0].element, { height: 10, top: 60, width: 100 });

			blockedInRendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 61 }));
			document.dispatchEvent(pointerEvent("pointermove", { clientX: 1, clientY: 95 }));
			document.dispatchEvent(pointerEvent("pointerup", { clientX: 1, clientY: 95 }));

			expect(blockedInSource.sortable.items.value.map(item => item.id)).toEqual(["b"]);
			expect(blockedInTarget.sortable.items.value).toEqual([]);
		}
		finally {
			blockedOutSource.remove();
			blockedOutTarget.remove();
			blockedInSource.remove();
			blockedInTarget.remove();
		}
	});

	it("allows active sorts in separate documents", () => {
		const otherDocument = document.implementation.createHTMLDocument("other");
		const firstRendered: Component[] = [];
		const secondRendered: Component[] = [];
		const first = mountedComponent().and(Sortable, [
			{ id: "a", label: "Alpha" },
		], sortableOptions(firstRendered));
		const secondHost = Component(otherDocument.createElement("div"));
		otherDocument.body.append(secondHost.element);
		const second = secondHost.and(Sortable, [
			{ id: "b", label: "Beta" },
		], {
			key: (item: { id: string }) => item.id,
			placeholder: () => Component(otherDocument.createElement("i")).text.set("placeholder"),
			render: (item: State.Readonly<{ id: string; label: string }>) => {
				const component = Component(otherDocument.createElement("div")).text.set(item.map(value => value.label));
				secondRendered.push(component);
				return component;
			},
		});

		try {
			firstRendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
			secondRendered[0].element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));

			expect(first.sortable.phase.value).toBe("sorting");
			expect(second.sortable.phase.value).toBe("sorting");
			expect(first.sortable.dragging.value).toBe(firstRendered[0]);
			expect(second.sortable.dragging.value).toBe(secondRendered[0]);
		}
		finally {
			first.remove();
			second.remove();
		}
	});
});
