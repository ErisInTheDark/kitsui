import { JSONOutput } from "typedoc";
import Document, { DocumentBuilderWithExtras } from "./Document";
import ApiModulePage from "./components/ApiModulePage";
import { setTypeDeclarationLinks, setTypeNameAliases } from "./components/Type";
import { prepareModuleSections } from "./modulePage/reflection";
import { createSidebarPages, manipulatorModuleShortName } from "./navigation";

export function createManipulatorPageBuilder (moduleName: string): DocumentBuilderWithExtras<JSONOutput.ProjectReflection> {
	const shortName = manipulatorModuleShortName(moduleName);

	return Document((doc, project, path) => {
		doc.setTitle(`${shortName} - kitsui`);

		const prepared = prepareModuleSections(project, {
			declarationLinkPath: path,
			rootModuleName: moduleName,
			stripDefaultExports: true,
		});

		setTypeNameAliases(prepared.nameAliases);
		setTypeDeclarationLinks(prepared.declarationLinks, prepared.declarationLinksById);

		return ApiModulePage({
			heading: shortName,
			path,
			pages: createSidebarPages(project),
			sections: prepared.sections,
			summary: `${shortName} helpers for fluent Component APIs.`,
		});
	});
}
