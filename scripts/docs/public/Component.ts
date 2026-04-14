import Document from "../Document";
import ApiModulePage from "../components/ApiModulePage";
import { setTypeDeclarationLinks, setTypeNameAliases } from "../components/Type";
import { prepareModuleSections } from "../modulePage/reflection";

export default Document((doc, project, path) => {
	doc.setTitle("Component - kitsui");

	const prepared = prepareModuleSections(project, {
		declarationLinkPath: path,
		extensionsInterfaceName: "ComponentExtensions",
		modulePrefix: "component/extensions/",
		rootModuleName: "component/Component",
		stripDefaultExports: true,
	});

	setTypeNameAliases(prepared.nameAliases);
	setTypeDeclarationLinks(prepared.declarationLinks);

	return ApiModulePage({
		heading: "Component",
		path,
		sections: prepared.sections,
		summary: "The core building block for creating and managing DOM elements with owned lifecycle, reactive state, and composable extensions.",
	});
});
