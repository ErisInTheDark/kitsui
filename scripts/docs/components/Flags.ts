import { JSONOutput } from "typedoc";
import { Component, Style } from "../../../src";

const flagStyle = Style.Class("docs-flag", {
	background: "$bgRaised",
	border: "1px solid $borderMuted",
	borderRadius: "4px",
	color: "$textMuted",
	fontSize: "12px",
	lineHeight: 1,
	padding: "2px 6px",
});

const flagsContainerStyle = Style.Class("docs-flags", {
	display: "inline-flex",
	gap: "4px",
});

export default function Flags (flags: JSONOutput.ReflectionFlags): Component {
	const container = Component("span").class.add(flagsContainerStyle);

	const entries: string[] = [];
	if (flags.isAbstract) entries.push("abstract");
	if (flags.isStatic) entries.push("static");
	if (flags.isReadonly) entries.push("readonly");
	if (flags.isOptional) entries.push("optional");
	if (flags.isRest) entries.push("rest");

	for (const flag of entries) {
		Component("span")
			.class.add(flagStyle)
			.text.set(flag)
			.appendTo(container);
	}

	return container;
}
