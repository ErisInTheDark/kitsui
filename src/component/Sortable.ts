import { Component } from "./Component";
import { State, type CleanupFunction } from "../state/State";
import { Draggable, type DragEventDetail, type DraggableComponent } from "./Draggable";
import { handleDropTargetDrop, resolveDropTarget } from "./DropTarget";

type SortableDraggableItem<TItem extends Component> = TItem & DraggableComponent<TItem>;

export interface SortableExtensions<
	T,
	TItem extends Component = Component,
	K extends PropertyKey = number,
> {
	readonly sortable: Sortable<T, TItem, K>;
}

export interface Sortable<
	T,
	TItem extends Component = Component,
	K extends PropertyKey = number,
> {
	readonly dragging: State.Readonly<SortableDraggableItem<TItem> | null>;
	readonly items: State.Readonly<readonly T[]>;
	readonly phase: State.Readonly<"idle" | "sorting">;
	readonly preview: State.Readonly<readonly T[]>;
	cancel (): void;
	dispose (): void;
}

export interface SortableTransfer<T> {
	readonly label: string | undefined;
	readonly type?: (value: T) => T;
}

export interface SortableTransferContext<
	T,
	TItem extends Component = Component,
	K extends PropertyKey = number,
> {
	readonly item: T;
	readonly key: K;
	readonly sortable: Component & SortableExtensions<T, TItem, K>;
}

export interface SortableOptions<
	T,
	TItem extends Component = Component,
	K extends PropertyKey = number,
> {
	readonly canTransferIn?: (context: SortableTransferContext<T, TItem, K>) => boolean;
	readonly canTransferOut?: (context: SortableTransferContext<T, TItem, K>) => boolean;
	readonly key?: (item: T, index: number) => K;
	placeholder (component: SortableDraggableItem<TItem>, key: K): Component;
	render (item: State.Readonly<T>, key: K, index: number): TItem;
	readonly transfer?: SortableTransfer<T>;
}

type SortableInput<T> = readonly T[] | State.Readonly<readonly T[]>;

interface NormalizedItem<T, K extends PropertyKey> {
	readonly index: number;
	readonly item: T;
	readonly key: K;
}

interface SortableRecord<T, TItem extends Component, K extends PropertyKey> {
	readonly cleanup: CleanupFunction;
	readonly component: SortableDraggableItem<TItem>;
	readonly key: K;
	readonly state: State<T>;
}

interface ActiveSortSession<T, TItem extends Component, K extends PropertyKey> {
	readonly dragging: SortableDraggableItem<TItem>;
	item: T;
	readonly key: K;
	placeholder: Component | null;
	source: SortableController<T, TItem, K>;
	target: SortableController<any, any, any>;
	targetIndex: number;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

const createOwnedState = State as unknown as <T>(owner: Component, initialValue: T) => State<T>;
const sortablesByDocument = new WeakMap<Document, Set<SortableController<any, any, any>>>();
const activeSessionsByDocument = new WeakMap<Document, ActiveSortSession<any, any, any>>();

function isStateLike<T> (value: unknown): value is State.Readonly<T> {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const maybeState = value as Partial<State.Readonly<T>>;
	return "value" in maybeState && typeof maybeState.subscribe === "function";
}

function isComponent (value: unknown): value is Component {
	return value instanceof Component.extend();
}

function isUnplacedOwnerlessComponent (component: Component): boolean {
	return component.owner.get() === null && component.element.parentNode === null;
}

function validateRenderedComponent (component: unknown, message: string): Component {
	if (!isComponent(component)) {
		throw new TypeError(`${message} must return a Component.`);
	}

	if (!isUnplacedOwnerlessComponent(component)) {
		throw new Error(`${message} must return an ownerless, unplaced Component.`);
	}

	return component;
}

function valuesFromRecords<T, TItem extends Component, K extends PropertyKey> (
	records: Map<K, SortableRecord<T, TItem, K>>,
	order: readonly K[],
): T[] {
	const values: T[] = [];

	for (const key of order) {
		const record = records.get(key);
		if (record) {
			values.push(record.state.value);
		}
	}

	return values;
}

function getSortableController (component: Component | null | undefined): SortableController<any, any, any> | null {
	return ((component as Partial<SortableExtensions<any, any, any>> | null | undefined)?.sortable as SortableController<any, any, any> | undefined) ?? null;
}

function closestSortableController (component: Component | undefined): SortableController<any, any, any> | null {
	let current: Node | null = component?.element ?? null;

	while (current) {
		if (current instanceof HTMLElement) {
			const controller = getSortableController(current.component);
			if (controller) {
				return controller;
			}
		}

		current = current.parentNode;
	}

	return null;
}

function pointInRect (point: { readonly x: number; readonly y: number }, rect: DOMRectReadOnly): boolean {
	return point.x >= rect.left
		&& point.x <= rect.right
		&& point.y >= rect.top
		&& point.y <= rect.bottom;
}

function sortableRegistryFor (documentRef: Document): Set<SortableController<any, any, any>> {
	let registry = sortablesByDocument.get(documentRef);

	if (!registry) {
		registry = new Set();
		sortablesByDocument.set(documentRef, registry);
	}

	return registry;
}

function activeSessionFor (documentRef: Document): ActiveSortSession<any, any, any> | null {
	return activeSessionsByDocument.get(documentRef) ?? null;
}

function activeSessionForSortable (sortable: SortableController<any, any, any>): ActiveSortSession<any, any, any> | null {
	return activeSessionFor(sortable.component.element.ownerDocument);
}

function setActiveSession (session: ActiveSortSession<any, any, any> | null): void {
	if (!session) {
		return;
	}

	activeSessionsByDocument.set(session.source.component.element.ownerDocument, session);
}

function clearActiveSession (session: ActiveSortSession<any, any, any>): void {
	const documentRef = session.source.component.element.ownerDocument;
	if (activeSessionsByDocument.get(documentRef) === session) {
		activeSessionsByDocument.delete(documentRef);
	}
}

function resolveSortableTarget (
	session: ActiveSortSession<any, any, any>,
	detail: DragEventDetail,
): SortableController<any, any, any> {
	const explicit = closestSortableController(detail.target);

	if (explicit?.canAcceptSession(session)) {
		return explicit;
	}

	const registry = [...sortableRegistryFor(detail.component.element.ownerDocument)].reverse();

	for (const sortable of registry) {
		if (!pointInRect(detail.position.current, sortable.component.element.getBoundingClientRect())) {
			continue;
		}

		if (sortable.canAcceptSession(session)) {
			return sortable;
		}
	}

	return session.source;
}

export class SortableController<
	T,
	TItem extends Component = Component,
	K extends PropertyKey = number,
> implements Sortable<T, TItem, K> {
	readonly dragging: State<SortableDraggableItem<TItem> | null>;
	readonly items: State<readonly T[]>;
	readonly phase: State<"idle" | "sorting">;
	readonly preview: State<readonly T[]>;

	private readonly recordsByKey = new Map<K, SortableRecord<T, TItem, K>>();
	private cleanupDisposeEvent: CleanupFunction = noop;
	private currentOrder: K[] = [];
	private disposedValue = false;
	private previewOrder: K[] = [];
	private releaseSourceSubscription: CleanupFunction = noop;

	constructor (
		readonly component: Component & SortableExtensions<T, TItem, K>,
		private readonly input: SortableInput<T>,
		private readonly options: SortableOptions<T, TItem, K>,
	) {
		const initial = isStateLike<readonly T[]>(input) ? input.value : input;
		this.items = createOwnedState<readonly T[]>(component, []);
		this.preview = createOwnedState<readonly T[]>(component, []);
		this.phase = createOwnedState<"idle" | "sorting">(component, "idle");
		this.dragging = createOwnedState<SortableDraggableItem<TItem> | null>(component, null);

		sortableRegistryFor(component.element.ownerDocument).add(this);
		const handleDispose = () => {
			this.dispose();
		};
		component.element.addEventListener("Dispose", handleDispose);
		this.cleanupDisposeEvent = () => {
			component.element.removeEventListener("Dispose", handleDispose);
		};
		component.onCleanup(() => {
			this.dispose();
		});

		if (isStateLike<readonly T[]>(input)) {
			this.releaseSourceSubscription = input.subscribe(component, (items) => {
				this.syncItems(items);
			});
		}

		this.syncItems(initial);
	}

	cancel (): void {
		const session = activeSessionForSortable(this);
		if (session?.source === this || session?.target === this) {
			this.cancelDragSession(session);
		}
	}

	canAcceptSession (session: ActiveSortSession<any, any, any>): boolean {
		if (session.source === this) {
			return true;
		}

		if (!this.options.transfer || this.options.transfer !== session.source.options.transfer) {
			return false;
		}

		if (this.recordsByKey.has(session.key as K)) {
			return false;
		}

		const sourceContext = session.source.transferContextFor(session);
		const targetContext = this.transferContextFor(session);

		if (session.source.options.canTransferOut?.(sourceContext) === false) {
			return false;
		}

		if (this.options.canTransferIn?.(targetContext) === false) {
			return false;
		}

		return true;
	}

	dispose (): void {
		if (this.disposedValue) {
			return;
		}

		this.disposedValue = true;
		const session = activeSessionForSortable(this);
		if (session?.source === this || session?.target === this) {
			this.cancelDragSession(session);
		}

		this.cleanupDisposeEvent();
		this.cleanupDisposeEvent = noop;
		this.releaseSourceSubscription();
		sortableRegistryFor(this.component.element.ownerDocument).delete(this);

		for (const record of [...this.recordsByKey.values()]) {
			this.removeRecord(record);
		}
	}

	handleDragStart (record: SortableRecord<T, TItem, K>, detail: DragEventDetail): void {
		if (activeSessionForSortable(this) || this.disposedValue || !this.recordsByKey.has(record.key)) {
			return;
		}

		const placeholder = validateRenderedComponent(this.options.placeholder(record.component, record.key), "Sortable placeholder");
		placeholder.owner.add(this.component, "sortable-placeholder");

		const session: ActiveSortSession<T, TItem, K> = {
			dragging: record.component,
			item: record.state.value,
			key: record.key,
			placeholder,
			source: this,
			target: this,
			targetIndex: this.currentOrder.indexOf(record.key),
		};
		setActiveSession(session);

		this.phase.set("sorting");
		this.dragging.set(record.component);
		this.previewOrder = [...this.currentOrder];
		this.preview.set(valuesFromRecords(this.recordsByKey, this.previewOrder));
		this.placePlaceholder(this, session.targetIndex);
		this.handleDragMove(detail);
		record.component.element.remove();
	}

	handleDragMove (detail: DragEventDetail): void {
		const session = activeSessionForSortable(this);

		if (!session || session.source !== this) {
			return;
		}

		const dropTarget = resolveDropTarget(detail.component, detail.position.current, detail.position.source, detail.target);
		if (dropTarget) {
			session.target.clearPreviewFromSession(session);
			session.target = session.source;
			session.targetIndex = session.source.currentOrder.indexOf(session.key as never);
			this.suspendPlaceholder(session);
			return;
		}

		const target = resolveSortableTarget(session, detail);
		target.previewSession(session, detail.position.current);
	}

	handleDragEnd (event: Event, detail: DragEventDetail): void {
		const session = activeSessionForSortable(this);

		if (!session || session.source !== this) {
			return;
		}

		const handled = handleDropTargetDrop(event, detail.component, detail.position.current, detail.position.source, detail.target);
		if (handled) {
			this.cleanupSession();
			return;
		}

		session.target.commitSession(session);
	}

	handleDragCancel (): void {
		if (activeSessionForSortable(this)?.source === this) {
			this.cancelSession();
		}
	}

	previewSession (session: ActiveSortSession<any, any, any>, point: { readonly x: number; readonly y: number }): void {
		if (!this.canAcceptSession(session)) {
			session.source.previewSession(session, point);
			return;
		}

		if (session.target !== this) {
			session.target.clearPreviewFromSession(session);
		}

		session.target = this;
		session.targetIndex = this.resolveInsertionIndex(session, point);
		this.placePlaceholder(this, session.targetIndex);
		this.previewOrder = this.previewOrderForSession(session, session.targetIndex);
		this.preview.set(this.previewValuesForSession(session));
		this.phase.set("sorting");
		this.dragging.set(session.dragging as never);
	}

	private cleanupSession (): void {
		const session = activeSessionForSortable(this);
		if (!session || session.source !== this) {
			return;
		}

		session.placeholder?.remove();
		session.placeholder = null;
		session.target.clearPreviewFromSession(session);
		session.source.phase.set("idle");
		session.source.dragging.set(null);
		session.source.previewOrder = [...session.source.currentOrder];
		session.source.preview.set(valuesFromRecords(session.source.recordsByKey, session.source.previewOrder));

		if (session.target !== session.source) {
			session.target.phase.set("idle");
			session.target.dragging.set(null);
		}

		clearActiveSession(session);
		if (!session.source.disposedValue && !session.source.component.disposed) {
			session.source.placeRecords();
		}

		if (session.target !== session.source && !session.target.disposedValue && !session.target.component.disposed) {
			session.target.placeRecords();
		}
	}

	private cancelSession (): void {
		const session = activeSessionForSortable(this);
		if (!session || (session.source !== this && session.target !== this)) {
			return;
		}

		session.placeholder?.remove();
		session.placeholder = null;
		session.source.phase.set("idle");
		session.source.dragging.set(null);
		session.source.previewOrder = [...session.source.currentOrder];
		session.source.preview.set(valuesFromRecords(session.source.recordsByKey, session.source.previewOrder));

		if (session.target !== session.source) {
			session.target.phase.set("idle");
			session.target.dragging.set(null);
			session.target.previewOrder = [...session.target.currentOrder];
			session.target.preview.set(valuesFromRecords(session.target.recordsByKey, session.target.previewOrder));
		}

		clearActiveSession(session);
		if (!session.source.disposedValue && !session.source.component.disposed) {
			session.source.placeRecords();
		}

		if (session.target !== session.source && !session.target.disposedValue && !session.target.component.disposed) {
			session.target.placeRecords();
		}
	}

	private cancelDragSession (session: ActiveSortSession<any, any, any>): void {
		if (session.dragging.draggable.phase.value !== "idle") {
			session.dragging.draggable.cancel();
			return;
		}

		this.cancelSession();
	}

	private clearPreviewFromSession (session: ActiveSortSession<any, any, any>): void {
		this.previewOrder = [...this.currentOrder];
		this.preview.set(valuesFromRecords(this.recordsByKey, this.previewOrder));

		if (session.target === this && session.source !== this) {
			this.phase.set("idle");
			this.dragging.set(null);
		}
	}

	private suspendPlaceholder (session: ActiveSortSession<any, any, any>): void {
		session.placeholder?.element.remove();
	}

	private commitSession (session: ActiveSortSession<any, any, any>): void {
		if (session.target !== this) {
			return;
		}

		if (session.source === this) {
			const nextItems = this.previewValuesForSession(session);
			this.syncItems(nextItems);
			this.cleanupSession();
			return;
		}

		const sourceItems = session.source.items.value.filter((item: unknown, index: number) => {
			return session.source.keyFor(item, index) !== session.key;
		});
		const targetItems = [...this.items.value];
		targetItems.splice(session.targetIndex, 0, session.item);

		session.source.syncItems(sourceItems);
		this.syncItems(targetItems as T[]);
		session.source.cleanupSession();
	}

	private normalize (items: readonly T[]): Array<NormalizedItem<T, K>> {
		const normalized: Array<NormalizedItem<T, K>> = [];
		const seen = new Set<K>();

		items.forEach((item, index) => {
			const key = this.keyFor(item, index);

			if (seen.has(key)) {
				console.error(`Sortable ignored duplicate key ${String(key)}.`);
				return;
			}

			seen.add(key);
			normalized.push({ index, item, key });
		});

		return normalized;
	}

	private keyFor (item: unknown, index: number): K {
		return (this.options.key?.(item as T, index) ?? index) as K;
	}

	private syncItems (items: readonly T[]): void {
		if (this.disposedValue) {
			return;
		}

		const sessionBeforeSync = activeSessionForSortable(this);
		const normalized = this.normalize(items);
		const nextKeys = new Set(normalized.map(item => item.key));
		const draggingKey = sessionBeforeSync?.source === this ? sessionBeforeSync.key as K : null;

		if (draggingKey !== null && !nextKeys.has(draggingKey)) {
			this.cancelSession();
		}

		for (const entry of normalized) {
			const existing = this.recordsByKey.get(entry.key);

			if (existing) {
				existing.state.set(entry.item);
				if (sessionBeforeSync?.key === entry.key && sessionBeforeSync.source === this) {
					sessionBeforeSync.item = entry.item;
				}
				continue;
			}

			this.recordsByKey.set(entry.key, this.createRecord(entry));
		}

		for (const [key, record] of [...this.recordsByKey]) {
			if (nextKeys.has(key)) {
				continue;
			}

			this.removeRecord(record);
		}

		this.currentOrder = normalized.map(item => item.key);
		const committedItems = normalized.map(item => item.item);
		this.items.set(committedItems);
		this.placeRecords();

		const session = activeSessionForSortable(this);
		if (session && session === sessionBeforeSync && session.target === this) {
			this.previewOrder = this.mergeActivePreviewOrder(session);
			this.preview.set(this.previewValuesForSession(session));
			this.placePlaceholder(this, session.targetIndex);
		}
		else {
			this.previewOrder = [...this.currentOrder];
			this.preview.set(committedItems);
		}
	}

	private createRecord (entry: NormalizedItem<T, K>): SortableRecord<T, TItem, K> {
		const state = createOwnedState<T>(this.component, entry.item);
		const rendered = validateRenderedComponent(this.options.render(state, entry.key, entry.index), "Sortable render") as TItem;
		const draggable = Draggable.call(rendered) as SortableDraggableItem<TItem>;

		draggable.owner.add(this.component, "sortable-item");

		let record: SortableRecord<T, TItem, K>;
		const isRecordDragDetail = (detail: DragEventDetail | undefined): detail is DragEventDetail => {
			return detail?.component === record.component;
		};
		const handleDragStart = (event: Event) => {
			const detail = (event as CustomEvent<DragEventDetail>).detail;
			if (isRecordDragDetail(detail)) {
				this.handleDragStart(record, detail);
			}
		};
		const handleDragMove = (event: Event) => {
			const detail = (event as CustomEvent<DragEventDetail>).detail;
			if (isRecordDragDetail(detail)) {
				this.handleDragMove(detail);
			}
		};
		const handleDragEnd = (event: Event) => {
			const detail = (event as CustomEvent<DragEventDetail>).detail;
			if (isRecordDragDetail(detail)) {
				this.handleDragEnd(event, detail);
			}
		};
		const handleDragCancel = (event: Event) => {
			const detail = (event as CustomEvent<DragEventDetail>).detail;
			if (isRecordDragDetail(detail)) {
				this.handleDragCancel();
			}
		};
		const cleanup = () => {
			draggable.element.removeEventListener("DragStart", handleDragStart);
			draggable.element.removeEventListener("DragMove", handleDragMove);
			draggable.element.removeEventListener("DragEnd", handleDragEnd);
			draggable.element.removeEventListener("DragCancel", handleDragCancel);
			state.dispose();
			draggable.remove();
		};
		record = {
			cleanup,
			component: draggable,
			key: entry.key,
			state,
		};

		draggable.element.addEventListener("DragStart", handleDragStart);
		draggable.element.addEventListener("DragMove", handleDragMove);
		draggable.element.addEventListener("DragEnd", handleDragEnd);
		draggable.element.addEventListener("DragCancel", handleDragCancel);

		return record;
	}

	private removeRecord (record: SortableRecord<T, TItem, K>): void {
		if (this.recordsByKey.get(record.key) !== record) {
			return;
		}

		this.recordsByKey.delete(record.key);
		record.cleanup();
	}

	private placeRecords (): void {
		const session = activeSessionForSortable(this);
		const hiddenKey = session?.source === this ? session.key as K : null;

		for (const key of this.currentOrder) {
			if (key === hiddenKey) {
				continue;
			}

			const record = this.recordsByKey.get(key);
			if (record) {
				this.component.append(record.component);
			}
		}
	}

	private placePlaceholder (target: SortableController<any, any, any>, index: number): void {
		const session = activeSessionForSortable(target);
		const placeholder = session?.placeholder;

		if (!placeholder) {
			return;
		}

		const referenceRecord = target.recordAtInsertionIndex(session, index);
		const referenceNode = referenceRecord?.component.element ?? null;
		target.component.element.insertBefore(placeholder.element, referenceNode);
	}

	private baseOrderForSession (session: ActiveSortSession<any, any, any>): K[] {
		const order = [...this.currentOrder];

		if (session.source === this) {
			return order.filter(key => key !== session.key);
		}

		return order;
	}

	private previewOrderForSession (session: ActiveSortSession<any, any, any>, index: number): K[] {
		const order = [...this.currentOrder];

		if (session.source === this) {
			const existingIndex = order.indexOf(session.key as K);
			if (existingIndex >= 0) {
				order.splice(existingIndex, 1);
			}
		}

		order.splice(index, 0, session.key as K);
		return order;
	}

	private previewValuesForSession (session: ActiveSortSession<any, any, any>): T[] {
		const values: T[] = [];

		for (const key of this.previewOrder) {
			if (key === session.key) {
				values.push(session.item as T);
				continue;
			}

			const record = this.recordsByKey.get(key);
			if (record) {
				values.push(record.state.value);
			}
		}

		return values;
	}

	private recordAtInsertionIndex (session: ActiveSortSession<any, any, any>, index: number): SortableRecord<T, TItem, K> | null {
		const order = this.baseOrderForSession(session);
		const referenceKey = order[index];

		if (referenceKey === undefined) {
			return null;
		}

		return this.recordsByKey.get(referenceKey) ?? null;
	}

	private resolveInsertionIndex (session: ActiveSortSession<any, any, any>, point: { readonly x: number; readonly y: number }): number {
		const slots = this.insertionSlotsForSession(session);

		let nearest = slots[0] ?? { index: 0, x: point.x, y: point.y };
		let nearestDistance = Number.POSITIVE_INFINITY;

		for (const slot of slots) {
			const distanceX = point.x - slot.x;
			const distanceY = point.y - slot.y;
			const distance = distanceX * distanceX + distanceY * distanceY;

			if (distance < nearestDistance) {
				nearest = slot;
				nearestDistance = distance;
			}
		}

		return nearest.index;
	}

	private insertionSlotsForSession (session: ActiveSortSession<any, any, any>): Array<{ readonly index: number; readonly x: number; readonly y: number; }> {
		const order = this.baseOrderForSession(session);
		const hostRect = this.component.element.getBoundingClientRect();
		const slots: Array<{ readonly index: number; readonly x: number; readonly y: number; }> = [];

		if (order.length === 0) {
			return [{
				index: 0,
				x: hostRect.left + hostRect.width / 2,
				y: hostRect.top + hostRect.height / 2,
			}];
		}

		for (let index = 0; index <= order.length; index += 1) {
			const before = index > 0 ? this.recordsByKey.get(order[index - 1]) ?? null : null;
			const after = index < order.length ? this.recordsByKey.get(order[index]) ?? null : null;
			const beforeRect = before?.component.element.getBoundingClientRect();
			const afterRect = after?.component.element.getBoundingClientRect();

			if (beforeRect && afterRect) {
				slots.push({
					index,
					x: (beforeRect.left + beforeRect.width / 2 + afterRect.left + afterRect.width / 2) / 2,
					y: (beforeRect.bottom + afterRect.top) / 2,
				});
				continue;
			}

			if (afterRect) {
				slots.push({
					index,
					x: afterRect.left + afterRect.width / 2,
					y: afterRect.top,
				});
				continue;
			}

			if (beforeRect) {
				slots.push({
					index,
					x: beforeRect.left + beforeRect.width / 2,
					y: beforeRect.bottom,
				});
			}
		}

		return slots;
	}

	private mergeActivePreviewOrder (session: ActiveSortSession<any, any, any>): K[] {
		const currentKeys = new Set(this.currentOrder);
		const merged: K[] = [];

		for (const key of this.previewOrder) {
			if (key !== session.key && !currentKeys.has(key)) {
				continue;
			}

			if (!merged.includes(key)) {
				merged.push(key);
			}
		}

		for (const key of this.currentOrder) {
			if (merged.includes(key)) {
				continue;
			}

			this.insertKeyBySourceNeighbors(merged, key, session);
		}

		if (session.target === this) {
			const sessionKeyIndex = merged.indexOf(session.key as K);
			if (sessionKeyIndex >= 0) {
				session.targetIndex = merged.slice(0, sessionKeyIndex).filter(key => key !== session.key).length;
			}
		}

		return merged;
	}

	private insertKeyBySourceNeighbors (merged: K[], key: K, session: ActiveSortSession<any, any, any>): void {
		const sourceIndex = this.currentOrder.indexOf(key);
		const sessionKey = session.key as K;
		const sessionKeyIndex = this.currentOrder.indexOf(sessionKey);
		const mergedSessionIndex = merged.indexOf(sessionKey);
		let previousNeighborIndex = -1;
		let nextNeighborIndex = -1;

		for (let index = sourceIndex - 1; index >= 0; index -= 1) {
			const previousKey = this.currentOrder[index];
			if (previousKey === sessionKey) {
				continue;
			}

			previousNeighborIndex = merged.indexOf(previousKey);
			break;
		}

		for (let index = sourceIndex + 1; index < this.currentOrder.length; index += 1) {
			const nextKey = this.currentOrder[index];
			if (nextKey === sessionKey) {
				continue;
			}

			nextNeighborIndex = merged.indexOf(nextKey);
			break;
		}

		if (previousNeighborIndex >= 0 && nextNeighborIndex >= 0) {
			merged.splice(Math.min(previousNeighborIndex + 1, nextNeighborIndex), 0, key);
			return;
		}

		if (session.source === this && sessionKeyIndex >= 0 && mergedSessionIndex >= 0) {
			if (sourceIndex > sessionKeyIndex) {
				merged.splice(mergedSessionIndex + 1, 0, key);
				return;
			}

			if (sourceIndex < sessionKeyIndex) {
				merged.splice(mergedSessionIndex, 0, key);
				return;
			}
		}

		merged.push(key);
	}

	private transferContextFor (session: ActiveSortSession<any, any, any>): SortableTransferContext<T, TItem, K> {
		return {
			item: session.item as T,
			key: session.key as K,
			sortable: this.component,
		};
	}
}

type SortableConstructor = {
	<T, TItem extends Component = Component, K extends PropertyKey = number>(
		this: Component | void,
		input: SortableInput<T>,
		options: SortableOptions<T, TItem, K>,
	): Component & SortableExtensions<T, TItem, K>;
	Transfer<T> (label?: string): SortableTransfer<T>;
};

export const Sortable = function Sortable<
	T,
	TItem extends Component = Component,
	K extends PropertyKey = number,
> (
	this: Component | void,
	input: SortableInput<T>,
	options: SortableOptions<T, TItem, K>,
): Component & SortableExtensions<T, TItem, K> {
	if (!options || typeof options.render !== "function") {
		throw new TypeError("Sortable requires a render function.");
	}

	if (typeof options.placeholder !== "function") {
		throw new TypeError("Sortable requires a placeholder function.");
	}

	const component = Component(this ?? "div", Sortable) as Component & Partial<SortableExtensions<T, TItem, K>>;

	if (component.sortable) {
		return component as Component & SortableExtensions<T, TItem, K>;
	}

	return component.extend<SortableExtensions<T, TItem, K>>((root) => ({
		sortable: new SortableController(root, input, options),
	}));
} as SortableConstructor;

Sortable.Transfer = function Transfer<T> (label?: string): SortableTransfer<T> {
	return { label };
};
