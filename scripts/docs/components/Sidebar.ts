import { Component, Style, StyleAnimation, StyleSelector, whenHover } from "../../../src";
import type { SidebarPage, SidebarSection } from "../navigation";
import { monoFont, stackColumn } from "../styles";

const sidebarStyle = Style.Class("docs-sidebar", {
	...stackColumn,
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

const sectionLinksStyle = Style.Class("docs-sidebar-sections", {
	...stackColumn,
	gap: "2px",
	marginBottom: "4px",
	marginLeft: "14px",
	marginTop: "2px",
	transformOrigin: "top",
});

const sectionLinkStyle = Style.Class("docs-sidebar-section-link", {
	borderRadius: "6px",
	color: "$textSecondary",
	display: "block",
	fontSize: "12px",
	padding: "3px 8px",
	textDecoration: "none",
	transition: "background 0.15s, color 0.15s",
	...whenHover({
		background: "$bgSurface",
		color: "$textPrimary",
	}),
});

const sectionTransitionNamesByDocument = new WeakMap<Document, Set<string>>();

function sidebarSectionsTransitionName (currentPath: string): string {
	const slug = currentPath
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "") || "index-html";

	return `docs-sidebar-sections-${slug}`;
}

function ensureSectionTransitionStyles (name: string): void {
	const documentRef = document;
	let names = sectionTransitionNamesByDocument.get(documentRef);
	if (!names) {
		names = new Set<string>();
		sectionTransitionNamesByDocument.set(documentRef, names);
	}

	if (names.has(name)) {
		return;
	}

	names.add(name);
	
	const OUT = Style({
		opacity: 0,
		transform: "scaleY(0)",
		transformOrigin: "top",
	})
	const IN = Style({
		opacity: 1,
		transform: "scaleY(1)",
		transformOrigin: "top",
	})

	const animIn = StyleAnimation("sidebar-sections-in", {
		from: OUT,
		to: IN,
	})

	const animOut = StyleAnimation("sidebar-sections-out", {
		from: IN,
		to: OUT,
	})
	
	StyleSelector(`::view-transition-group(${name})`, {
		animationDuration: ".1s",
		animationTimingFunction: "ease-out",
		animationFillMode: "forwards",
		transformOrigin: "top",
	}).appendTo(document.head);
	StyleSelector(`::view-transition-old(${name})`, {
		animationName: animOut,
	}).appendTo(document.head);
	StyleSelector(`::view-transition-new(${name})`, {
		animationName: animIn,
	}).appendTo(document.head);
}

export default function Sidebar (currentPath: string, pages: SidebarPage[], sections: SidebarSection[]): Component {
	const nav = Component("nav").class.add(sidebarStyle);

	Component("span")
		.class.add(sectionLabelStyle)
		.text.set("Pages")
		.appendTo(nav);

	for (const page of pages) {
		const isCurrentPage = page.href === currentPath;
		const link = Component("a")
			.class.add(linkStyle)
			.text.set(page.label)
			.attribute.set("href", page.href)
			.appendTo(nav);

		if (isCurrentPage) {
			link.class.add(activeLinkStyle);

			if (sections.length > 0) {
				const transitionName = sidebarSectionsTransitionName(currentPath);
				ensureSectionTransitionStyles(transitionName);

				const sectionLinks = Component("div")
					.class.add(sectionLinksStyle)
					.attribute.set("style", `view-transition-name: ${transitionName}`)
					.appendTo(nav);

				for (const section of sections) {
					Component("a")
						.class.add(sectionLinkStyle)
						.text.set(section.label)
						.attribute.set("href", section.href)
						.appendTo(sectionLinks);
				}
			}
		}
	}

	return nav;
}