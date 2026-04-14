import { JSONOutput } from "typedoc";
import { Component, Style } from "../../../src";
import Type from "./Type";

const typeParameterStyle = Style.Class("docs-type-parameter", {
	display: "inline",
});

const typeParameterNameStyle = Style.Class("docs-type-parameter-name", {
	color: "$syntaxMethod",
	fontWeight: 600,
});

export default function TypeParameter (param: JSONOutput.TypeParameterReflection): Component {
	const container = Component("span").class.add(typeParameterStyle);

	container.append(
		Component("span").class.add(typeParameterNameStyle).text.set(param.name),
	);

	if (param.type) {
		container.append(
			Component("span").text.set(" extends "),
			Type(param.type),
		);
	}

	if (param.default) {
		container.append(
			Component("span").text.set(" = "),
			Type(param.default),
		);
	}

	return container;
}
