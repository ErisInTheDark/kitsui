import { JSONOutput } from "typedoc";
import { Component, Style } from "../../../src";
import { monoFont } from "../styles";

const typeStyle = Style.Class("docs-type", {
	...monoFont,
	color: "$syntaxType",
	fontSize: "14px",
});

const typeKeywordStyle = Style.Class("docs-type-keyword", {
	color: "$syntaxKeyword",
});

const typePunctuationStyle = Style.Class("docs-type-punctuation", {
	color: "$syntaxPunctuation",
});

const typeLiteralStyle = Style.Class("docs-type-literal", {
	color: "$syntaxLiteral",
});

const typeReferenceStyle = Style.Class("docs-type-reference", {
	color: "$syntaxReference",
});

const typeReferenceLinkStyle = Style.Class("docs-type-reference-link", {
	textDecoration: "none",
});

const typeErrorStyle = Style.Class("docs-type-error", {
	color: "$accentThrows",
});

const typeFunctionStyle = Style.Class("docs-type-function", {
	color: "$syntaxMethod",
});

const typeParamNameStyle = Style.Class("docs-type-param-name", {
	color: "$textPrimary",
});

const ERROR_PATTERN = /Error|Exception/;
const FUNCTION_PATTERN = /Function|Method|Constructor|Listener|Handler|Callback|Supplier|Builder/;

/**
 * A mapping from internal type names to their public alias names.
 * Set by the page builder before rendering to remap names like
 * "ComponentClass" → "Component" or "PlaceClass" → "Place".
 */
let typeNameAliases = new Map<string, string>();
let typeDeclarationLinks = new Map<string, string>();

export function setTypeNameAliases (aliases: Map<string, string>): void {
	typeNameAliases = aliases;
}

export function resolveTypeName (name: string): string {
	return typeNameAliases.get(name) ?? name;
}

export function setTypeDeclarationLinks (links: Map<string, string>): void {
	typeDeclarationLinks = links;
}

export function resolveTypeDeclarationLink (name: string): string | undefined {
	return typeDeclarationLinks.get(name);
}

export function referenceStyle (name: string): ReturnType<typeof Style.Class> {
	if (ERROR_PATTERN.test(name)) return typeErrorStyle;
	if (FUNCTION_PATTERN.test(name)) return typeFunctionStyle;
	return typeReferenceStyle;
}

/**
 * Determine the dominant color class for a type, excluding null/undefined.
 * Returns undefined if types are mixed or no meaningful types exist.
 */
export function dominantTypeColor (type: JSONOutput.SomeType): ReturnType<typeof Style.Class> | undefined {
	const colors = new Set<ReturnType<typeof Style.Class>>();
	collectTypeColors(type, colors);
	return colors.size === 1 ? [...colors][0] : undefined;
}

function collectTypeColors (type: JSONOutput.SomeType, colors: Set<ReturnType<typeof Style.Class>>): void {
	switch (type.type) {
		case "reference":
			colors.add(referenceStyle(type.name));
			break;
		case "union":
		case "intersection":
			for (const t of type.types) {
				// Skip null/undefined
				if (t.type === "intrinsic" && (t.name === "null" || t.name === "undefined")) continue;
				if (t.type === "literal" && t.value === null) continue;
				collectTypeColors(t, colors);
			}
			break;
		case "array":
			collectTypeColors(type.elementType, colors);
			break;
	}
}

function keyword (text: string): Component {
	return Component("span")
		.class.add(typeKeywordStyle)
		.text.set(text);
}

function punctuation (text: string): Component {
	return Component("span")
		.class.add(typePunctuationStyle)
		.text.set(text);
}

function renderTypeArguments (args: JSONOutput.SomeType[]): Component {
	const container = Component("span");
	container.append(punctuation("<"));

	for (let i = 0; i < args.length; i++) {
		if (i > 0) container.append(punctuation(", "));
		container.append(Type(args[i]));
	}

	container.append(punctuation(">"));
	return container;
}

type TypeHandler<K extends keyof JSONOutput.TypeKindMap> = (type: JSONOutput.TypeKindMap[K], container: Component) => void;

const handlers: { [K in keyof JSONOutput.TypeKindMap]: TypeHandler<K> } = {
	intrinsic (type, container) {
		container.append(keyword(type.name));
	},

	literal (type, container) {
		if (type.value === null) {
			container.append(keyword("null"));
		} else if (typeof type.value === "string") {
			container.append(
				Component("span").class.add(typeLiteralStyle).text.set(`"${type.value}"`),
			);
		} else if (typeof type.value === "number" || typeof type.value === "boolean") {
			container.append(
				Component("span").class.add(typeLiteralStyle).text.set(String(type.value)),
			);
		} else {
			const prefix = type.value.negative ? "-" : "";
			container.append(
				Component("span").class.add(typeLiteralStyle).text.set(`${prefix}${type.value.value}n`),
			);
		}
	},

	reference (type, container) {
		const name = resolveTypeName(type.name);
		const ref = Component("span").class.add(referenceStyle(name)).text.set(name);
		if (type.externalUrl) {
			const link = Component("a")
				.class.add(typeReferenceLinkStyle)
				.attribute.set("href", type.externalUrl)
				.append(ref);
			container.append(link);
		} else if (resolveTypeDeclarationLink(name)) {
			const link = Component("a")
				.class.add(typeReferenceLinkStyle)
				.attribute.set("href", resolveTypeDeclarationLink(name)!)
				.append(ref);
			container.append(link);
		} else {
			container.append(ref);
		}
		if (type.typeArguments && type.typeArguments.length > 0) {
			container.append(renderTypeArguments(type.typeArguments));
		}
	},

	union (type, container) {
		for (let i = 0; i < type.types.length; i++) {
			if (i > 0) container.append(punctuation(" | "));
			container.append(Type(type.types[i]));
		}
	},

	intersection (type, container) {
		for (let i = 0; i < type.types.length; i++) {
			if (i > 0) container.append(punctuation(" & "));
			container.append(Type(type.types[i]));
		}
	},

	array (type, container) {
		container.append(Type(type.elementType), punctuation("[]"));
	},

	tuple (type, container) {
		container.append(punctuation("["));
		if (type.elements) {
			for (let i = 0; i < type.elements.length; i++) {
				if (i > 0) container.append(punctuation(", "));
				container.append(Type(type.elements[i]));
			}
		}
		container.append(punctuation("]"));
	},

	namedTupleMember (type, container) {
		container.append(
			Component("span").text.set(type.name + (type.isOptional ? "?: " : ": ")),
			Type(type.element),
		);
	},

	conditional (type, container) {
		container.append(
			Type(type.checkType),
			keyword(" extends "),
			Type(type.extendsType),
			punctuation(" ? "),
			Type(type.trueType),
			punctuation(" : "),
			Type(type.falseType),
		);
	},

	indexedAccess (type, container) {
		container.append(
			Type(type.objectType),
			punctuation("["),
			Type(type.indexType),
			punctuation("]"),
		);
	},

	mapped (type, container) {
		container.append(
			punctuation("{ "),
			punctuation("["),
			Component("span").text.set(type.parameter),
			keyword(" in "),
			Type(type.parameterType),
			punctuation("]"),
		);
		if (type.nameType) {
			container.append(keyword(" as "), Type(type.nameType));
		}
		container.append(
			punctuation(": "),
			Type(type.templateType),
			punctuation(" }"),
		);
	},

	optional (type, container) {
		container.append(Type(type.elementType), punctuation("?"));
	},

	rest (type, container) {
		container.append(punctuation("..."), Type(type.elementType));
	},

	predicate (type, container) {
		container.append(Component("span").text.set(type.name));
		if (type.asserts) {
			container.prepend(keyword("asserts "));
		}
		if (type.targetType) {
			container.append(keyword(" is "), Type(type.targetType));
		}
	},

	query (type, container) {
		container.append(keyword("typeof "), Type(type.queryType));
	},

	typeOperator (type, container) {
		container.append(keyword(type.operator + " "), Type(type.target));
	},

	reflection (type, container) {
		if (type.declaration) {
			if (type.declaration.signatures && type.declaration.signatures.length > 0) {
				const sig = type.declaration.signatures[0];
				container.append(punctuation("("));
				if (sig.parameters) {
					for (let i = 0; i < sig.parameters.length; i++) {
						if (i > 0) container.append(punctuation(", "));
						const param = sig.parameters[i];
						container.append(
							Component("span").class.add(typeParamNameStyle).text.set(param.name),
							punctuation(": "),
						);
						if (param.type) container.append(Type(param.type));
					}
				}
				container.append(punctuation(") => "));
				if (sig.type) {
					container.append(Type(sig.type));
				} else {
					container.append(keyword("void"));
				}
			} else if (type.declaration.children && type.declaration.children.length > 0) {
				container.append(punctuation("{ "));
				for (let i = 0; i < type.declaration.children.length; i++) {
					if (i > 0) container.append(punctuation("; "));
					const child = type.declaration.children[i];
					container.append(Component("span").class.add(typeParamNameStyle).text.set(child.name));
					if (child.flags.isOptional) container.append(punctuation("?"));
					container.append(punctuation(": "));
					if (child.type) container.append(Type(child.type as JSONOutput.SomeType));
				}
				container.append(punctuation(" }"));
			} else {
				container.append(punctuation("{}"));
			}
		} else {
			container.append(punctuation("{}"));
		}
	},

	templateLiteral (type, container) {
		container.append(Component("span").class.add(typeLiteralStyle).text.set("`"));
		container.append(
			Component("span").class.add(typeLiteralStyle).text.set(type.head),
		);
		for (const [tailType, tailText] of type.tail) {
			container.append(
				punctuation("${"),
				Type(tailType),
				punctuation("}"),
				Component("span").class.add(typeLiteralStyle).text.set(tailText),
			);
		}
		container.append(Component("span").class.add(typeLiteralStyle).text.set("`"));
	},

	inferred (type, container) {
		container.append(keyword("infer "), Component("span").text.set(type.name));
		if (type.constraint) {
			container.append(keyword(" extends "), Type(type.constraint));
		}
	},

	unknown (type, container) {
		container.append(Component("span").text.set(type.name));
	},
};

export default function Type (type: JSONOutput.SomeType): Component {
	const container = Component("span").class.add(typeStyle);
	const handler = handlers[type.type] as ((type: JSONOutput.SomeType, container: Component) => void) | undefined;

	if (handler) {
		handler(type, container);
	} else {
		container.append(Component("span").text.set(String((type as { type: string }).type)));
	}

	return container;
}

export function typeToPlainText (type: JSONOutput.SomeType): string {
	switch (type.type) {
		case "intrinsic": return type.name;
		case "literal": return type.value === null ? "null" : String(type.value);
		case "reference": {
			let text = type.name;
			if (type.typeArguments && type.typeArguments.length > 0) {
				text += `<${type.typeArguments.map(typeToPlainText).join(", ")}>`;
			}
			return text;
		}
		case "union": return type.types.map(typeToPlainText).join(" | ");
		case "intersection": return type.types.map(typeToPlainText).join(" & ");
		case "array": return typeToPlainText(type.elementType) + "[]";
		case "tuple": return `[${(type.elements ?? []).map(typeToPlainText).join(", ")}]`;
		case "typeOperator": return `${type.operator} ${typeToPlainText(type.target)}`;
		case "indexedAccess": return `${typeToPlainText(type.objectType)}[${typeToPlainText(type.indexType)}]`;
		case "templateLiteral": return "string";
		case "reflection": return "object";
		default: return type.type;
	}
}
