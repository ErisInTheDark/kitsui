import Document from "../Document";
import ApiModulePage from "../components/ApiModulePage";
import { setTypeDeclarationLinks, setTypeNameAliases } from "../components/Type";
import { prepareModuleSections, type PrepareModuleSectionsOptions } from "../modulePage/reflection";
import { createSidebarPages } from "../navigation";

export const componentModuleOptions: Omit<PrepareModuleSectionsOptions, "declarationLinkPath"> = {
	extensionsInterfaceName: "ComponentExtensions",
	modulePrefix: "component/extensions/",
	rootModuleName: "component/Component",
	stripDefaultExports: true,
} as const;

export default Document((doc, project, path) => {
	doc.setTitle("Component - kitsui");

	const prepared = prepareModuleSections(project, { ...componentModuleOptions, declarationLinkPath: path });
	setTypeNameAliases(prepared.nameAliases);
	setTypeDeclarationLinks(prepared.declarationLinks, prepared.declarationLinksById);

	return ApiModulePage({
		heading: "Component",
		path,
		pages: createSidebarPages(project),
		sections: prepared.sections,
		summary: "The core building block for creating and managing DOM elements with owned lifecycle, reactive state, and composable extensions.",
	});
});
