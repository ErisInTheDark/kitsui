import { Component, Style } from "../../../src";
import { PreparedModuleSection } from "../modulePage/reflection";
import type { SidebarPage, SidebarSection } from "../navigation";
import { pageHeroBase, pageSummaryBase, pageTitleBase, sectionTitleBase, stackColumn } from "../styles";
import Declaration from "./Declaration";
import Layout from "./Layout";

const sectionStyle = Style.Class("docs-component-section", {
	...stackColumn,
	gap: "4px",
});

const sectionTitleStyle = Style.Class("docs-component-section-title", {
	...sectionTitleBase,
});

const heroStyle = Style.Class("docs-component-hero", {
	...pageHeroBase,
});

const titleStyle = Style.Class("docs-component-title", {
	...pageTitleBase,
});

const summaryStyle = Style.Class("docs-component-summary", {
	...pageSummaryBase,
});

export function createSectionAnchorId (title: string, seen: Map<string, number>): string {
	const base = title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "") || "section";
	const count = (seen.get(base) ?? 0) + 1;
	seen.set(base, count);
	return count === 1 ? `section-${base}` : `section-${base}-${count}`;
}

export interface ApiModulePageOptions {
	heading: string;
	path: string;
	pages: SidebarPage[];
	sections: PreparedModuleSection[];
	summary: string;
}

export default function ApiModulePage (options: ApiModulePageOptions): Component {
	const seenAnchors = new Map<string, number>();
	const sectionsWithAnchors = options.sections.map(section => ({
		...section,
		anchorId: createSectionAnchorId(section.sectionTitle, seenAnchors),
	}));
	const sidebarSections: SidebarSection[] = sectionsWithAnchors.map(section => ({
		href: `#${section.anchorId}`,
		label: section.sectionTitle,
	}));

	return Layout((content) => {
		content.append(
			Component("section")
				.class.add(heroStyle)
				.append(
					Component("h1")
						.class.add(titleStyle)
						.text.set(options.heading),
					Component("p")
						.class.add(summaryStyle)
						.text.set(options.summary),
				),
		);

		for (const sectionData of sectionsWithAnchors) {
			const section = Component("section")
				.class.add(sectionStyle)
				.appendTo(content);

			Component("h2")
				.class.add(sectionTitleStyle)
				.attribute.set("id", sectionData.anchorId)
				.text.set(sectionData.sectionTitle)
				.appendTo(section);

			for (const child of sectionData.children)
				Declaration(child, { anchorScope: sectionData.anchorScope }).appendTo(section);
		}
	}, options.path, options.pages, sidebarSections);
}
