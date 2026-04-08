export type StyleValue = string | number;
export type StyleDefinition = ({
    [KEY in keyof CSSStyleDeclaration as CSSStyleDeclaration[KEY] extends string ? KEY : never]?: StyleValue | null | undefined;
} & {
    [KEY in `$${string}`]?: StyleValue | null | undefined;
});
type StyleConstructor = {
    (className: string, definition: StyleDefinition): Style;
    new (className: string, definition: StyleDefinition): Style;
    after(...classes: Style[]): {
        create(className: string, definition: StyleDefinition): Style;
    };
    prototype: Style;
};
declare class StyleClass {
    readonly className: string;
    readonly afterClassNames: readonly string[];
    readonly definition: Readonly<StyleDefinition>;
    readonly cssText: string;
    constructor(className: string, definition: StyleDefinition, cssText: string, afterClassNames: readonly string[]);
    toString(): string;
}
export type Style = StyleClass;
export declare const Style: StyleConstructor;
export {};
