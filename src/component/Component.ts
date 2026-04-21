import { Owner, State, type CleanupFunction } from "../state/State";
import { scheduleTimeoutPromise, type DeferredTimeoutHandle } from "../utility/timeoutPromise";
import { AriaManipulator } from "./AriaManipulator";
import { AttributeManipulator } from "./AttributeManipulator";
import type { Falsy } from "./ClassManipulator";
import { ClassManipulator } from "./ClassManipulator";
import type { ComponentHTMLElementEventMap } from "./EventManipulator";
import { EventManipulator } from "./EventManipulator";
import { Marker } from "./Marker";
import { StyleManipulator } from "./StyleManipulator";
import { TextManipulator } from "./TextManipulator";

declare global {
	interface Node {
		readonly component: Component | undefined;
	}

	interface HTMLElementEventMap {
		Mount: CustomEvent;
		Dispose: CustomEvent;
	}
}

/**
 * A child node that can be appended, prepended, or inserted.
 * Supports components, raw DOM nodes, and strings (converted to text nodes).
 * Falsy values (null, undefined, false) are silently ignored.
 */
export type ComponentChild = Component | Node | string | Falsy;

/**
 * One or more child nodes, optionally as an iterable or stateful selection.
 * Used as the parameter type for {@link Component.append}, {@link Component.prepend},
 * and {@link Component.insert}.
 */
export type ComponentChildren = ComponentChild | Iterable<ComponentChild> | ComponentSelectionState;

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
 * A marker interface for module-level component extensions.
 * Extend this interface to add methods to all Component instances.
 */
export interface ComponentExtensions { }

/**
 * A marker interface for module-level Component static extensions.
 * Extend this interface to add static methods to the Component constructor function.
 */
export interface ComponentStaticExtensions { }

/**
 * Constructor type for extending the Component class with custom methods.
 * Used with {@link Component.extend} to access and modify the Component prototype.
 */
export type ExtendableComponentClass = ComponentConstructor & ComponentStaticExtensions;

/** @group Component */
type ComponentConstructor = {
	/**
	 * @returns A new component that wraps a <span> element.
	 */
	(): Component<HTMLSpanElement>;
	/**
	 * @param tagName - An HTML tag name (creates new element).
	 * @returns A new component that wraps a DOM element.
	 */
	<NAME extends keyof HTMLElementTagNameMap> (tagName: NAME): Component<HTMLElementTagNameMap[NAME]>;
	/**
	 * @param element - An existing HTMLElement to wrap.
	 * @returns A new component that wraps a DOM element.
	 * @throws If wrapping an element that already has a component.
	 */
	<ELEMENT extends HTMLElement> (element: ELEMENT): Component<ELEMENT>;
	new (): Component<HTMLSpanElement>;
	/**
	 * @param tagName - An HTML tag name (creates new element).
	 * @returns A new component that wraps a DOM element.
	 * @throws If wrapping an element that already has a component.
	 */
	new<NAME extends keyof HTMLElementTagNameMap> (tagName: NAME): Component<HTMLElementTagNameMap[NAME]>;
	/**
	 * @param element - An existing HTMLElement to wrap.
	 * @returns A new component that wraps a DOM element.
	 * @throws If wrapping an element that already has a component.
	 */
	new <ELEMENT extends HTMLElement>(element: ELEMENT): Component<ELEMENT>;
	prototype: Component;
	/**
	 * Selects the first element in the document matching the CSS selector and wraps it in a component (or returns the existing).
	 * @param selector - A CSS selector string to match the element.
	 * @returns A component wrapping the matched element, or null if no element is found.
	 */
	query (selector: string): Component | null;
	/**
	 * Returns a component wrapping an element created from the provided HTML string.
	 * @param html - A string of HTML to parse and create an element from. Should contain a single root element.
	 * @returns A component wrapping the created element.
	 * @throws If the HTML string is invalid or contains multiple root elements.
	 */
	fromHTML(html: string): Component;
	/**
	 * Returns the extendable Component class for adding custom methods to all component instances.
	 * Used to define custom extensions that should be available on every component.
	 * @returns The Component class prototype that can be extended.
	 * @example
	 * declare module "kitsui/Component" {
	 *   interface ComponentExtensions {
	 *     custom (): string;
	 *   }
	 * }
	 * const ComponentClass = Component.extend();
	 * ComponentClass.prototype.custom = function() { return "custom"; };
	 */
	extend (): ExtendableComponentClass;
};

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

const orphanedComponentErrorMessage = "Components must be connected to the document or have a managed owner before the next tick.";
const recursiveTreeErrorMessage = "Cannot move a node into itself or one of its descendants.";
const elementComponents = new WeakMap<HTMLElement, WeakRef<ComponentClass<HTMLElement>>>();
const componentOwnerResolvers = new Set<ComponentOwnerResolver>();
let componentAccessorInstalled = false;

type MoveParent = ParentNode & Node & {
	insertBefore (node: Node, child: Node | null): Node;
	moveBefore?: (node: Node, child: Node | null) => unknown;
};

function isMoveParent (value: ParentNode | null): value is MoveParent {
	return value !== null && typeof (value as Partial<MoveParent>).insertBefore === "function";
}

function wouldCreateRecursiveTree (parent: MoveParent, node: Node): boolean {
	return node === parent || node.contains(parent);
}

function moveNode (parent: MoveParent, node: Node, beforeNode: Node | null): boolean {
	if (wouldCreateRecursiveTree(parent, node)) {
		console.error(recursiveTreeErrorMessage);
		return false;
	}

	try {
		if (typeof parent.moveBefore === "function" && parent.isConnected && node.isConnected) {
			parent.moveBefore(node, beforeNode);
			return true;
		}

		parent.insertBefore(node, beforeNode);
		return true;
	} catch (error) {
		if (error instanceof DOMException && error.name === "HierarchyRequestError") {
			console.error(recursiveTreeErrorMessage);
			return false;
		}

		throw error;
	}
}

function createStorageElement (documentRef: Document): HTMLElement {
	return documentRef.createElement("kitsui-storage");
}

function getLiveComponent (element: HTMLElement): ComponentClass<HTMLElement> | undefined {
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
	if (typeof value !== "object" || value === null) {
		return false;
	}

	if (value instanceof Node || value instanceof ComponentClass) {
		return false;
	}

	const maybeSelectionState = value as Partial<ComponentSelectionState>;
	return "value" in maybeSelectionState && typeof maybeSelectionState.subscribe === "function";
}

function isChildIterable (value: unknown): value is Iterable<ComponentChild> {
	return typeof value === "object"
		&& value !== null
		&& !(value instanceof Node)
		&& !(value instanceof ComponentClass)
		&& !(value instanceof State)
		&& Symbol.iterator in value;
}

/**
 * A function that resolves the owner of a component in a custom context.
 * Registered via registerComponentOwnerResolver to handle components outside standard parent-child hierarchies.
 */
export type ComponentOwnerResolver = (component: Component) => Owner | null;

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

/** @group Component */
class ComponentClass<ELEMENT extends HTMLElement> extends Owner {
	/**
	 * The underlying DOM element managed by this component.
	 */
	readonly element: ELEMENT;
	private explicitOwner: Owner | null = null;
	private releaseExplicitOwner: CleanupFunction = noop;
	private readonly structuralCleanups = new Set<CleanupFunction>();
	private mounted = false;
	private onBeforeMove: (() => void) | null = null;
	private orphanCheckId: DeferredTimeoutHandle | null = null;

	constructor (tagNameOrElement: string | HTMLElement) {
		super();
		installNodeComponentAccessor();

		this.element =(
			typeof tagNameOrElement === "string"
				? document.createElement(tagNameOrElement)
				: tagNameOrElement
		) as ELEMENT;

		if (getLiveComponent(this.element)) {
			throw new Error("This node already has a component. Use node.component to retrieve it.");
		}

		elementComponents.set(this.element, new WeakRef(this));
		this.refreshOrphanCheck();
	}

	/**
	 * Lazily creates and memoizes a ClassManipulator for adding/removing CSS classes.
	 */
	get class (): ClassManipulator<this> {
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
	get attribute (): AttributeManipulator<this> {
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
	 * Lazily creates and memoizes a StyleManipulator for managing inline styles.
	 */
	get style (): StyleManipulator<this> {
		this.ensureActive();

		const manipulator = new StyleManipulator(this, this.element);
		Object.defineProperty(this, "style", {
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
	get aria (): AriaManipulator<this> {
		this.ensureActive();

		const manipulator = new AriaManipulator(this, this.attribute);
		Object.defineProperty(this, "aria", {
			configurable: true,
			enumerable: true,
			value: manipulator,
			writable: false,
		});

		return manipulator;
	}

	/**
	 * Lazily creates and memoizes a TextManipulator for managing text content.
	 */
	get text (): TextManipulator<this> {
		this.ensureActive();

		const manipulator = new TextManipulator(this, (value) => {
			this.releaseStructuralCleanups();

			for (const childNode of Array.from(this.element.childNodes)) {
				disposeManagedNode(childNode);
			}

			this.element.textContent = value;
		});
		Object.defineProperty(this, "text", {
			configurable: true,
			enumerable: true,
			value: manipulator,
			writable: false,
		});

		return manipulator;
	}

	/**
	 * Lazily creates and memoizes an EventManipulator for managing host event listeners.
	 */
	get event (): EventManipulator<this> {
		this.ensureActive();

		const manipulator = new EventManipulator<this, "component", ComponentHTMLElementEventMap>(this, this.element);
		Object.defineProperty(this, "event", {
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
	 * @param children - Nodes, components, strings, iterables, or ComponentSelectionState.
	 * @returns This component for chaining.
	 */
	append (...children: ComponentChildren[]): this {
		this.ensureActive();

		for (const child of this.expandChildren(children)) {
			if (isComponentSelectionState(child)) {
				this.attachStatefulChildren(child, {
					getContainer: () => this.element,
					getReferenceNode: () => null,
				});
				continue;
			}

			const moved = moveNode(this.element, this.resolveNode(child), null);
			if (moved && child instanceof ComponentClass) {
				child.refreshOrphanCheck();
				child.dispatchMount();
			}
		}

		return this;
	}

	/**
	 * Prepends children to this component's element, before existing content.
	 * Strings are converted to text nodes. Falsy values are ignored.
	 * Components are owned by this component and removed when this component is removed.
	 * @param children - Nodes, components, strings, iterables, or ComponentSelectionState.
	 * @returns This component for chaining.
	 */
	prepend (...children: ComponentChildren[]): this {
		this.ensureActive();
		const referenceNode = this.element.firstChild;

		for (const child of this.expandChildren(children)) {
			if (isComponentSelectionState(child)) {
				this.attachStatefulChildren(child, {
					getContainer: () => this.element,
					getReferenceNode: () => referenceNode,
				});
				continue;
			}

			const moved = moveNode(this.element, this.resolveNode(child), referenceNode);
			if (moved && child instanceof ComponentClass) {
				child.refreshOrphanCheck();
				child.dispatchMount();
			}
		}

		return this;
	}

	/**
	 * Inserts children before or after this component (relative to its parent).
	 * Strings are converted to text nodes. Falsy values are filtered out. Useful for inserting siblings.
	 * @param where - "before" to insert before this component, or "after" to insert after.
	 * @param nodes - One or more nodes, strings, iterables, or ComponentSelectionState to insert.
	 * @returns This component for chaining.
	 * @throws If this component has no parent node.
	 */
	insert (where: InsertWhere, ...nodes: ComponentChildren[]): this {
		this.ensureActive();

		const insertables = this.expandChildren(nodes);

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
					getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling,
				});
				continue;
			}

			const moved = moveNode(parentNode, this.resolveNode(node), where === "before" ? this.element : this.element.nextSibling);
			if (moved && node instanceof ComponentClass) {
				node.refreshOrphanCheck();
				node.dispatchMount();
			}
		}

		return this;
	}

	/**
	 * Appends children conditionally based on state.
	 * When the state becomes true, children are inserted. When false, they are parked in storage and placeholders remain in-flow.
	 * @param state - A State<boolean> that controls visibility.
	 * @param nodes - Nodes or iterables of nodes to append conditionally.
	 * @returns This component for chaining.
	 */
	appendWhen (state: State<boolean>, ...nodes: ComponentChildren[]): this {
		this.ensureActive();

		for (const node of this.expandChildren(nodes)) {
			if (isComponentSelectionState(node)) {
				this.attachConditionalSelectionState(state, node, {
					getContainer: () => this.element,
					getReferenceNode: () => null,
				});
				continue;
			}

			this.attachConditionalNode(state, node, {
				getContainer: () => this.element,
				getReferenceNode: () => null,
			});
		}

		return this;
	}

	/**
	 * Prepends children conditionally based on state.
	 * When the state becomes true, children are inserted before the current first child.
	 * @param state - A State<boolean> that controls visibility.
	 * @param nodes - Nodes or iterables of nodes to prepend conditionally.
	 * @returns This component for chaining.
	 */
	prependWhen (state: State<boolean>, ...nodes: ComponentChildren[]): this {
		this.ensureActive();
		const referenceNode = this.element.firstChild;

		for (const node of this.expandChildren(nodes)) {
			if (isComponentSelectionState(node)) {
				this.attachConditionalSelectionState(state, node, {
					getContainer: () => this.element,
					getReferenceNode: () => referenceNode,
				});
				continue;
			}

			this.attachConditionalNode(state, node, {
				getContainer: () => this.element,
				getReferenceNode: () => referenceNode,
			});
		}

		return this;
	}

	/**
	 * Inserts children conditionally before or after this component, based on state.
	 * When the state becomes true, children are inserted. When false, they're stored but stay in the DOM as a placeholder.
	 * @param state - A State<boolean> that controls visibility.
	 * @param where - "before" to insert before this component, or "after" to insert after.
	 * @param nodes - Nodes or iterables of nodes to insert conditionally.
	 * @returns This component for chaining.
	 */
	insertWhen (state: State<boolean>, where: InsertWhere, ...nodes: ComponentChildren[]): this {
		this.ensureActive();
		const insertables = this.expandChildren(nodes);
		const orderedInsertables = where === "before"
			? insertables
			: [...insertables].reverse();

		for (const node of orderedInsertables) {
			if (isComponentSelectionState(node)) {
				this.attachConditionalSelectionState(state, node, {
					getContainer: () => this.element.parentNode,
					getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling,
				});
				continue;
			}

			this.attachConditionalNode(state, node, {
				getContainer: () => this.element.parentNode,
				getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling,
			});
		}

		return this;
	}

	private attachConditionalSelectionState (
		visibleState: State<boolean>,
		selectionState: ComponentSelectionState,
		options: {
			getContainer: () => ParentNode | null;
			getReferenceNode: () => Node | null;
		},
	): CleanupFunction {
		const marker = Marker("kitsui:conditional-stateful").setOwner(this);
		const storage = createStorageElement(this.element.ownerDocument);
		let active = true;
		let markerWasInserted = false;
		let renderedComponents: Component[] = [];
		const retainedHiddenComponents = new Set<Component>();

		const cleanupRenderedComponents = (
			nextComponents: ReadonlySet<Component> = new Set(),
			mode: "dispose" | "retain" = "dispose",
		) => {
			for (const component of renderedComponents) {
				if (nextComponents.has(component)) {
					retainedHiddenComponents.delete(component);
					continue;
				}

				if (mode === "dispose") {
					retainedHiddenComponents.delete(component);
					component.remove();
					continue;
				}

				retainedHiddenComponents.add(component);
			}

			renderedComponents = renderedComponents.filter(component => nextComponents.has(component));
		};

		const releaseRetainedHiddenComponents = (nextComponents: ReadonlySet<Component>) => {
			for (const component of [...retainedHiddenComponents]) {
				if (nextComponents.has(component)) {
					continue;
				}

				retainedHiddenComponents.delete(component);
				component.element.parentNode?.removeChild(component.element);
				component.refreshOrphanCheck();
			}
		};

		const render = () => {
			if (!active) {
				return;
			}

			const nextComponents = this.resolveComponentSelection(selectionState.value);
			const nextComponentSet = new Set(nextComponents);
			const container = options.getContainer();

			if (!isMoveParent(container)) {
				if (markerWasInserted) {
					this.remove();
					return;
				}

				cleanupRenderedComponents(nextComponentSet, visibleState.value ? "dispose" : "retain");
				if (visibleState.value) {
					releaseRetainedHiddenComponents(nextComponentSet);
				}
				for (const component of nextComponents) {
					retainedHiddenComponents.delete(component);
					component.ensureActive();
					component.onBeforeMove?.();
					moveNode(storage, component.element, null);
				}
				renderedComponents = nextComponents;
				return;
			}

			if (markerWasInserted && marker.node.parentNode !== container) {
				this.remove();
				return;
			}

			if (marker.node.parentNode !== container) {
				moveNode(container, marker.node, options.getReferenceNode());
				markerWasInserted = true;
			}

			cleanupRenderedComponents(nextComponentSet, visibleState.value ? "dispose" : "retain");

			if (visibleState.value) {
				releaseRetainedHiddenComponents(nextComponentSet);
				for (const component of nextComponents) {
					retainedHiddenComponents.delete(component);
					component.ensureActive();
					component.onBeforeMove?.();
					const moved = moveNode(container, component.element, marker.node);
					if (moved) {
						component.refreshOrphanCheck();
						component.dispatchMount();
					}
				}
			} else {
				for (const component of nextComponents) {
					retainedHiddenComponents.delete(component);
					component.ensureActive();
					component.onBeforeMove?.();
					moveNode(storage, component.element, null);
				}
			}

			renderedComponents = nextComponents;
		};

		const cleanup = this.trackStructuralCleanup(() => {
			active = false;
			releaseVisibleSubscription();
			releaseSelectionSubscription();
			cleanupRenderedComponents();
			for (const component of retainedHiddenComponents) {
				component.remove();
			}
			retainedHiddenComponents.clear();
			marker.remove();
			storage.remove();
		});

		const releaseVisibleSubscription = visibleState.subscribe(this, render);
		const releaseSelectionSubscription = selectionState.subscribe(this, render);
		render();

		return cleanup;
	}

	/**
	 * Clears all child nodes from this component.
	 * @returns This component for chaining.
	 */
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
	 * Runs a setup callback against this component, or subscribes a render function to a state.
	 * The stateful form invokes the render immediately with the current value, then again each time the state changes.
	 * @param setup A setup callback that can perform additional fluent configuration.
	 * @returns This component for chaining.
	 */
	use (setup: (component: Component) => unknown): this;
	/**
	 * Subscribes this component to state changes and re-renders when the state updates.
	 * The render function is called immediately with the current state value, then again each time the state changes.
	 * The subscription is automatically cleaned up when this component is removed.
	 * @typeParam TValue - The type of state value being rendered.
	 * @param state - The state to subscribe to.
	 * @param render - Function called with the state value and this component, for each update.
	 * @returns This component for chaining.
	 */
	use<TValue> (state: State<TValue>, render: ComponentRender<TValue>): this;
	use<TValue> (setupOrState: ((component: Component) => unknown) | State<TValue>, render?: ComponentRender<TValue>): this {
		this.ensureActive();

		if (typeof setupOrState === "function") {
			setupOrState(this);
			return this;
		}

		if (!render) {
			throw new Error("Component.use requires a render function when passed a state.");
		}

		render(setupOrState.value, this);
		setupOrState.subscribe(this, (value) => {
			render(value, this);
		});
		return this;
	}

	/**
	 * Removes this component from the DOM and disposes its resources.
	 * Owned child components are also removed.
	 * The component cannot be modified after removal.
	 */
	remove (): void {
		super.dispose();
	}

	/** @internal Dispatches the Mount event if this component has never been mounted. */
	dispatchMount (): void {
		if (this.mounted) {
			return;
		}

		this.mounted = true;
		this.element.dispatchEvent(new CustomEvent("Mount"));
	}

	/**
	 * Sets or clears the explicit owner of this component.
	 * When a component has an explicit owner, it is removed when the owner is disposed.
	 * This is independent of implicit ownership through DOM ancestry.
	 * @param owner - The owner component or state, or null to remove explicit ownership.
	 * @returns This component for chaining.
	 */
	setOwner (owner: Owner | null): this {
		this.ensureActive();

		if (this.explicitOwner === owner) {
			return this;
		}

		this.releaseExplicitOwner();
		this.releaseExplicitOwner = noop;
		this.explicitOwner = owner;

		if (owner) {
			this.releaseExplicitOwner = owner.onCleanup(() => {
				this.remove();
			});
		}

		this.refreshOrphanCheck();

		return this;
	}

	/**
	 * Gets the current explicit owner of this component.
	 * @returns The owner component/state, or null if no explicit owner is set.
	 */
	getOwner (): Owner | null {
		return this.explicitOwner;
	}

	protected beforeDispose (): void {
		this.element.dispatchEvent(new CustomEvent("Dispose"));
		this.clearOrphanCheck();
		this.releaseStructuralCleanups();
		this.releaseExplicitOwner();
		this.releaseExplicitOwner = noop;
		this.explicitOwner = null;

		if (getLiveComponent(this.element) === this) {
			elementComponents.delete(this.element);
		}
	}

	protected afterDispose (): void {
		this.element.remove();

		const disposeImplicitChildren = (node: Node): void => {
			if (node instanceof HTMLElement) {
				const component = getLiveComponent(node);

				if (component && !component.disposed) {
					if (component.getOwner()) {
						return;
					}

					component.remove();
					return;
				}
			}

			for (const childNode of Array.from(node.childNodes)) {
				disposeImplicitChildren(childNode);
			}
		};

		for (const childNode of Array.from(this.element.childNodes)) {
			disposeImplicitChildren(childNode);
		}
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

		this.orphanCheckId.cancel();
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

		this.orphanCheckId = scheduleTimeoutPromise(() => {
			this.orphanCheckId = null;

			if (this.disposed) {
				return;
			}

			if (this.isManaged()) {
				this.dispatchMount();
				return;
			}

			throw new Error(orphanedComponentErrorMessage);
		});
	}

	private isManaged (): boolean {
		if (this.element.isConnected) {
			return true;
		}

		if (this.ownerResolves(this.explicitOwner)) {
			return true;
		}

		for (const resolver of componentOwnerResolvers) {
			if (this.ownerResolves(resolver(this))) {
				return true;
			}
		}

		return false;
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

	private resolveNode (child: ComponentChild): Node {
		if (!child && child !== "") {
			throw new Error("Cannot resolve a falsy value to a DOM node.");
		}

		if (typeof child === "string") {
			return this.element.ownerDocument.createTextNode(child);
		}

		if (child instanceof ComponentClass) {
			child.ensureActive();
			child.onBeforeMove?.();
			return child.element;
		}

		return child;
	}

	private expandChildren (children: ComponentChildren[]): Array<ComponentChild | ComponentSelectionState> {
		const expanded: Array<ComponentChild | ComponentSelectionState> = [];

		for (const child of children) {
			if (!child && child !== "") {
				continue;
			}

			if (isComponentSelectionState(child)) {
				expanded.push(child);
				continue;
			}

			if (isChildIterable(child)) {
				for (const entry of child) {
					if (!entry && entry !== "") {
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
		node: ComponentChild,
		options: {
			getContainer: () => ParentNode | null;
			getReferenceNode: () => Node | null;
		},
	): CleanupFunction {
		if (!node && node !== "") {
			return noop;
		}

		const resolvedNode = this.resolveNode(node);
		const placeholder = Marker("kitsui:conditional").setOwner(this);
		const storage = createStorageElement(this.element.ownerDocument);
		const childComponent = node instanceof ComponentClass ? node : null;
		let active = true;
		let releaseChildCleanup: CleanupFunction = noop;
		let placeholderWasInserted = false;

		if (childComponent && childComponent.getOwner() === null) {
			childComponent.setOwner(this);
		}

		const getSafeReferenceNode = (container: ParentNode): Node | null => {
			const referenceNode = options.getReferenceNode();
			if (!referenceNode) {
				return null;
			}

			return referenceNode.parentNode === container ? referenceNode : null;
		};

		const removeOwnerForMissingMarker = () => {
			if (!active) {
				return;
			}

			this.remove();
		};

		const ensurePlaceholder = (): MoveParent | null => {
			const container = options.getContainer();

			if (!isMoveParent(container)) {
				if (placeholderWasInserted) {
					removeOwnerForMissingMarker();
				}

				return null;
			}

			if (!placeholderWasInserted) {
				moveNode(container, placeholder.node, getSafeReferenceNode(container));
				placeholderWasInserted = true;
				return container;
			}

			if (placeholder.node.parentNode !== container) {
				removeOwnerForMissingMarker();
				return null;
			}

			return container;
		};

		const placeVisible = () => {
			if (!active) {
				return;
			}

			const initialContainer = options.getContainer();
			if (isMoveParent(initialContainer) && wouldCreateRecursiveTree(initialContainer, resolvedNode)) {
				console.error(recursiveTreeErrorMessage);
				return;
			}

			const container = ensurePlaceholder();

			if (!active) {
				return;
			}

			if (!container) {
				moveNode(storage, resolvedNode, null);
				return;
			}

			const moved = moveNode(container, resolvedNode, placeholder.node);

			if (moved) {
				childComponent?.refreshOrphanCheck();
				childComponent?.dispatchMount();
			}
		};

		const placeHidden = () => {
			if (!active) {
				return;
			}

			const initialContainer = options.getContainer();
			if (isMoveParent(initialContainer) && wouldCreateRecursiveTree(initialContainer, resolvedNode)) {
				console.error(recursiveTreeErrorMessage);
				return;
			}

			const container = ensurePlaceholder();

			if (!active) {
				return;
			}

			if (!container) {
				if (resolvedNode.parentNode !== storage) {
					moveNode(storage, resolvedNode, null);
				}
				return;
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
				const explicitOwner = childComponent.getOwner();
				if (explicitOwner && explicitOwner !== this) {
					childComponent.element.parentNode?.removeChild(childComponent.element);
					childComponent.refreshOrphanCheck();
					return;
				}

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
			getReferenceNode: () => Node | null;
		},
	): CleanupFunction {
		const marker = Marker("kitsui:stateful-child").setOwner(this);
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

			if (markerWasInserted && marker.node.parentNode !== container) {
				this.remove();
				return;
			}

			if (marker.node.parentNode !== container) {
				moveNode(container, marker.node, options.getReferenceNode());
				markerWasInserted = true;
			}

			cleanupRenderedComponents(nextComponentSet);

			for (const component of nextComponents) {
				component.ensureActive();
				component.onBeforeMove?.();
				const moved = moveNode(container, component.element, marker.node);
				if (moved) {
					component.refreshOrphanCheck();
					component.dispatchMount();
				}
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

interface ComponentClass<ELEMENT extends HTMLElement> extends ComponentExtensions { }

/** @group Component */
export type Component<ELEMENT extends HTMLElement = HTMLElement> = ComponentClass<ELEMENT>;

/**
 * Creates a new component that wraps or creates an HTMLElement.
 * Can be called with or without the `new` keyword.
 * @param tagNameOrElement - HTML tag name to create, or an existing HTMLElement to wrap. Defaults to "span".
 * @returns A new component instance.
 * @throws If wrapping an element that already has a component attached.
 * @example
 * const div = Component("div");
 * const section = new Component("section");
 * const wrapped = Component(document.getElementById("existing"));
 * @group Component
 */
export const Component = function Component (
	tagNameOrElement: string | HTMLElement = "span",
): Component {
	return new ComponentClass(tagNameOrElement);
} as ComponentConstructor & ComponentStaticExtensions;

Component.prototype = ComponentClass.prototype;

/**
 * Selects the first element in the document matching the CSS selector and wraps it in a component (or returns the existing).
 * @param selector - A CSS selector string to match the element.
 * @returns A component wrapping the matched element, or null if no element is found.
 */
Component.query = function query (selector: string): Component | null {
	const element = document.querySelector<HTMLElement>(selector);
	if (!element) {
		return null;
	}

	return elementComponents.get(element)?.deref() ?? Component(element);
};

/**
 * Returns a component wrapping an element created from the provided HTML string.
 * @param html - A string of HTML to parse and create an element from. Should contain a single root element.
 * @returns A component wrapping the created element.
 * @throws If the HTML string is invalid or contains multiple root elements.
 */
Component.fromHTML = function fromHTML (html: string): Component { 
	const template = document.createElement("template");
	template.innerHTML = html.trim();
	const element = template.content.firstElementChild as HTMLElement;
	if (!element) {
		throw new Error("Invalid HTML string.");
	}
	if (template.content.childElementCount > 1) {
		throw new Error("HTML string contains multiple root elements.");
	}
	return Component(element);
}

/**
 * Returns the extendable Component class for adding custom methods to all component instances.
 * Used to define custom extensions that should be available on every component.
 * @returns The Component class prototype that can be extended.
 * @example
 * declare module "kitsui/Component" {
 *   interface ComponentExtensions {
 *     custom (): string;
 *   }
 * }
 * const ComponentClass = Component.extend();
 * ComponentClass.prototype.custom = function() { return "custom"; };
 */
Component.extend = function extend (): ExtendableComponentClass {
	return ComponentClass as ExtendableComponentClass;
};
