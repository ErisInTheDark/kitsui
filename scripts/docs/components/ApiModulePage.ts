import { Component, Style } from "../../../src";
import Declaration from "./Declaration";
import Layout from "./Layout";
import { PreparedModuleSection } from "../modulePage/reflection";

const sectionStyle = Style.Class("docs-component-section", {
	display: "flex",
	flexDirection: "column",
	gap: "4px",
});

const sectionTitleStyle = Style.Class("docs-component-section-title", {
	color: "$textBright",
	fontSize: "22px",
	fontWeight: 700,
	letterSpacing: "-0.01em",
	marginTop: "16px",
});

const heroStyle = Style.Class("docs-component-hero", {
	borderBottom: "1px solid $borderSubtle",
	display: "flex",
	flexDirection: "column",
	gap: "8px",
	paddingBottom: "20px",
});

const titleStyle = Style.Class("docs-component-title", {
	color: "$textBright",
	fontSize: "31px",
	fontWeight: 700,
	letterSpacing: "-0.02em",
	lineHeight: 1.2,
});

const summaryStyle = Style.Class("docs-component-summary", {
	color: "$textSubtle",
	fontSize: "15px",
	lineHeight: 1.5,
});

export interface ApiModulePageOptions {
	heading: string;
	path: string;
	sections: PreparedModuleSection[];
	summary: string;
}

export default function ApiModulePage (options: ApiModulePageOptions): Component {
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

		for (const sectionData of options.sections) {
			const section = Component("section")
				.class.add(sectionStyle)
				.appendTo(content);

			Component("h2")
				.class.add(sectionTitleStyle)
				.text.set(sectionData.sectionTitle)
				.appendTo(section);

			for (const child of sectionData.children)
				Declaration(child, { anchorScope: sectionData.anchorScope }).appendTo(section);
		}
	}, options.path);
}
