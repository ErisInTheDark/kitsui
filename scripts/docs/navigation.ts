import { JSONOutput, ReflectionKind } from "typedoc";

export interface SidebarPage {
	label: string;
	href: string;
}

export interface SidebarSection {
	label: string;
	href: string;
}

const STATIC_PAGES: SidebarPage[] = [
	{ label: "Overview", href: "index.html" },
	{ label: "Component", href: "Component.html" },
	{ label: "State", href: "State.html" },
	{ label: "Style", href: "Style.html" },
	{ label: "Marker", href: "Marker.html" },
];

function collectModules (
	children: JSONOutput.SomeReflection[] | undefined,
	result: JSONOutput.DeclarationReflection[],
): void {
	if (!children || children.length === 0) {
		return;
	}

	for (const child of children) {
		if (child.kind === ReflectionKind.Module) {
			result.push(child as JSONOutput.DeclarationReflection);
		}

		if ("children" in child && child.children) {
			collectModules(child.children, result);
		}
	}
}

export function manipulatorModuleShortName (moduleName: string): string {
	const slashIndex = moduleName.lastIndexOf("/");
	return slashIndex >= 0 ? moduleName.slice(slashIndex + 1) : moduleName;
}

function findModuleByName (
	project: JSONOutput.ProjectReflection,
	moduleName: string,
): JSONOutput.DeclarationReflection | undefined {
	const modules: JSONOutput.DeclarationReflection[] = [];
	collectModules(project.children, modules);
	return modules.find(module => module.name === moduleName);
}

function isManipulatorReferenceType (type: JSONOutput.SomeType | undefined): type is JSONOutput.ReferenceType {
	return !!type && type.type === "reference" && type.name.endsWith("Manipulator");
}

function manipulatorTypeName (declaration: JSONOutput.DeclarationReflection): string | undefined {
	if (isManipulatorReferenceType(declaration.type)) {
		return declaration.type.name;
	}

	if (isManipulatorReferenceType(declaration.getSignature?.type)) {
		return declaration.getSignature.type.name;
	}

	if (isManipulatorReferenceType(declaration.setSignature?.type)) {
		return declaration.setSignature.type.name;
	}

	const signatureType = declaration.signatures?.find(signature => isManipulatorReferenceType(signature.type))?.type;
	if (isManipulatorReferenceType(signatureType)) {
		return signatureType.name;
	}

	return undefined;
}

function listManipulatorFieldOrder (project: JSONOutput.ProjectReflection): string[] {
	const componentModule = findModuleByName(project, "component/Component");
	if (!componentModule?.children || componentModule.children.length === 0) {
		return [];
	}

	const componentClasses = componentModule.children.filter(
		(child): child is JSONOutput.DeclarationReflection => child.kind === ReflectionKind.Class,
	);

	for (const componentClass of componentClasses) {
		if (!componentClass.children || componentClass.children.length === 0) {
			continue;
		}

		const orderedEntries: Array<{ name: string; line: number }> = [];
		for (const child of componentClass.children) {
			const typeName = manipulatorTypeName(child);
			if (!typeName) {
				continue;
			}

			orderedEntries.push({
				line: child.sources?.[0]?.line ?? Number.MAX_SAFE_INTEGER,
				name: typeName,
			});
		}

		if (orderedEntries.length === 0) {
			continue;
		}

		orderedEntries.sort((left, right) => {
			if (left.line === right.line) {
				return left.name.localeCompare(right.name);
			}

			return left.line - right.line;
		});

		const ordered = new Set<string>();
		for (const entry of orderedEntries) {
			ordered.add(entry.name);
		}

		return [...ordered];
	}

	return [];
}

export function listManipulatorModules (project: JSONOutput.ProjectReflection): string[] {
	const modules: JSONOutput.DeclarationReflection[] = [];
	collectModules(project.children, modules);

	return modules
		.filter(child => child.name.startsWith("component/") && child.name.endsWith("Manipulator"))
		.map(module => module.name)
		.sort((left, right) => left.localeCompare(right));
}

export function createSidebarPages (project: JSONOutput.ProjectReflection): SidebarPage[] {
	const pages = [...STATIC_PAGES];
	const hrefs = new Set(pages.map(page => page.href));
	const manipulatorModules = listManipulatorModules(project);
	const modulesByShortName = new Map(manipulatorModules.map(module => [manipulatorModuleShortName(module), module]));

	const orderedModules: string[] = [];
	for (const shortName of listManipulatorFieldOrder(project)) {
		const moduleName = modulesByShortName.get(shortName);
		if (!moduleName) {
			continue;
		}

		orderedModules.push(moduleName);
		modulesByShortName.delete(shortName);
	}

	for (const moduleName of [...modulesByShortName.values()].sort((left, right) => left.localeCompare(right))) {
		orderedModules.push(moduleName);
	}

	for (const manipulatorModule of orderedModules) {
		const shortName = manipulatorModuleShortName(manipulatorModule);
		const href = `${shortName}.html`;

		if (hrefs.has(href)) {
			throw new Error(`Duplicate docs sidebar page href '${href}' generated from manipulator module '${manipulatorModule}'.`);
		}

		hrefs.add(href);
		pages.push({ href, label: shortName });
	}

	return pages;
}
