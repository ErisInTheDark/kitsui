import { Owner, State, type CleanupFunction } from "../state/State";
import { AriaManipulator } from "./AriaManipulator";
import { AttributeManipulator } from "./AttributeManipulator";
import type { Falsy } from "./ClassManipulator";
import { ClassManipulator } from "./ClassManipulator";

declare global {
	interface Node {
		readonly component: Component | undefined;
	}
}

export type ComponentChild = Component | HTMLElement | string;
export type ComponentRender<TValue> = (value: TValue, component: Component) => void;
export type InsertWhere = "before" | "after";
export type InsertableNode = Node | Component | Falsy;
export type InsertableSelection = InsertableNode | Iterable<InsertableNode>;
export type ComponentSelection = Component | Falsy | Iterable<Component | Falsy>;
export interface ComponentSelectionState {
	readonly value: ComponentSelection;
	subscribe (owner: Owner, listener: (value: ComponentSelection) => void): CleanupFunction;
}
export type AppendableComponentChild = ComponentChild | ComponentSelectionState;
export type InsertableComponentChild = InsertableSelection | ComponentSelectionState;

export interface ComponentOptions {
	className?: string;
	textContent?: string;
}

type ConditionalNode = ComponentChild | InsertableNode;

export type ComponentOwnerResolver = (component: Component) => Owner | null;
export type ComponentMoveHandler = (component: Component) => void;

export interface ComponentExtensions { }

export type ExtendableComponentClass = (abstract new (...args: never[]) => Component) & {
	prototype: Component;
};

type ComponentConstructor = {
	(tagNameOrElement: string | HTMLElement, options?: ComponentOptions): Component;
	new(tagNameOrElement: string | HTMLElement, options?: ComponentOptions): Component;
	prototype: Component;
	wrap (element: HTMLElement): Component;
	extend (): ExtendableComponentClass;
};

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

const orphanedComponentErrorMessage = "Components must be mounted or owned before the next tick.";
const elementComponents = new WeakMap<HTMLElement, WeakRef<ComponentClass>>();
const componentMoveHandlers = new Set<ComponentMoveHandler>();
const componentOwnerResolvers = new Set<ComponentOwnerResolver>();
let componentAccessorInstalled = false;

type MoveParent = ParentNode & Node & {
	insertBefore (node: Node, child: Node | null): Node;
	moveBefore?: (node: Node, child: Node | null) => unknown;
};

function isMoveParent (value: ParentNode | null): value is MoveParent {
	return value !== null && typeof (value as Partial<MoveParent>).insertBefore === "function";
}

function moveNode (parent: MoveParent, node: Node, beforeNode: Node | null): void {
	if (typeof parent.moveBefore === "function") {
		parent.moveBefore(node, beforeNode);
		return;
	}

	parent.insertBefore(node, beforeNode);
}

function createStorageElement (documentRef: Document): HTMLElement {
	return documentRef.createElement("kitsui-storage");
}

function getLiveComponent (element: HTMLElement): ComponentClass | undefined {
	const component = elementComponents.get(element)?.deref();

	if (!component) {
		elementComponents.delete(element);
		return undefined;
	}

	return component;
}

function installNodeComponentAccessor (): void {
	if (componentAccessorInstalled) {
		return;
	}

	componentAccessorInstalled = true;
	Object.defineProperty(Node.prototype, "component", {
		configurable: true,
		enumerable: false,
		get (this: Node): Component | undefined {
			if (!(this instanceof HTMLElement)) {
				return undefined;
			}

			return getLiveComponent(this);
		},
	});
}

function isComponentSelectionState (value: unknown): value is ComponentSelectionState {
	return value instanceof State;
}

function isInsertableIterable (value: unknown): value is Iterable<InsertableNode> {
	return typeof value === "object"
		&& value !== null
		&& !(value instanceof Node)
		&& !(value instanceof ComponentClass)
		&& !(value instanceof State)
		&& Symbol.iterator in value;
}

function applyComponentMoveHandlers (component: Component): void {
	for (const handler of componentMoveHandlers) {
		handler(component);
	}
}

export function registerComponentMoveHandler (handler: ComponentMoveHandler): CleanupFunction {
	componentMoveHandlers.add(handler);

	return () => {
		componentMoveHandlers.delete(handler);
	};
}

export function registerComponentOwnerResolver (resolver: ComponentOwnerResolver): CleanupFunction {
	componentOwnerResolvers.add(resolver);

	return () => {
		componentOwnerResolvers.delete(resolver);
	};
}

function disposeManagedNode (node: Node): void {
	if (node instanceof HTMLElement) {
		const component = getLiveComponent(node);

		if (component && !component.disposed) {
			component.remove();
			return;
		}
	}

	for (const childNode of Array.from(node.childNodes)) {
		disposeManagedNode(childNode);
	}
}

function resolveHost (target: HTMLElement | string): HTMLElement {
	const host = typeof target === "string" ? document.querySelector(target) : target;

	if (!(host instanceof HTMLElement)) {
		throw new Error("Mount target was not found.");
	}

	return host;
}

class ComponentClass extends Owner {
	readonly element: HTMLElement;
	private owner: Owner | null = null;
	private releaseOwner: CleanupFunction = noop;
	private readonly structuralCleanups = new Set<CleanupFunction>();
	private orphanCheckId: ReturnType<typeof setTimeout> | null = null;

	constructor (tagNameOrElement: string | HTMLElement, options: ComponentOptions = {}) {
		super();
		installNodeComponentAccessor();

		this.element =
			typeof tagNameOrElement === "string"
				? document.createElement(tagNameOrElement)
				: tagNameOrElement;

		if (getLiveComponent(this.element)) {
			throw new Error("This node already has a component. Use node.component to retrieve it.");
		}

		if (options.className) {
			this.element.className = options.className;
		}

		if (options.textContent !== undefined) {
			this.element.textContent = options.textContent;
		}

		elementComponents.set(this.element, new WeakRef(this));
		this.refreshOrphanCheck();
	}

	static wrap (element: HTMLElement): ComponentClass {
		return new ComponentClass(element);
	}

	get class (): ClassManipulator {
		this.ensureActive();

		const manipulator = new ClassManipulator(this, this.element);
		Object.defineProperty(this, "class", {
			configurable: true,
			enumerable: true,
			value: manipulator,
			writable: false,
		});

		return manipulator;
	}

	get attribute (): AttributeManipulator {
		this.ensureActive();

		const manipulator = new AttributeManipulator(this, this.element);
		Object.defineProperty(this, "attribute", {
			configurable: true,
			enumerable: true,
			value: manipulator,
			writable: false,
		});

		return manipulator;
	}

	get aria (): AriaManipulator {
		this.ensureActive();

		const manipulator = new AriaManipulator(this.attribute);
		Object.defineProperty(this, "aria", {
			configurable: true,
			enumerable: true,
			value: manipulator,
			writable: false,
		});

		return manipulator;
	}

	append (...children: AppendableComponentChild[]): this {
		this.ensureActive();

		for (const child of children) {
			if (isComponentSelectionState(child)) {
				this.attachStatefulChildren(child, {
					getContainer: () => this.element,
					getOwner: () => this,
					getReferenceNode: () => null,
				});
				continue;
			}

			this.element.append(this.resolveChildNode(child, this));
		}

		return this;
	}

	prepend (...children: AppendableComponentChild[]): this {
		this.ensureActive();
		const referenceNode = this.element.firstChild;

		for (const child of children) {
			if (isComponentSelectionState(child)) {
				this.attachStatefulChildren(child, {
					getContainer: () => this.element,
					getOwner: () => this,
					getReferenceNode: () => referenceNode,
				});
				continue;
			}

			this.element.insertBefore(this.resolveChildNode(child, this), referenceNode);
		}

		return this;
	}

	insert (where: InsertWhere, ...nodes: InsertableComponentChild[]): this {
		this.ensureActive();

		const insertables = this.expandInsertableChildren(nodes);

		if (insertables.length === 0) {
			return this;
		}

		const parentNode = this.element.parentNode;

		if (!isMoveParent(parentNode)) {
			throw new Error("Insert target was not found.");
		}

		const orderedInsertables = where === "before"
			? insertables
			: [...insertables].reverse();

		for (const node of orderedInsertables) {
			if (isComponentSelectionState(node)) {
				this.attachStatefulChildren(node, {
					getContainer: () => this.element.parentNode,
					getOwner: () => this.resolveEffectiveOwner(),
					getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling,
				});
				continue;
			}

			const staticNode: InsertableNode = node;
			moveNode(parentNode, this.resolveInsertableNode(staticNode, this.resolveEffectiveOwner()), where === "before" ? this.element : this.element.nextSibling);
		}

		return this;
	}

	appendWhen (state: State<boolean>, child: ComponentChild): CleanupFunction {
		this.ensureActive();
		return this.attachConditionalNode(state, child, {
			getContainer: () => this.element,
			getOwner: () => this,
			getReferenceNode: () => null,
		});
	}

	prependWhen (state: State<boolean>, child: ComponentChild): CleanupFunction {
		this.ensureActive();
		return this.attachConditionalNode(state, child, {
			getContainer: () => this.element,
			getOwner: () => this,
			getReferenceNode: () => this.element.firstChild,
		});
	}

	insertWhen (state: State<boolean>, where: InsertWhere, ...nodes: InsertableSelection[]): CleanupFunction {
		this.ensureActive();
		const insertables = this.expandConditionalNodes(nodes);
		const orderedInsertables = where === "before"
			? insertables
			: [...insertables].reverse();
		const cleanups = orderedInsertables.map((node) => this.attachConditionalNode(state, node, {
			getContainer: () => this.element.parentNode,
			getOwner: () => this.resolveEffectiveOwner(),
			getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling,
		}));

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	}

	clear (): this {
		this.ensureActive();
		this.releaseStructuralCleanups();

		for (const childNode of Array.from(this.element.childNodes)) {
			disposeManagedNode(childNode);
		}

		this.element.replaceChildren();
		return this;
	}

	setAttribute (name: string, value: string): this {
		this.ensureActive();
		this.element.setAttribute(name, value);
		return this;
	}

	setText (text: string): this {
		this.ensureActive();
		this.releaseStructuralCleanups();

		for (const childNode of Array.from(this.element.childNodes)) {
			disposeManagedNode(childNode);
		}

		this.element.textContent = text;
		return this;
	}

	mount (target: HTMLElement | string): this {
		this.ensureActive();
		applyComponentMoveHandlers(this);

		const host = resolveHost(target);
		moveNode(host, this.element, null);
		this.refreshOrphanCheck();
		return this;
	}

	bindState<TValue> (state: State<TValue>, render: ComponentRender<TValue>): CleanupFunction {
		this.ensureActive();
		render(state.value, this);

		return state.subscribe(this, (value) => {
			render(value, this);
		});
	}

	remove (): void {
		super.dispose();
	}

	setOwner (owner: Owner | null): this {
		this.ensureActive();

		if (this.owner === owner) {
			return this;
		}

		this.releaseOwner();
		this.releaseOwner = noop;
		this.owner = owner;

		if (owner) {
			this.releaseOwner = owner.onCleanup(() => {
				this.remove();
			});
		}

		this.refreshOrphanCheck();

		return this;
	}

	getOwner (): Owner | null {
		return this.owner;
	}

	protected beforeDispose (): void {
		this.clearOrphanCheck();
		this.releaseStructuralCleanups();
		this.releaseOwner();
		this.releaseOwner = noop;
		this.owner = null;

		if (getLiveComponent(this.element) === this) {
			elementComponents.delete(this.element);
		}
	}

	protected afterDispose (): void {
		this.element.remove();
	}

	private ensureActive (): void {
		if (this.disposed) {
			throw new Error("Disposed components cannot be modified.");
		}
	}

	private clearOrphanCheck (): void {
		if (this.orphanCheckId === null) {
			return;
		}

		clearTimeout(this.orphanCheckId);
		this.orphanCheckId = null;
	}

	private refreshOrphanCheck (): void {
		if (this.disposed || this.isManaged()) {
			this.clearOrphanCheck();
			return;
		}

		if (this.orphanCheckId !== null) {
			return;
		}

		this.orphanCheckId = setTimeout(() => {
			this.orphanCheckId = null;

			if (!this.disposed && !this.isManaged()) {
				throw new Error(orphanedComponentErrorMessage);
			}
		}, 0);
	}

	private isManaged (): boolean {
		if (this.element.isConnected) {
			return true;
		}

		if (this.ownerResolves(this.owner)) {
			return true;
		}

		for (const resolver of componentOwnerResolvers) {
			if (this.ownerResolves(resolver(this))) {
				return true;
			}
		}

		return false;
	}

	private resolveEffectiveOwner (): Owner | null {
		if (this.owner) {
			return this.owner;
		}

		for (const resolver of componentOwnerResolvers) {
			const owner = resolver(this);

			if (owner) {
				return owner;
			}
		}

		return null;
	}

	private ownerResolves (owner: Owner | null): boolean {
		if (!owner || owner.disposed) {
			return false;
		}

		if (owner instanceof ComponentClass) {
			return owner.isManaged();
		}

		return true;
	}

	private resolveChildNode (child: ComponentChild, owner: Owner | null): Node {
		if (child instanceof ComponentClass) {
			child.ensureActive();
			applyComponentMoveHandlers(child);
			child.setOwner(owner);
			return child.element;
		}

		if (typeof child === "string") {
			return this.element.ownerDocument.createTextNode(child);
		}

		return child;
	}

	private resolveInsertableNode (node: ConditionalNode, owner: Owner | null): Node {
		if (!node) {
			throw new Error("Insert target was not found.");
		}

		if (typeof node === "string") {
			return this.element.ownerDocument.createTextNode(node);
		}

		if (node instanceof ComponentClass) {
			if (node === this) {
				return this.element;
			}

			node.ensureActive();
			applyComponentMoveHandlers(node);
			node.setOwner(owner);
			return node.element;
		}

		return node;
	}

	private expandInsertableChildren (children: InsertableComponentChild[]): Array<InsertableNode | ComponentSelectionState> {
		const expanded: Array<InsertableNode | ComponentSelectionState> = [];

		for (const child of children) {
			if (!child) {
				continue;
			}

			if (isInsertableIterable(child)) {
				for (const entry of child) {
					if (!entry) {
						continue;
					}

					expanded.push(entry);
				}

				continue;
			}

			expanded.push(child);
		}

		return expanded;
	}

	private expandConditionalNodes (nodes: InsertableSelection[]): ConditionalNode[] {
		const expanded: ConditionalNode[] = [];

		for (const node of nodes) {
			if (!node) {
				continue;
			}

			if (isInsertableIterable(node)) {
				for (const entry of node) {
					if (!entry) {
						continue;
					}

					expanded.push(entry);
				}

				continue;
			}

			expanded.push(node);
		}

		return expanded;
	}

	private trackStructuralCleanup (cleanup: CleanupFunction): CleanupFunction {
		let active = true;
		let releaseOwnerCleanup: CleanupFunction = noop;

		const trackedCleanup = () => {
			if (!active) {
				return;
			}

			active = false;
			this.structuralCleanups.delete(trackedCleanup);
			releaseOwnerCleanup();
			cleanup();
		};

		this.structuralCleanups.add(trackedCleanup);
		releaseOwnerCleanup = this.onCleanup(trackedCleanup);

		return trackedCleanup;
	}

	private releaseStructuralCleanups (): void {
		const structuralCleanups = [...this.structuralCleanups];

		for (const structuralCleanup of structuralCleanups) {
			structuralCleanup();
		}
	}

	private attachConditionalNode (
		state: State<boolean>,
		node: ConditionalNode,
		options: {
			getContainer: () => ParentNode | null;
			getOwner: () => Owner | null;
			getReferenceNode: () => Node | null;
		},
	): CleanupFunction {
		if (!node) {
			return noop;
		}

		const resolvedNode = this.resolveInsertableNode(node, options.getOwner());
		const placeholder = this.element.ownerDocument.createComment("kitsui:conditional");
		const storage = createStorageElement(this.element.ownerDocument);
		const childComponent = node instanceof ComponentClass ? node : null;
		let active = true;
		let releaseChildCleanup: CleanupFunction = noop;
		let placeholderWasInserted = false;

		const removeOwnerForMissingMarker = () => {
			if (!active) {
				return;
			}

			this.remove();
		};

		const placeVisible = () => {
			if (!active) {
				return;
			}

			const container = options.getContainer();

			if (!isMoveParent(container)) {
				if (placeholderWasInserted) {
					removeOwnerForMissingMarker();
					return;
				}

				moveNode(storage, resolvedNode, null);
				return;
			}

			if (placeholderWasInserted && resolvedNode.parentNode === storage && placeholder.parentNode !== container) {
				removeOwnerForMissingMarker();
				return;
			}

			if (placeholder.parentNode === container) {
				moveNode(container, resolvedNode, placeholder);
				placeholder.remove();
			} else {
				moveNode(container, resolvedNode, options.getReferenceNode());
			}
		};

		const placeHidden = () => {
			if (!active) {
				return;
			}

			const container = options.getContainer();

			if (!isMoveParent(container)) {
				if (placeholderWasInserted) {
					removeOwnerForMissingMarker();
					return;
				}

				if (resolvedNode.parentNode !== storage) {
					moveNode(storage, resolvedNode, null);
				}
				return;
			}

			if (placeholder.parentNode !== container) {
				moveNode(container, placeholder, options.getReferenceNode());
				placeholderWasInserted = true;
			}

			if (resolvedNode.parentNode !== storage) {
				moveNode(storage, resolvedNode, null);
			}
		};

		const cleanup = this.trackStructuralCleanup(() => {
			active = false;
			stateCleanup();
			releaseChildCleanup();
			placeholder.remove();
			storage.remove();

			if (childComponent) {
				childComponent.remove();
				return;
			}

			resolvedNode.parentNode?.removeChild(resolvedNode);
		});

		if (childComponent) {
			releaseChildCleanup = childComponent.onCleanup(cleanup);
		}

		const stateCleanup = state.subscribe(this, (nextVisible) => {
			if (nextVisible) {
				placeVisible();
				return;
			}

			placeHidden();
		});

		if (state.value) {
			placeVisible();
		} else {
			placeHidden();
		}

		return cleanup;
	}

	private attachStatefulChildren (
		state: ComponentSelectionState,
		options: {
			getContainer: () => ParentNode | null;
			getOwner: () => Owner | null;
			getReferenceNode: () => Node | null;
		},
	): CleanupFunction {
		const marker = this.element.ownerDocument.createComment("kitsui:stateful-child");
		const storage = createStorageElement(this.element.ownerDocument);
		let active = true;
		let renderedComponents: Component[] = [];
		let markerWasInserted = false;

		const cleanupRenderedComponents = (nextComponents: ReadonlySet<Component> = new Set()) => {
			for (const component of renderedComponents) {
				if (nextComponents.has(component)) {
					continue;
				}

				component.remove();
			}

			renderedComponents = renderedComponents.filter((component) => nextComponents.has(component));
		};

		const renderSelection = (selection: ComponentSelection) => {
			if (!active) {
				return;
			}

			const nextComponents = this.resolveComponentSelection(selection);
			const nextComponentSet = new Set(nextComponents);
			const container = options.getContainer();

			if (!isMoveParent(container)) {
				if (markerWasInserted) {
					this.remove();
					return;
				}

				cleanupRenderedComponents();
				return;
			}

			if (markerWasInserted && marker.parentNode !== container) {
				this.remove();
				return;
			}

			if (marker.parentNode !== container) {
				moveNode(container, marker, options.getReferenceNode());
				markerWasInserted = true;
			}

			cleanupRenderedComponents(nextComponentSet);

			const owner = options.getOwner();

			for (const component of nextComponents) {
				component.ensureActive();
				applyComponentMoveHandlers(component);
				component.setOwner(owner);
				moveNode(container, component.element, marker);
			}

			renderedComponents = nextComponents;
		};

		const cleanup = this.trackStructuralCleanup(() => {
			active = false;
			stateCleanup();
			cleanupRenderedComponents();
			marker.remove();
			storage.remove();
		});

		const stateCleanup = state.subscribe(this, (selection) => {
			renderSelection(selection);
		});

		renderSelection(state.value);
		return cleanup;
	}

	private resolveComponentSelection (selection: ComponentSelection): Component[] {
		if (!selection) {
			return [];
		}

		if (selection instanceof ComponentClass) {
			return [selection];
		}

		if (typeof selection !== "object" || !(Symbol.iterator in selection)) {
			throw new TypeError("Unsupported component selection.");
		}

		const components: Component[] = [];
		const seen = new Set<Component>();

		for (const item of selection) {
			if (!item) {
				continue;
			}

			if (!(item instanceof ComponentClass)) {
				throw new TypeError("Unsupported component selection item.");
			}

			if (seen.has(item)) {
				throw new Error("Component selections cannot contain the same component more than once.");
			}

			seen.add(item);
			components.push(item);
		}

		return components;
	}
}

interface ComponentClass extends ComponentExtensions { }

export type Component = ComponentClass;

export const Component = function Component (
	tagNameOrElement: string | HTMLElement = "span",
	options: ComponentOptions = {},
): Component {
	if (tagNameOrElement instanceof HTMLElement) {
		return ComponentClass.wrap(tagNameOrElement);
	}

	return new ComponentClass(tagNameOrElement, options);
} as ComponentConstructor;

Component.prototype = ComponentClass.prototype;
Component.wrap = function wrap (element: HTMLElement): Component {
	return ComponentClass.wrap(element);
};
Component.extend = function extend (): ExtendableComponentClass {
	return ComponentClass as ExtendableComponentClass;
};