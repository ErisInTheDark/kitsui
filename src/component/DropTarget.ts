import { Component, type ComponentBuilderFunction } from "./Component";
import { State, type CleanupFunction } from "../state/State";
import type {
	DragInputSource,
	DragPoint,
	DraggableExtensions,
	DragEventDetail,
} from "./Draggable";

export interface DropTargetExtensions {
	readonly dropTarget: DropTarget;
}

export interface DropTarget {
	readonly accepting: State.Readonly<boolean>;
	readonly draggable: State.Readonly<(Component & DraggableExtensions) | null>;
	readonly hovering: State.Readonly<boolean>;
	dispose (): void;
}

export interface DropTargetContext<
	TTarget extends Component = Component,
	TDraggable extends Component & DraggableExtensions = Component & DraggableExtensions,
> {
	readonly draggable: TDraggable;
	readonly position: DragPoint;
	readonly source: DragInputSource;
	readonly target: TTarget & DropTargetExtensions;
}

export interface DropTargetOptions<
	TTarget extends Component = Component,
	TDraggable extends Component & DraggableExtensions = Component & DraggableExtensions,
> {
	accepts (context: DropTargetContext<TTarget, TDraggable>): boolean;
	drop (context: DropTargetContext<TTarget, TDraggable>): void;
}

export interface ResolvedDropTarget {
	readonly controller: DropTargetController;
	readonly target: Component & DropTargetExtensions;
	drop (): void;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

const targetsByDocument = new WeakMap<Document, Set<DropTargetController>>();
const documentCleanups = new WeakMap<Document, CleanupFunction>();
const activeHoverByDocument = new WeakMap<Document, DropTargetController>();
const handledDropEvents = new WeakMap<Event, boolean>();

function isPointInRect (point: DragPoint, rect: DOMRectReadOnly): boolean {
	return point.x >= rect.left
		&& point.x <= rect.right
		&& point.y >= rect.top
		&& point.y <= rect.bottom;
}

function getDropTargetController (component: Component | null | undefined): DropTargetController | null {
	return ((component as Partial<DropTargetExtensions> | null | undefined)?.dropTarget as DropTargetController | undefined) ?? null;
}

function contextFor (
	controller: DropTargetController,
	draggable: Component & DraggableExtensions,
	position: DragPoint,
	source: DragInputSource,
): DropTargetContext {
	return {
		draggable,
		position,
		source,
		target: controller.component,
	};
}

function installDocumentListeners (documentRef: Document): void {
	if (documentCleanups.has(documentRef)) {
		return;
	}

	const handleDragStart = (event: Event) => {
		const detail = (event as CustomEvent<DragEventDetail>).detail;
		if (!detail) {
			return;
		}

		syncAcceptingTargets(detail.component.element.ownerDocument, detail.component, detail.position.current, detail.position.source);
	};
	const handleDragMove = (event: Event) => {
		const detail = (event as CustomEvent<DragEventDetail>).detail;
		if (!detail) {
			return;
		}

		syncAcceptingTargets(detail.component.element.ownerDocument, detail.component, detail.position.current, detail.position.source);
		const resolved = resolveDropTarget(detail.component, detail.position.current, detail.position.source, detail.target);
		setActiveDropTarget(detail.component.element.ownerDocument, resolved?.controller ?? null, detail.component);
	};
	const handleDragEnd = (event: Event) => {
		const detail = (event as CustomEvent<DragEventDetail>).detail;
		if (!detail) {
			return;
		}

		const handled = handleDropTargetDrop(event, detail.component, detail.position.current, detail.position.source, detail.target);
		handledDropEvents.set(event, handled);
		clearDropTargetState(detail.component.element.ownerDocument);
	};
	const handleDragCancel = (event: Event) => {
		const detail = (event as CustomEvent<DragEventDetail>).detail;
		if (!detail) {
			return;
		}

		clearDropTargetState(detail.component.element.ownerDocument);
	};

	documentRef.addEventListener("DragStart", handleDragStart);
	documentRef.addEventListener("DragMove", handleDragMove);
	documentRef.addEventListener("DragEnd", handleDragEnd);
	documentRef.addEventListener("DragCancel", handleDragCancel);
	documentCleanups.set(documentRef, () => {
		documentRef.removeEventListener("DragStart", handleDragStart);
		documentRef.removeEventListener("DragMove", handleDragMove);
		documentRef.removeEventListener("DragEnd", handleDragEnd);
		documentRef.removeEventListener("DragCancel", handleDragCancel);
		documentCleanups.delete(documentRef);
	});
}

function getRegisteredTargets (documentRef: Document): Set<DropTargetController> {
	let targets = targetsByDocument.get(documentRef);

	if (!targets) {
		targets = new Set();
		targetsByDocument.set(documentRef, targets);
		installDocumentListeners(documentRef);
	}

	return targets;
}

function peekRegisteredTargets (documentRef: Document): Set<DropTargetController> | undefined {
	return targetsByDocument.get(documentRef);
}

function syncAcceptingTargets (
	documentRef: Document,
	draggable: Component & DraggableExtensions,
	position: DragPoint,
	source: DragInputSource,
): void {
	for (const target of peekRegisteredTargets(documentRef) ?? []) {
		target.setAccepting(target.accepts(draggable, position, source));
	}
}

function hoveredDropTargets (documentRef: Document): DropTargetController[] {
	const hovered: DropTargetController[] = [];

	try {
		for (const element of Array.from(documentRef.querySelectorAll(":hover")).reverse()) {
			if (!(element instanceof HTMLElement)) {
				continue;
			}

			const controller = getDropTargetController(element.component);
			if (controller) {
				hovered.push(controller);
			}
		}
	} catch {
		// Some DOM implementations do not support :hover in querySelectorAll.
	}

	return hovered;
}

function targetFromExplicitComponent (component: Component | undefined): DropTargetController | null {
	let current: Node | null = component?.element ?? null;

	while (current) {
		if (current instanceof HTMLElement) {
			const controller = getDropTargetController(current.component);
			if (controller) {
				return controller;
			}
		}

		current = current.parentNode;
	}

	return null;
}

export function resolveDropTarget (
	draggable: Component & DraggableExtensions,
	position: DragPoint,
	source: DragInputSource,
	explicitTarget?: Component,
): ResolvedDropTarget | null {
	const documentRef = draggable.element.ownerDocument;
	const candidates: DropTargetController[] = [];
	const explicit = targetFromExplicitComponent(explicitTarget);

	if (explicit) {
		candidates.push(explicit);
	}

	candidates.push(...hoveredDropTargets(documentRef));

	const elementAtPoint = documentRef.elementFromPoint?.(position.x, position.y);
	if (elementAtPoint instanceof HTMLElement) {
		const pointTarget = targetFromExplicitComponent(elementAtPoint.component);
		if (pointTarget) {
			candidates.push(pointTarget);
		}
	}

	for (const candidate of candidates) {
		if (candidate.accepts(draggable, position, source)) {
			return candidate.toResolved(draggable, position, source);
		}
	}

	const targets = [...(peekRegisteredTargets(documentRef) ?? [])].reverse();

	for (const target of targets) {
		if (!isPointInRect(position, target.component.element.getBoundingClientRect())) {
			continue;
		}

		if (target.accepts(draggable, position, source)) {
			return target.toResolved(draggable, position, source);
		}
	}

	return null;
}

export function setActiveDropTarget (
	documentRef: Document,
	controller: DropTargetController | null,
	draggable: (Component & DraggableExtensions) | null,
): void {
	const previous = activeHoverByDocument.get(documentRef);

	if (previous && previous !== controller) {
		previous.setHovering(false, null);
	}

	if (!controller) {
		activeHoverByDocument.delete(documentRef);
		return;
	}

	activeHoverByDocument.set(documentRef, controller);
	controller.setHovering(true, draggable);
}

export function clearDropTargetState (documentRef: Document): void {
	const previous = activeHoverByDocument.get(documentRef);
	previous?.setHovering(false, null);
	activeHoverByDocument.delete(documentRef);

	for (const target of peekRegisteredTargets(documentRef) ?? []) {
		target.setAccepting(false);
	}
}

export function handleDropTargetDrop (
	event: Event | null,
	draggable: Component & DraggableExtensions,
	position: DragPoint,
	source: DragInputSource,
	explicitTarget?: Component,
): boolean {
	if (event && handledDropEvents.has(event)) {
		return handledDropEvents.get(event) ?? false;
	}

	const resolved = resolveDropTarget(draggable, position, source, explicitTarget);
	const handled = Boolean(resolved);
	resolved?.drop();

	if (event) {
		handledDropEvents.set(event, handled);
	}

	return handled;
}

export class DropTargetController implements DropTarget {
	readonly accepting: State<boolean>;
	readonly draggable: State<(Component & DraggableExtensions) | null>;
	readonly hovering: State<boolean>;

	private cleanupRegistration: CleanupFunction = noop;
	private disposedValue = false;

	constructor (
		readonly component: Component & DropTargetExtensions,
		private readonly options: DropTargetOptions,
	) {
		this.accepting = State(component, false);
		this.draggable = State<(Component & DraggableExtensions) | null>(component, null);
		this.hovering = State(component, false);

		const documentRef = component.element.ownerDocument;
		const targets = getRegisteredTargets(documentRef);
		targets.add(this);
		this.cleanupRegistration = () => {
			targets.delete(this);
			if (activeHoverByDocument.get(documentRef) === this) {
				activeHoverByDocument.delete(documentRef);
			}

			if (!this.component.disposed) {
				this.setAccepting(false);
				this.setHovering(false, null);
			}

			if (targets.size === 0) {
				targetsByDocument.delete(documentRef);
				documentCleanups.get(documentRef)?.();
			}
		};
		component.onCleanup(() => {
			this.dispose();
		});
	}

	accepts (
		draggable: Component & DraggableExtensions,
		position: DragPoint,
		source: DragInputSource,
	): boolean {
		return this.options.accepts(contextFor(this, draggable, position, source));
	}

	dispose (): void {
		if (this.disposedValue) {
			return;
		}

		this.disposedValue = true;
		this.cleanupRegistration();
		this.cleanupRegistration = noop;
	}

	setAccepting (accepting: boolean): void {
		if (this.accepting.disposed) {
			return;
		}

		this.accepting.set(accepting);
	}

	setHovering (hovering: boolean, draggable: (Component & DraggableExtensions) | null): void {
		if (this.hovering.disposed || this.draggable.disposed) {
			return;
		}

		this.hovering.set(hovering);
		this.draggable.set(hovering ? draggable : null);
	}

	toResolved (
		draggable: Component & DraggableExtensions,
		position: DragPoint,
		source: DragInputSource,
	): ResolvedDropTarget {
		return {
			controller: this,
			drop: () => {
				this.options.drop(contextFor(this, draggable, position, source));
			},
			target: this.component,
		};
	}
}

type DropTargetConstructor = ComponentBuilderFunction<[DropTargetOptions], Component & DropTargetExtensions>;

export const DropTarget = function DropTarget (
	this: Component | void,
	options: DropTargetOptions,
): Component & DropTargetExtensions {
	if (!options || typeof options.accepts !== "function") {
		throw new TypeError("DropTarget requires an accepts function.");
	}

	if (typeof options.drop !== "function") {
		throw new TypeError("DropTarget requires a drop function.");
	}

	const component = Component(this ?? "div", DropTarget) as Component & Partial<DropTargetExtensions>;

	if (component.dropTarget) {
		return component as Component & DropTargetExtensions;
	}

	return component.extend<DropTargetExtensions>((root) => ({
		dropTarget: new DropTargetController(root, options),
	}));
} as DropTargetConstructor;
