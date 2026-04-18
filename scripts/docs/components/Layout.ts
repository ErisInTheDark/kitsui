import { Component, Style } from "../../../src";
import type { SidebarPage, SidebarSection } from "../navigation";
import { containerCenter, pageLayoutStyle, stackColumn, theme } from "../styles";
import Footer from "./Footer";
import Header from "./Header";
import Sidebar from "./Sidebar";

const shellStyle = Style.Class("docs-layout-shell", {
	...containerCenter,
	display: "flex",
	gap: "24px",
	padding: "24px 20px 0",
	flexGrow: 1,
});

const sidebarWrapStyle = Style.Class("docs-layout-sidebar-wrap", {
	flex: "0 0 220px",
	minWidth: 0,
});

const mainStyle = Style.Class("docs-layout-main", {
	display: "flex",
	flex: "1 1 0",
	minWidth: 0,
	viewTransitionName: "docs-main",
});

const contentStyle = Style.Class("docs-layout-content", {
	...stackColumn,
	gap: "20px",
	width: "100%",
});

export default function Layout (
	renderContent: (content: Component) => unknown,
	currentPath: string = "",
	pages: SidebarPage[] = [],
	sections: SidebarSection[] = [],
): Component {
	const content = Component("div").class.add(contentStyle);
	const main = Component("main")
		.class.add(mainStyle)
		.attribute.set("role", "main");
	renderContent(content);
	main.append(content);

	return Component("div")
		.class.add(theme, pageLayoutStyle)
		.append(
			Header(currentPath),
			Component("div")
				.class.add(shellStyle)
				.append(
					Component("div")
						.class.add(sidebarWrapStyle)
						.append(Sidebar(currentPath, pages, sections)),
					main,
				),
			Footer(),
		);
}