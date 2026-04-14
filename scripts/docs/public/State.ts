import Document from "../Document";
import ApiModulePage from "../components/ApiModulePage";
import { setTypeDeclarationLinks, setTypeNameAliases } from "../components/Type";
import { prepareModuleSections } from "../modulePage/reflection";

export default Document((doc, project, path) => {
	doc.setTitle("State - kitsui");

	const prepared = prepareModuleSections(project, {
		declarationLinkPath: path,
		extensionsInterfaceName: "StateExtensions",
		modulePrefix: "state/extensions/",
		rootModuleName: "state/State",
		stripDefaultExports: true,
	});

	setTypeNameAliases(prepared.nameAliases);
	setTypeDeclarationLinks(prepared.declarationLinks);

	return ApiModulePage({
		heading: "State",
		path,
		sections: prepared.sections,
		summary: "Reactive state containers with owner-managed lifecycle, composable subscriptions, and extension-based state transformations.",
	});
});
