import { Component } from "../../../src";
import Layout from "../components/Layout";
import Document from "../Document";
import { createSidebarPages } from "../navigation";
import { homeHeroClass, homeSummaryClass, homeTitleClass } from "../styles";
	
export default Document(async (doc, project, path) => {
	doc.setTitle("kitsui / 404");

	return Layout((content) => {

		content.append(
			Component("section")
				.class.add(homeHeroClass)
				.append(
					Component("h1")
						.class.add(homeTitleClass)
						.text.set("404"),
					Component("p")
						.class.add(homeSummaryClass)
						.text.set("The page you are looking for does not exist."),
				),
		);
	}, path, createSidebarPages(project));
});
