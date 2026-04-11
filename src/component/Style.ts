/**
 * A CSS property value that can be a string or number.
 * Numbers are automatically suffixed with "px" during serialization.
 */
export type StyleValue = string | number;

/**
 * CSS style property definition. Supports:
 * - Standard CSS properties (camelCase, e.g., `backgroundColor`)
 * - Custom CSS variables (prefixed with `$`, e.g., `$cardGap` becomes `--card-gap`)
 * - Variable shorthand in values (e.g., `gap: "$cardGap"` or `gap: "${varName: fallback}"`)
 * 
 * Properties with `null` or `undefined` values are filtered during serialization.
 */
export type StyleDefinition = (
	& { [KEY in keyof CSSStyleDeclaration as CSSStyleDeclaration[KEY] extends string ? KEY : never]?: StyleValue | null | undefined }
	& { [KEY in `$${string}`]?: StyleValue | null | undefined }
);

type StyleConstructor = {
	(className: string, definition: StyleDefinition): Style;
	new(className: string, definition: StyleDefinition): Style;
	after (...classes: Style[]): {
		create (className: string, definition: StyleDefinition): Style;
	};
	prototype: Style;
};

const styleRegistry = new Map<string, StyleClass>();
const styleOrder: StyleClass[] = [];
let styleElement: HTMLStyleElement | null = null;

function toCssPropertyName (propertyName: string): string {
	if (propertyName.startsWith("--")) {
		return propertyName;
	}

	if (propertyName.startsWith("$")) {
		propertyName = `--${propertyName.slice(1)}`;
	}

	return propertyName.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function serializeDefinition (definition: StyleDefinition): string {
	return Object.entries(definition)
		.filter((entry): entry is [string, StyleValue] => entry[1] !== undefined && entry[1] !== null)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([propertyName, value]) => `${toCssPropertyName(propertyName)}: ${String(expandVariableAccessShorthand(value))}`)
		.join("; ");
}

function isWordCharacter (character: string): boolean {
	const charCode = character.charCodeAt(0);
	return (false
		|| (charCode >= 48 && charCode <= 57) // 0-9
		|| (charCode >= 65 && charCode <= 90) // A-Z
		|| (charCode >= 97 && charCode <= 122) // a-z
		|| charCode === 45 // -
		|| charCode === 95 // _
	);
}

function isWhitespaceCharacter (character: string): boolean {
	const charCode = character.charCodeAt(0);
	return (false
		|| charCode === 32 // space
		|| charCode === 9 // tab
		|| charCode === 10 // newline
		|| charCode === 13 // carriage return
	);
}

function expandVariableAccessShorthand (styleValue: StyleValue): StyleValue {
	if (typeof styleValue === "number") {
		return `${styleValue}px`;
	}

	const src = styleValue;

	let i = 0;
	function consumeChar (expected: string): boolean {
		if (src[i] === expected) {
			i++;
			return true;
		}

		return false;
	}

	function consumeWord (): string {
		let j = i;
		for (; i < src.length; i++) {
			const character = src[i];
			if (!isWordCharacter(character)) {
				break;
			}
		}

		return src.slice(j, i);
	}

	function consumeWhitespace (): string {
		let result = "";
		while (i < src.length && isWhitespaceCharacter(src[i])) {
			result += src[i++];
		}
		return result;
	}

	let awaitingClosingBrace = 0;
	function consumeVariableAccess (): string | undefined {
		const restorePoint = i;
		if (!consumeChar("$")) {
			return undefined;
		}

		if (!consumeChar("{")) {
			const variableName = consumeWord();
			if (!variableName) {
				i = restorePoint;
				return undefined;
			}

			return `var(${toCssPropertyName(`$${variableName}`)})`;
		}

		consumeWhitespace();
		const variableName = consumeWord();
		if (!variableName) {
			i = restorePoint;
			return undefined;
		}

		consumeWhitespace();
		if (!consumeChar(":")) {
			i = restorePoint;
			return undefined;
		}

		consumeWhitespace();
		awaitingClosingBrace++;
		const fallbackValue = consumeStyleValue();
		consumeWhitespace();
		if (!consumeChar("}")) {
			i = restorePoint;
			return undefined;
		}

		return `var(${toCssPropertyName(`$${variableName}`)}, ${fallbackValue})`;
	}

	function consumeStyleValue (): string {
		let result = "";
		do {
			if (awaitingClosingBrace && src[i] === "}") {
				awaitingClosingBrace--;
				return result;
			}

			result += consumeWhitespace() || consumeVariableAccess() || src[i++];
		} while (i < src.length);
		return result;
	}

	return consumeStyleValue();
}

function getStyleElement (): HTMLStyleElement {
	if (typeof document === "undefined") {
		throw new Error("Style registration requires a document.");
	}

	if (styleElement?.isConnected) {
		return styleElement;
	}

	styleElement = null;

	styleElement = document.querySelector("style[data-kitsui-styles='true']");

	if (styleElement instanceof HTMLStyleElement) {
		return styleElement;
	}

	styleElement = document.createElement("style");
	styleElement.setAttribute("data-kitsui-styles", "true");
	(document.head ?? document.documentElement).append(styleElement);
	return styleElement;
}

class StyleClass {
	readonly className: string;
	readonly afterClassNames: readonly string[];
	readonly definition: Readonly<StyleDefinition>;
	readonly cssText: string;

	constructor (className: string, definition: StyleDefinition, cssText: string, afterClassNames: readonly string[]) {
		this.afterClassNames = [...afterClassNames];
		this.className = className;
		this.definition = Object.freeze({ ...definition });
		this.cssText = cssText;
	}

	toString (): string {
		return this.className;
	}
}

function renderStyleSheet (): void {
	getStyleElement().textContent = styleOrder
		.map((style) => `.${style.className} { ${style.cssText} }`)
		.join("\n");

	if (styleOrder.length > 0) {
		getStyleElement().append(document.createTextNode("\n"));
	}
}

function insertStyleInOrder (style: StyleClass): void {
	if (style.afterClassNames.length === 0) {
		styleOrder.push(style);
		return;
	}

	let insertionIndex = -1;

	for (const afterClassName of style.afterClassNames) {
		const styleIndex = styleOrder.findIndex((entry) => entry.className === afterClassName);

		if (styleIndex === -1) {
			throw new Error(`Style '${style.className}' cannot be ordered after unknown style '${afterClassName}'.`);
		}

		insertionIndex = Math.max(insertionIndex, styleIndex);
	}

	styleOrder.splice(insertionIndex + 1, 0, style);
}

function createStyle (
	className: string,
	definition: StyleDefinition,
	afterStyles: readonly Style[] = [],
): Style {
	const cssText = serializeDefinition(definition);
	const afterClassNames = afterStyles.map((style) => style.className);
	const existingStyle = styleRegistry.get(className);

	if (existingStyle) {
		const sameAfterStyles = existingStyle.afterClassNames.length === afterClassNames.length
			&& existingStyle.afterClassNames.every((value, index) => value === afterClassNames[index]);

		if (existingStyle.cssText !== cssText || !sameAfterStyles) {
			throw new Error(`Style '${className}' is already registered with different rules.`);
		}

		return existingStyle;
	}

	const style = new StyleClass(className, definition, cssText, afterClassNames);
	styleRegistry.set(className, style);
	insertStyleInOrder(style);
	renderStyleSheet();
	return style;
}

export type Style = StyleClass;

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
 * const cardStyle = Style("card", { backgroundColor: "#fff", borderRadius: 8 });
 * // className: "card", renders: .card { background-color: #fff; border-radius: 8px }
 */
export const Style = function Style (className: string, definition: StyleDefinition): Style {
	return createStyle(className, definition);
} as StyleConstructor;

Style.prototype = StyleClass.prototype;

/**
 * Creates a style that will be rendered after the given dependency styles.
 * Useful for ensuring CSS specificity or cascading order when styles depend on others.
 * 
 * @param classes - One or more Style instances that this style should be ordered after.
 * @returns An object with a `create` method for defining the dependent style.
 * 
 * @example
 * const base = Style("base", { color: "black" });
 * const accent = Style.after(base).create("accent", { color: "red" });
 * // In the stylesheet, .base appears before .accent
 */
Style.after = function after (...classes: Style[]) {
	return {
		create (className: string, definition: StyleDefinition): Style {
			return createStyle(className, definition, classes);
		},
	};
};