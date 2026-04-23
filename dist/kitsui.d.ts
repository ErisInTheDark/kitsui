declare module "kitsui" {
export type AriaRole = "alert" | "alertdialog" | "application" | "article" | "banner" | "blockquote" | "button" | "caption" | "cell" | "checkbox" | "code" | "columnheader" | "combobox" | "complementary" | "contentinfo" | "definition" | "deletion" | "dialog" | "directory" | "document" | "emphasis" | "feed" | "figure" | "form" | "generic" | "grid" | "gridcell" | "group" | "heading" | "img" | "insertion" | "link" | "list" | "listbox" | "listitem" | "log" | "main" | "marquee" | "math" | "menu" | "menubar" | "menuitem" | "menuitemcheckbox" | "menuitemradio" | "meter" | "navigation" | "none" | "note" | "option" | "paragraph" | "presentation" | "progressbar" | "radio" | "radiogroup" | "region" | "row" | "rowgroup" | "rowheader" | "scrollbar" | "search" | "searchbox" | "separator" | "slider" | "spinbutton" | "status" | "strong" | "subscript" | "superscript" | "switch" | "tab" | "table" | "tablist" | "tabpanel" | "term" | "textbox" | "time" | "timer" | "toolbar" | "tooltip" | "tree" | "treegrid" | "treeitem";

export type AriaText = string | null | undefined;

export type AriaTextInput = AriaText | State<AriaText>;

export type AriaRoleInput = AriaRole | null | undefined | State<AriaRole | null | undefined>;

export type AriaBooleanInput = boolean | null | undefined | State<boolean | null | undefined>;

export type AriaBooleanMixed = boolean | "mixed" | null | undefined;

export type AriaBooleanMixedInput = AriaBooleanMixed | State<AriaBooleanMixed>;

export type AriaCurrent = boolean | "page" | "step" | "location" | "date" | "time" | null | undefined;

export type AriaCurrentInput = AriaCurrent | State<AriaCurrent>;

export type AriaLive = "off" | "polite" | "assertive" | null | undefined;

export type AriaLiveInput = AriaLive | State<AriaLive>;

export type AriaReference = string | HTMLElement | {
    readonly element: HTMLElement;
} | Falsy;

export type AriaReferenceSelection = AriaReference | Iterable<AriaReference>;

export type AriaReferenceInput = AriaReferenceSelection | State<AriaReferenceSelection>;

export class AriaManipulator<OWNER extends Component> {
    private readonly owner;
    private readonly attribute;
    constructor(owner: OWNER, attribute: AttributeManipulator<OWNER>);
    /**
     * Set the ARIA role.
     * @param value The role value or reactive State.
     */
    role(value: AriaRoleInput): OWNER;
    /**
     * Set the ARIA label.
     * @param value The label text or reactive State.
     */
    label(value: AriaTextInput): OWNER;
    /**
     * Set the ARIA description.
     * @param value The description text or reactive State.
     */
    description(value: AriaTextInput): OWNER;
    /**
     * Set the ARIA role description.
     * @param value The role description text or reactive State.
     */
    roleDescription(value: AriaTextInput): OWNER;
    /**
     * Set aria-labelledby: elements that label this element.
     * @param value Element reference(s) or reactive State.
     */
    labelledBy(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-describedby: elements that describe this element.
     * @param value Element reference(s) or reactive State.
     */
    describedBy(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-controls: elements controlled by this element.
     * @param value Element reference(s) or reactive State.
     */
    controls(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-details: elements that provide details for this element.
     * @param value Element reference(s) or reactive State.
     */
    details(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-owns: elements owned by this element.
     * @param value Element reference(s) or reactive State.
     */
    owns(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-flowto: elements that follow this element.
     * @param value Element reference(s) or reactive State.
     */
    flowTo(value: AriaReferenceInput): OWNER;
    /**
     * Set aria-hidden: whether this element is hidden from assistive technology.
     * @param value The boolean value or reactive State.
     */
    hidden(value: AriaBooleanInput): OWNER;
    /**
     * Set aria-disabled: whether this element is disabled.
     * @param value The boolean value or reactive State.
     */
    disabled(value: AriaBooleanInput): OWNER;
    /**
     * Set aria-expanded: whether this element is expanded.
     * @param value The boolean value or reactive State.
     */
    expanded(value: AriaBooleanInput): OWNER;
    /**
     * Set aria-busy: whether this element is busy/loading.
     * @param value The boolean value or reactive State.
     */
    busy(value: AriaBooleanInput): OWNER;
    /**
     * Set aria-selected: whether this element is selected.
     * @param value The boolean value or reactive State.
     */
    selected(value: AriaBooleanInput): OWNER;
    /**
     * Set aria-checked: whether this element is checked (true, false, or "mixed").
     * @param value The boolean/mixed value or reactive State.
     */
    checked(value: AriaBooleanMixedInput): OWNER;
    /**
     * Set aria-pressed: whether this element is pressed (true, false, or "mixed").
     * @param value The boolean/mixed value or reactive State.
     */
    pressed(value: AriaBooleanMixedInput): OWNER;
    /**
     * Set aria-current: mark this element or one of its descendants as the current page/step/location.
     * @param value The current value (true, false, or a location type) or reactive State.
     */
    current(value: AriaCurrentInput): OWNER;
    /**
     * Set aria-live: announce dynamic content updates (off, polite, or assertive).
     * @param value The politeness level or reactive State.
     */
    live(value: AriaLiveInput): OWNER;
    private set;
}

export type AttributeNameSelection = string | Falsy | Iterable<string | Falsy>;

export type AttributeValue = string | number | bigint | boolean;

export type AttributeValueSelection = AttributeValue | null | undefined;

export type AttributeNameInput = AttributeNameSelection | State<AttributeNameSelection>;

export type AttributeValueInput = AttributeValueSelection | State<AttributeValueSelection>;

export interface AttributeEntry {
    name: AttributeNameInput;
    value: AttributeValueInput;
}

export class AttributeManipulator<OWNER extends Component> {
    private readonly owner;
    private readonly element;
    private readonly attributeDeterminers;
    /**
     * @param owner The component owner managing this manipulator's cleanup.
     * @param element The DOM element whose attributes are managed.
     */
    constructor(owner: OWNER, element: HTMLElement);
    /**
     * Adds valueless attributes to the element. Multiple names can be passed as separate arguments or as an iterable.
     * @param attributes Attribute names to add.
     * @returns The owning component for fluent chaining.
     */
    add(...attributes: AttributeNameInput[]): OWNER;
    /**
     * Sets attribute values using either a (name, value) pair or entries with name and value.
     * Values or names can be subscribable sources that update automatically.
     * @param name - Attribute name or source.
     * @param value - Attribute value or source.
     * @returns The owning component for fluent chaining.
     */
    set(name: AttributeNameInput, value: AttributeValueInput): OWNER;
    /**
     * Sets attribute values using entries with name and value pairs.
     * Values or names can be subscribable sources that update automatically.
     * @param entries - Objects with `name` and `value` properties.
     * @returns The owning component for fluent chaining.
     */
    set(...entries: AttributeEntry[]): OWNER;
    /**
     * Removes attributes from the element. Multiple names can be passed as separate arguments or as an iterable.
     * @param attributes Attribute names to remove.
     * @returns The owning component for fluent chaining.
     */
    remove(...attributes: AttributeNameInput[]): OWNER;
    /**
     * Binds valueless attributes to a boolean state, adding/removing them based on state value.
     * @param state A subscribable boolean state.
     * @param attributes Attribute names to bind.
     * @returns The owning component for fluent chaining.
     */
    bind(state: State<boolean>, ...attributes: AttributeNameInput[]): OWNER;
    /**
     * Binds attribute entries to a boolean state, setting/removing them based on state value.
     * When state is true, attributes are set; when false, they are removed.
     * @param state A subscribable boolean state.
     * @param entries Objects with `name` and `value` properties.
     * @returns The owning component for fluent chaining.
     */
    bind(state: State<boolean>, ...entries: AttributeEntry[]): OWNER;
    private ensureActive;
    private resolveSetEntries;
    private installAttributePresence;
    private installAttributeValue;
    private installAttributeSelection;
    private replaceAttributeDeterminer;
}

export type Falsy = false | 0 | 0n | "" | null | undefined;

export type StyleSelection = Style.Class | Falsy | Iterable<Style.Class | Falsy>;

export type StyleInput = Style.Class | Falsy | State<StyleSelection>;

export class ClassManipulator<OWNER extends Component> {
    private readonly owner;
    private readonly element;
    private readonly styleDeterminers;
    /**
     * @param owner The owner managing this manipulator's lifecycle.
     * @param element The HTML element to manipulate.
     */
    constructor(owner: OWNER, element: HTMLElement);
    /**
     * Adds one or more styles to the element. Each style replaces any prior determiner
     * for that class. Falsy values and values in iterables are ignored.
     *
     * @param classes Static or reactive styles to add. Accepts individual styles,
     * falsy values for conditional logic, or reactive style sources (States).
     * @returns The owning component for fluent chaining.
     * @throws If the owner is disposed.
     *
     * @example
     * // Static
     * component.class.add(primaryStyle);
     *
     * // Conditional
     * component.class.add(isPrimary ? primaryStyle : null);
     *
     * // Reactive
     * const selection = State(component, null);
     * component.class.add(selection);
     */
    add(...classes: StyleInput[]): OWNER;
    /**
     * Removes one or more styles from the element. Each style replaces any prior determiner
     * for that class. Falsy values and values in iterables are ignored.
     *
     * @param classes Static or reactive styles to remove. Accepts individual styles,
     * falsy values for conditional logic, or reactive style sources (States).
     * @returns The owning component for fluent chaining.
     * @throws If the owner is disposed.
     */
    remove(...classes: StyleInput[]): OWNER;
    /**
     * Binds one or more styles to a boolean State. The classes are added when the
     * state value is true, and removed when false. Each style replaces any prior
     * determiner for that class. Falsy values are ignored.
     *
     * @param state A boolean State controlling the visibility of the classes.
     * @param classes Styles to bind to the state. Accepts individual styles, falsy
     * values, or reactive style sources.
     * @returns The owning component for fluent chaining.
     * @throws If the owner is disposed.
     *
     * @example
     * const isActive = State(component, false);
     * component.class.bind(isActive, activeStyle);
     * // activeStyle is present iff isActive.value is true
     */
    bind(state: State<boolean>, ...classes: StyleInput[]): OWNER;
    /**
     * Adds one or more styles under the ownership of another Owner. The styles are
     * automatically removed when that owner is cleaned up. Falsy values and values
     * in iterables are ignored.
     *
     * @param owner The external owner managing the lifetime of these class additions.
     * @param classes Static or reactive styles to add.
     * @returns The owning component for fluent chaining.
     * @throws If this manipulator's owner is disposed.
     *
     * @example
     * const externalOwner = ComponentOwner(); // some lifecycle manager
     * component.class.addFrom(externalOwner, externalStyle);
     * // externalStyle is removed when externalOwner is cleaned up
     */
    addFrom(owner: Owner, ...classes: StyleInput[]): OWNER;
    private ensureActive;
    private installAddInput;
    private installRemoveInput;
    private installStateDrivenStyles;
    private replaceDeterminer;
}

export type ComponentChild = Component | Node | string | Falsy;

export type ComponentChildren = ComponentChild | Iterable<ComponentChild> | ComponentSelectionState;

export type ComponentRender<TValue> = (value: TValue, component: Component) => void;

export type InsertWhere = "before" | "after";

export type ComponentSelection = Component | Falsy | Iterable<Component | Falsy>;

export interface ComponentSelectionState {
    readonly value: ComponentSelection;
    subscribe(owner: Owner, listener: (value: ComponentSelection) => void): CleanupFunction;
}

interface ComponentExtensions {
}

interface ComponentStaticExtensions {
}

type ExtendableComponentClass = ComponentConstructor & ComponentStaticExtensions;

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

type ComponentOwnerResolver = (component: Component) => Owner | null;

function registerComponentOwnerResolver(resolver: ComponentOwnerResolver): CleanupFunction;

class ComponentClass<ELEMENT extends HTMLElement> extends Owner {
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
     * Lazily creates and memoizes a StyleManipulator for managing inline styles.
     */
    get style(): StyleManipulator<this>;
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

export type Component<ELEMENT extends HTMLElement = HTMLElement> = ComponentClass<ELEMENT>;

export const Component: ComponentConstructor & ComponentStaticExtensions;

type HostedEvent<TEvent extends Event, THost extends Owner, THostKey extends string> = TEvent & {
    readonly [KEY in THostKey]: THost;
};

type EventListenerFor<THost extends Owner, THostKey extends string, TEvent extends Event> = (event: HostedEvent<TEvent, THost, THostKey>) => unknown;

type EventListenerInputFor<THost extends Owner, THostKey extends string, TEvent extends Event> = EventListenerFor<THost, THostKey, TEvent> | State<EventListenerFor<THost, THostKey, TEvent> | null | undefined> | null | undefined;

type EventMapValue<TEventMap, TEventName extends keyof TEventMap & string> = TEventMap[TEventName] extends Event ? TEventMap[TEventName] : Event;

type EventOnProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
    [KEventName in keyof TEventMap & string]: (owner: Owner, listener: EventListenerInputFor<THost, THostKey, EventMapValue<TEventMap, KEventName>>) => THost;
};

type EventOffProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
    [KEventName in keyof TEventMap & string]: (listener: EventListenerInputFor<THost, THostKey, EventMapValue<TEventMap, KEventName>>) => THost;
};

type OwnedEventOnProxyFor<THost extends Owner, THostKey extends string, TEventMap> = {
    [KEventName in keyof TEventMap & string]: (listener: EventListenerInputFor<THost, THostKey, EventMapValue<TEventMap, KEventName>>) => THost;
};

export type ComponentEvent<TEvent extends Event, THost extends Component = Component> = HostedEvent<TEvent, THost, "component">;

export type ComponentEventListener<THost extends Component, TEvent extends Event> = EventListenerFor<THost, "component", TEvent>;

export type EventListenerInput<THost extends Component, TEvent extends Event> = EventListenerInputFor<THost, "component", TEvent>;

interface ComponentHTMLElementEventMap extends HTMLElementEventMap {
    Mount: CustomEvent;
    Dispose: CustomEvent;
}

type EventOnProxy<THost extends Component> = EventOnProxyFor<THost, "component", ComponentHTMLElementEventMap>;

type EventOffProxy<THost extends Component> = EventOffProxyFor<THost, "component", ComponentHTMLElementEventMap>;

type OwnedEventOnProxy<THost extends Component> = OwnedEventOnProxyFor<THost, "component", ComponentHTMLElementEventMap>;

interface OwnedEventManipulator<THost extends Component> {
    readonly on: OwnedEventOnProxy<THost>;
    readonly off: EventOffProxy<THost>;
}

export class EventManipulator<THost extends Owner = Component, THostKey extends string = "component", TEventMap = ComponentHTMLElementEventMap> {
    private readonly owner;
    private readonly target;
    private readonly hostPropertyName;
    readonly on: EventOnProxyFor<THost, THostKey, TEventMap>;
    readonly off: EventOffProxyFor<THost, THostKey, TEventMap>;
    readonly owned: {
        readonly on: OwnedEventOnProxyFor<THost, THostKey, TEventMap>;
        readonly off: EventOffProxyFor<THost, THostKey, TEventMap>;
    };
    private readonly listenerRecords;
    constructor(owner: THost, target: EventTarget, hostPropertyName?: THostKey);
    private releaseAllListeners;
    private createOnProxy;
    private createOwnedOnProxy;
    private createOffProxy;
    private installListener;
    private replaceListener;
    private removeListener;
    private ensureActive;
}

export type PlacementTarget = Node | Component | Marker | Place | Falsy;

type PlacementParent = ParentNode & Node;

type PlaceConstructor = {
    (): Place;
    new (): Place;
    prototype: Place;
};

export type PlacerFunction = (Place: PlaceConstructor) => State<Place | null>;

export interface ComponentExtensions {
        /**
         * Appends this component to the end of the target component or DOM parent.
         * Sets this component's owner to the target component, or the nearest wrapped ancestor for raw DOM parents.
         * @param target The target component or DOM parent.
         * @returns This component for chaining.
         * @throws If this or the target component is disposed.
         */
        appendTo(target: PlacementContainer): this;
        /**
         * Conditionally appends this component based on a boolean state.
         * Automatically removes the component when the state becomes false.
         * @param state The boolean state that controls visibility.
         * @param target The target component or DOM parent.
         * @returns This component for chaining.
         */
        appendToWhen(state: State<boolean>, target: PlacementContainer): this;
        /**
         * Prepends this component to the start of the target component or DOM parent.
         * Sets this component's owner to the target component, or the nearest wrapped ancestor for raw DOM parents.
         * @param target The target component or DOM parent.
         * @returns This component for chaining.
         * @throws If this or the target component is disposed.
         */
        prependTo(target: PlacementContainer): this;
        /**
         * Conditionally prepends this component based on a boolean state.
         * Automatically removes the component when the state becomes false.
         * @param state The boolean state that controls visibility.
         * @param target The target component or DOM parent.
         * @returns This component for chaining.
         */
        prependToWhen(state: State<boolean>, target: PlacementContainer): this;
        /**
         * Inserts this component before or after a reference node, component, or place.
         * Sets the owner based on the target's owner if applicable.
         * @param where \"before\" or \"after\" the target.
         * @param target The reference node, component, place, or null.
         * @returns This component for chaining.
         * @throws If this component is disposed or target's parent is not a valid insert location.
         */
        insertTo(where: InsertWhere, target: PlacementTarget): this;
        /**
         * Conditionally inserts this component based on a boolean state.
         * Automatically removes the component when the state becomes false.
         * @param state The boolean state that controls visibility.
         * @param where \"before\" or \"after\" the target.
         * @param target The reference node, component, place, or null.
         * @returns This component for chaining.
         */
        insertToWhen(state: State<boolean>, where: InsertWhere, target: PlacementTarget): this;
        /**
         * Manually controls component placement with a reactive placer function.
         * The placer receives a Place constructor and returns State<Place | null> that controls where the component is inserted.
         * @param owner The owner who manages the placement lifecycle.
         * @param placer A function that produces State<Place | null> determining the component's location.
         * @returns This component for chaining.
         * @throws If this component is disposed.
         */
        place(owner: Owner, placer: PlacerFunction): this;
    }

export interface MarkerExtensions {
        /**
         * Appends this marker to the end of the target component or DOM parent.
         * @param target The target component or DOM parent.
         * @returns This marker for chaining.
         */
        appendTo(target: PlacementContainer): this;
        /**
         * Prepends this marker to the start of the target component or DOM parent.
         * @param target The target component or DOM parent.
         * @returns This marker for chaining.
         */
        prependTo(target: PlacementContainer): this;
        /**
         * Inserts this marker relative to another target.
         * @param where Whether to insert before or after the target.
         * @param target The component, marker, place, or DOM node to insert around.
         * @returns This marker for chaining.
         */
        insertTo(where: InsertWhere, target: PlacementTarget): this;
    }

type PlacementContainer = Component | PlacementParent;

class PlaceClass {
    readonly owner: Owner;
    readonly marker: Marker;
    constructor(owner: Owner, marker: Marker);
    /**
     * Moves this placement marker to the end of the target component or DOM parent.
     * @param target The target component or DOM parent.
     * @returns This place for chaining.
     */
    appendTo(target: PlacementContainer): this;
    /**
     * Moves this placement marker to the start of the target component or DOM parent.
     * @param target The target component or DOM parent.
     * @returns This place for chaining.
     */
    prependTo(target: PlacementContainer): this;
    /**
     * Moves this placement marker before or after a reference node/component/place.
     * @param where "before" or "after" the target.
     * @param target The reference node, component, or place.
     * @returns This place for chaining, or this unchanged if target does not exist.
     * @throws If the target's parent is not a valid insert location.
     */
    insertTo(where: InsertWhere, target: PlacementTarget): this;
    /**
     * Removes this placement marker from the DOM.
     */
    remove(): void;
}

export type Place = PlaceClass;

export interface MarkerEventMap {
    Mount: CustomEvent;
    Dispose: CustomEvent;
}

export interface MarkerExtensions {
}

export interface MarkerStaticExtensions {
}

export type ExtendableMarkerClass = MarkerConstructor & MarkerStaticExtensions;

interface MarkerBuilderDefinition<A extends any[]> {
    /**
     * Returns the identifier text to store in the marker's comment node.
     * @param args The arguments passed into the generated marker factory.
     * @returns The comment text for the created marker.
     */
    id(...args: A): string;
    /**
     * Runs when the marker mounts and may return disposal cleanup.
     * @param marker The marker instance created by the factory.
     * @param args The arguments passed into the generated marker factory.
     * @returns Optional cleanup to run when the marker disposes.
     */
    build(marker: Marker, ...args: A): CleanupFunction;
}

type MarkerConstructor = {
    (id: string): Marker;
    new (id: string): Marker;
    prototype: Marker;
    /**
     * Returns the underlying Marker class for prototype extension.
     * Use this when adding methods through module augmentation.
     */
    extend(): ExtendableMarkerClass;
    /**
     * Creates a marker factory from an id/build definition pair.
     * The returned function creates markers lazily and wires their mount/dispose lifecycle automatically.
     */
    builder<A extends any[]>(definition: MarkerBuilderDefinition<A>): (...args: A) => Marker;
};

class MarkerClass extends Owner {
    /** The underlying DOM comment node that this marker wraps. */
    readonly node: Comment;
    private explicitOwner;
    private releaseExplicitOwner;
    private mounted;
    private orphanCheckId;
    /**
     * Creates a new marker comment with the given identifier text.
     * @param id The comment text to store in the marker node.
     */
    constructor(id: string);
    /** Lazily creates the marker's event manipulator for mount and dispose lifecycle events. */
    get event(): EventManipulator<this, "marker", MarkerEventMap>;
    /** Disposes the marker and removes its comment node from the DOM. */
    remove(): void;
    /**
     * Assigns or clears the explicit owner responsible for disposing this marker.
     * @param owner The owner to bind to this marker, or `null` to clear explicit ownership.
     * @returns This marker for chaining.
     */
    setOwner(owner: Owner | null): this;
    /** Returns the marker's current explicit owner, if one has been assigned. */
    getOwner(): Owner | null;
    /**
     * Registers mount and optional dispose hooks tied to this marker's lifecycle events.
     * @param onMount Called when the marker mounts. May return a cleanup function.
     * @param onDispose Called after the marker disposes.
     * @returns This marker for chaining.
     */
    use(onMount: () => CleanupFunction | undefined, onDispose?: () => unknown): this;
    protected beforeDispose(): void;
    protected afterDispose(): void;
    /** @internal */
    private dispatchMount;
    private ensureActive;
    private clearOrphanCheck;
    /** @internal */
    refreshOrphanCheck(): void;
    private isManaged;
}

interface MarkerClass extends MarkerExtensions {
}

export type Marker = MarkerClass;

export const Marker: MarkerConstructor & MarkerStaticExtensions;

export type StyleValue = string | number;

export interface AnimationMarker extends Marker {
    readonly name: string;
}

export type KeyframesDefinition = Record<string, StyleDefinition | null | undefined>;

export type StyleDefinition = ({
    [KEY in keyof CSSStyleDeclaration as CSSStyleDeclaration[KEY] extends string ? KEY extends "animation" | "animationName" ? never : KEY : never]?: StyleValue | null | undefined;
} & {
    [KEY in `$${string}`]?: StyleValue | null | undefined;
} & {
    [KEY in `{${string}}`]?: StyleDefinition | null | undefined;
} & {
    animationName?: readonly AnimationMarker[] | AnimationMarker | "none" | null | undefined;
});

type StyleClassConstructor = {
    (className: string, definition: StyleDefinition): Style.Class;
    new (className: string, definition: StyleDefinition): Style.Class;
    prototype: Style.Class;
};

class StyleClass {
    readonly className: string;
    readonly afterClassNames: readonly string[];
    readonly definition: Readonly<StyleDefinition>;
    readonly cssText: string;
    constructor(className: string, definition: StyleDefinition, cssText: string, afterClassNames: readonly string[]);
    toString(): string;
}

function mountStylesheet(): void;

function unmountStylesheet(): void;

export function Style(definition: StyleDefinition): StyleDefinition;

export namespace Style {
    /** @group Style.Class */
    type Class = StyleClass;
    /**
     * Creates or retrieves a CSS stylesheet entry with the given class name and style definition.
     * Can be called with or without the `new` keyword.
     *
     * The style is immediately registered in a `<style>` element and available for use.
     * CSS property names are converted from camelCase to kebab-case.
     * Custom variables are prefixed with `$` in the definition and become `--` in CSS.
     *
     * @param className - Unique identifier for the style class. Must be unique or identical rules.
     * @param definition - CSS property definitions to register.
     * @returns The registered Style instance with a `.className` property.
     * @throws If `className` is already registered with different rules.
     *
     * @example
     * const cardStyle = Style.Class("card", { backgroundColor: "#fff", borderRadius: "8px" });
     * // className: "card", renders: .card { background-color: #fff; border-radius: 8px }
     * @group Style.Class
     */
    const Class: StyleClassConstructor & {
        prototype: StyleClass;
    };
    /**
     * Creates styles that will be rendered after the given dependency styles.
     * Useful for ensuring CSS specificity or cascading order when styles depend on others.
     *
     * @param classes - One or more Style instances that this style should be ordered after.
     * @returns An object with a `Class` method for defining the dependent style.
     *
     * @example
     * const base = Style.Class("base", { color: "black" });
     * const accent = Style.after(base).Class("accent", { color: "red" });
     * // In the stylesheet, .base appears before .accent
     */
    function after(...classes: Style.Class[]): {
        Class(className: string, definition: StyleDefinition): Style.Class;
    };
}

export function StyleAnimation(name: string, keyframes: KeyframesDefinition): AnimationMarker;

export const StyleReset: (definition: StyleDefinition) => Marker;

export const StyleRoot: (definition: StyleDefinition) => Marker;

export const StyleSelector: (selector: string, definition: StyleDefinition) => Marker;

export const StyleImport: (url: string) => Marker;

export type FontFaceDefinition = StyleDefinition & {
    fontFamily: string;
    src: string;
    fontDisplay?: "auto" | "block" | "swap" | "fallback" | "optional";
    unicodeRange?: string;
};

export const StyleFontFace: (definition: FontFaceDefinition) => Marker;

export function elements(tagName: keyof HTMLElementTagNameMap, definition: StyleDefinition): StyleDefinition;

export const whenFirst: (definition: StyleDefinition) => StyleDefinition;

export const whenNotFirst: (definition: StyleDefinition) => StyleDefinition;

const whenAfterSelf: (definition: StyleDefinition) => StyleDefinition;

export const whenLast: (definition: StyleDefinition) => StyleDefinition;

export const whenNotLast: (definition: StyleDefinition) => StyleDefinition;

export const whenMiddle: (definition: StyleDefinition) => StyleDefinition;

export const whenEmpty: (definition: StyleDefinition) => StyleDefinition;

export const whenFull: (definition: StyleDefinition) => StyleDefinition;

export const whenOdd: (definition: StyleDefinition) => StyleDefinition;

export const whenEven: (definition: StyleDefinition) => StyleDefinition;

export const whenHover: (definition: StyleDefinition) => StyleDefinition;

export const whenHoverSelf: (definition: StyleDefinition) => StyleDefinition;

export const whenActive: (definition: StyleDefinition) => StyleDefinition;

export const whenActiveSelf: (definition: StyleDefinition) => StyleDefinition;

export const whenDisabled: (definition: StyleDefinition) => StyleDefinition;

export const whenFocus: (definition: StyleDefinition) => StyleDefinition;

export const whenFocusSelf: (definition: StyleDefinition) => StyleDefinition;

export const whenFocusAny: (definition: StyleDefinition) => StyleDefinition;

export const whenFocusAnySelf: (definition: StyleDefinition) => StyleDefinition;

export const pseudoBefore: (definition: StyleDefinition) => StyleDefinition;

export const pseudoAfter: (definition: StyleDefinition) => StyleDefinition;

export function lightScheme(definition: StyleDefinition): StyleDefinition;

export function darkScheme(definition: StyleDefinition): StyleDefinition;

export function whenStuck(container: Style.Class, definition: StyleDefinition): StyleDefinition;

export function whenOpen(definition: StyleDefinition): StyleDefinition;

export function whenClosed(definition: StyleDefinition): StyleDefinition;

export type StyleAttributeValue = StyleValue | null | undefined;

export type StyleAttributeValueInput = StyleAttributeValue | State<StyleAttributeValue>;

export type StyleAttributeDefinition = ({
    [KEY in keyof CSSStyleDeclaration as KEY extends string ? CSSStyleDeclaration[KEY] extends string ? KEY extends "animation" | "animationName" ? never : KEY : never : never]?: StyleAttributeValueInput;
} & {
    [KEY in `$${string}`]?: StyleAttributeValueInput;
});

export type StyleAttributeInput = StyleAttributeDefinition | State<StyleAttributeDefinition | null | undefined>;

export class StyleManipulator<OWNER extends Component> {
    private readonly owner;
    private readonly element;
    private determiner;
    /**
     * @param owner The component owner managing this manipulator's lifecycle.
     * @param element The element whose inline styles are controlled.
     */
    constructor(owner: OWNER, element: HTMLElement);
    /**
     * Sets inline styles from a direct definition or a subscribable definition source.
     * Each property can also be driven by its own subscribable value.
     * Nullish property values remove that property from the inline style attribute.
     * @param value Direct or reactive inline style definition.
     * @returns The owning component for fluent chaining.
     */
    set(value: StyleAttributeInput): OWNER;
    private installDefinition;
    private replaceDeterminer;
    private writeProperty;
    private ensureActive;
}

export type TextValue = string | number | bigint | boolean;

export type TextSelection = TextValue | null | undefined;

export type TextInput = TextSelection | State<TextSelection>;

export class TextManipulator<OWNER extends Component> {
    private readonly owner;
    private readonly writeText;
    private determiner;
    constructor(owner: OWNER, writeText: (value: string) => void);
    /**
     * Sets the element's text content from a direct value or subscribable source.
     * Nullish values clear the text content.
     * @param value Direct or reactive text input.
     * @returns The owning component for fluent chaining.
     */
    set(value: TextInput): OWNER;
    /**
     * Shows or clears text content based on a boolean source.
     * When visible, the latest text value is applied; when hidden, the text content is cleared.
     * @param visible Boolean source controlling whether text is shown.
     * @param value Direct or reactive text input.
     * @returns The owning component for fluent chaining.
     */
    bind(visible: State<boolean>, value: TextInput): OWNER;
    private replaceDeterminer;
    private ensureActive;
}

type Nullish = null | undefined;

export type Mapper<T, TMapped> = (value: T, oldValue?: T) => TMapped;

interface RecomputableState<T> extends State<T> {
    /**
     * Recomputes the current value of the state by reapplying all mapping and transformation functions.
     * Useful when external conditions affecting the mapped values have changed and a manual update is needed.
     */
    recompute(): void;
}

export interface StateExtensions<T> {
        /**
         * Creates a new ownerless state containing the mapped value of this state.
         * The mapped state subscribes to changes in the source and automatically updates.
         * The mapped state must gain an owner before the next tick.
         * @param mapValue Function that transforms each value from the source state.
         * @returns A new ownerless state with the transformed values.
         */
        map<TMapped>(mapValue: Mapper<T, TMapped>): RecomputableState<TMapped>;
        /**
         * Creates a new state containing the mapped value of this state.
         * The mapped state subscribes to changes in the source and automatically updates.
         * @param owner The owner responsible for managing the mapped state's lifecycle.
         * @param mapValue Function that transforms each value from the source state.
         * @returns A new state with the transformed values.
         */
        map<TMapped>(owner: Owner, mapValue: Mapper<T, TMapped>): RecomputableState<TMapped>;
        /**
         * A boolean state indicating whether the current value is truthy.
         * The value is memoized per state instance for efficiency.
         */
        readonly truthy: State<boolean>;
        /**
         * A boolean state indicating whether the current value is falsy.
         * The value is memoized per state instance for efficiency.
         */
        readonly falsy: State<boolean>;
        /**
         * Returns a state that falls back to a computed value when this state is null or undefined.
         * Otherwise, returns the original value.
         * @param getValue Function invoked to compute the fallback value when needed.
         * @returns A new state with the original or fallback value.
         */
        or<TFallback>(getValue: () => TFallback): RecomputableState<Exclude<T, Nullish> | TFallback>;
        /**
         * Returns a boolean state that is true when this state equals the provided value.
         * Uses strict equality (===) for comparison.
         * @param compareValue The value to compare against the current state value.
         * @returns A new state that is true when the values are strictly equal, false otherwise.
         */
        equals(compareValue: T): State<boolean>;
    }

export type CleanupFunction = () => void;

export type StateEqualityFunction<T> = (currentValue: T, nextValue: T) => boolean;

export type StateListener<T> = (value: T, previousValue: T) => void;

export type StateUpdater<T> = (currentValue: T) => T;

export interface StateOptions<T> {
    /**
     * Custom equality function for comparing state values.
     * Defaults to `Object.is` if not provided.
     */
    equals?: StateEqualityFunction<T>;
}

interface StateExtensions<T> {
}

interface StateStaticExtensions {
}

export type ExtendableStateClass = StateConstructor & StateStaticExtensions;

interface StateGraph {
    pendingListeners: Set<QueuedStateListenerRecord<unknown>>;
    scheduled: boolean;
}

interface QueuedStateListenerRecord<T> {
    active: boolean;
    graph: StateGraph;
    listener: StateListener<T>;
    pending: boolean;
    pendingOriginalValue: T;
    pendingFinalValue: T;
    equals: StateEqualityFunction<T>;
}

type StateInternalOptions<T> = StateOptions<T> & {
    graph?: StateGraph;
};

export abstract class Owner {
    private readonly cleanupFunctions;
    private disposedValue;
    /** @hidden */
    constructor();
    /**
     * Whether this owner has been disposed.
     * @readonly
     */
    get disposed(): boolean;
    /**
     * Disposes this owner and invokes all registered cleanup functions.
     * Once disposed, an owner cannot be used again.
     * Subsequent calls to `dispose()` are no-ops.
     */
    dispose(): void;
    /**
     * Registers a cleanup function to be invoked when this owner is disposed.
     * If the owner is already disposed, the cleanup function is invoked immediately.
     * @param cleanupFunction Function to invoke during cleanup.
     * @returns A function that unregisters the cleanup function. Calling it prevents the cleanup function from being invoked later.
     */
    onCleanup(cleanupFunction: CleanupFunction): CleanupFunction;
    /**
     * Hook invoked before cleanup functions run during disposal.
     * Subclasses may override to perform custom pre-disposal logic.
     * @protected
     */
    protected beforeDispose(): void;
    /**
     * Hook invoked after all cleanup functions have run during disposal.
     * Subclasses may override to perform custom post-disposal logic.
     * @protected
     */
    protected afterDispose(): void;
}

class StateClass<T> extends Owner {
    private owner;
    private releaseOwner;
    private isImplicitOwner;
    private requiresExplicitOwner;
    private readonly implicitOwnerDependents;
    private orphanCheckId;
    private currentValue;
    /** @deprecated Use getEqualityFunction(this) */
    private equalityFunction;
    private readonly graph;
    /** @deprecated Use getImmediateListeners(this) */
    private readonly immediateListeners;
    /** @deprecated Use getQueuedListeners(this) */
    private readonly queuedListeners;
    constructor(owner: Owner | null, initialValue: T, options?: StateInternalOptions<T>);
    /**
     * Returns the owner that manages this state's lifecycle, or null if ownerless.
     */
    getOwner(): Owner | null;
    /**
     * The current state value. Changes to this value trigger listeners.
     */
    get value(): T;
    /**
     * Returns the internal state graph used for batching queued listeners.
     * This is typically used internally by extensions and should not be accessed directly.
     * @internal
     */
    getGraph(): StateGraph;
    /**
     * Updates the state to a new value.
     * If the new value is equal to the current value (by the equality function),
     * the value is unchanged and no listeners are invoked.
     * Immediate listeners are invoked synchronously; queued listeners are batched and called asynchronously.
     * @param nextValue The new value for this state.
     * @returns The new state value.
     * @throws If the state has been disposed.
     */
    set(nextValue: T): T;
    /**
     * Replaces the internal state value without checking disposal or notifying listeners.
     * This is intended for silent state resets during disposal and cleanup flows.
     * @param nextValue The new value for this state.
     * @returns The stored state value.
     */
    clear(nextValue: T): T;
    /**
     * Updates the state by applying a function to the current value.
     * @param updater Function that transforms the current value to a new value.
     * @returns The new state value.
     * @throws If the state has been disposed.
     */
    update(updater: StateUpdater<T>): T;
    /**
     * Sets a new equality function for comparing state values.
     * This affects all subsequent calls to `set()` but does not re-evaluate existing listeners.
     * @param equals Custom equality function.
     * @returns This state instance for method chaining.
     * @throws If the state has been disposed.
     */
    setEquality(equals: StateEqualityFunction<T>): this;
    /**
     * Subscribes to synchronous state changes without binding to an owner.
     * The listener is invoked immediately (synchronously) whenever the state value changes.
     * Use this for quick derivations and computed values. If the state is disposed, returns a no-op unsubscribe function.
     * @param listener Function called with (newValue, previousValue) on each change.
     * @returns Function to unsubscribe the listener.
     */
    subscribeImmediateUnbound(listener: StateListener<T>): CleanupFunction;
    /**
     * Subscribes to asynchronous state changes without binding to an owner.
     * Listeners are batched and invoked together in microtasks, receiving only the original and final values.
     * Multiple state changes between listener invocations are coalesced.
     * Use this for side effects that can tolerate slight delays. If the state is disposed, returns a no-op unsubscribe function.
     * @param listener Function called with (finalValue, originalValue) after batched changes.
     * @returns Function to unsubscribe the listener.
     */
    subscribeUnbound(listener: StateListener<T>): CleanupFunction;
    /**
     * Subscribes to synchronous state changes with automatic cleanup via an owner.
     * The listener is invoked immediately (synchronously) whenever the state value changes.
     * The subscription is automatically cleaned up when the owner is disposed.
     * @param owner The owner that will manage the subscription lifecycle.
     * @param listener Function called with (newValue, previousValue) on each change.
     * @returns Function to unsubscribe (also triggered automatically when owner is disposed).
     */
    subscribeImmediate(owner: Owner, listener: StateListener<T>): CleanupFunction;
    /**
     * Subscribes to asynchronous state changes with automatic cleanup via an owner.
     * Listeners are batched and invoked together in microtasks, receiving only the original and final values.
     * The subscription is automatically cleaned up when the owner is disposed.
     * @param owner The owner that will manage the subscription lifecycle.
     * @param listener Function called with (finalValue, originalValue) after batched changes.
     * @returns Function to unsubscribe (also triggered automatically when owner is disposed).
     */
    subscribe(owner: Owner, listener: StateListener<T>): CleanupFunction;
    _registerImplicitOwnerDependent(dependent: State<unknown>): CleanupFunction;
    protected beforeDispose(): void;
    private clearOrphanCheck;
    private refreshOrphanCheck;
    private setImplicitOwnerCandidate;
    private notifyImplicitOwnerDependents;
    private ensureActive;
}

interface StateClass<T> extends StateExtensions<T> {
}

export type State<T> = StateClass<T>;

type StateConstructor = {
    <T>(initialValue: T, options?: StateOptions<T>): State<T>;
    <T>(owner: Owner, initialValue: T, options?: StateOptions<T>): State<T>;
    new <T>(initialValue: T, options?: StateOptions<T>): State<T>;
    new <T>(owner: Owner, initialValue: T, options?: StateOptions<T>): State<T>;
    prototype: State<unknown>;
    /**
     * Returns the underlying State class for prototype extension.
     * This allows modules to add custom methods and properties to all State instances.
     *
     * @returns The ExtendableStateClass constructor, whose prototype can be modified.
     *
     * @example
     * ```
     * const StateClass = State.extend<number>();
     * StateClass.prototype.double = function() {
     *   return this.value * 2;
     * };
     *
     * const num = State(owner, 5);
     * num.double(); // 10
     * ```
     */
    extend<T = unknown>(): ExtendableStateClass;
    /**
     * Creates a new State instance that can never change.
     * The returned state has a fixed value and ignores all updates.
     * It is not associated with any owner and does not require disposal.
     * @param value The fixed value for the readonly state.
     * @returns A new readonly state instance with the specified value.
     */
    Readonly<T>(value: T): State<T>;
};

export const State: StateConstructor & StateStaticExtensions;

type BreakdownPartBuilder<TPart> = (state: State<TPart>) => Component;

type StatelessBreakdownPartBuilder = () => Component;

type BreakdownPartRegistrar = {
    <TPart>(key: PropertyKey, value: TPart, build: BreakdownPartBuilder<TPart>): Component;
    (key: PropertyKey, build: StatelessBreakdownPartBuilder): Component;
};

type BreakdownRenderer<TValue> = (Part: BreakdownPartRegistrar, value: TValue) => void;

type BreakdownConstructor = {
    <TValue>(owner: Owner, state: State<TValue>, breakdown: BreakdownRenderer<TValue>): CleanupFunction;
};

export interface ComponentStaticExtensions {
        /**
         * Breaks a source state into keyed reusable parts owned by the provided owner.
         *
         * Each unique key creates a component once. Later breakdown passes reuse that component,
         * update its per-part state, and let callers reposition it through normal placement APIs.
         *
         * Parts omitted from a later pass are removed and their part state is disposed.
         *
         * @param owner The owner that explicitly owns every created part.
         * @param state The source state to break down on each update.
         * @param breakdown Called immediately and on each source update to register keyed parts.
         * @returns A cleanup function that stops the breakdown and disposes its parts.
         */
        Breakdown: BreakdownConstructor;
    }

type GroupedStateObject = Record<string, State<any>>;

type GroupedValue<T extends GroupedStateObject> = {
    [K in keyof T]: T[K] extends State<infer TValue> ? TValue : never;
};

type GroupConstructor = {
    <T extends GroupedStateObject>(owner: Owner, states: T): State<GroupedValue<T>>;
    new <T extends GroupedStateObject>(owner: Owner, states: T): State<GroupedValue<T>>;
};

export interface StateStaticExtensions {
        /**
         * Creates a grouped state that mirrors the current values of multiple states.
         *
         * The grouped state subscribes to all input states and coalesces source updates
         * into a single next-tick grouped update per tick.
         *
         * @param owner The owner that manages the grouped state's lifecycle.
         * @param states A record of source states to group.
         * @returns A state whose value is an object with the current value of each source state.
         * @group Group
         */
        Group: GroupConstructor;
    }
}
