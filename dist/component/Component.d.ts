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
export type ComponentChild = Component | HTMLElement | string;
export type ComponentRender<TValue> = (value: TValue, component: Component) => void;
export type InsertWhere = "before" | "after";
export type InsertableNode = Node | Component | Falsy;
export type InsertableSelection = InsertableNode | Iterable<InsertableNode>;
export type ComponentSelection = Component | Falsy | Iterable<Component | Falsy>;
export interface ComponentSelectionState {
    readonly value: ComponentSelection;
    subscribe(owner: Owner, listener: (value: ComponentSelection) => void): CleanupFunction;
}
export type AppendableComponentChild = ComponentChild | ComponentSelectionState;
export type InsertableComponentChild = InsertableSelection | ComponentSelectionState;
export interface ComponentOptions {
    className?: string;
    textContent?: string;
}
export type ComponentOwnerResolver = (component: Component) => Owner | null;
export type ComponentMoveHandler = (component: Component) => void;
export interface ComponentExtensions {
}
export type ExtendableComponentClass = (abstract new (...args: never[]) => Component) & {
    prototype: Component;
};
type ComponentConstructor = {
    (tagNameOrElement: string | HTMLElement, options?: ComponentOptions): Component;
    new (tagNameOrElement: string | HTMLElement, options?: ComponentOptions): Component;
    prototype: Component;
    wrap(element: HTMLElement): Component;
    extend(): ExtendableComponentClass;
};
export declare function registerComponentMoveHandler(handler: ComponentMoveHandler): CleanupFunction;
export declare function registerComponentOwnerResolver(resolver: ComponentOwnerResolver): CleanupFunction;
declare class ComponentClass extends Owner {
    readonly element: HTMLElement;
    private owner;
    private releaseOwner;
    private readonly structuralCleanups;
    private orphanCheckId;
    constructor(tagNameOrElement: string | HTMLElement, options?: ComponentOptions);
    static wrap(element: HTMLElement): ComponentClass;
    get class(): ClassManipulator;
    get attribute(): AttributeManipulator;
    get aria(): AriaManipulator;
    append(...children: AppendableComponentChild[]): this;
    prepend(...children: AppendableComponentChild[]): this;
    insert(where: InsertWhere, ...nodes: InsertableComponentChild[]): this;
    appendWhen(state: State<boolean>, child: ComponentChild): CleanupFunction;
    prependWhen(state: State<boolean>, child: ComponentChild): CleanupFunction;
    insertWhen(state: State<boolean>, where: InsertWhere, ...nodes: InsertableSelection[]): CleanupFunction;
    clear(): this;
    setAttribute(name: string, value: string): this;
    setText(text: string): this;
    mount(target: HTMLElement | string): this;
    bindState<TValue>(state: State<TValue>, render: ComponentRender<TValue>): CleanupFunction;
    remove(): void;
    setOwner(owner: Owner | null): this;
    getOwner(): Owner | null;
    protected beforeDispose(): void;
    protected afterDispose(): void;
    private ensureActive;
    private clearOrphanCheck;
    private refreshOrphanCheck;
    private isManaged;
    private resolveEffectiveOwner;
    private ownerResolves;
    private resolveChildNode;
    private resolveInsertableNode;
    private expandInsertableChildren;
    private expandConditionalNodes;
    private trackStructuralCleanup;
    private releaseStructuralCleanups;
    private attachConditionalNode;
    private attachStatefulChildren;
    private resolveComponentSelection;
}
interface ComponentClass extends ComponentExtensions {
}
export type Component = ComponentClass;
export declare const Component: ComponentConstructor;
export {};
