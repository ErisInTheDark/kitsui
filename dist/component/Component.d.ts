import { Owner, State, type CleanupFunction } from "../state/State";
import { AriaManipulator } from "./AriaManipulator";
import { AttributeManipulator } from "./AttributeManipulator";
import type { Falsy } from "./ClassManipulator";
import { ClassManipulator } from "./ClassManipulator";
import { EventManipulator } from "./EventManipulator";
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
    subscribe(owner: Owner, listener: (value: ComponentSelection) => void): CleanupFunction;
}
/**
 * A marker interface for module-level component extensions.
 * Extend this interface to add methods to all Component instances.
 */
export interface ComponentExtensions {
}
/**
 * A marker interface for module-level Component static extensions.
 * Extend this interface to add static methods to the Component constructor function.
 */
export interface ComponentStaticExtensions {
}
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
    <NAME extends keyof HTMLElementTagNameMap>(tagName: NAME): Component<HTMLElementTagNameMap[NAME]>;
    /**
     * @param element - An existing HTMLElement to wrap.
     * @returns A new component that wraps a DOM element.
     * @throws If wrapping an element that already has a component.
     */
    <ELEMENT extends HTMLElement>(element: ELEMENT): Component<ELEMENT>;
    new (): Component<HTMLSpanElement>;
    /**
     * @param tagName - An HTML tag name (creates new element).
     * @returns A new component that wraps a DOM element.
     * @throws If wrapping an element that already has a component.
     */
    new <NAME extends keyof HTMLElementTagNameMap>(tagName: NAME): Component<HTMLElementTagNameMap[NAME]>;
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
    query(selector: string): Component | null;
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
    extend(): ExtendableComponentClass;
};
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
export declare function registerComponentOwnerResolver(resolver: ComponentOwnerResolver): CleanupFunction;
/** @group Component */
declare class ComponentClass<ELEMENT extends HTMLElement> extends Owner {
    /**
     * The underlying DOM element managed by this component.
     */
    readonly element: ELEMENT;
    private explicitOwner;
    private releaseExplicitOwner;
    private readonly structuralCleanups;
    private mounted;
    private onBeforeMove;
    private orphanCheckId;
    constructor(tagNameOrElement: string | HTMLElement);
    /**
     * Lazily creates and memoizes a ClassManipulator for adding/removing CSS classes.
     */
    get class(): ClassManipulator<this>;
    /**
     * Lazily creates and memoizes an AttributeManipulator for managing element attributes.
     */
    get attribute(): AttributeManipulator<this>;
    /**
     * Lazily creates and memoizes an AriaManipulator for managing ARIA attributes.
     */
    get aria(): AriaManipulator<this>;
    /**
     * Lazily creates and memoizes a TextManipulator for managing text content.
     */
    get text(): TextManipulator<this>;
    /**
     * Lazily creates and memoizes an EventManipulator for managing host event listeners.
     */
    get event(): EventManipulator<this>;
    /**
     * Appends children to this component's element.
     * Strings are converted to text nodes. Falsy values are ignored.
     * Components are owned by this component and removed when this component is removed.
     * @param children - Nodes, components, strings, iterables, or ComponentSelectionState.
     * @returns This component for chaining.
     */
    append(...children: ComponentChildren[]): this;
    /**
     * Prepends children to this component's element, before existing content.
     * Strings are converted to text nodes. Falsy values are ignored.
     * Components are owned by this component and removed when this component is removed.
     * @param children - Nodes, components, strings, iterables, or ComponentSelectionState.
     * @returns This component for chaining.
     */
    prepend(...children: ComponentChildren[]): this;
    /**
     * Inserts children before or after this component (relative to its parent).
     * Strings are converted to text nodes. Falsy values are filtered out. Useful for inserting siblings.
     * @param where - "before" to insert before this component, or "after" to insert after.
     * @param nodes - One or more nodes, strings, iterables, or ComponentSelectionState to insert.
     * @returns This component for chaining.
     * @throws If this component has no parent node.
     */
    insert(where: InsertWhere, ...nodes: ComponentChildren[]): this;
    /**
     * Appends children conditionally based on state.
     * When the state becomes true, children are inserted. When false, they are parked in storage and placeholders remain in-flow.
     * @param state - A State<boolean> that controls visibility.
     * @param nodes - Nodes or iterables of nodes to append conditionally.
     * @returns This component for chaining.
     */
    appendWhen(state: State<boolean>, ...nodes: ComponentChildren[]): this;
    /**
     * Prepends children conditionally based on state.
     * When the state becomes true, children are inserted before the current first child.
     * @param state - A State<boolean> that controls visibility.
     * @param nodes - Nodes or iterables of nodes to prepend conditionally.
     * @returns This component for chaining.
     */
    prependWhen(state: State<boolean>, ...nodes: ComponentChildren[]): this;
    /**
     * Inserts children conditionally before or after this component, based on state.
     * When the state becomes true, children are inserted. When false, they're stored but stay in the DOM as a placeholder.
     * @param state - A State<boolean> that controls visibility.
     * @param where - "before" to insert before this component, or "after" to insert after.
     * @param nodes - Nodes or iterables of nodes to insert conditionally.
     * @returns This component for chaining.
     */
    insertWhen(state: State<boolean>, where: InsertWhere, ...nodes: ComponentChildren[]): this;
    private attachConditionalSelectionState;
    /**
     * Clears all child nodes from this component.
     * @returns This component for chaining.
     */
    clear(): this;
    /**
     * Runs a setup callback against this component, or subscribes a render function to a state.
     * The stateful form invokes the render immediately with the current value, then again each time the state changes.
     * @param setup A setup callback that can perform additional fluent configuration.
     * @returns This component for chaining.
     */
    use(setup: (component: Component) => unknown): this;
    /**
     * Subscribes this component to state changes and re-renders when the state updates.
     * The render function is called immediately with the current state value, then again each time the state changes.
     * The subscription is automatically cleaned up when this component is removed.
     * @typeParam TValue - The type of state value being rendered.
     * @param state - The state to subscribe to.
     * @param render - Function called with the state value and this component, for each update.
     * @returns This component for chaining.
     */
    use<TValue>(state: State<TValue>, render: ComponentRender<TValue>): this;
    /**
     * Removes this component from the DOM and disposes its resources.
     * Owned child components are also removed.
     * The component cannot be modified after removal.
     */
    remove(): void;
    /** @internal Dispatches the Mount event if this component has never been mounted. */
    dispatchMount(): void;
    /**
     * Sets or clears the explicit owner of this component.
     * When a component has an explicit owner, it is removed when the owner is disposed.
     * This is independent of implicit ownership through DOM ancestry.
     * @param owner - The owner component or state, or null to remove explicit ownership.
     * @returns This component for chaining.
     */
    setOwner(owner: Owner | null): this;
    /**
     * Gets the current explicit owner of this component.
     * @returns The owner component/state, or null if no explicit owner is set.
     */
    getOwner(): Owner | null;
    protected beforeDispose(): void;
    protected afterDispose(): void;
    private ensureActive;
    private clearOrphanCheck;
    private refreshOrphanCheck;
    private isManaged;
    private ownerResolves;
    private resolveNode;
    private expandChildren;
    private trackStructuralCleanup;
    private releaseStructuralCleanups;
    private attachConditionalNode;
    private attachStatefulChildren;
    private resolveComponentSelection;
}
interface ComponentClass<ELEMENT extends HTMLElement> extends ComponentExtensions {
}
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
export declare const Component: ComponentConstructor & ComponentStaticExtensions;
export {};
