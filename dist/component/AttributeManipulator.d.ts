import { Owner, type CleanupFunction } from "../state/State";
import type { Falsy } from "./ClassManipulator";
export type AttributeNameSelection = string | Falsy | Iterable<string | Falsy>;
export interface AttributeNameSource {
    readonly value: AttributeNameSelection;
    subscribe(owner: Owner, listener: (value: AttributeNameSelection) => void): CleanupFunction;
}
export type AttributeValue = string | number | bigint | boolean;
export type AttributeValueSelection = AttributeValue | null | undefined;
export interface AttributeValueSource {
    readonly value: AttributeValueSelection;
    subscribe(owner: Owner, listener: (value: AttributeValueSelection) => void): CleanupFunction;
}
export type AttributeNameInput = AttributeNameSelection | AttributeNameSource;
export type AttributeValueInput = AttributeValueSelection | AttributeValueSource;
export interface AttributeEntry {
    name: AttributeNameInput;
    value: AttributeValueInput;
}
export declare class AttributeManipulator {
    private readonly owner;
    private readonly element;
    private readonly attributeDeterminers;
    constructor(owner: Owner, element: HTMLElement);
    add(...attributes: AttributeNameInput[]): this;
    set(name: AttributeNameInput, value: AttributeValueInput): this;
    set(...entries: AttributeEntry[]): this;
    remove(...attributes: AttributeNameInput[]): this;
    bind(state: {
        readonly value: boolean;
        subscribe(owner: Owner, listener: (value: boolean) => void): CleanupFunction;
    }, ...attributes: AttributeNameInput[]): CleanupFunction;
    bind(state: {
        readonly value: boolean;
        subscribe(owner: Owner, listener: (value: boolean) => void): CleanupFunction;
    }, ...entries: AttributeEntry[]): CleanupFunction;
    private ensureActive;
    private resolveSetEntries;
    private installAttributePresence;
    private installAttributeValue;
    private installAttributeSelection;
    private replaceAttributeDeterminer;
}
