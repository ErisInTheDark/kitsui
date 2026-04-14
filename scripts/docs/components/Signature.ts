import { JSONOutput, ReflectionKind } from "typedoc";
import { Component, pseudoBefore, Style } from "../../../src";
import { monoFont } from "../styles";
import Comment, { BlockTagContext, isReturnsOrThrowsTag, renderBlockTags } from "./Comment";
import Parameter from "./Parameter";
import Type from "./Type";
import TypeParameter from "./TypeParameter";

const signatureStyle = Style.Class("docs-signature", {
	position: "relative",
	display: "flex",
	flexDirection: "column",
	gap: "8px",
	zIndex: 1,
	paddingBlock: "12px",
	marginTop: "8px",
	...pseudoBefore({
		content: "''",
		display: "block",
		position: "absolute",
		inset: "0",
		left: "-24px",
		borderLeft: "2px solid $syntaxMethod",
		background: "linear-gradient(to right, $syntaxMethod, transparent)",
		backgroundSize: "300% 100%",
		backgroundPosition: "-200% 0",
		opacity: 0.4,
		zIndex: -1,
	})
});

const signatureCodeStyle = Style.Class("docs-signature-code", {
	...monoFont,
	background: "$bgCodeBlock",
	border: "1px solid $borderSubtle",
	borderRadius: "6px",
	color: "$textPrimary",
	fontSize: "14px",
	lineHeight: 1.6,
	overflow: "auto",
	padding: "10px 14px",
	marginLeft: "-14px",
});

const signaturePunctuationStyle = Style.Class("docs-signature-punctuation", {
	color: "$syntaxPunctuation",
});

const signatureNameStyle = Style.Class("docs-signature-name", {
	color: "$syntaxMethod",
	fontWeight: 600,
});

const parametersStyle = Style.Class("docs-signature-params", {
	display: "flex",
	flexDirection: "column",
	gap: "6px",
	paddingLeft: "24px",
});

const parameterRowStyle = Style.Class("docs-signature-param-row", {
	display: "flex",
	gap: "8px",
});

function punct (text: string): Component {
	return Component("span").class.add(signaturePunctuationStyle).text.set(text);
}

export interface SignatureOptions {
	skipSummary?: boolean;
	name?: string;
	pairedSignature?: JSONOutput.SignatureReflection;
}

function renderSignatureCode (sig: JSONOutput.SignatureReflection, code: Component, name: string | undefined): void {
	const isConstructSignature = sig.kind === ReflectionKind.ConstructorSignature;
	if (isConstructSignature) {
		code.append(punct("new "));
	}
	if (name && name !== "__type") {
		if (name.startsWith("get ")) {
			code.append(punct("get "));
			Component("span").class.add(signatureNameStyle).text.set(name.slice(4)).appendTo(code);
		} else {
			Component("span").class.add(signatureNameStyle).text.set(name).appendTo(code);
		}
	}

	// Type parameters
	if (sig.typeParameters && sig.typeParameters.length > 0) {
		code.append(punct("<"));
		for (let i = 0; i < sig.typeParameters.length; i++) {
			if (i > 0) code.append(punct(", "));
			code.append(TypeParameter(sig.typeParameters[i]));
		}
		code.append(punct(">"));
	}

	// Parameters
	code.append(punct("("));
	if (sig.parameters && sig.parameters.length > 0) {
		for (let i = 0; i < sig.parameters.length; i++) {
			if (i > 0) code.append(punct(", "));
			code.append(Parameter(sig.parameters[i]));
		}
	}
	code.append(punct(")"));

	// Return type
	if (sig.type) {
		code.append(
			punct(": "),
			Type(sig.type),
		);
	}
}

export default function Signature (sig: JSONOutput.SignatureReflection, options?: SignatureOptions): Component {
	const container = Component("div").class.add(signatureStyle);

	// Build context for block tag rendering
	const blockTagContext: BlockTagContext = {};
	if (sig.type) {
		blockTagContext.returnType = sig.type as JSONOutput.SomeType;
	}

	// Comment (excluding returns/throws — those render after params)
	if (sig.comment) {
		const comment = options?.skipSummary
			? { ...sig.comment, summary: [] as JSONOutput.CommentDisplayPart[] }
			: sig.comment;
		const hasContent = comment.summary.length > 0
			|| comment.blockTags?.some(tag => !isReturnsOrThrowsTag(tag));
		if (hasContent) {
			Comment(comment, tag => !isReturnsOrThrowsTag(tag), blockTagContext).appendTo(container);
		}
	}

	// Signature code block(s)
	const name = options?.name ?? sig.name;
	const code = Component("div").class.add(signatureCodeStyle).appendTo(container);
	renderSignatureCode(sig, code, name);

	// Render paired signature (call ↔ construct) back-to-back in the same code block
	if (options?.pairedSignature) {
		code.append(Component("br"));
		renderSignatureCode(options.pairedSignature, code, name);
	}

	// Parameter details (only params with documentation)
	const documentedParams = (sig.parameters ?? []).filter(p => p.comment);
	if (documentedParams.length > 0) {
		const paramsSection = Component("div")
			.class.add(parametersStyle)
			.appendTo(container);

		for (const param of documentedParams) {
			Component("div")
				.class.add(parameterRowStyle)
				.append(Parameter(param))
				.appendTo(paramsSection);

			if (param.comment) {
				Comment(param.comment).appendTo(paramsSection);
			}
		}
	}

	// Returns and throws (after params)
	if (sig.comment?.blockTags?.some(isReturnsOrThrowsTag)) {
		renderBlockTags(sig.comment.blockTags, isReturnsOrThrowsTag, blockTagContext).appendTo(container);
	}

	return container;
}
