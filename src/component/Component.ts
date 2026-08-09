import { Owner, State, type CleanupFunction } from "../state/State";
import { cleanupAndRethrow, runCleanupSteps } from "../utility/cleanup";
import { scheduleTimeoutPromise, type DeferredTimeoutHandle } from "../utility/timeoutPromise";
import { AriaManipulator } from "./AriaManipulator";
import { AttributeManipulator } from "./AttributeManipulator";
import type { Falsy } from "./ClassManipulator";
import { ClassManipulator } from "./ClassManipulator";
import { markComponentBuilder } from "./ComponentComposition";
import {
	DOMTree,
	isDOMParent,
	recursiveTreeErrorMessage,
	registerDOMTreeNode,
	type DOMParent,
	type DOMTreeNodeRegistration,
	unregisterDOMTreeNode,
} from "./DOMTree";
import type { ComponentHTMLElementEventMap } from "./EventManipulator";
import { EventManipulator } from "./EventManipulator";
import { Marker } from "./Marker";
import { OwnerManipulator } from "./OwnerManipulator";
import {
	createPlacementAuthorityAuthor,
	placementAuthorityOwner,
	releasePlacementAuthority,
	replacePlacementAuthority,
	type PlacementAuthority,
	type PlacementAuthorityAuthor,
} from "./PlacementAuthority";
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
export type ComponentRender<TValue, TComponent extends Component = Component> = (value: TValue, component: TComponent) => void;

/**
 * A source that can be passed to Component to create, wrap, or reuse a component.
 */
export type ComponentSource = Component | keyof HTMLElementTagNameMap | HTMLElement;

/**
 * Resolves the Component type produced by a Component source.
 */
export type ComponentFromSource<SOURCE extends ComponentSource> =
	SOURCE extends Component ? SOURCE
		: SOURCE extends keyof HTMLElementTagNameMap
			? HTMLElementTagNameMap[SOURCE] extends infer ELEMENT extends HTMLElement
				? Component<ELEMENT>
				: Component<HTMLElement>
			: SOURCE extends HTMLElement ? Component<SOURCE>
				: never;

/**
 * A component builder function that can either create a standalone component or compose an existing one.
 * When called through {@link ComponentExtensions.and}, the current component is provided as `this`.
 * Standalone builder calls should mark their result with `Component(source, builder)`.
 */
export type ComponentBuilderFunction<PARAMS extends unknown[] = unknown[], RESULT extends Component = Component> = (this: Component | void, ...params: PARAMS) => RESULT;

/**
 * Builds members to assign onto one component instance through {@link Component.extend}.
 * @typeParam TComponent - The component being extended.
 * @typeParam TExtensions - The instance-specific members to assign.
 */
export type ComponentExtensionFactory<TComponent extends Component, TExtensions extends object> = (
	component: TComponent & TExtensions
) => TExtensions & ThisType<TComponent & TExtensions>;

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
 * A newer Kitsui authoring call replaces the prior placement authority for the same Component identity.
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
	/**
	 * @param source - A Component to return, an HTML tag name to create, or an HTMLElement to wrap.
	 * @param builder - Function identity that marks the component as having been built by that function.
	 * @returns A marked component resolved from the source.
	 */
	<SOURCE extends ComponentSource> (source: SOURCE, builder: Function): ComponentFromSource<SOURCE>;
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
	/**
	 * @param source - A Component to return, an HTML tag name to create, or an HTMLElement to wrap.
	 * @param builder - Function identity that marks the component as having been built by that function.
	 * @returns A marked component resolved from the source.
	 * @throws If wrapping an element that already has a component.
	 */
	new <SOURCE extends ComponentSource>(source: SOURCE, builder: Function): ComponentFromSource<SOURCE>;
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
const shadowPlacementOwnerClaim = "kitsui:shadow-placement";
const elementComponents = new WeakMap<HTMLElement, WeakRef<ComponentClass<HTMLElement>>>();
const componentOwnerResolvers = new Set<ComponentOwnerResolver>();

type StatefulChildController = {
	active: boolean;
	author: PlacementAuthorityAuthor;
	authorities: Map<Node, PlacementAuthority>;
	cleanup: (preservePosition?: boolean) => void;
	onSuppressed: ((component: ComponentClass<HTMLElement>) => void) | null;
	setCleanup: (cleanup: (preservePosition?: boolean) => void) => void;
};
let componentAccessorInstalled = false;

function createStatefulChildController (): StatefulChildController {
	let cleanup: (preservePosition?: boolean) => void = () => { };
	const controller: StatefulChildController = {
		active: true,
		author: createPlacementAuthorityAuthor(),
		authorities: new Map(),
		cleanup: (preservePosition = false) => {
			if (!controller.active) return;
			controller.active = false;
			cleanup(preservePosition);
		},
		setCleanup: (nextCleanup) => {
			cleanup = nextCleanup;
			if (!controller.active) nextCleanup(true);
		},
		onSuppressed: null,
	};
	return controller;
}

function claimStatefulChildComponentSelection (
	components: readonly ComponentClass<HTMLElement>[],
	owner: ComponentClass<HTMLElement>,
	token: StatefulChildController,
): ComponentClass<HTMLElement>[] {
	const controlledComponents: ComponentClass<HTMLElement>[] = [];
	for (const component of components) {
		if (!token.active) break;
		if (token.authorities.get(component.element)?.isCurrent()) {
			controlledComponents.push(component);
			continue;
		}
		const authority = token.author.claim(component.element, owner);
		if (!authority) {
			token.onSuppressed?.(component);
			continue;
		}
		token.authorities.set(component.element, authority);
		authority.setCleanup((preservePosition) => {
			if (token.authorities.get(component.element) !== authority) return;
			token.authorities.delete(component.element);
			if (token.onSuppressed) token.onSuppressed(component);
			else token.cleanup(preservePosition);
		});
		if (!authority.isCurrent()) continue;
		component["refreshOrphanCheck"]();
		controlledComponents.push(component);
	}
	return controlledComponents;
}

function claimStatefulNode (node: Node, owner: ComponentClass<HTMLElement>, token: StatefulChildController): void {
	if (!token.active || token.authorities.get(node)?.isCurrent()) return;
	const authority = token.author.claim(node, owner);
	if (!authority) {
		token.cleanup(true);
		return;
	}
	token.authorities.set(node, authority);
	authority.setCleanup((preservePosition) => {
		if (token.authorities.get(node) !== authority) return;
		token.authorities.delete(node);
		token.cleanup(preservePosition);
	});
}

function releaseStatefulNode (node: Node, token: StatefulChildController): void {
	const authority = token.authorities.get(node);
	if (!authority) return;
	authority.relinquish();
	token.authorities.delete(node);
}

function releaseStatefulChildController (component: ComponentClass<HTMLElement>, token: StatefulChildController): void {
	releaseStatefulNode(component.element, token);
	component["refreshOrphanCheck"]();
}

function createStorageElement (documentRef: Document): HTMLElement {
	return documentRef.createElement("kitsui-storage");
}

function moveKnownComponent (
	component: ComponentClass<HTMLElement>,
	parent: DOMParent,
	beforeNode: Node | null,
	onMoved: (component: ComponentClass<HTMLElement>) => void = noop,
): void {
	const placement = beforeNode
		? { type: "before" as const, reference: beforeNode }
		: { type: "append" as const, parent };
	DOMTree.place([component.element], placement, () => {
		onMoved(component);
	});
}

function getLiveComponent (element: HTMLElement): ComponentClass<HTMLElement> | undefined {
	const component = elementComponents.get(element)?.deref();

	if (!component) {
		elementComponents.delete(element);
		return undefined;
	}

	return component;
}

function getWrappedNodeOwner (node: Node): Owner | null {
	const maybeMarker = (node as Node & { marker?: Marker }).marker;
	if (maybeMarker) {
		return maybeMarker;
	}

	const maybeComponent = (node as Node & { component?: Component }).component;
	return maybeComponent ?? null;
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

function refreshPlacedNode (node: Node): void {
	const component = (node as Node & { component?: Component }).component;
	component?.["refreshPlacementOwner"]();
	component?.["refreshOrphanCheck"]();
	const marker = (node as Node & { marker?: Marker }).marker;
	marker?.["refreshPlacementOwner"]();
	marker?.["refreshOrphanCheck"]();
}

function dispatchPlacedNodeMount (node: Node): void {
	(node as Node & { component?: Component }).component?.["dispatchMount"]();
	(node as Node & { marker?: Marker }).marker?.["dispatchMount"]();
}

function snapshotDirectInsertedNodes (node: Node): Node[] {
	return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !("host" in node)
		? Array.from(node.childNodes)
		: [node];
}

type RetainedManagedComponentAction = "leave" | "detach";
interface ExternalComponentManager {
	kind: "physical" | "other";
	owner: Owner;
	resolverManaged: boolean;
}

interface DisposeManagedNodeOptions {
	ignoredOwner?: ComponentClass<HTMLElement>;
	physicalOwnershipBoundary?: Node | null;
	retainedComponentAction?: RetainedManagedComponentAction;
	retainedPhysicalComponentAction?: RetainedManagedComponentAction;
}

function ownerResolvesForComponent (
	owner: Owner | null,
	visitedComponents: Set<ComponentClass<HTMLElement>> = new Set(),
): boolean {
	if (!owner || owner.disposed) {
		return false;
	}

	if (owner instanceof ComponentClass) {
		return owner["isManaged"](visitedComponents);
	}

	return true;
}

function resolveExternalComponentManager (
	component: ComponentClass<HTMLElement>,
	ignoredOwner: Owner,
	physicalOwnershipBoundary?: Node | null,
): ExternalComponentManager | null {
	const visitedComponents = new Set<ComponentClass<HTMLElement>>([component]);
	let current: Node | null = DOMTree.composedParentOf(component.element);
	while (current) {
		if (current === physicalOwnershipBoundary) {
			break;
		}

		const wrappedOwner = getWrappedNodeOwner(current);
		if (wrappedOwner !== ignoredOwner && ownerResolvesForComponent(wrappedOwner, visitedComponents)) {
			return { kind: "physical", owner: wrappedOwner!, resolverManaged: false };
		}

		current = DOMTree.composedParentOf(current);
	}

	const explicitOwner = component.owner.getAll()
		.find(owner => owner !== ignoredOwner && ownerResolvesForComponent(owner, visitedComponents));
	if (explicitOwner) {
		return { kind: "other", owner: explicitOwner, resolverManaged: false };
	}

	const statefulChildOwner = placementAuthorityOwner(component.element);
	if (statefulChildOwner !== ignoredOwner && ownerResolvesForComponent(statefulChildOwner ?? null, visitedComponents)) {
		return { kind: "other", owner: statefulChildOwner!, resolverManaged: false };
	}

	for (const resolver of componentOwnerResolvers) {
		const resolvedOwner = resolver(component);
		if (resolvedOwner !== ignoredOwner && ownerResolvesForComponent(resolvedOwner, visitedComponents)) {
			return { kind: "other", owner: resolvedOwner!, resolverManaged: true };
		}
	}

	return null;
}

function retainManagedComponent (component: ComponentClass<HTMLElement>, action: RetainedManagedComponentAction): void {
	if (action !== "detach") {
		return;
	}

	DOMTree.remove(component.element);
	component["refreshOrphanCheck"]();
}

function managedChildNodes (node: Node): Node[] {
	const childNodes = new Set(isDOMParent(node) ? DOMTree.childrenOf(node) : Array.from(node.childNodes));
	if (node instanceof HTMLElement && node.shadowRoot) {
		for (const childNode of DOMTree.childrenOf(node.shadowRoot)) {
			childNodes.add(childNode);
		}
	}

	return [...childNodes];
}

function pendingManagedChildNodes (
	node: Node,
	settledNodes: ReadonlySet<Node>,
	includeDetachedPhysicalChildren: boolean,
): Node[] {
	const pendingNodes: Node[] = [];
	const visitedNodes = new Set<Node>();
	const visit = (parent: Node, includeDetachedChildren = false) => {
		const childNodes = new Set(managedChildNodes(parent));
		if (includeDetachedChildren && isDOMParent(parent)) {
			for (const childNode of DOMTree.physical.childrenOf(parent)) {
				if (DOMTree.parentOf(childNode) === null) {
					childNodes.add(childNode);
				}
			}
		}

		for (const childNode of childNodes) {
			if (visitedNodes.has(childNode)) {
				continue;
			}

			visitedNodes.add(childNode);
			if (!settledNodes.has(childNode)) {
				pendingNodes.push(childNode);
				continue;
			}

			const component = childNode instanceof HTMLElement ? getLiveComponent(childNode) : undefined;
			if (!component || component.disposed) {
				visit(childNode);
			}
		}
	};

	visit(node, includeDetachedPhysicalChildren);
	return pendingNodes;
}

function *managedChildCleanupSteps (
	node: Node,
	options: DisposeManagedNodeOptions,
	includeDetachedPhysicalChildren = false,
): Generator<CleanupFunction> {
	const settledNodes = new Set<Node>();
	while (true) {
		const pendingNodes = pendingManagedChildNodes(node, settledNodes, includeDetachedPhysicalChildren);
		if (pendingNodes.length === 0) {
			return;
		}

		for (const childNode of pendingNodes) {
			settledNodes.add(childNode);
			yield () => disposeManagedNode(childNode, options);
		}
	}
}

function disposeManagedNode (node: Node, options: DisposeManagedNodeOptions = {}): void {
	if (node instanceof HTMLElement) {
		const component = getLiveComponent(node);

		if (component && !component.disposed) {
			const externalManager = options.ignoredOwner && resolveExternalComponentManager(
				component,
				options.ignoredOwner,
				options.physicalOwnershipBoundary,
			);
			if (externalManager) {
				const retainedAction = externalManager.kind === "physical"
					? options.retainedPhysicalComponentAction ?? options.retainedComponentAction ?? "leave"
					: options.retainedComponentAction ?? "leave";
				retainManagedComponent(component, retainedAction);
				if (externalManager.resolverManaged) {
					component["bindRetainedResolverOwner"](externalManager.owner);
				}
				return;
			}

			component.remove();
			return;
		}
	}

	runCleanupSteps(managedChildCleanupSteps(node, options));
}

function releaseStatefulChildComponent (
	component: ComponentClass<HTMLElement>,
	owner: ComponentClass<HTMLElement>,
	token: StatefulChildController,
	physicalOwnershipBoundary?: Node | null,
): void {
	releaseStatefulChildController(component, token);
	if (component.disposed) {
		return;
	}

	disposeManagedNode(component.element, {
		ignoredOwner: owner,
		physicalOwnershipBoundary,
		retainedComponentAction: "detach",
		retainedPhysicalComponentAction: "leave",
	});
}

interface PreparedComponentChild {
	child: ComponentChild | ComponentSelectionState;
	controller: StatefulChildController | null;
	controlledComponents: ComponentClass<HTMLElement>[];
}

/** @group Component */
class ComponentClass<ELEMENT extends HTMLElement> extends Owner {
	/**
	 * The underlying DOM element managed by this component.
	 */
	readonly element: ELEMENT;
	private readonly domTreeRegistration: DOMTreeNodeRegistration;
	private readonly structuralCleanups = new Set<CleanupFunction>();
	private mounted = false;
	private orphanCheckId: DeferredTimeoutHandle | null = null;
	private retainedResolverOwner: Owner | null = null;
	private releaseRetainedResolverOwner: CleanupFunction = noop;

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
		this.domTreeRegistration = registerDOMTreeNode(this.element, this);
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
	 * Lazily creates and memoizes an OwnerManipulator for managing explicit owners.
	 */
	get owner (): OwnerManipulator<this> {
		this.ensureActive();

		const manipulator = new OwnerManipulator(this, () => {
			this.refreshOrphanCheck();
		});
		Object.defineProperty(this, "owner", {
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

		const manipulator = new TextManipulator(this);
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
		const preparedChildren = this.prepareComponentChildren(this.expandChildren(children), false);

		this.processPreparedChildren(preparedChildren, (prepared) => {
			const { child } = prepared;
			if (this.disposed) {
				this.disposePreparedChild(prepared);
				return;
			}

			if (isComponentSelectionState(child)) {
				this.attachStatefulChildren(child, {
					getContainer: () => this.element,
					getReferenceNode: () => null,
				}, prepared.controller!, prepared.controlledComponents);
				return;
			}

			const node = this.resolveNode(child);
			const insertedNodes = snapshotDirectInsertedNodes(node);
			if (!DOMTree.canPlace(insertedNodes, { type: "append", parent: this.element })) return;
			for (const insertedNode of insertedNodes) replacePlacementAuthority(insertedNode);
			DOMTree.place([node], { type: "append", parent: this.element }, dispatchPlacedNodeMount);
			for (const insertedNode of insertedNodes) refreshPlacedNode(insertedNode);
		});

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
		const preparedChildren = this.prepareComponentChildren(this.expandChildren(children), false);
		let referenceNode = DOMTree.firstChildOf(this.element);

		this.processPreparedChildren(preparedChildren, (prepared) => {
			const { child } = prepared;
			if (this.disposed) {
				this.disposePreparedChild(prepared);
				return;
			}
			if (referenceNode && DOMTree.parentOf(referenceNode) !== this.element) {
				referenceNode = DOMTree.firstChildOf(this.element);
			}

			if (isComponentSelectionState(child)) {
				this.attachStatefulChildren(child, {
					getContainer: () => this.element,
					getReferenceNode: () => referenceNode,
				}, prepared.controller!, prepared.controlledComponents);
				return;
			}

			const node = this.resolveNode(child);
			const placement = referenceNode
				? { type: "before" as const, reference: referenceNode }
				: { type: "append" as const, parent: this.element };
			const insertedNodes = snapshotDirectInsertedNodes(node);
			if (!DOMTree.canPlace(insertedNodes, placement)) return;
			for (const insertedNode of insertedNodes) replacePlacementAuthority(insertedNode);
			DOMTree.place([node], placement, dispatchPlacedNodeMount);
			for (const insertedNode of insertedNodes) refreshPlacedNode(insertedNode);
			const lastInsertedNode = insertedNodes[insertedNodes.length - 1];
			if (lastInsertedNode && DOMTree.parentOf(lastInsertedNode) === this.element) {
				referenceNode = DOMTree.nextSiblingOf(lastInsertedNode);
			}
		});

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

		const parentNode = DOMTree.parentOf(this.element);

		if (!isDOMParent(parentNode)) {
			throw new Error("Insert target was not found.");
		}

		const orderedInsertables = where === "before"
			? insertables
			: [...insertables].reverse();
		const preparedInsertables = this.prepareComponentChildren(orderedInsertables, false);
		this.processPreparedChildren(preparedInsertables, (prepared) => {
			const { child: node } = prepared;
			if (this.disposed) {
				this.disposePreparedChild(prepared);
				return;
			}

			if (isComponentSelectionState(node)) {
				this.attachStatefulChildren(node, {
					getContainer: () => DOMTree.parentOf(this.element),
					getReferenceNode: () => where === "before" ? this.element : DOMTree.nextSiblingOf(this.element),
				}, prepared.controller!, prepared.controlledComponents);
				return;
			}

			const resolvedNode = this.resolveNode(node);
			const insertedNodes = snapshotDirectInsertedNodes(resolvedNode);
			if (!DOMTree.canPlace(insertedNodes, { type: where, reference: this.element })) return;
			for (const insertedNode of insertedNodes) replacePlacementAuthority(insertedNode);
			DOMTree.place([resolvedNode], { type: where, reference: this.element }, dispatchPlacedNodeMount);
			for (const insertedNode of insertedNodes) refreshPlacedNode(insertedNode);
		});

		return this;
	}

	/**
	 * Appends children conditionally based on state.
	 * When the state becomes true, children are inserted. When false, they are parked in storage and placeholders remain in-flow.
	 * @param state - A State<boolean> that controls visibility.
	 * @param nodes - Nodes or iterables of nodes to append conditionally.
	 * @returns This component for chaining.
	 */
	appendWhen (state: State.Readonly<boolean>, ...nodes: ComponentChildren[]): this {
		this.ensureActive();
		const preparedNodes = this.prepareComponentChildren(this.expandConditionalChildren(nodes), true);

		this.processPreparedChildren(preparedNodes, (prepared) => {
			const { child: node } = prepared;
			if (this.disposed) {
				this.disposePreparedChild(prepared);
				return;
			}

			if (isComponentSelectionState(node)) {
				this.attachConditionalSelectionState(state, node, {
					getContainer: () => this.element,
					getReferenceNode: () => null,
				}, prepared.controller!, prepared.controlledComponents);
				return;
			}

			this.attachConditionalNode(state, node, {
				getContainer: () => this.element,
				getReferenceNode: () => null,
			}, prepared.controller!);
		});

		return this;
	}

	/**
	 * Prepends children conditionally based on state.
	 * When the state becomes true, children are inserted before the current first child.
	 * @param state - A State<boolean> that controls visibility.
	 * @param nodes - Nodes or iterables of nodes to prepend conditionally.
	 * @returns This component for chaining.
	 */
	prependWhen (state: State.Readonly<boolean>, ...nodes: ComponentChildren[]): this {
		this.ensureActive();
		const referenceNode = DOMTree.firstChildOf(this.element);
		const preparedNodes = this.prepareComponentChildren(this.expandConditionalChildren(nodes), true);

		this.processPreparedChildren(preparedNodes, (prepared) => {
			const { child: node } = prepared;
			if (this.disposed) {
				this.disposePreparedChild(prepared);
				return;
			}

			if (isComponentSelectionState(node)) {
				this.attachConditionalSelectionState(state, node, {
					getContainer: () => this.element,
					getReferenceNode: () => referenceNode,
				}, prepared.controller!, prepared.controlledComponents);
				return;
			}

			this.attachConditionalNode(state, node, {
				getContainer: () => this.element,
				getReferenceNode: () => referenceNode,
			}, prepared.controller!);
		});

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
	insertWhen (state: State.Readonly<boolean>, where: InsertWhere, ...nodes: ComponentChildren[]): this {
		this.ensureActive();
		const insertables = this.expandConditionalChildren(nodes);
		const orderedInsertables = where === "before"
			? insertables
			: [...insertables].reverse();
		const preparedInsertables = this.prepareComponentChildren(orderedInsertables, true);

		this.processPreparedChildren(preparedInsertables, (prepared) => {
			const { child: node } = prepared;
			if (this.disposed) {
				this.disposePreparedChild(prepared);
				return;
			}

			if (isComponentSelectionState(node)) {
				this.attachConditionalSelectionState(state, node, {
					getContainer: () => DOMTree.parentOf(this.element),
					getReferenceNode: () => where === "before" ? this.element : DOMTree.nextSiblingOf(this.element),
				}, prepared.controller!, prepared.controlledComponents);
				return;
			}

			this.attachConditionalNode(state, node, {
				getContainer: () => DOMTree.parentOf(this.element),
				getReferenceNode: () => where === "before" ? this.element : DOMTree.nextSiblingOf(this.element),
			}, prepared.controller!);
		});

		return this;
	}

	private attachConditionalSelectionState (
		visibleState: State.Readonly<boolean>,
		selectionState: ComponentSelectionState,
		options: {
			getContainer: () => ParentNode | null;
			getReferenceNode: () => Node | null;
		},
		controller: StatefulChildController,
		initialComponents: Component[],
	): CleanupFunction {
		const marker = Marker("kitsui:conditional-stateful").owner.add(this);
		const storage = createStorageElement(this.element.ownerDocument);
		let active = true;
		let rendering = false;
		let markerWasInserted = false;
		let renderedComponents: Component[] = [];
		let releaseVisibleSubscription: CleanupFunction = noop;
		let releaseSelectionSubscription: CleanupFunction = noop;
		const retainedHiddenComponents = new Set<Component>();
		const getPhysicalOwnershipBoundary = () => DOMTree.parentOf(marker.node);
		controller.onSuppressed = (component) => {
			renderedComponents = renderedComponents.filter(rendered => rendered !== component);
			retainedHiddenComponents.delete(component);
		};
		renderedComponents = claimStatefulChildComponentSelection(initialComponents, this, controller);

		const cleanupRenderedComponents = (
			nextComponents: ReadonlySet<Component> = new Set(),
			mode: "dispose" | "retain" = "dispose",
		) => {
			const cleanupSteps: CleanupFunction[] = [];
			for (const component of renderedComponents) {
				if (nextComponents.has(component)) {
					retainedHiddenComponents.delete(component);
					continue;
				}

				if (mode === "dispose") {
					retainedHiddenComponents.delete(component);
					cleanupSteps.push(() => releaseStatefulChildComponent(component, this, controller, getPhysicalOwnershipBoundary()));
					continue;
				}

				if (component.disposed) {
					releaseStatefulChildController(component, controller);
					continue;
				}

				retainedHiddenComponents.add(component);
				moveKnownComponent(component, storage, null);
			}

			renderedComponents = renderedComponents.filter(component => nextComponents.has(component) && !component.disposed);
			runCleanupSteps(cleanupSteps);
		};

		const releaseRetainedHiddenComponents = (nextComponents: ReadonlySet<Component>) => {
			const cleanupSteps: CleanupFunction[] = [];
			for (const component of [...retainedHiddenComponents]) {
				if (nextComponents.has(component)) {
					continue;
				}

				retainedHiddenComponents.delete(component);
				cleanupSteps.push(() => releaseStatefulChildComponent(component, this, controller, getPhysicalOwnershipBoundary()));
			}
			runCleanupSteps(cleanupSteps);
		};

		const forgetDisposedComponent = (component: Component) => {
			releaseStatefulChildController(component, controller);
			retainedHiddenComponents.delete(component);
			renderedComponents = renderedComponents.filter(rendered => rendered !== component);
		};
		const releaseUntrackedClaims = (components: Component[]) => {
			const trackedComponents = new Set([...renderedComponents, ...retainedHiddenComponents]);
			runCleanupSteps(components
				.filter(component => !trackedComponents.has(component))
				.map(component => () => releaseStatefulChildController(component, controller)));
		};

		const render = () => {
			if (!active || rendering) {
				return;
			}

			rendering = true;
			try {
				const nextComponents = claimStatefulChildComponentSelection(
					this.resolveComponentSelection(selectionState.value),
					this,
					controller,
				);
				if (!active || !controller.active) return;
				const nextComponentSet = new Set(nextComponents);
				try {
					const container = options.getContainer();

				if (!isDOMParent(container)) {
					if (markerWasInserted) {
						this.remove();
						return;
					}

					const cleanupMode = visibleState.value ? "dispose" : "retain";
					cleanupRenderedComponents(nextComponentSet, cleanupMode);
					if (!active) {
						return;
					}
					if (visibleState.value) {
						releaseRetainedHiddenComponents(nextComponentSet);
					}
					renderedComponents = [...nextComponents];
					for (const component of nextComponents) {
						if (!active) {
							return;
						}
						if (component.disposed) {
							forgetDisposedComponent(component);
							continue;
						}

						retainedHiddenComponents.delete(component);
						moveKnownComponent(component, storage, null);
					}
					return;
				}

				if (markerWasInserted && DOMTree.parentOf(marker.node) !== container) {
					this.remove();
					return;
				}

				if (DOMTree.parentOf(marker.node) !== container) {
					const reference = options.getReferenceNode();
					DOMTree.place([marker.node], reference
						? { type: "before", reference }
						: { type: "append", parent: container }, () => {
							markerWasInserted = true;
						});
				}

				const cleanupMode = visibleState.value ? "dispose" : "retain";
				cleanupRenderedComponents(nextComponentSet, cleanupMode);
				if (!active) {
					return;
				}
				if (visibleState.value) {
					releaseRetainedHiddenComponents(nextComponentSet);
				}
				renderedComponents = [...nextComponents];

				if (visibleState.value) {
					for (const component of nextComponents) {
						if (!active) {
							return;
						}
						if (component.disposed) {
							forgetDisposedComponent(component);
							continue;
						}

						retainedHiddenComponents.delete(component);
						moveKnownComponent(component, container, marker.node, (movedComponent) => {
							movedComponent.refreshOrphanCheck();
							movedComponent.dispatchMount();
						});
					}
				} else {
					for (const component of nextComponents) {
						if (!active) {
							return;
						}
						if (component.disposed) {
							forgetDisposedComponent(component);
							continue;
						}

						retainedHiddenComponents.delete(component);
						moveKnownComponent(component, storage, null);
					}
				}
				} catch (error) {
					cleanupAndRethrow(error, () => releaseUntrackedClaims(nextComponents));
				}
			} finally {
				rendering = false;
			}
		};

		const cleanup = this.trackStructuralCleanup((preservePosition = false) => {
			const cleanupComponents = new Set([...renderedComponents, ...retainedHiddenComponents]);
			active = false;
			renderedComponents = [];
			retainedHiddenComponents.clear();
			runCleanupSteps([
				releaseVisibleSubscription,
				releaseSelectionSubscription,
				...[...cleanupComponents].map(component => () => preservePosition
					? releaseStatefulChildController(component, controller)
					: releaseStatefulChildComponent(component, this, controller, getPhysicalOwnershipBoundary())),
				() => marker.remove(),
				() => DOMTree.remove(storage),
			]);
		});
		controller.setCleanup(cleanup);

		try {
			releaseVisibleSubscription = visibleState.subscribe(this, render);
			if (!active) {
				releaseVisibleSubscription();
				return cleanup;
			}

			releaseSelectionSubscription = selectionState.subscribe(this, render);
			if (!active) {
				releaseSelectionSubscription();
				return cleanup;
			}

			render();
		} catch (error) {
			cleanupAndRethrow(error, cleanup);
		}

		return cleanup;
	}

	/**
	 * Clears all child nodes from this component.
	 * @returns This component for chaining.
	 */
	clear (): this {
		this.ensureActive();
		runCleanupSteps([
			() => this.releaseStructuralCleanups(),
			() => runCleanupSteps(managedChildCleanupSteps(this.element, {
				ignoredOwner: this,
				retainedComponentAction: "detach",
			})),
			() => runCleanupSteps(DOMTree.childrenOf(this.element).map(childNode => () => DOMTree.remove(childNode))),
		]);
		return this;
	}

	/**
	 * Runs a setup callback against this component, or subscribes a render function to a state.
	 * The stateful form invokes the render immediately with the current value, then again each time the state changes.
	 * @param setup A setup callback that can perform additional fluent configuration.
	 * @returns This component for chaining.
	 */
	use<PARAMS extends any[]> (setup: (component: this, ...params: PARAMS) => unknown, ...params: PARAMS): this;
	/**
	 * Subscribes this component to state changes and re-renders when the state updates.
	 * The render function is called immediately with the current state value, then again each time the state changes.
	 * The subscription is automatically cleaned up when this component is removed.
	 * @typeParam TValue - The type of state value being rendered.
	 * @param state - The state to subscribe to.
	 * @param render - Function called with the state value and this component, for each update.
	 * @returns This component for chaining.
	 */
	use<TValue> (state: State.Readonly<TValue>, render: ComponentRender<TValue, this>): this;
	use<TValue> (setupOrState: ((component: this, ...params: any[]) => unknown) | State.Readonly<TValue>, ...params: [ComponentRender<TValue, this>] | any[]): this {
		this.ensureActive();

		if (typeof setupOrState === "function") {
			setupOrState(this, ...params);
			return this;
		}

		const render = params[0] as ComponentRender<TValue> | undefined;

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
	 * Assigns instance-specific members onto this component and returns the same narrowed component.
	 * The extension factory receives this component typed as the final intersection.
	 * @param extensions Builds the object members to assign onto this component.
	 * @returns This component narrowed with the assigned extension members.
	 */
	extend<TExtensions extends object> (extensions: ComponentExtensionFactory<this, TExtensions>): this & TExtensions {
		this.ensureActive();

		if (typeof extensions !== "function") {
			throw new TypeError("Component.extend requires an extension factory function.");
		}

		const extensionMembers = extensions(this as this & TExtensions);

		if (typeof extensionMembers !== "object" || extensionMembers === null) {
			throw new TypeError("Component.extend extension factories must return an object.");
		}

		return Object.assign(this, extensionMembers);
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

	protected beforeDispose (): void {
		runCleanupSteps([
			() => this.element.dispatchEvent(new CustomEvent("Dispose")),
			() => releasePlacementAuthority(this.element, true),
			() => this.clearOrphanCheck(),
			() => this.releaseStructuralCleanups(),
			this.releaseRetainedResolverOwner,
			() => unregisterDOMTreeNode(this.domTreeRegistration),
		]);
	}

	protected afterDispose (): void {
		try {
			runCleanupSteps([
				() => DOMTree.remove(this.element),
				() => runCleanupSteps(managedChildCleanupSteps(this.element, {
					ignoredOwner: this,
					retainedComponentAction: "leave",
				}, true)),
			]);
		}
		finally {
			if (getLiveComponent(this.element) === this) {
				elementComponents.delete(this.element);
			}
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

			this.refreshPlacementOwner();
			if (this.isManaged()) {
				this.dispatchMount();
				return;
			}

			throw new Error(orphanedComponentErrorMessage);
		});
	}

	private refreshPlacementOwner (): void {
		let current: Node | null = DOMTree.parentOf(this.element);
		let crossedShadowBoundary = false;
		while (current) {
			if (current instanceof HTMLElement) {
				const owner = current.component;
				if (owner && owner !== this) {
					if (crossedShadowBoundary) this.owner.add(owner, shadowPlacementOwnerClaim);
					else this.owner.remove(shadowPlacementOwnerClaim);
					return;
				}
			}

			const parent = DOMTree.parentOf(current);
			if (parent) {
				current = parent;
				continue;
			}
			const composedParent = DOMTree.composedParentOf(current);
			if (!composedParent) break;
			crossedShadowBoundary = true;
			current = composedParent;
		}
		this.owner.remove(shadowPlacementOwnerClaim);
	}

	private bindRetainedResolverOwner (owner: Owner): void {
		if (this.disposed || this.retainedResolverOwner === owner) {
			return;
		}

		this.releaseRetainedResolverOwner();
		this.retainedResolverOwner = owner;
		let active = true;
		let releaseComponent = noop;
		let releaseOwner = noop;
		const release = () => {
			if (!active) {
				return;
			}

			active = false;
			if (this.retainedResolverOwner === owner) {
				this.retainedResolverOwner = null;
				this.releaseRetainedResolverOwner = noop;
			}
			releaseComponent();
			releaseOwner();
		};
		this.releaseRetainedResolverOwner = release;
		releaseComponent = this.onCleanup(release);
		releaseOwner = owner.onCleanup(() => {
			release();
			if (this.disposed) {
				return;
			}

			for (const resolver of componentOwnerResolvers) {
				const nextOwner = resolver(this);
				if (ownerResolvesForComponent(nextOwner)) {
					this.bindRetainedResolverOwner(nextOwner!);
					return;
				}
			}

			if (!this.isManaged()) {
				this.remove();
			}
		});
	}

	private disposeIfUnmanagedAfterPlacementCleanup (): void {
		if (this.disposed || this.isManaged()) {
			this.clearOrphanCheck();
			return;
		}

		this.clearOrphanCheck();
		this.orphanCheckId = scheduleTimeoutPromise(() => {
			this.orphanCheckId = null;

			if (this.disposed) {
				return;
			}

			this.refreshPlacementOwner();
			if (this.isManaged()) {
				this.dispatchMount();
				return;
			}

			this.remove();
		});
	}

	private isManaged (visitedComponents: Set<ComponentClass<HTMLElement>> = new Set()): boolean {
		if (DOMTree.isConnected(this.element)) {
			return true;
		}
		if (visitedComponents.has(this)) {
			return false;
		}
		visitedComponents.add(this);

		if (this.owner.getAll().some(owner => this.ownerResolves(owner, visitedComponents))) {
			return true;
		}

		if (this.ownerResolves(placementAuthorityOwner(this.element), visitedComponents)) {
			return true;
		}

		let current: Node | null = DOMTree.composedParentOf(this.element);
		while (current) {
			if (this.ownerResolves(getWrappedNodeOwner(current), visitedComponents)) {
				return true;
			}

			current = DOMTree.composedParentOf(current);
		}

		for (const resolver of componentOwnerResolvers) {
			if (this.ownerResolves(resolver(this), visitedComponents)) {
				return true;
			}
		}

		return false;
	}

	private ownerResolves (owner: Owner | null, visitedComponents: Set<ComponentClass<HTMLElement>>): boolean {
		return ownerResolvesForComponent(owner, visitedComponents);
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

	private expandConditionalChildren (children: ComponentChildren[]): Array<ComponentChild | ComponentSelectionState> {
		return this.expandChildren(children).flatMap((child) => {
			if (child instanceof Node && child.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !("host" in child)) {
				return Array.from(child.childNodes);
			}
			return [child];
		});
	}

	private processPreparedChildren (
		preparedChildren: PreparedComponentChild[],
		process: (prepared: PreparedComponentChild) => void,
	): void {
		for (const preparedChild of preparedChildren) {
			process(preparedChild);
		}
	}

	private prepareComponentChildren (
		children: Array<ComponentChild | ComponentSelectionState>,
		controlDirectComponents: boolean,
	): PreparedComponentChild[] {
		const prepared = children.map((child): PreparedComponentChild => {
			if (isComponentSelectionState(child)) {
				return {
					child,
					controller: createStatefulChildController(),
					controlledComponents: this.resolveComponentSelection(child.value),
				};
			}

			if (controlDirectComponents) {
				return {
					child,
					controller: createStatefulChildController(),
					controlledComponents: child instanceof ComponentClass ? [child] : [],
				};
			}

			return { child, controller: null, controlledComponents: [] };
		});

		return prepared;
	}

	private disposePreparedChild (prepared: PreparedComponentChild): void {
		const settledComponents = new Set<ComponentClass<HTMLElement>>();
		if (prepared.controller) {
			for (let index = 0; index < prepared.controlledComponents.length; index += 1) {
				const component = prepared.controlledComponents[index];
				settledComponents.add(component);
				try {
					releaseStatefulChildComponent(component, this, prepared.controller);
				} catch (error) {
					const pendingClaimReleases = prepared.controlledComponents
						.slice(index + 1)
						.map(pending => () => releaseStatefulChildController(pending, prepared.controller!));
					cleanupAndRethrow(error, () => runCleanupSteps(pendingClaimReleases));
				}
			}
		}

		const cleanupSteps: CleanupFunction[] = [];
		const { child } = prepared;
		if (isComponentSelectionState(child)) {
			cleanupSteps.push(() => runCleanupSteps(this.resolveComponentSelection(child.value)
				.filter(component => !settledComponents.has(component))
				.map(component => () => disposeManagedNode(component.element, { ignoredOwner: this }))));
			runCleanupSteps(cleanupSteps);
			return;
		}

		if (child instanceof ComponentClass) {
			if (!settledComponents.has(child)) {
				cleanupSteps.push(() => disposeManagedNode(child.element, { ignoredOwner: this }));
			}
			runCleanupSteps(cleanupSteps);
			return;
		}

		const node = this.resolveNode(child);
		cleanupSteps.push(() => runCleanupSteps([
			() => disposeManagedNode(node, { ignoredOwner: this }),
			() => DOMTree.remove(node),
		]));
		runCleanupSteps(cleanupSteps);
	}

	private trackStructuralCleanup (cleanup: (preservePosition?: boolean) => void): (preservePosition?: boolean) => void {
		let active = true;
		let releaseOwnerCleanup: CleanupFunction = noop;

		const trackedCleanup = (preservePosition = false) => {
			if (!active) {
				return;
			}

			active = false;
			this.structuralCleanups.delete(trackedCleanup);
			runCleanupSteps([releaseOwnerCleanup, () => cleanup(preservePosition)]);
		};

		this.structuralCleanups.add(trackedCleanup);
		releaseOwnerCleanup = this.onCleanup(trackedCleanup);

		return trackedCleanup;
	}

	private releaseStructuralCleanups (): void {
		const structuralCleanups = [...this.structuralCleanups];
		runCleanupSteps(structuralCleanups);
	}

	private attachConditionalNode (
		state: State.Readonly<boolean>,
		node: ComponentChild,
		options: {
			getContainer: () => ParentNode | null;
			getReferenceNode: () => Node | null;
		},
		controller: StatefulChildController,
	): CleanupFunction {
		if (!node && node !== "") {
			return noop;
		}

		const childComponent = node instanceof ComponentClass ? node : null;
		const resolvedNode = this.resolveNode(node);
		claimStatefulNode(resolvedNode, this, controller);
		if (!controller.active) return noop;
		const initialContainer = options.getContainer();
		if (isDOMParent(initialContainer) && DOMTree.contains(resolvedNode, initialContainer)) {
			console.error(recursiveTreeErrorMessage);
			releaseStatefulNode(resolvedNode, controller);
			return noop;
		}

		const placeholder = Marker("kitsui:conditional").owner.add(this);
		const storage = createStorageElement(this.element.ownerDocument);
		let active = true;
		let releaseChildCleanup: CleanupFunction = noop;
		let placeholderWasInserted = false;
		let stateCleanup: CleanupFunction = noop;

		const getSafeReferenceNode = (container: ParentNode): Node | null => {
			const referenceNode = options.getReferenceNode();
			if (!referenceNode) {
				return null;
			}

			return DOMTree.parentOf(referenceNode) === container ? referenceNode : null;
		};

		const removeOwnerForMissingMarker = () => {
			if (!active) {
				return;
			}

			this.remove();
		};

		const ensurePlaceholder = (): DOMParent | null => {
			const container = options.getContainer();

			if (!isDOMParent(container)) {
				if (placeholderWasInserted) {
					removeOwnerForMissingMarker();
				}

				return null;
			}

			if (!placeholderWasInserted) {
				const reference = getSafeReferenceNode(container);
				DOMTree.place([placeholder.node], reference
					? { type: "before", reference }
					: { type: "append", parent: container }, () => {
						placeholderWasInserted = true;
					});
				return container;
			}

			if (DOMTree.parentOf(placeholder.node) !== container) {
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
			if (isDOMParent(initialContainer) && DOMTree.contains(resolvedNode, initialContainer)) {
				console.error(recursiveTreeErrorMessage);
				return;
			}

			const container = ensurePlaceholder();

			if (!active) {
				return;
			}

			if (!container) {
				if (childComponent) {
					moveKnownComponent(childComponent, storage, null);
				}
				else {
					DOMTree.place([resolvedNode], { type: "append", parent: storage });
				}
				return;
			}

			if (childComponent) {
				moveKnownComponent(childComponent, container, placeholder.node, (movedComponent) => {
					movedComponent.refreshOrphanCheck();
					movedComponent.dispatchMount();
				});
			}
			else {
				DOMTree.place([resolvedNode], { type: "before", reference: placeholder.node });
			}
		};

		const placeHidden = () => {
			if (!active) {
				return;
			}

			const initialContainer = options.getContainer();
			if (isDOMParent(initialContainer) && DOMTree.contains(resolvedNode, initialContainer)) {
				console.error(recursiveTreeErrorMessage);
				return;
			}

			const container = ensurePlaceholder();

			if (!active) {
				return;
			}

			if (!container) {
				if (DOMTree.parentOf(resolvedNode) !== storage) {
					if (childComponent) {
						moveKnownComponent(childComponent, storage, null);
					}
					else {
						DOMTree.place([resolvedNode], { type: "append", parent: storage });
					}
				}
				return;
			}

			if (DOMTree.parentOf(resolvedNode) !== storage) {
				if (childComponent) {
					moveKnownComponent(childComponent, storage, null);
				}
				else {
					DOMTree.place([resolvedNode], { type: "append", parent: storage });
				}
			}
		};

		const cleanup = this.trackStructuralCleanup((preservePosition = false) => {
			const physicalOwnershipBoundary = DOMTree.parentOf(placeholder.node);
			active = false;
			runCleanupSteps([
				stateCleanup,
				releaseChildCleanup,
				() => placeholder.remove(),
				() => DOMTree.remove(storage),
				childComponent
					? () => preservePosition
						? releaseStatefulChildController(childComponent, controller)
						: releaseStatefulChildComponent(childComponent, this, controller, physicalOwnershipBoundary)
					: () => {
						releaseStatefulNode(resolvedNode, controller);
						if (!preservePosition) DOMTree.remove(resolvedNode);
					},
			]);
		});
		controller.setCleanup(cleanup);

		if (childComponent) {
			releaseChildCleanup = childComponent.onCleanup(cleanup);
		}

		try {
			stateCleanup = state.subscribe(this, (nextVisible) => {
				if (nextVisible) {
					placeVisible();
					return;
				}

				placeHidden();
			});
			if (!active) {
				stateCleanup();
				return cleanup;
			}

			if (state.value) {
				placeVisible();
			} else {
				placeHidden();
			}
		} catch (error) {
			cleanupAndRethrow(error, cleanup);
		}

		return cleanup;
	}

	private attachStatefulChildren (
		state: ComponentSelectionState,
		options: {
			getContainer: () => ParentNode | null;
			getReferenceNode: () => Node | null;
		},
		controller: StatefulChildController,
		initialComponents: Component[],
	): CleanupFunction {
		const marker = Marker("kitsui:stateful-child").owner.add(this);
		let active = true;
		let rendering = false;
		let renderedComponents: Component[] = [];
		let markerWasInserted = false;
		let stateCleanup: CleanupFunction = noop;
		const getPhysicalOwnershipBoundary = () => DOMTree.parentOf(marker.node);
		controller.onSuppressed = (component) => {
			renderedComponents = renderedComponents.filter(rendered => rendered !== component);
		};
		renderedComponents = claimStatefulChildComponentSelection(initialComponents, this, controller);

		const cleanupRenderedComponents = (nextComponents: ReadonlySet<Component> = new Set()) => {
			const cleanupSteps: CleanupFunction[] = [];
			for (const component of renderedComponents) {
				if (nextComponents.has(component)) {
					continue;
				}

				cleanupSteps.push(() => releaseStatefulChildComponent(component, this, controller, getPhysicalOwnershipBoundary()));
			}

			renderedComponents = renderedComponents.filter(component => nextComponents.has(component) && !component.disposed);
			runCleanupSteps(cleanupSteps);
		};

		const forgetDisposedComponent = (component: Component) => {
			releaseStatefulChildController(component, controller);
			renderedComponents = renderedComponents.filter(rendered => rendered !== component);
		};
		const releaseUntrackedClaims = (components: Component[]) => {
			const trackedComponents = new Set(renderedComponents);
			runCleanupSteps(components
				.filter(component => !trackedComponents.has(component))
				.map(component => () => releaseStatefulChildController(component, controller)));
		};

		const renderSelection = (selection: ComponentSelection) => {
			if (!active || rendering) {
				return;
			}

			rendering = true;
			try {
				const nextComponents = claimStatefulChildComponentSelection(
					this.resolveComponentSelection(selection),
					this,
					controller,
				);
				if (!active || !controller.active) return;
				const nextComponentSet = new Set(nextComponents);
				try {
					const container = options.getContainer();

				if (!isDOMParent(container)) {
					if (markerWasInserted) {
						this.remove();
						return;
					}

					cleanupRenderedComponents();
					return;
				}

				if (markerWasInserted && DOMTree.parentOf(marker.node) !== container) {
					this.remove();
					return;
				}

				if (DOMTree.parentOf(marker.node) !== container) {
					const reference = options.getReferenceNode();
					DOMTree.place([marker.node], reference
						? { type: "before", reference }
						: { type: "append", parent: container }, () => {
							markerWasInserted = true;
						});
				}

				cleanupRenderedComponents(nextComponentSet);
				if (!active) {
					return;
				}
				renderedComponents = [...nextComponents];

				for (const component of nextComponents) {
					if (!active) {
						return;
					}
					if (component.disposed) {
						forgetDisposedComponent(component);
						continue;
					}

					moveKnownComponent(component, container, marker.node, (movedComponent) => {
						movedComponent.refreshOrphanCheck();
						movedComponent.dispatchMount();
					});
				}
				} catch (error) {
					cleanupAndRethrow(error, () => releaseUntrackedClaims(nextComponents));
				}
			} finally {
				rendering = false;
			}
		};

		const cleanup = this.trackStructuralCleanup((preservePosition = false) => {
			const cleanupComponents = [...renderedComponents];
			renderedComponents = [];
			active = false;
			runCleanupSteps([
				stateCleanup,
				...cleanupComponents.map(component => () => preservePosition
					? releaseStatefulChildController(component, controller)
					: releaseStatefulChildComponent(component, this, controller, getPhysicalOwnershipBoundary())),
				() => marker.remove(),
			]);
		});
		controller.setCleanup(cleanup);

		try {
			stateCleanup = state.subscribe(this, renderSelection);
			if (!active) {
				stateCleanup();
				return cleanup;
			}

			renderSelection(state.value);
		} catch (error) {
			cleanupAndRethrow(error, cleanup);
		}
		return cleanup;
	}

	private resolveComponentSelection (selection: ComponentSelection): Component[] {
		if (!selection) {
			return [];
		}

		if (selection instanceof ComponentClass) {
			return selection.disposed ? [] : [selection];
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
			if (item.disposed) {
				continue;
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

export namespace Component {
	export type EventMap<TEvents extends { readonly [K in keyof TEvents]: Event }> = ComponentHTMLElementEventMap & TEvents;

	export interface WithEvents<TEvents extends { readonly [K in keyof TEvents]: Event }> extends Component {
		readonly event: EventManipulator<this, "component", EventMap<TEvents>>;
	}
}

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
	tagNameOrElement: string | HTMLElement | Component = "span",
	builder?: Function,
): Component {
	if (tagNameOrElement instanceof ComponentClass) {
		if (builder) {
			markComponentBuilder(tagNameOrElement, builder);
		}

		return tagNameOrElement;
	}

	const component = new ComponentClass(tagNameOrElement);

	if (builder) {
		markComponentBuilder(component, builder);
	}

	return component;
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
