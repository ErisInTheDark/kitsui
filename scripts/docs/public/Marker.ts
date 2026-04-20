import Document from "../Document";
import ApiModulePage from "../components/ApiModulePage";
import { setTypeDeclarationLinks, setTypeNameAliases } from "../components/Type";
import { prepareModuleSections, type PrepareModuleSectionsOptions } from "../modulePage/reflection";
import { createSidebarPages } from "../navigation";

export const componentModuleOptions: Omit<PrepareModuleSectionsOptions, "declarationLinkPath"> = {
	extensionsInterfaceName: "MarkerExtensions",
	modulePrefix: "component/extensions/",
	rootModuleName: "component/Marker",
	stripDefaultExports: true,
} as const;

export default Document((doc, project, path) => {
	doc.setTitle("Marker - kitsui");

	const prepared = prepareModuleSections(project, { ...componentModuleOptions, declarationLinkPath: path });
	setTypeNameAliases(prepared.nameAliases);
	setTypeDeclarationLinks(prepared.declarationLinks, prepared.declarationLinksById);

	return ApiModulePage({
		heading: "Marker",
		path,
		pages: createSidebarPages(project),
		sections: prepared.sections,
		summary: "A wrapper around a DOM comment used where an actual DOM element is not needed.",
	});
});
