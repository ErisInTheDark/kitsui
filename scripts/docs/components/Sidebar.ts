import { Component, Style, whenHover } from "../../../src";
import { monoFont } from "../styles";

const sidebarStyle = Style.Class("docs-sidebar", {
	display: "flex",
	flexDirection: "column",
	gap: "4px",
	position: "sticky",
	top: "24px",
});

const sectionLabelStyle = Style.Class("docs-sidebar-label", {
	...monoFont,
	color: "$textSecondary",
	fontSize: "11px",
	fontWeight: 600,
	letterSpacing: "0.1em",
	padding: "12px 10px 6px",
	textTransform: "uppercase",
});

const linkStyle = Style.Class("docs-sidebar-link", {
	borderRadius: "6px",
	color: "$textMuted",
	display: "block",
	fontSize: "14px",
	padding: "6px 10px",
	textDecoration: "none",
	transition: "background 0.15s, color 0.15s",
	...whenHover({
		background: "$bgSurface",
		color: "$textPrimary",
	}),
});

const activeLinkStyle = Style.Class("docs-sidebar-link-active", {
	background: "$bgSurface",
	color: "$accentPrimary",
});

interface SidebarPage {
	label: string;
	href: string;
}

const PAGES: SidebarPage[] = [
	{ label: "Overview", href: "index.html" },
	{ label: "Component", href: "Component.html" },
	{ label: "State", href: "State.html" },
];

export default function Sidebar (currentPath: string): Component {
	const nav = Component("nav").class.add(sidebarStyle);

	Component("span")
		.class.add(sectionLabelStyle)
		.text.set("Pages")
		.appendTo(nav);

	for (const page of PAGES) {
		const link = Component("a")
			.class.add(linkStyle)
			.text.set(page.label)
			.attribute.set("href", page.href)
			.appendTo(nav);

		if (page.href === currentPath) {
			link.class.add(activeLinkStyle);
		}
	}

	return nav;
}