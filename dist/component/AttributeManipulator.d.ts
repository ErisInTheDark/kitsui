import { State } from "../state/State";
import type { Falsy } from "./ClassManipulator";
import type { Component } from "./Component";
/**
 * Types accepted as attribute names: a single string, or any iterable of strings.
 * Falsy values are ignored.
 */
export type AttributeNameSelection = string | Falsy | Iterable<string | Falsy>;
/**
 * Valid types for HTML attribute values. All are serializable to strings.
 */
export type AttributeValue = string | number | bigint | boolean;
/**
 * Attribute values including nullish options for attribute removal.
 */
export type AttributeValueSelection = AttributeValue | null | undefined;
/**
 * Attribute name input: either a direct name selection or a subscribable source.
 */
export type AttributeNameInput = AttributeNameSelection | State<AttributeNameSelection>;
/**
 * Attribute value input: either a direct value or a subscribable source.
 */
export type AttributeValueInput = AttributeValueSelection | State<AttributeValueSelection>;
/**
 * Maps an attribute name to a value.
 */
export interface AttributeEntry {
    name: AttributeNameInput;
    value: AttributeValueInput;
}
/**
 * Manages HTML element attributes on a DOM element, supporting both static and state-driven values.
 * Attributes can be added, set, removed, and bound to reactive state.
 * Values are kept in sync with their sources and invalid configurations are rejected.
 */
export declare class AttributeManipulator<OWNER extends Component> {
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
