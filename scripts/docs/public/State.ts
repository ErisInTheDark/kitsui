import Document from "../Document";
import ApiModulePage from "../components/ApiModulePage";
import { setTypeDeclarationLinks, setTypeNameAliases } from "../components/Type";
import { prepareModuleSections, type PrepareModuleSectionsOptions } from "../modulePage/reflection";
import { createSidebarPages } from "../navigation";

export const stateModuleOptions: Omit<PrepareModuleSectionsOptions, "declarationLinkPath"> = {
	extensionsInterfaceName: "StateExtensions",
	modulePrefix: "state/extensions/",
	rootModuleName: "state/State",
	stripDefaultExports: true,
} as const;

export default Document((doc, project, path) => {
	doc.setTitle("State - kitsui");

	const prepared = prepareModuleSections(project, { ...stateModuleOptions, declarationLinkPath: path });

	setTypeNameAliases(prepared.nameAliases);
	setTypeDeclarationLinks(prepared.declarationLinks, prepared.declarationLinksById);

	return ApiModulePage({
		heading: "State",
		path,
		pages: createSidebarPages(project),
		sections: prepared.sections,
		summary: "Reactive state containers with owner-managed lifecycle, composable subscriptions, and extension-based state transformations.",
	});
});
