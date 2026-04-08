import { Owner, State, type CleanupFunction } from "../state/State";
import { Style } from "./Style";
export type Falsy = false | 0 | 0n | "" | null | undefined;
export type StyleSelection = Style | Falsy | Iterable<Style | Falsy>;
export interface StyleSelectionSource {
    readonly value: StyleSelection;
    subscribe(owner: Owner, listener: (value: StyleSelection) => void): CleanupFunction;
}
export type StyleInput = Style | Falsy | StyleSelectionSource;
export declare class ClassManipulator {
    private readonly owner;
    private readonly element;
    private readonly styleDeterminers;
    constructor(owner: Owner, element: HTMLElement);
    add(...classes: StyleInput[]): this;
    remove(...classes: StyleInput[]): this;
    bind(state: State<boolean>, ...classes: StyleInput[]): CleanupFunction;
    addFrom(owner: Owner, ...classes: StyleInput[]): CleanupFunction;
    private ensureActive;
    private installAddInput;
    private installRemoveInput;
    private installStateDrivenStyles;
    private replaceDeterminer;
}
