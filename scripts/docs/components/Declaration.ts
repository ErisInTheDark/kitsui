import { JSONOutput, ReflectionKind } from "typedoc";
import { Component, pseudoBefore, Style, whenClosed, whenFirst, whenHover, whenNotFirst, whenStuck } from "../../../src";
import { monoFont } from "../styles";
import Comment from "./Comment";
import Flags from "./Flags";
import Signature, { fancyAccentBlock } from "./Signature";
import SourceLink from "./SourceLink";
import Type, { resolveTypeDeclarationLinkById } from "./Type";

function summarizeText (summary: JSONOutput.CommentDisplayPart[]): string {
	return summary.map(p => p.text).join("").trim();
}

function summarizeComment (comment: JSONOutput.Comment | undefined): string {
	if (!comment)
		return "";

	const summary = summarizeText(comment.summary);
	const tags = (comment.blockTags ?? [])
		.map(tag => `${tag.tag}:${tag.name ?? ""}:${summarizeText(tag.content)}`)
		.join("|");

	return `${summary}||${tags}`;
}

function summarizeSignatureShape (signature: JSONOutput.SignatureReflection): string {
	const typeParameters = (signature.typeParameters ?? []).map(typeParameter => typeParameter.name).join(",");
	const parameters = (signature.parameters ?? []).map(parameter => parameter.name).join(",");
	return `${typeParameters}||${parameters}`;
}

function hasRenderableComment (comment: JSONOutput.Comment | undefined): comment is JSONOutput.Comment {
	if (!comment) {
		return false;
	}

	const hasSummary = summarizeText(comment.summary).length > 0;
	const hasRenderableBlockTag = comment.blockTags?.some(tag => tag.tag !== "@group" && tag.tag !== "@category") ?? false;
	return hasSummary || hasRenderableBlockTag;
}

const CALL_CONSTRUCT_KINDS = new Set([ReflectionKind.CallSignature, ReflectionKind.ConstructorSignature]);

/**
 * Find a paired call/construct signature with identical documentation.
 * Returns the index of the paired signature, or undefined.
 */
function findPairedSignature (
	signatures: JSONOutput.SignatureReflection[],
	index: number,
	rendered: Set<number>,
): number | undefined {
	const sig = signatures[index];
	if (!CALL_CONSTRUCT_KINDS.has(sig.kind)) return undefined;

	const pairKind = sig.kind === ReflectionKind.CallSignature
		? ReflectionKind.ConstructorSignature
		: ReflectionKind.CallSignature;

	const sigSummary = summarizeComment(sig.comment);
	const sigShape = summarizeSignatureShape(sig);
	let commentMatchIndex: number | undefined;
	let shapeMatchIndex: number | undefined;

	for (let j = 0; j < signatures.length; j++) {
		if (j === index || rendered.has(j)) continue;
		const other = signatures[j];
		if (other.kind !== pairKind) continue;

		const otherSummary = summarizeComment(other.comment);
		const otherShape = summarizeSignatureShape(other);

		if (sigShape === otherShape && sigSummary === otherSummary) return j;
		if (shapeMatchIndex === undefined && sigShape === otherShape) {
			shapeMatchIndex = j;
		}
		if (commentMatchIndex === undefined && sigSummary === otherSummary) {
			commentMatchIndex = j;
		}
	}

	return shapeMatchIndex ?? commentMatchIndex;
}

function renderedSignatureGroupCount (signatures: JSONOutput.SignatureReflection[]): number {
	const rendered = new Set<number>();
	let groups = 0;

	for (let i = 0; i < signatures.length; i++) {
		if (rendered.has(i)) continue;

		rendered.add(i);
		const paired = findPairedSignature(signatures, i, rendered);
		if (paired !== undefined) {
			rendered.add(paired);
		}

		groups++;
	}

	return groups;
}

const declarationStyle = Style.Class("docs-declaration", {
	borderTop: "1px solid $borderSubtle",
	paddingBlock: "16px",
	paddingLeft: "26px",
	scrollMarginTop: "$docsDeclarationStickyTop",
	...whenClosed({
		$declarationTitleFontStyle: "italic",
	})
});

const declarationCollapsed = Style.after(declarationStyle).Class("docs-declaration-collapsed", {
	paddingBlock: "4px",
	...whenFirst({ paddingTop: "8px" }),
	...whenNotFirst({ borderTop: "none" }),
});

const declarationContentsStyle = Style.Class("docs-declaration-contents", {
	display: "flex",
	flexDirection: "column",
	gap: "10px",
	paddingTop: "10px",
});

const declarationRelationshipsStyle = Style.Class("docs-declaration-relationships", {
	alignItems: "center",
	display: "flex",
	flexWrap: "wrap",
	gap: "8px",
	marginLeft: "-2px",
	minHeight: "24px",
});

const declarationRelationshipLabelStyle = Style.Class("docs-declaration-relationship-label", {
	...monoFont,
	color: "$syntaxKeyword",
	fontSize: "13px",
	fontWeight: 700,
	textTransform: "lowercase",
});

const declarationRelationshipListStyle = Style.Class("docs-declaration-relationship-list", {
	alignItems: "center",
	display: "inline-flex",
	flexWrap: "wrap",
	gap: "6px",
});

const declarationRelationshipSeparatorStyle = Style.Class("docs-declaration-relationship-separator", {
	color: "$syntaxPunctuation",
});

const declarationHeaderStyle = Style.Class("docs-declaration-header", {
	alignItems: "center",
	display: "flex",
	gap: "8px",
	marginLeft: "-30px",
	marginBottom: "-17px",
	minHeight: "42px",
	padding: "6px 0",
	position: "sticky",
	top: "${docsDeclarationStickyTop: 0px}",
	zIndex: "${docsDeclarationStickyZ: 1}",
	containerName: "declaration-header",
	containerType: "scroll-state",
	background: "linear-gradient(to bottom, $bgPage 60%, transparent)",
	fontStyle: "${declarationTitleFontStyle: none}"
});

const declarationHeaderOverlayStyle = Style.Class("docs-declaration-header-overlay", {
	position: "absolute",
	inset: "0",
	zIndex: -1,
	opacity: 0,
	transition: "opacity 0.1s",
	...whenStuck(declarationHeaderStyle, {
		background: "$bgPage",
		borderBottom: "1px solid $borderSubtle",
		opacity: 1,
	}),
});

const declarationCollapsedLinkStyle = Style.Class("docs-declaration-collapsed-link", {
	marginBottom: "0",
	position: "relative",
	top: "auto",
	zIndex: 1,
	background: "transparent",
	fontStyle: "normal",
	cursor: "pointer",
	textDecoration: "none",
	width: "fit-content",
	$declarationCollapsedArrowX: "0px",
	...pseudoBefore({
		content: '""',
		display: "block",
		position: "absolute",
		insetBlock: "0",
		insetInline: "-12px",
		borderRadius: "6px",
		background: "$bgSurface",
		opacity: 0,
		transition: "opacity 0.15s",
		zIndex: -1,
	}),
	...whenHover({
		$declarationCollapsedArrowX: "2px",
		...pseudoBefore({ opacity: 1 }),
	}),
});

const declarationCollapsedArrowStyle = Style.Class("docs-declaration-collapsed-arrow", {
	color: "$textDim",
	display: "inline-flex",
	paddingRight: "6px",
	transform: "translateX($declarationCollapsedArrowX)",
	transition: "transform 0.12s, color 0.12s",
	height: "24px",
});

const declarationNameStyle = Style.Class("docs-declaration-name", {
	...monoFont,
	color: "$textPrimary",
	fontSize: "18px",
	fontWeight: 700,
	whiteSpace: "nowrap",
});

const declarationAnchorStyle = Style.Class("docs-declaration-anchor", {
	color: "$textDim",
	fontSize: "14px",
	fontWeight: 600,
	textDecoration: "none",
	...whenHover({ color: "$textPrimary" }),
});

const kindIconStyle = Style.Class("docs-declaration-kind-icon", {
	alignItems: "center",
	borderRadius: "4px",
	display: "inline-flex",
	flexShrink: "0",
	height: "22px",
	justifyContent: "center",
	width: "22px",
});

const kindColorType = Style.Class("docs-kind-type", { color: "$syntaxType" });
const kindColorMethod = Style.Class("docs-kind-method", { color: "$syntaxMethod" });
const kindColorReference = Style.Class("docs-kind-reference", { color: "$syntaxReference" });
const kindColorLiteral = Style.Class("docs-kind-literal", { color: "$syntaxLiteral" });
const kindColorKeyword = Style.Class("docs-kind-keyword", { color: "$syntaxKeyword" });
const kindColorProperty = Style.Class("docs-kind-property", { color: "$textPrimary" });

const declarationTypeStyle = Style.Class("docs-declaration-type", {
	...monoFont,
	background: "$bgCodeBlock",
	border: "1px solid $borderSubtle",
	borderRadius: "6px",
	color: "$textSecondary",
	fontSize: "14px",
	overflow: "auto",
	padding: "10px 14px",
	marginLeft: "-14px",
});

const declarationKeywordStyle = Style.Class("docs-declaration-keyword", {
	color: "$syntaxPunctuation",
});

const declarationVarNameStyle = Style.Class("docs-declaration-var-name", {
	color: "$textPrimary",
	fontWeight: 600,
});

const declarationRefNameStyle = Style.Class("docs-declaration-ref-name", {
	color: "$syntaxReference",
	fontWeight: 600,
});

const declarationMethodNameStyle = Style.Class("docs-declaration-method-name", {
	color: "$syntaxMethod",
	fontWeight: 600,
});

const declarationTypePunctuationStyle = Style.Class("docs-declaration-type-punctuation", {
	color: "$syntaxPunctuation",
});

const childrenContainerStyle = Style.Class("docs-declaration-children", {
	display: "flex",
	flexDirection: "column",
});

const declarationSignaturesContainerStyle = Style.Class("docs-declaration-signatures", {
	display: "flex",
	flexDirection: "column",
	gap: "12px",
});

const declarationFancyStyle = Style.Class("docs-declaration-fancy", {
	...fancyAccentBlock,
	$docsAccent: "$syntaxMethod",
});

const declarationFancyAccentMethodStyle = Style.Class("docs-declaration-fancy-accent-method", {
	$docsAccent: "$syntaxMethod",
});

const declarationFancyAccentTypeStyle = Style.Class("docs-declaration-fancy-accent-type", {
	$docsAccent: "$syntaxType",
});

const declarationFancyAccentReferenceStyle = Style.Class("docs-declaration-fancy-accent-reference", {
	$docsAccent: "$syntaxReference",
});

const declarationFancyAccentLiteralStyle = Style.Class("docs-declaration-fancy-accent-literal", {
	$docsAccent: "$syntaxLiteral",
});

const declarationFancyAccentKeywordStyle = Style.Class("docs-declaration-fancy-accent-keyword", {
	$docsAccent: "$syntaxKeyword",
});

const declarationFancyAccentPropertyStyle = Style.Class("docs-declaration-fancy-accent-property", {
	$docsAccent: "$textPrimary",
});

interface KindInfo {
	svg: string;
	colorClass: ReturnType<typeof Style.Class>;
}

// Small, distinctive SVG icons for each declaration kind
const ICONS = {
	// Variable: left bracket with dot
	variable: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>`,
	// Type: diamond
	type: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2L14 8L8 14L2 8Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
	// Function: f() with parens
	function: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 12V6.5C6 4.5 7 3 9 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M4.5 7.5H8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="11.5" cy="10" r="1.2" fill="currentColor"/></svg>`,
	// Method: small function glyph
	method: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4L7 8L4 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
	// Property: small square with line
	property: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" width="4" height="4" rx="1" fill="currentColor"/><path d="M9 8H13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
	// Accessor: bidirectional arrow
	accessor: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8H12M12 8L9 5M12 8L9 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
	// Constructor: wrench/build
	constructor: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3V13M5 6L8 3L11 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 13H12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
	// Class: layered rectangles
	class: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 2H14V11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/></svg>`,
	// Interface: dashed rectangle
	interface: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.5 2"/></svg>`,
	// Enum: stacked bars
	enum: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4.5H12M4 8H10M4 11.5H8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
	// Namespace: folder
	namespace: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5V12.5A1 1 0 003 13.5H13A1 1 0 0014 12.5V6.5A1 1 0 0013 5.5H8.5L7 4H3A1 1 0 002 5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
	// Get: down-arrow
	get: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3V11M8 11L5 8M8 11L11 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 13H12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
	// Set: up-arrow
	set: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 13V5M8 5L5 8M8 5L11 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 3H12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
};

function kindIcon (kind: number): KindInfo | undefined {
	switch (kind) {
		case ReflectionKind.Variable: return { svg: ICONS.variable, colorClass: kindColorType };
		case ReflectionKind.TypeAlias: return { svg: ICONS.type, colorClass: kindColorReference };
		case ReflectionKind.Function: return { svg: ICONS.method, colorClass: kindColorMethod };
		case ReflectionKind.Method: return { svg: ICONS.method, colorClass: kindColorMethod };
		case ReflectionKind.Property: return { svg: ICONS.property, colorClass: kindColorProperty };
		case ReflectionKind.Accessor: return { svg: ICONS.accessor, colorClass: kindColorMethod };
		case ReflectionKind.Constructor: return { svg: ICONS.constructor, colorClass: kindColorMethod };
		case ReflectionKind.Class: return { svg: ICONS.class, colorClass: kindColorReference };
		case ReflectionKind.Interface: return { svg: ICONS.interface, colorClass: kindColorReference };
		case ReflectionKind.Enum: return { svg: ICONS.enum, colorClass: kindColorLiteral };
		case ReflectionKind.EnumMember: return { svg: ICONS.enum, colorClass: kindColorLiteral };
		case ReflectionKind.Namespace:
		case ReflectionKind.Module: return { svg: ICONS.namespace, colorClass: kindColorReference };
		case ReflectionKind.GetSignature: return { svg: ICONS.get, colorClass: kindColorKeyword };
		case ReflectionKind.SetSignature: return { svg: ICONS.set, colorClass: kindColorKeyword };
		default: return undefined;
	}
}

function nameStyleForKind (kind: number): ReturnType<typeof Style.Class> {
	switch (kind) {
		case ReflectionKind.TypeAlias:
		case ReflectionKind.Class:
		case ReflectionKind.Interface:
		case ReflectionKind.Enum:
			return declarationRefNameStyle;
		case ReflectionKind.Function:
		case ReflectionKind.Method:
		case ReflectionKind.Accessor:
		case ReflectionKind.Constructor:
			return declarationMethodNameStyle;
		default:
			return declarationVarNameStyle;
	}
}

function keywordForKind (kind: number): string {
	switch (kind) {
		case ReflectionKind.Variable: return "const ";
		case ReflectionKind.TypeAlias: return "type ";
		case ReflectionKind.Function: return "function ";
		case ReflectionKind.Class: return "class ";
		case ReflectionKind.Interface: return "interface ";
		case ReflectionKind.Enum: return "enum ";
		case ReflectionKind.Namespace: return "namespace ";
		case ReflectionKind.Module: return "module ";
		default: return "";
	}
}

function typeAssignmentOperator (kind: number): string {
	switch (kind) {
		case ReflectionKind.TypeAlias: return " = ";
		default: return ": ";
	}
}

type AccentVariant = "method" | "type" | "reference" | "literal" | "keyword" | "property";

function accentVariantForKind (kind: number): AccentVariant {
	switch (kind) {
		case ReflectionKind.Variable:
			return "type";
		case ReflectionKind.TypeAlias:
		case ReflectionKind.Class:
		case ReflectionKind.Interface:
		case ReflectionKind.Namespace:
		case ReflectionKind.Module:
			return "reference";
		case ReflectionKind.Enum:
		case ReflectionKind.EnumMember:
			return "literal";
		case ReflectionKind.GetSignature:
		case ReflectionKind.SetSignature:
			return "keyword";
		case ReflectionKind.Property:
			return "property";
		default:
			return "method";
	}
}

function fancyAccentClass (variant: AccentVariant): Style.Class {
	switch (variant) {
		case "type": return declarationFancyAccentTypeStyle;
		case "reference": return declarationFancyAccentReferenceStyle;
		case "literal": return declarationFancyAccentLiteralStyle;
		case "keyword": return declarationFancyAccentKeywordStyle;
		case "property": return declarationFancyAccentPropertyStyle;
		default: return declarationFancyAccentMethodStyle;
	}
}

export interface DeclarationOptions {
	parentKind?: number;
	depth?: number;
	anchorScope?: string;
}

interface RenderableDeclaration extends JSONOutput.DeclarationReflection {
	anchorName?: string;
	children?: RenderableDeclaration[];
	collapseToTargetId?: number;
	extendsReferences?: JSONOutput.ReferenceType[];
}

function sanitizeAnchorScope (scope: string): string {
	return scope.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function variableFunctionTypeSignatures (decl: RenderableDeclaration): JSONOutput.SignatureReflection[] | undefined {
	if (decl.kind !== ReflectionKind.Variable || !decl.type) {
		return undefined;
	}

	const type = decl.type;
	if (type.type !== "reflection") {
		return undefined;
	}

	const signatures = type.declaration?.signatures;
	if (!signatures || signatures.length === 0) {
		return undefined;
	}

	return signatures;
}

export function declarationAnchorId (decl: JSONOutput.DeclarationReflection & { anchorName?: string }, anchorScope?: string): string {
	if (decl.anchorName)
		return decl.anchorName;

	if (!anchorScope)
		return `decl-${decl.id}`;

	return `decl-${sanitizeAnchorScope(anchorScope)}-${decl.id}`;
}

export default function Declaration (decl: RenderableDeclaration, options?: DeclarationOptions): Component {
	const anchorId = declarationAnchorId(decl, options?.anchorScope);
	const typeFunctionSignatures = variableFunctionTypeSignatures(decl);
	const signatureList = (decl.signatures && decl.signatures.length > 0)
		? decl.signatures
		: typeFunctionSignatures;
	const hasConstructorSignature = signatureList?.some(signature => signature.kind === ReflectionKind.ConstructorSignature) ?? false;
	const visualKind = hasConstructorSignature
		? ReflectionKind.Class
		: typeFunctionSignatures
			? ReflectionKind.Function
			: decl.kind;

	if (decl.collapseToTargetId !== undefined) {
		const targetLink = resolveTypeDeclarationLinkById(decl.collapseToTargetId);
		if (targetLink) {
			const container = Component("div")
				.class.add(declarationStyle, declarationCollapsed)
				.attribute.set("id", anchorId);

			const link = Component("a")
				.class.add(declarationHeaderStyle, declarationCollapsedLinkStyle)
				.attribute.set("href", targetLink)
				.append(Component("div").class.add(declarationHeaderOverlayStyle))
				.appendTo(container);

			const info = kindIcon(visualKind);
			if (info) {
				const icon = Component("span").class.add(kindIconStyle, info.colorClass);
				icon.element.innerHTML = info.svg;
				icon.appendTo(link);
			}

			Component("span")
				.class.add(declarationNameStyle)
				.text.set(decl.name)
				.appendTo(link);

			if (decl.flags && Object.values(decl.flags).some(Boolean))
				Flags(decl.flags).appendTo(link);

			const arrow = Component("span").class.add(declarationCollapsedArrowStyle);
			arrow.element.innerHTML = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8H11M11 8L8 5M11 8L8 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
			arrow.appendTo(link);

			return container;
		}
	}
		
	const depth = options?.depth ?? 0;

	const container = Component("details")
		.class.add(declarationStyle)
		.class.add(Style.Class(`docs-declaration-depth-${depth}`, {
			$docsDeclarationStickyTop: `${depth * 42}px`,
			$docsDeclarationStickyZ: 200 - depth,
		}))
		.attribute.set("id", anchorId)
		.attribute.add("open");

	const contents = Component("div")
		.class.add(declarationContentsStyle)
		.appendTo(container);

	// Header row: kind icon, name, flags
	const header = Component("summary")
		.class.add(declarationHeaderStyle)
		.append(Component("div")
			.class.add(declarationHeaderOverlayStyle)
		)
		.appendTo(container);

	const info = kindIcon(visualKind);
	if (info) {
		const icon = Component("span").class.add(kindIconStyle, info.colorClass);
		icon.element.innerHTML = info.svg;
		icon.appendTo(header);
	}

	Component("span")
		.class.add(declarationNameStyle)
		.text.set(decl.name)
		.appendTo(header);

	Component("a")
		.class.add(declarationAnchorStyle)
		.attribute.set("href", `#${anchorId}`)
		.attribute.set("aria-label", `Link to ${decl.name}`)
		.text.set("#")
		.appendTo(header);

	if (decl.flags && Object.values(decl.flags).some(Boolean)) {
		Flags(decl.flags).appendTo(header);
	}

	if (decl.extendsReferences && decl.extendsReferences.length > 0) {
		const relationships = Component("div")
			.class.add(declarationRelationshipsStyle)
			.appendTo(contents);

		Component("span")
			.class.add(declarationRelationshipLabelStyle)
			.text.set("extends")
			.appendTo(relationships);

		const list = Component("div")
			.class.add(declarationRelationshipListStyle)
			.appendTo(relationships);

		for (let i = 0; i < decl.extendsReferences.length; i++) {
			if (i > 0) {
				Component("span")
					.class.add(declarationRelationshipSeparatorStyle)
					.text.set(",")
					.appendTo(list);
			}

			list.append(Type(decl.extendsReferences[i]));
		}
	}

	// Comment — with virtual signature extraction for non-function declarations
	const hasSignatures = (signatureList && signatureList.length > 0) || decl.getSignature || decl.setSignature;
	const declarationComment = hasRenderableComment(decl.comment) ? decl.comment : undefined;
	const hasFancyContent = !!declarationComment || !!decl.type;
	const shouldUseFancyDeclarationBox = !hasSignatures && hasFancyContent;
	const contentTarget = shouldUseFancyDeclarationBox
		? Component("div").class.add(declarationFancyStyle, fancyAccentClass(accentVariantForKind(visualKind))).appendTo(contents)
		: contents;
	const shouldInjectDeclarationCommentIntoSignatures = !!declarationComment
		&& !!signatureList
		&& signatureList.length > 0
		&& signatureList.every(signature => summarizeText(signature.comment?.summary ?? []) === "")
		&& renderedSignatureGroupCount(signatureList) === 1;
	const sigLikeTags = declarationComment?.blockTags?.filter(
		t => t.tag === "@param" || t.tag === "@returns" || t.tag === "@throws",
	);

	let hasVirtualSignature = false;

	if (declarationComment && sigLikeTags && sigLikeTags.length > 0 && !hasSignatures) {
		hasVirtualSignature = true;
		const paramTags = sigLikeTags.filter(t => t.tag === "@param");
		const otherSigTags = sigLikeTags.filter(t => t.tag !== "@param");
		const nonSigTags = declarationComment.blockTags?.filter(
			t => t.tag !== "@param" && t.tag !== "@returns" && t.tag !== "@throws",
		);

		// Render summary + non-sig block tags via Comment
		if (declarationComment.summary.length > 0 || (nonSigTags && nonSigTags.length > 0)) {
			Comment({ summary: declarationComment.summary, blockTags: nonSigTags }).appendTo(contentTarget);
		}

		// Build virtual signature from @param, @returns, @throws
		const virtualParams = paramTags.map(tag => ({
			name: tag.name ?? "",
			flags: {} as JSONOutput.ReflectionFlags,
			comment: tag.content.length > 0
				? { summary: tag.content } as JSONOutput.Comment
				: undefined,
		})) as JSONOutput.ParameterReflection[];

		const virtualSig = {
			name: decl.name,
			kind: 0,
			parameters: virtualParams.length > 0 ? virtualParams : undefined,
			comment: otherSigTags.length > 0
				? { summary: [] as JSONOutput.CommentDisplayPart[], blockTags: otherSigTags } as JSONOutput.Comment
				: undefined,
		} as unknown as JSONOutput.SignatureReflection;

		Signature(virtualSig, { accent: "method", name: decl.name }).appendTo(contentTarget);
	} else if (declarationComment && !shouldInjectDeclarationCommentIntoSignatures) {
		Comment(declarationComment).appendTo(contentTarget);
	}

	// Type (for variables, properties, type aliases) — skip if virtual signature replaces it
	if (decl.type && !hasVirtualSignature && !typeFunctionSignatures && !(signatureList && signatureList.length > 0)) {
		const typeRow = Component("div")
			.class.add(declarationTypeStyle)
			.appendTo(contentTarget);

		const kw = keywordForKind(visualKind);
		if (kw) {
			Component("span").class.add(declarationKeywordStyle).text.set(kw).appendTo(typeRow);
		}

		Component("span").class.add(nameStyleForKind(visualKind)).text.set(decl.name).appendTo(typeRow);

		const op = typeAssignmentOperator(visualKind);
		Component("span").class.add(declarationTypePunctuationStyle).text.set(op).appendTo(typeRow);

		typeRow.append(Type(decl.type as JSONOutput.SomeType));
	}

	// Signatures (for functions, methods) — dedup identical summaries
	if (signatureList && signatureList.length > 0) {
		const declSummary = declarationComment ? summarizeText(declarationComment.summary) : "";

		const signaturesContainer = Component("div")
			.class.add(declarationSignaturesContainerStyle)
			.appendTo(contentTarget);

		// Group call/construct signature pairs with identical docs
		const rendered = new Set<number>();
		let pendingLeadingComment = shouldInjectDeclarationCommentIntoSignatures ? declarationComment : undefined;
		for (let i = 0; i < signatureList.length; i++) {
			if (rendered.has(i)) continue;

			const sig = signatureList[i];
			const sigSummary = sig.comment ? summarizeText(sig.comment.summary) : "";
			const skipSummary = !!declSummary && sigSummary === declSummary;

			// Find a matching paired signature (call ↔ construct) with identical docs
			const paired = findPairedSignature(signatureList, i, rendered);
			if (paired !== undefined) {
				rendered.add(i);
				rendered.add(paired);
				// Render both code blocks back-to-back with shared documentation
				const callSig = sig.kind === ReflectionKind.CallSignature ? sig : signatureList[paired];
				const constructSig = sig.kind === ReflectionKind.ConstructorSignature ? sig : signatureList[paired];
				Signature(callSig, {
					...(skipSummary ? { skipSummary } : {}),
					...(pendingLeadingComment ? { leadingComment: pendingLeadingComment } : {}),
					accent: "method",
					name: decl.name,
					pairedSignature: constructSig,
				}).appendTo(signaturesContainer);
				pendingLeadingComment = undefined;
			} else {
				rendered.add(i);
				Signature(sig, {
					...(skipSummary ? { skipSummary } : {}),
					...(pendingLeadingComment ? { leadingComment: pendingLeadingComment } : {}),
					accent: "method",
					name: decl.name,
				}).appendTo(signaturesContainer);
				pendingLeadingComment = undefined;
			}
		}
	}

	// Get/Set signatures (for accessors)
	if (decl.getSignature) {
		Signature(decl.getSignature, { accent: "method", name: `get ${decl.name}` }).appendTo(contentTarget);
	}
	if (decl.setSignature) {
		Signature(decl.setSignature, { accent: "method", name: `set ${decl.name}` }).appendTo(contentTarget);
	}

	// Source link (at the very end) — skip for undocumented interface members
	const isUndocumentedInterfaceMember = options?.parentKind === ReflectionKind.Interface
		&& !decl.comment
		&& !decl.signatures?.some(s => s.comment);
	if (decl.sources && decl.sources.length > 0 && !isUndocumentedInterfaceMember) {
		SourceLink(decl.sources[0]).appendTo(contents);
	}

	// Children (for classes, interfaces, enums, namespaces)
	if (decl.children && decl.children.length > 0) {
		const childrenContainer = Component("div")
			.class.add(childrenContainerStyle)
			.appendTo(contents);

		for (const child of decl.children) {
			Declaration(child, { parentKind: decl.kind, depth: depth + 1, anchorScope: options?.anchorScope }).appendTo(childrenContainer);
		}
	}

	return container;
}
