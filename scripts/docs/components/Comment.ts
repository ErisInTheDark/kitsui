import { JSONOutput } from "typedoc";
import { Component, Style } from "../../../src";
import { monoFont } from "../styles";
import Type, { dominantTypeColor } from "./Type";

const commentStyle = Style.Class("docs-comment", {
	color: "$textBody",
	fontSize: "15px",
	lineHeight: 1.6,
});

const blockTagStyle = Style.Class("docs-comment-block-tag", {
	alignItems: "flex-start",
	display: "flex",
	gap: "6px",
});

const tagIconStyle = Style.Class("docs-comment-tag-icon", {
	flexShrink: "0",
	height: "16px",
	marginTop: "2px",
	width: "16px",
});

const tagContentStyle = Style.Class("docs-comment-tag-content", {
	flex: "1",
	minWidth: 0,
});

const typeAnnotationStyle = Style.Class("docs-comment-type-annotation", {
	...monoFont,
	background: "$bgSurface",
	border: "1px solid $borderCode",
	borderRadius: "4px",
	fontSize: "13px",
	marginRight: "6px",
	padding: "2px 5px",
});

const codeSpanStyle = Style.Class("docs-comment-code", {
	...monoFont,
	background: "$bgSurface",
	border: "1px solid $borderCode",
	borderRadius: "4px",
	color: "$accentPrimary",
	fontSize: "13px",
	padding: "2px 5px",
});

const codeBlockStyle = Style.Class("docs-comment-code-block", {
	...monoFont,
	background: "$bgCodeBlock",
	border: "1px solid $borderSubtle",
	borderRadius: "6px",
	color: "$textBody",
	display: "block",
	fontSize: "14px",
	lineHeight: 1.6,
	margin: "8px 0",
	overflow: "auto",
	padding: "10px 14px",
	marginLeft: "-14px",
	whiteSpace: "pre",
});

const RETURNS_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 4v4a3 3 0 0 0 3 3h4.5M8.5 8.5L11 11l-2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const THROWS_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3L14 13H2L8 3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 7v2.5M8 11.5v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const returnsIconStyle = Style.Class("docs-comment-icon-returns", {
	color: "$accentReturns",
});

const throwsIconStyle = Style.Class("docs-comment-icon-throws", {
	color: "$accentThrows",
});

function parseFencedCodeBlock (text: string): { lang: string; code: string } | undefined {
	const match = text.match(/^```([^\n]*)\r?\n([\s\S]*?)```\s*$/);
	if (!match) return undefined;
	return { lang: match[1] || "", code: match[2].replace(/\n$/, "") };
}

function unescapeText (text: string): string {
	return text.replace(/\\"/g, "\"");
}

export function renderDisplayParts (parts: JSONOutput.CommentDisplayPart[]): Component {
	const container = Component("span");

	for (const part of parts) {
		if (part.kind === "text") {
			Component("span")
			.class.add(commentStyle)
				.text.set(unescapeText(part.text))
				.appendTo(container);
		} else if (part.kind === "code") {
			const parsed = parseFencedCodeBlock(part.text);
			if (parsed) {
				const pre = Component("pre").class.add(codeBlockStyle);
				Component("code")
					.text.set(parsed.code)
					.appendTo(pre);
				pre.appendTo(container);
			} else {
				Component("code")
					.class.add(codeSpanStyle)
					.text.set(part.text.replace(/^`|`$/g, ""))
					.appendTo(container);
			}
		} else if (part.kind === "inline-tag") {
			Component("code")
				.class.add(codeSpanStyle)
				.text.set(part.text)
				.appendTo(container);
		}
	}

	return container;
}

function svgIcon (svg: string, colorStyle?: ReturnType<typeof Style.Class>): Component {
	const icon = Component("span").class.add(tagIconStyle);
	if (colorStyle) icon.class.add(colorStyle);
	icon.element.innerHTML = svg;
	return icon;
}

export type BlockTagFilter = (tag: JSONOutput.CommentTag) => boolean;

export interface BlockTagContext {
	returnType?: JSONOutput.SomeType;
}

function renderBlockTag (tag: JSONOutput.CommentTag, context?: BlockTagContext): Component {
	const tagContainer = Component("div").class.add(blockTagStyle);

	if (tag.tag === "@returns") {
		const icon = svgIcon(RETURNS_ICON, returnsIconStyle);
		if (context?.returnType) {
			const dominant = dominantTypeColor(context.returnType);
			if (dominant) icon.class.remove(returnsIconStyle).class.add(dominant);
		}
		icon.appendTo(tagContainer);
	} else if (tag.tag === "@throws") {
		svgIcon(THROWS_ICON, throwsIconStyle).appendTo(tagContainer);
	}

	const content = Component("div").class.add(tagContentStyle);

	if (tag.tag === "@returns" && context?.returnType) {
		Component("code")
			.class.add(typeAnnotationStyle)
			.append(Type(context.returnType))
			.appendTo(content);
	} else if (tag.tag === "@throws") {
		const throwsType = tag.name || "Error";
		const throwsTypeObj: JSONOutput.SomeType = { type: "reference", name: throwsType } as JSONOutput.SomeType;
		Component("code")
			.class.add(typeAnnotationStyle)
			.append(Type(throwsTypeObj))
			.appendTo(content);
	}

	if (tag.content.length > 0) {
		renderDisplayParts(tag.content).appendTo(content);
	}

	content.appendTo(tagContainer);
	return tagContainer;
}

export function isReturnsOrThrowsTag (tag: JSONOutput.CommentTag): boolean {
	return tag.tag === "@returns" || tag.tag === "@throws";
}

const METADATA_TAGS = new Set(["@group", "@category"]);

function isMetadataTag (tag: JSONOutput.CommentTag): boolean {
	return METADATA_TAGS.has(tag.tag);
}

export function renderBlockTags (tags: JSONOutput.CommentTag[], filter?: BlockTagFilter, context?: BlockTagContext): Component {
	const container = Component("div");
	for (const tag of tags) {
		if (isMetadataTag(tag)) continue;
		if (filter && !filter(tag)) continue;
		renderBlockTag(tag, context).appendTo(container);
	}
	return container;
}

export default function Comment (comment: JSONOutput.Comment, blockTagFilter?: BlockTagFilter, context?: BlockTagContext): Component {
	const container = Component("div").class.add(commentStyle);

	if (comment.summary.length > 0) {
		renderDisplayParts(comment.summary).appendTo(container);
	}

	if (comment.blockTags) {
		for (const tag of comment.blockTags) {
			if (isMetadataTag(tag)) continue;
			if (blockTagFilter && !blockTagFilter(tag)) continue;
			renderBlockTag(tag, context).appendTo(container);
		}
	}

	return container;
}
