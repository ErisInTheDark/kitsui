import { Owner, State } from "../state/State";
import type { Component } from "./Component";
import { Style } from "./Style";
/**
 * Falsy values that are ignored when used as style inputs.
 * Used to allow convenient conditional style application.
 */
export type Falsy = false | 0 | 0n | "" | null | undefined;
/**
 * A single style, falsy value, or iterable collection of styles and falsy values.
 * Falsy values in iterables are filtered out during resolution.
 */
export type StyleSelection = Style.Class | Falsy | Iterable<Style.Class | Falsy>;
/**
 * A style input: a static style, falsy value, reactive style source, or any combination.
 */
export type StyleInput = Style.Class | Falsy | State<StyleSelection>;
/**
 * Manages CSS class application to an HTML element with support for static values,
 * reactive state, and multiple overlapping style determiners.
 *
 * Each class has a single "determiner" — the most recent operation (add/remove/bind)
 * takes precedence. When a determiner is replaced, it is properly cleaned up.
 *
 * @example
 * const component = Component("div");
 * const primaryStyle = Style.Class("primary", { color: "blue" });
 * const accentStyle = Style.Class("accent", { fontWeight: "bold" });
 *
 * // Static invocations
 * component.class.add(primaryStyle);
 * component.class.remove(accentStyle);
 *
 * // Reactive binding
 * const isActive = State(component, false);
 * component.class.bind(isActive, accentStyle);
 *
 * // Multiple styles or iterables
 * component.class.add([primaryStyle, accentStyle]);
 */
export declare class ClassManipulator<OWNER extends Component> {
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
