import { JSONOutput } from "typedoc";
import { Component, Style } from "../../../src";
import Type from "./Type";

const parameterStyle = Style.Class("docs-parameter", {
	display: "inline",
});

const parameterNameStyle = Style.Class("docs-parameter-name", {
	color: "$textPrimary",
	fontWeight: 600,
});

export default function Parameter (param: JSONOutput.ParameterReflection): Component {
	const container = Component("span").class.add(parameterStyle);

	if (param.flags.isRest) {
		container.append(Component("span").text.set("..."));
	}

	container.append(
		Component("span").class.add(parameterNameStyle).text.set(param.name),
	);

	if (param.flags.isOptional) {
		container.append(Component("span").text.set("?"));
	}

	if (param.type) {
		container.append(
			Component("span").text.set(": "),
			Type(param.type),
		);
	}

	if (param.defaultValue) {
		container.append(
			Component("span").text.set(" = " + param.defaultValue),
		);
	}

	return container;
}
