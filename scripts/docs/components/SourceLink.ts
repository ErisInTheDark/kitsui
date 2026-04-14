import { JSONOutput } from "typedoc";
import { Component, Style } from "../../../src";
import { monoFont } from "../styles";

const sourceLinkStyle = Style.Class("docs-source-link", {
	...monoFont,
	color: "$textDim",
	fontSize: "13px",
	textDecoration: "none",
});

export default function SourceLink (source: JSONOutput.SourceReference): Component {
	const label = `${source.fileName}:${source.line}`;

	const link = Component("a")
		.class.add(sourceLinkStyle)
		.text.set(label);

	if (source.url) {
		link.attribute.set("href", source.url);
	}

	return link;
}
