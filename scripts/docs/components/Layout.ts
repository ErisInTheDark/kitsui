import { Component, Style } from "../../../src";
import { containerCenter, theme } from "../styles";
import Footer from "./Footer";
import Header from "./Header";
import Sidebar from "./Sidebar";

const pageStyle = Style.Class("docs-layout-page", {
	background: "$bgPage",
	color: "$textPrimary",
	fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
	fontSize: "17px",
	lineHeight: 1.6,
	minHeight: "100vh",
});

const shellStyle = Style.Class("docs-layout-shell", {
	...containerCenter,
	display: "flex",
	gap: "24px",
	padding: "24px 20px 0",
});

const sidebarWrapStyle = Style.Class("docs-layout-sidebar-wrap", {
	flex: "0 0 220px",
	minWidth: 0,
});

const mainStyle = Style.Class("docs-layout-main", {
	display: "flex",
	flex: "1 1 0",
	minWidth: 0,
});

const contentStyle = Style.Class("docs-layout-content", {
	display: "flex",
	flexDirection: "column",
	gap: "20px",
	width: "100%",
});

export default function Layout (renderContent: (content: Component) => unknown, currentPath?: string): Component {
	const content = Component("div").class.add(contentStyle);
	const main = Component("main")
		.class.add(mainStyle)
		.attribute.set("role", "main");
	renderContent(content);
	main.append(content);

	return Component("div")
		.class.add(theme, pageStyle)
		.append(
			Header(),
			Component("div")
				.class.add(shellStyle)
				.append(
					Component("div")
						.class.add(sidebarWrapStyle)
						.append(Sidebar(currentPath ?? "")),
					main,
				),
			Footer(),
		);
}