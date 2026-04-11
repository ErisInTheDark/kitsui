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

/**
 * A child node that can be appended or prepended to a component.
 * Supports components, raw DOM elements, and strings (converted to text nodes).
 */
export type ComponentChild = Component | HTMLElement | string;

/**
 * A render function that responds to state changes.
 * @typeParam TValue - The type of state value being rendered.
 */
export type ComponentRender<TValue> = (value: TValue, component: Component) => void;

/**
 * Specifies the direction for inserting a component relative to an anchor.
 */
export type InsertWhere = "before" | "after";

/**
 * A node that can be inserted into the DOM tree.
 * Falsy values (null, undefined, false) are filtered out and do not produce nodes.
 */
export type InsertableNode = Node | Component | Falsy;

/**
 * One or more nodes that can be inserted.
 * Supports individual nodes or iterables (arrays, sets, etc.) of nodes.
 */
export type InsertableSelection = InsertableNode | Iterable<InsertableNode>;

/**
 * One or more components, potentially empty (falsy) or an iterable collection.
 * Used with stateful rendering to dynamically control which components are in the DOM.
 */
export type ComponentSelection = Component | Falsy | Iterable<Component | Falsy>;

/**
 * Represents a stateful source of component selections.
 * Used to dynamically render different components based on state changes.
 */
export interface ComponentSelectionState {
	readonly value: ComponentSelection;
	subscribe (owner: Owner, listener: (value: ComponentSelection) => void): CleanupFunction;
}

/**
 * A child node that can be appended or prepended to a component.
 * Extends ComponentChild to include stateful selections.
 */
export type AppendableComponentChild = ComponentChild | ComponentSelectionState;

/**
 * A node that can be inserted relative to a component.
 * Extends InsertableSelection to include stateful selections.
 */
export type InsertableComponentChild = InsertableSelection | ComponentSelectionState;

/**
 * Configuration options when creating a new component.
 */
export interface ComponentOptions {
	/**
	 * Optional CSS class names to apply to the element.
	 */
	className?: string;
	/**
	 * Optional text content to set on the element.
	 */
	textContent?: string;
}

type ConditionalNode = ComponentChild | InsertableNode;

/**
 * A function that resolves the owner of a component in a custom context.
 * Registered via registerComponentOwnerResolver to handle components outside standard parent-child hierarchies.
 */
export type ComponentOwnerResolver = (component: Component) => Owner | null;

/**
 * A function invoked when a component is moved (inserted or mounted).
 * Registered via registerComponentMoveHandler to respond to component positioning changes.
 */
export type ComponentMoveHandler = (component: Component) => void;

/**
 * A marker interface for module-level component extensions.
 * Extend this interface to add methods to all Component instances.
 */
export interface ComponentExtensions { }

/**
 * The Component constructor class, used internally by Component.extend() to access prototype.
 * Allows adding custom methods to all component instances.
 */
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

/**
 * Registers a handler to be called whenever a component is moved or mounted.
 * Useful for extensions that need to respond to component positioning changes.
 * @param handler - Function to invoke when a component moves.
 * @returns A cleanup function that unregisters the handler.
 */
export function registerComponentMoveHandler (handler: ComponentMoveHandler): CleanupFunction {
	componentMoveHandlers.add(handler);

	return () => {
		componentMoveHandlers.delete(handler);
	};
}

/**
 * Registers a resolver to determine the owner of a component in custom contexts.
 * Useful for managing component lifecycles outside the standard parent-child hierarchy.
 * Called when a component needs to resolve its owner (e.g., during append operations).
 * @param resolver - Function that returns the owner for a given component, or null if not applicable.
 * @returns A cleanup function that unregisters the resolver.
 */
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
	/**
	 * The underlying DOM element managed by this component.
	 */
	readonly element: HTMLElement;
	private owner: Owner | null = null;
	private releaseOwner: CleanupFunction = noop;
	private readonly structuralCleanups = new Set<CleanupFunction>();
	private orphanCheckId: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Creates a new component that wraps a DOM element.
	 * @param tagNameOrElement - Either an HTML tag name (creates new element) or an existing HTMLElement to wrap.
	 * @param options - Optional configuration for className and textContent.
	 * @throws If wrapping an element that already has a component.
	 */
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

	/**
	 * Wraps an existing HTMLElement in a component.
	 * @param element - The DOM element to wrap.
	 * @returns A component wrapping the element.
	 * @throws If the element already has a component attached.
	 */
	static wrap (element: HTMLElement): ComponentClass {
		return new ComponentClass(element);
	}

	/**
	 * Lazily creates and memoizes a ClassManipulator for adding/removing CSS classes.
	 */
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

	/**
	 * Lazily creates and memoizes an AttributeManipulator for managing element attributes.
	 */
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

	/**
	 * Lazily creates and memoizes an AriaManipulator for managing ARIA attributes.
	 */
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

	/**
	 * Appends children to this component's element.
	 * Strings are converted to text nodes. Falsy values are ignored.
	 * Components are owned by this component and removed when this component is removed.
	 * @param children - Nodes, components, strings, or ComponentSelectionState.
	 * @returns This component for chaining.
	 */
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

	/**
	 * Prepends children to this component's element, before existing content.
	 * Strings are converted to text nodes. Falsy values are ignored.
	 * Components are owned by this component and removed when this component is removed.
	 * @param children - Nodes, components, strings, or ComponentSelectionState.
	 * @returns This component for chaining.
	 */
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

	/**
	 * Inserts children before or after this component (relative to its parent).
	 * Falsy values are filtered out. Useful for inserting siblings.
	 * @param where - "before" to insert before this component, or "after" to insert after.
	 * @param nodes - One or more nodes or iterables of nodes to insert.
	 * @returns This component for chaining.
	 * @throws If this component has no parent node.
	 */
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

	/**
	 * Appends a child conditionally based on state.
	 * When the state becomes true, the child is inserted. When false, it's stored but stays in the DOM as a placeholder.
	 * @param state - A State<boolean> that controls visibility.
	 * @param child - The child to append conditionally.
	 * @returns A cleanup function that removes the conditional binding and the child.
	 */
	appendWhen (state: State<boolean>, child: ComponentChild): CleanupFunction {
		this.ensureActive();
		return this.attachConditionalNode(state, child, {
			getContainer: () => this.element,
			getOwner: () => this,
			getReferenceNode: () => null,
		});
	}

	/**
	 * Prepends a child conditionally based on state.
	 * When the state becomes true, the child is inserted before existing content.
	 * @param state - A State<boolean> that controls visibility.
	 * @param child - The child to prepend conditionally.
	 * @returns A cleanup function that removes the conditional binding and the child.
	 */
	prependWhen (state: State<boolean>, child: ComponentChild): CleanupFunction {
		this.ensureActive();
		return this.attachConditionalNode(state, child, {
			getContainer: () => this.element,
			getOwner: () => this,
			getReferenceNode: () => this.element.firstChild,
		});
	}

	/**
	 * Inserts children conditionally before or after this component, based on state.
	 * When the state becomes true, children are inserted. When false, they're stored but stay in the DOM as a placeholder.
	 * @param state - A State<boolean> that controls visibility.
	 * @param where - "before" to insert before this component, or "after" to insert after.
	 * @param nodes - Nodes or iterables of nodes to insert conditionally.
	 * @returns A cleanup function that removes all conditional bindings and children.
	 */
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

	/**
	 * Sets a single attribute on the element.
	 * @param name - The attribute name.
	 * @param value - The attribute value.
	 * @returns This component for chaining.
	 */
	setAttribute (name: string, value: string): this {
		this.ensureActive();
		this.element.setAttribute(name, value);
		return this;
	}

	/**
	 * Sets the element's text content, removing all child nodes and disposing managed component children.
	 * @param text - The text to set.
	 * @returns This component for chaining.
	 */
	setText (text: string): this {
		this.ensureActive();
		this.releaseStructuralCleanups();

		for (const childNode of Array.from(this.element.childNodes)) {
			disposeManagedNode(childNode);
		}

		this.element.textContent = text;
		return this;
	}

	/**
	 * Mounts this component into the DOM tree at the specified target.
	 * @param target - An HTMLElement or CSS selector string identifying the mount point.
	 * @returns This component for chaining.
	 * @throws If the target selector does not resolve to an HTMLElement.
	 */
	mount (target: HTMLElement | string): this {
		this.ensureActive();
		applyComponentMoveHandlers(this);

		const host = resolveHost(target);
		moveNode(host, this.element, null);
		this.refreshOrphanCheck();
		return this;
	}

	/**
	 * Subscribes this component to state changes and re-renders when the state updates.
	 * The render function is called immediately with the current state value, then again each time the state changes.
	 * The subscription is automatically cleaned up when this component is removed.
	 * @typeParam TValue - The type of state value being rendered.
	 * @param state - The state to subscribe to.
	 * @param render - Function called with the state value and this component, for each update.
	 * @returns A cleanup function that unsubscribes from the state.
	 */
	bindState<TValue> (state: State<TValue>, render: ComponentRender<TValue>): CleanupFunction {
		this.ensureActive();
		render(state.value, this);

		return state.subscribe(this, (value) => {
			render(value, this);
		});
	}

	/**
	 * Removes this component from the DOM and disposes its resources.
	 * Owned child components are also removed.
	 * The component cannot be modified after removal.
	 */
	remove (): void {
		super.dispose();
	}

	/**
	 * Sets or clears the owner of this component.
	 * When a component has an owner, it is removed when the owner is disposed.
	 * Used to establish parent-child lifecycle relationships.
	 * @param owner - The owner component or state, or null to remove ownership.
	 * @returns This component for chaining.
	 */
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

	/**
	 * Gets the current owner of this component.
	 * @returns The owner component/state, or null if no owner is set.
	 */
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

/**
 * Creates a new component that wraps or creates an HTMLElement.
 * Can be called with or without the `new` keyword.
 * @param tagNameOrElement - HTML tag name to create, or an existing HTMLElement to wrap. Defaults to "span".
 * @param options - Optional configuration for className and textContent.
 * @returns A new component instance.
 * @throws If wrapping an element that already has a component attached.
 * @example
 * const div = Component("div");
 * const section = new Component("section", { className: "panel" });
 * const wrapped = Component(document.getElementById("existing"));
 */
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

/**
 * Wraps an existing HTMLElement in a component.
 * @param element - The DOM element to wrap.
 * @returns A component wrapping the element.
 * @throws If the element already has a component attached.
 */
Component.wrap = function wrap (element: HTMLElement): Component {
	return ComponentClass.wrap(element);
};

/**
 * Returns the extendable Component class for adding custom methods to all component instances.
 * Used to define custom extensions that should be available on every component.
 * @returns The Component class prototype that can be extended.
 * @example
 * const ComponentClass = Component.extend();
 * ComponentClass.prototype.custom = function() { return "custom"; };
 */
Component.extend = function extend (): ExtendableComponentClass {
	return ComponentClass as ExtendableComponentClass;
};