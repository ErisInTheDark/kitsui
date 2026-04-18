import Document from "../Document";
import ApiModulePage from "../components/ApiModulePage";
import { setTypeDeclarationLinks, setTypeNameAliases } from "../components/Type";
import { prepareModuleSections, type PrepareModuleSectionsOptions } from "../modulePage/reflection";
import { createSidebarPages } from "../navigation";

export const stateModuleOptions: Omit<PrepareModuleSectionsOptions, "declarationLinkPath"> = {
	rootModuleName: "component/Style",
	stripDefaultExports: true,
} as const;

export default Document((doc, project, path) => {
	doc.setTitle("Style - kitsui");

	const prepared = prepareModuleSections(project, { ...stateModuleOptions, declarationLinkPath: path });

	setTypeNameAliases(prepared.nameAliases);
	setTypeDeclarationLinks(prepared.declarationLinks, prepared.declarationLinksById);

	return ApiModulePage({
		heading: "Style",
		path,
		pages: createSidebarPages(project),
		sections: prepared.sections,
		summary: "Styling components with JIT CSS-in-JS.",
	});
});
