import { Owner, type CleanupFunction } from "../state/State";
import type { Component } from "./Component";
/** Serializable values accepted by the text manipulator. */
export type TextValue = string | number | bigint | boolean;
/** Text content selections, including nullish values that clear the text content. */
export type TextSelection = TextValue | null | undefined;
/** A subscribable source of text content. */
export interface TextSource {
    readonly value: TextSelection;
    subscribe(owner: Owner, listener: (value: TextSelection) => void): CleanupFunction;
}
/** A direct or subscribable text input. */
export type TextInput = TextSelection | TextSource;
type PresenceSource = {
    readonly value: boolean;
    subscribe(owner: Owner, listener: (value: boolean) => void): CleanupFunction;
};
/**
 * Manages an element's text content with support for direct values and reactive sources.
 */
export declare class TextManipulator {
    private readonly owner;
    private readonly writeText;
    private determiner;
    constructor(owner: Component, writeText: (value: string) => void);
    /**
     * Sets the element's text content from a direct value or subscribable source.
     * Nullish values clear the text content.
     * @param value Direct or reactive text input.
     * @returns The owning component for fluent chaining.
     */
    set(value: TextInput): Component;
    /**
     * Shows or clears text content based on a boolean source.
     * When visible, the latest text value is applied; when hidden, the text content is cleared.
     * @param visible Boolean source controlling whether text is shown.
     * @param value Direct or reactive text input.
     * @returns The owning component for fluent chaining.
     */
    bind(visible: PresenceSource, value: TextInput): Component;
    private replaceDeterminer;
    private ensureActive;
}
export {};
