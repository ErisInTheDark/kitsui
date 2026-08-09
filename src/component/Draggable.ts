import { Component, type ComponentBuilderFunction } from "./Component";
import { DOMTree } from "./DOMTree";
import type { ComponentEvent } from "./EventManipulator";
import { State, type CleanupFunction } from "../state/State";

export type DragPhase = "idle" | "pending" | "dragging";

export interface DragPoint {
	readonly x: number;
	readonly y: number;
}

export type DragInputSource =
	| { readonly type: "pointer"; readonly pointerId: number; readonly pointerType: string }
	| { readonly type: "external"; readonly id?: string };

export interface DragPosition {
	readonly initial: DragPoint;
	readonly current: DragPoint;
	readonly previous: DragPoint | null;
	readonly offset: DragPoint;
	readonly delta: DragPoint;
	readonly source: DragInputSource;
}

export interface DragStartContext<TComponent extends Component = Component> {
	readonly component: DraggableHost<TComponent>;
	readonly event?: Event;
	readonly localPosition: DragPoint;
	readonly position: DragPoint;
	readonly rect: DOMRectReadOnly;
	readonly source: DragInputSource;
}

export interface DragPreviewContext<TComponent extends Component = Component> extends DragStartContext<TComponent> {}

export type DragPreviewRenderer<TComponent extends Component = Component> = (context: DragPreviewContext<TComponent>) => Component;

export interface DragInputStart {
	readonly event?: Event;
	readonly localPosition?: DragPoint;
	readonly position: DragPoint;
	readonly source: DragInputSource;
	readonly target?: Component;
}

export interface DragInputMove {
	readonly event?: Event;
	readonly position: DragPoint;
	readonly source?: DragInputSource;
	readonly target?: Component;
}

export interface DragInputEnd {
	readonly event?: Event;
	readonly position?: DragPoint;
	readonly source?: DragInputSource;
	readonly target?: Component;
}

export interface DragInputCancel {
	readonly event?: Event;
	readonly position?: DragPoint;
	readonly source?: DragInputSource;
	readonly target?: Component;
}

export interface DragInputReceiver {
	start (input: DragInputStart): boolean;
	move (input: DragInputMove): void;
	end (input: DragInputEnd): void;
	cancel (input?: DragInputCancel): void;
}

export type DragInputAdapter<TComponent extends Component = Component> = (
	component: DraggableHost<TComponent>,
	receiver: DragInputReceiver,
) => CleanupFunction | void;

export interface DraggableOptions<TComponent extends Component = Component> {
	readonly canStart?: (context: DragStartContext<TComponent>) => boolean;
	readonly input?: DragInputAdapter<TComponent>;
	readonly renderPreview?: false | DragPreviewRenderer<TComponent>;
	readonly threshold?: number;
}

export interface DraggableExtensions {
	readonly draggable: Draggable;
}

export interface Draggable {
	readonly active: State.Readonly<boolean>;
	readonly pending: State.Readonly<boolean>;
	readonly phase: State.Readonly<DragPhase>;
	readonly position: State.Readonly<DragPosition | null>;
	readonly preview: State.Readonly<Component | null>;
	cancel (): void;
	dispose (): void;
	end (): void;
}

export interface DragEventDetail<TComponent extends Component = Component> {
	readonly component: DraggableHost<TComponent>;
	readonly event?: Event;
	readonly position: DragPosition;
	readonly target?: Component;
}

export interface DraggableEvents<TComponent extends Component = Component> {
	DragCancel: CustomEvent<DragEventDetail<TComponent>>;
	DragEnd: CustomEvent<DragEventDetail<TComponent>>;
	DragMove: CustomEvent<DragEventDetail<TComponent>>;
	DragStart: CustomEvent<DragEventDetail<TComponent>>;
	DragStartRequested: CustomEvent<DragStartContext<TComponent>>;
}

export interface DraggableComponent<TComponent extends Component = Component> extends Component.WithEvents<DraggableEvents<TComponent>>, DraggableExtensions {}

type DraggableHost<TComponent extends Component = Component> = TComponent & DraggableComponent<TComponent>;

export type DragComponentEvent<TComponent extends Component = Component> = ComponentEvent<CustomEvent<DragEventDetail<TComponent>>, DraggableHost<TComponent>>;

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

const dragEventOptions = {
	bubbles: true,
	cancelable: false,
} as const;

const createOwnedState = State as unknown as <T>(owner: Component, initialValue: T) => State<T>;
const activeDragsByDocument = new WeakMap<Document, DraggableController>();

interface ActiveDragPreview {
	readonly component: Component;
	readonly localPosition: DragPoint;
}

function pointFromPointerEvent (event: PointerEvent): DragPoint {
	return {
		x: event.clientX,
		y: event.clientY,
	};
}

function subtractPoint (left: DragPoint, right: DragPoint): DragPoint {
	return {
		x: left.x - right.x,
		y: left.y - right.y,
	};
}

function distance (point: DragPoint): number {
	return Math.hypot(point.x, point.y);
}

function localPointFor (component: Component, point: DragPoint): DragPoint {
	const rect = component.element.getBoundingClientRect();

	return {
		x: point.x - rect.left,
		y: point.y - rect.top,
	};
}

function componentFromPoint (documentRef: Document, point: DragPoint): Component | undefined {
	const element = documentRef.elementFromPoint?.(point.x, point.y);

	if (element instanceof HTMLElement) {
		return element.component;
	}

	return undefined;
}

function isComponent (value: unknown): value is Component {
	return value instanceof Component.extend();
}

function isUnplacedOwnerlessComponent (component: Component): boolean {
	return component.owner.get() === null && DOMTree.parentOf(component.element) === null;
}

function eachElement (root: HTMLElement, callback: (element: HTMLElement) => void): void {
	callback(root);

	for (const element of Array.from(root.querySelectorAll("*"))) {
		if (element instanceof HTMLElement) {
			callback(element);
		}
	}
}

function makePreviewInert (element: HTMLElement): void {
	eachElement(element, (current) => {
		current.setAttribute("aria-hidden", "true");
		current.setAttribute("draggable", "false");
		current.setAttribute("inert", "");

		if ("inert" in current) {
			(current as HTMLElement & { inert: boolean }).inert = true;
		}
	});
}

function sanitizePreviewClone (element: HTMLElement): void {
	eachElement(element, (current) => {
		for (const attribute of Array.from(current.attributes)) {
			const name = attribute.name.toLowerCase();
			const value = attribute.value.trim().toLowerCase();
			const dangerousUrl = value.startsWith("javascript:");

			if (
				name === "id"
				|| name === "autofocus"
				|| name === "srcdoc"
				|| name.startsWith("on")
				|| ((name === "href" || name.endsWith(":href") || name === "src") && dangerousUrl)
			) {
				current.removeAttribute(attribute.name);
			}
		}
	});

	makePreviewInert(element);
}

function defaultRenderPreview (context: DragPreviewContext): Component {
	const clone = context.component.element.cloneNode(true);

	if (!(clone instanceof HTMLElement)) {
		throw new TypeError("Draggable preview clone must be an HTMLElement.");
	}

	sanitizePreviewClone(clone);
	return Component(clone);
}

function validatePreviewComponent (component: unknown): Component {
	if (!isComponent(component)) {
		throw new TypeError("Draggable preview must return a Component.");
	}

	if (!isUnplacedOwnerlessComponent(component)) {
		throw new Error("Draggable preview must return an ownerless, unplaced Component.");
	}

	return component;
}

function defaultPointerInput (component: DraggableComponent, receiver: DragInputReceiver): CleanupFunction {
	let releaseTracking: (releaseCapture?: boolean) => void = noop;

	const releaseCurrentTracking = () => {
		releaseTracking();
		releaseTracking = noop;
	};
	const releaseCurrentTrackingWithoutCapture = () => {
		releaseTracking(false);
		releaseTracking = noop;
	};

	const handlePointerDown = (event: PointerEvent) => {
		if (event.button !== 0) {
			return;
		}

		const point = pointFromPointerEvent(event);
		const accepted = receiver.start({
			event,
			localPosition: localPointFor(component, point),
			position: point,
			source: {
				pointerId: event.pointerId,
				pointerType: event.pointerType,
				type: "pointer",
			},
			target: componentFromPoint(component.element.ownerDocument, point),
		});

		if (!accepted) {
			return;
		}

		if (component.draggable.phase.value === "idle") {
			return;
		}

		releaseCurrentTracking();

		const documentRef = component.element.ownerDocument;
		const captureElement = documentRef.documentElement;
		try {
			captureElement.setPointerCapture?.(event.pointerId);
		}
		catch {
			// Pointer capture is helpful, but document listeners still own tracking.
		}

		const handlePointerMove = (moveEvent: PointerEvent) => {
			if (moveEvent.pointerId !== event.pointerId) {
				return;
			}

			const movePoint = pointFromPointerEvent(moveEvent);
			receiver.move({
				event: moveEvent,
				position: movePoint,
				target: componentFromPoint(documentRef, movePoint),
			});
		};
		const handlePointerUp = (upEvent: PointerEvent) => {
			if (upEvent.pointerId !== event.pointerId) {
				return;
			}

			const upPoint = pointFromPointerEvent(upEvent);
			releaseCurrentTracking();
			receiver.end({
				event: upEvent,
				position: upPoint,
				target: componentFromPoint(documentRef, upPoint),
			});
		};
		const handlePointerCancel = (cancelEvent: PointerEvent) => {
			if (cancelEvent.pointerId !== event.pointerId) {
				return;
			}

			const cancelPoint = pointFromPointerEvent(cancelEvent);
			releaseCurrentTracking();
			receiver.cancel({
				event: cancelEvent,
				position: cancelPoint,
				target: componentFromPoint(documentRef, cancelPoint),
			});
		};
		const handleLostPointerCapture = (lostEvent: PointerEvent) => {
			if (lostEvent.pointerId !== event.pointerId) {
				return;
			}

			const lostPoint = pointFromPointerEvent(lostEvent);
			releaseCurrentTrackingWithoutCapture();
			receiver.cancel({
				event: lostEvent,
				position: lostPoint,
				target: componentFromPoint(documentRef, lostPoint),
			});
		};

		documentRef.addEventListener("pointermove", handlePointerMove);
		documentRef.addEventListener("pointerup", handlePointerUp);
		documentRef.addEventListener("pointercancel", handlePointerCancel);
		captureElement.addEventListener("lostpointercapture", handleLostPointerCapture);

		releaseTracking = (releaseCapture = true) => {
			documentRef.removeEventListener("pointermove", handlePointerMove);
			documentRef.removeEventListener("pointerup", handlePointerUp);
			documentRef.removeEventListener("pointercancel", handlePointerCancel);
			captureElement.removeEventListener("lostpointercapture", handleLostPointerCapture);
			if (releaseCapture) {
				try {
					captureElement.releasePointerCapture?.(event.pointerId);
				} catch {
					// Capture may already be gone when cleanup follows lostpointercapture.
				}
			}
		};
	};

	const handleDragStop = () => {
		releaseCurrentTracking();
	};

	component.element.addEventListener("pointerdown", handlePointerDown);
	component.element.addEventListener("DragEnd", handleDragStop);
	component.element.addEventListener("DragCancel", handleDragStop);

	return () => {
		releaseCurrentTracking();
		component.element.removeEventListener("pointerdown", handlePointerDown);
		component.element.removeEventListener("DragEnd", handleDragStop);
		component.element.removeEventListener("DragCancel", handleDragStop);
	};
}

class DraggableController implements Draggable {
	readonly active: State.Readonly<boolean>;
	readonly pending: State.Readonly<boolean>;
	readonly phase: State<DragPhase>;
	readonly position: State<DragPosition | null>;
	readonly preview: State<Component | null>;

	private activePreview: ActiveDragPreview | null = null;
	private cleanupDisposeEvent: CleanupFunction = noop;
	private cleanupInput: CleanupFunction = noop;
	private disposedValue = false;
	private startContext: DragStartContext | null = null;

	constructor (
		private readonly component: DraggableComponent,
		private readonly options: DraggableOptions,
	) {
		this.phase = createOwnedState<DragPhase>(component, "idle");
		this.position = createOwnedState<DragPosition | null>(component, null);
		this.preview = createOwnedState<Component | null>(component, null);
		const active = createOwnedState(component, false);
		const pending = createOwnedState(component, false);
		this.active = active;
		this.pending = pending;

		this.phase.subscribeImmediate(component, (phase) => {
			active.set(phase === "dragging");
			pending.set(phase === "pending");
		});

		this.cleanupInput = (options.input ?? defaultPointerInput)(component, this.createReceiver()) ?? noop;
		const handleDispose = () => {
			this.cancelWith({});
		};
		component.element.addEventListener("Dispose", handleDispose);
		this.cleanupDisposeEvent = () => {
			component.element.removeEventListener("Dispose", handleDispose);
		};
		component.onCleanup(() => {
			this.dispose();
		});
	}

	cancel (): void {
		this.cancelWith({});
	}

	dispose (): void {
		if (this.disposedValue) {
			return;
		}

		this.disposedValue = true;
		this.cleanupDisposeEvent();
		this.cleanupDisposeEvent = noop;

		if (!this.phase.disposed && !this.position.disposed) {
			this.cancelWith({});
		}
		else {
			this.releaseActiveDrag();
		}
		this.cleanupInput();
		this.cleanupInput = noop;
	}

	end (): void {
		this.endWith({});
	}

	private createReceiver (): DragInputReceiver {
		return {
			cancel: (input) => {
				this.cancelWith(input ?? {});
			},
			end: (input) => {
				this.endWith(input);
			},
			move: (input) => {
				this.moveWith(input);
			},
			start: (input) => {
				return this.startWith(input);
			},
		};
	}

	private startWith (input: DragInputStart): boolean {
		if (!this.canUseState() || this.phase.value !== "idle") {
			return false;
		}

		const documentRef = this.component.element.ownerDocument;
		const activeDrag = activeDragsByDocument.get(documentRef);

		if (activeDrag && activeDrag !== this) {
			return false;
		}

		const rect = this.component.element.getBoundingClientRect();
		const context: DragStartContext = {
			component: this.component,
			event: input.event,
			localPosition: input.localPosition ?? localPointFor(this.component, input.position),
			position: input.position,
			rect,
			source: input.source,
		};
		this.startContext = context;

		this.component.event.emit.DragStartRequested(context, dragEventOptions);

		if (!this.canUseState() || this.options.canStart?.(context) === false || !this.canUseState()) {
			this.startContext = null;
			return false;
		}

		activeDragsByDocument.set(documentRef, this);
		this.position.set({
			current: input.position,
			delta: { x: 0, y: 0 },
			initial: input.position,
			offset: { x: 0, y: 0 },
			previous: null,
			source: input.source,
		});
		this.phase.set("pending");

		if ((this.options.threshold ?? 0) <= 0) {
			this.startDragging(input);
		}

		return true;
	}

	private moveWith (input: DragInputMove): void {
		if (!this.canUseState()) {
			return;
		}

		const current = this.position.value;

		if (!current || this.phase.value === "idle") {
			return;
		}

		const next = this.nextPosition(input.position, input.source ?? current.source);
		this.position.set(next);

		if (this.phase.value === "pending") {
			if (distance(next.offset) < (this.options.threshold ?? 0)) {
				return;
			}

			this.startDragging(input);
		}

		if (!this.canUseState() || this.phase.value !== "dragging") {
			return;
		}

		this.positionPreview(next);
		this.component.event.emit.DragMove({
			component: this.component,
			event: input.event,
			position: next,
			target: input.target,
		} satisfies DragEventDetail, dragEventOptions);
	}

	private endWith (input: DragInputEnd): void {
		if (this.phase.value === "idle") {
			return;
		}

		if (input.position) {
			this.position.set(this.nextPosition(input.position, input.source ?? this.position.value!.source));
		}

		const position = this.position.value;
		const wasDragging = this.phase.value === "dragging";

		if (wasDragging && position) {
			this.positionPreview(position);
			this.component.event.emit.DragEnd({
				component: this.component,
				event: input.event,
				position,
				target: input.target,
			} satisfies DragEventDetail, dragEventOptions);
		}
		else if (position) {
			this.component.event.emit.DragCancel({
				component: this.component,
				event: input.event,
				position,
				target: input.target,
			} satisfies DragEventDetail, dragEventOptions);
		}

		this.reset();
	}

	private cancelWith (input: DragInputCancel): void {
		if (this.phase.value === "idle") {
			return;
		}

		if (input.position && this.position.value) {
			this.position.set(this.nextPosition(input.position, input.source ?? this.position.value.source));
		}

		const position = this.position.value;
		if (position) {
			this.positionPreview(position);
			this.component.event.emit.DragCancel({
				component: this.component,
				event: input.event,
				position,
				target: input.target,
			} satisfies DragEventDetail, dragEventOptions);
		}

		this.reset();
	}

	private startDragging (input: { readonly event?: Event; readonly target?: Component }): void {
		const position = this.position.value;
		const context = this.startContext;

		if (!position || !context || this.phase.value === "dragging") {
			return;
		}

		try {
			this.createPreview(context, position);
		}
		catch (error) {
			this.reset();
			throw error;
		}

		this.phase.set("dragging");
		this.component.event.emit.DragStart({
			component: this.component,
			event: input.event,
			position,
			target: input.target,
		} satisfies DragEventDetail, dragEventOptions);
	}

	private nextPosition (point: DragPoint, source: DragInputSource): DragPosition {
		const current = this.position.value!;
		const previous = current.current;

		return {
			current: point,
			delta: subtractPoint(point, previous),
			initial: current.initial,
			offset: subtractPoint(point, current.initial),
			previous,
			source,
		};
	}

	private reset (): void {
		this.releaseActiveDrag();
		this.removePreview();
		this.startContext = null;

		if (this.phase.disposed || this.position.disposed || this.preview.disposed) {
			return;
		}

		this.phase.set("idle");
		this.position.set(null);
		this.preview.set(null);
	}

	private releaseActiveDrag (): void {
		const documentRef = this.component.element.ownerDocument;
		if (activeDragsByDocument.get(documentRef) === this) {
			activeDragsByDocument.delete(documentRef);
		}
	}

	private canUseState (): boolean {
		return !this.disposedValue && !this.phase.disposed && !this.position.disposed && !this.preview.disposed;
	}

	private createPreview (context: DragStartContext, position: DragPosition): void {
		if (this.options.renderPreview === false) {
			return;
		}

		const renderPreview = this.options.renderPreview ?? defaultRenderPreview;
		const preview = validatePreviewComponent(renderPreview(context));
		makePreviewInert(preview.element);
		preview.owner.add(this.component, "drag-preview");
		preview.element.style.boxSizing = "border-box";
		preview.element.style.height = `${context.rect.height}px`;
		preview.element.style.left = "0px";
		preview.element.style.pointerEvents = "none";
		preview.element.style.position = "fixed";
		preview.element.style.top = "0px";
		preview.element.style.width = `${context.rect.width}px`;
		preview.element.style.zIndex = "2147483647";
		DOMTree.physical.place(
			[preview.element],
			{ type: "append", parent: this.component.element.ownerDocument.body },
			() => { },
		);
		this.activePreview = {
			component: preview,
			localPosition: context.localPosition,
		};
		this.preview.set(preview);
		this.positionPreview(position);
	}

	private positionPreview (position: DragPosition): void {
		const preview = this.activePreview;

		if (!preview || preview.component.disposed) {
			return;
		}

		preview.component.element.style.left = `${position.current.x - preview.localPosition.x}px`;
		preview.component.element.style.top = `${position.current.y - preview.localPosition.y}px`;
	}

	private removePreview (): void {
		const preview = this.activePreview?.component ?? null;
		this.activePreview = null;

		if (preview && !preview.disposed) {
			preview.remove();
		}
	}
}

type DraggableConstructor = ComponentBuilderFunction<[DraggableOptions?], DraggableComponent> & {
	Input<TComponent extends Component = Component> (input: DragInputAdapter<TComponent>): DragInputAdapter<TComponent>;
};

export const Draggable = function Draggable (
	this: Component | void,
	options: DraggableOptions = {},
): DraggableComponent {
	const component = Component(this ?? "div", Draggable) as Component & Partial<DraggableExtensions>;

	if (component.draggable) {
		return component as DraggableComponent;
	}

	return component.extend<DraggableExtensions>((root) => ({
		draggable: new DraggableController(root as DraggableComponent, options),
	})) as DraggableComponent;
} as DraggableConstructor;

Draggable.Input = function Input<TComponent extends Component = Component> (
	input: DragInputAdapter<TComponent>,
): DragInputAdapter<TComponent> {
	if (typeof input !== "function") {
		throw new TypeError("Draggable.Input requires an input adapter function.");
	}

	return input;
};
