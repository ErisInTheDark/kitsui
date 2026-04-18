import { Component, Style } from "../../../src";
import { pageLayoutStyle, theme } from "../styles";
import Header from "./Header";

const mainStyle = Style.Class("docs-playground-main", {
	display: "flex",
	flex: "1 1 0",
	minHeight: 0,
	minWidth: 0,
	padding: "20px",
	viewTransitionName: "docs-main",
});

const contentStyle = Style.Class("docs-playground-content", {
	display: "flex",
	flex: "1 1 0",
	minHeight: 0,
	minWidth: 0,
	width: "100%",
});

export default function PlaygroundLayout (
	renderContent: (content: Component) => unknown,
	currentPath: string = "",
): Component {
	const content = Component("div").class.add(contentStyle);
	renderContent(content);

	return Component("div")
		.class.add(theme, pageLayoutStyle)
		.append(
			Header(currentPath),
			Component("main")
				.class.add(mainStyle)
				.attribute.set("role", "main")
				.append(content),
		);
}