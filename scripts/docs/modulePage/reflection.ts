import { JSONOutput, ReflectionKind } from "typedoc";
import { declarationAnchorId } from "../components/Declaration";

export interface PreparedModuleSection {
	anchorScope: string;
	children: JSONOutput.DeclarationReflection[];
	module: JSONOutput.DeclarationReflection;
	sectionTitle: string;
}

export interface PrepareModuleSectionsOptions {
	declarationLinkPath: string;
	extensionsInterfaceName: string;
	modulePrefix: string;
	rootModuleName: string;
	stripDefaultExports?: boolean;
}

interface ProcessGroupsResult {
	children: JSONOutput.DeclarationReflection[];
	nameAliases: Map<string, string>;
}

interface MergeResult {
	aliases: Map<string, string>;
	declaration: JSONOutput.DeclarationReflection;
}

interface PreparedModuleSectionsResult {
	declarationLinks: Map<string, string>;
	nameAliases: Map<string, string>;
	sections: PreparedModuleSection[];
}

const SIGNATURE_BLOCK_TAGS = new Set(["@param", "@returns", "@throws", "@example"]);

const STANDARD_GROUP_TITLES = new Set([
	"Variables", "Functions", "Classes", "Interfaces", "Type Aliases",
	"Enums", "Namespaces", "Modules", "Constructors", "Properties",
	"Methods", "Accessors", "References",
]);

function extractModuleName (fullName: string): string {
	const lastSlash = fullName.lastIndexOf("/");
	return lastSlash >= 0 ? fullName.slice(lastSlash + 1) : fullName;
}

function stripSignatureBlockTags (comment: JSONOutput.Comment): JSONOutput.Comment {
	if (!comment.blockTags || comment.blockTags.length === 0)
		return comment;

	const filtered = comment.blockTags.filter(t => !SIGNATURE_BLOCK_TAGS.has(t.tag));
	if (filtered.length === comment.blockTags.length)
		return comment;

	return { ...comment, blockTags: filtered.length > 0 ? filtered : undefined };
}

function processGroups (module: JSONOutput.DeclarationReflection): ProcessGroupsResult {
	const children = module.children ?? [];
	const groups = module.groups ?? [];
	const nameAliases = new Map<string, string>();

	const byId = new Map<number, JSONOutput.DeclarationReflection>();
	for (const child of children)
		byId.set(child.id, child);

	const consumedIds = new Set<number>();
	const syntheticEntries: JSONOutput.DeclarationReflection[] = [];

	for (const group of groups) {
		if (STANDARD_GROUP_TITLES.has(group.title))
			continue;

		const members = (group.children ?? [])
			.map(id => byId.get(id))
			.filter((member): member is JSONOutput.DeclarationReflection => member !== undefined);

		if (members.length === 0)
			continue;

		const merged = mergeCallableClassGroup(group.title, members);
		if (!merged)
			continue;

		for (const member of members)
			consumedIds.add(member.id);

		syntheticEntries.push(merged.declaration);
		for (const [from, to] of merged.aliases)
			nameAliases.set(from, to);
	}

	if (syntheticEntries.length === 0)
		return { children, nameAliases };

	const result: JSONOutput.DeclarationReflection[] = [];
	let insertedSynthetics = false;

	for (const child of children) {
		if (consumedIds.has(child.id)) {
			if (!insertedSynthetics) {
				result.push(...syntheticEntries);
				insertedSynthetics = true;
			}
			continue;
		}

		result.push(child);
	}

	return { children: result, nameAliases };
}

function mergeCallableClassGroup (
	groupName: string,
	members: JSONOutput.DeclarationReflection[],
): MergeResult | undefined {
	const classDecl = members.find(member => member.kind === ReflectionKind.Class);
	const typeAlias = members.find(member => member.kind === ReflectionKind.TypeAlias && member.name === groupName);

	if (!classDecl)
		return undefined;

	const isFactory = (member: JSONOutput.DeclarationReflection) => member.kind === ReflectionKind.Variable || member.kind === ReflectionKind.Function;
	const factory = members.find(member => isFactory(member) && member.name === groupName)
		?? members.find(isFactory);

	const constructorType = members.find(member =>
		member.kind === ReflectionKind.TypeAlias && member.name === `${groupName}Constructor`,
	) ?? members.find(member =>
		member.kind === ReflectionKind.TypeAlias && member.name.endsWith("Constructor"),
	);

	const name = typeAlias?.name ?? groupName;
	const rawComment = factory?.comment ?? typeAlias?.comment ?? classDecl.comment;
	const comment = rawComment ? stripSignatureBlockTags(rawComment) : undefined;
	const signatures = factory?.signatures;
	const constructorSignatures = extractConstructorSignatures(constructorType);

	const mergedChildren = (classDecl.children ?? [])
		.filter(child => child.kind !== ReflectionKind.Constructor);

	const constructorStaticChildren = extractConstructorChildren(constructorType);
	if (constructorStaticChildren)
		mergedChildren.unshift(...constructorStaticChildren);

	const aliases = new Map<string, string>();
	if (classDecl.name !== name)
		aliases.set(classDecl.name, name);

	return {
		aliases,
		declaration: {
			...classDecl,
			name,
			kind: ReflectionKind.Class,
			comment,
			signatures: signatures ?? constructorSignatures,
			children: mergedChildren.length > 0 ? mergedChildren : undefined,
			sources: classDecl.sources,
		},
	};
}

function extractConstructorSignatures (
	constructorType: JSONOutput.DeclarationReflection | undefined,
): JSONOutput.SignatureReflection[] | undefined {
	if (!constructorType)
		return undefined;

	if (constructorType.signatures && constructorType.signatures.length > 0)
		return constructorType.signatures;

	if (!constructorType.type)
		return undefined;

	const type = constructorType.type;
	if (typeof type !== "object" || !("type" in type) || type.type !== "reflection")
		return undefined;

	const declaration = (type as JSONOutput.ReflectionType).declaration;
	return declaration?.signatures;
}

function extractConstructorChildren (
	constructorType: JSONOutput.DeclarationReflection | undefined,
): JSONOutput.DeclarationReflection[] | undefined {
	if (!constructorType)
		return undefined;

	let children = constructorType.children;

	if (!children || children.length === 0) {
		if (!constructorType.type)
			return undefined;

		const type = constructorType.type;
		if (typeof type !== "object" || !("type" in type) || type.type !== "reflection")
			return undefined;

		const declaration = (type as JSONOutput.ReflectionType).declaration;
		children = declaration?.children;
	}

	if (!children || children.length === 0)
		return undefined;

	return children
		.filter(child => child.name !== "prototype")
		.map(child => ({ ...child, flags: { ...child.flags, isStatic: true } }));
}

function sortChildren (children: JSONOutput.DeclarationReflection[], moduleName: string): JSONOutput.DeclarationReflection[] {
	const baseName = extractModuleName(moduleName);
	return [...children].sort((left, right) => {
		if (left.name === baseName) return -1;
		if (right.name === baseName) return 1;
		return 0;
	});
}

function hoistStaticMembers (children: JSONOutput.DeclarationReflection[]): JSONOutput.DeclarationReflection[] {
	const result: JSONOutput.DeclarationReflection[] = [];

	for (const child of children) {
		if (child.kind !== ReflectionKind.Class || !child.children || child.children.length === 0) {
			result.push(child);
			continue;
		}

		const staticMembers = child.children.filter(member => member.flags?.isStatic);
		if (staticMembers.length === 0) {
			result.push(child);
			continue;
		}

		const instanceMembers = child.children.filter(member => !member.flags?.isStatic);
		result.push({
			...child,
			children: instanceMembers.length > 0 ? instanceMembers : undefined,
		});

		for (const staticMember of staticMembers) {
			result.push({
				...staticMember,
				flags: staticMember.flags ? { ...staticMember.flags, isStatic: false } : staticMember.flags,
				name: `${child.name}.${staticMember.name}`,
			});
		}
	}

	return result;
}

function collectDeclarationLinks (
	children: JSONOutput.DeclarationReflection[],
	pagePath: string,
	anchorScope: string,
	links: Map<string, string>,
): void {
	for (const child of children) {
		if (!links.has(child.name)) {
			links.set(child.name, `${pagePath}#${declarationAnchorId(child, anchorScope)}`);
		}

		if (child.children && child.children.length > 0)
			collectDeclarationLinks(child.children, pagePath, anchorScope, links);
	}
}

function methodBelongsToModule (method: JSONOutput.DeclarationReflection, modulePath: string): boolean {
	return method.sources?.some(source => source.fileName.includes(modulePath)) ?? false;
}

function hasTestSources (method: JSONOutput.DeclarationReflection): boolean {
	return method.sources?.some(source => source.fileName.startsWith("test/")) ?? false;
}

function findExtensionsInterface (
	children: JSONOutput.DeclarationReflection[],
	extensionsInterfaceName: string,
): JSONOutput.DeclarationReflection | undefined {
	return children.find(child => child.name === extensionsInterfaceName && child.kind === ReflectionKind.Interface);
}

function filterExtensions (
	extensions: JSONOutput.DeclarationReflection,
	predicate: (method: JSONOutput.DeclarationReflection) => boolean,
): JSONOutput.DeclarationReflection | undefined {
	const filtered = (extensions.children ?? []).filter(predicate);
	if (filtered.length === 0)
		return undefined;

	return { ...extensions, children: filtered };
}

export function prepareModuleSections (
	project: JSONOutput.ProjectReflection,
	options: PrepareModuleSectionsOptions,
): PreparedModuleSectionsResult {
	const modules = (project.children ?? [])
		.filter((child): child is JSONOutput.DeclarationReflection =>
			child.kind === ReflectionKind.Module
			&& (child.name === options.rootModuleName || child.name.startsWith(options.modulePrefix)),
		)
		.sort((left, right) => {
			if (left.name === options.rootModuleName) return -1;
			if (right.name === options.rootModuleName) return 1;
			return left.name.localeCompare(right.name);
		});

	const rootModule = modules.find(module => module.name === options.rootModuleName);
	const extensions = rootModule
		? findExtensionsInterface(rootModule.children ?? [], options.extensionsInterfaceName)
		: undefined;

	const extensionModulePaths = modules
		.filter(module => module.name !== options.rootModuleName)
		.map(module => `src/${module.name}.ts`);

	const allNameAliases = new Map<string, string>();
	const processedModules = modules.map(module => {
		const result = processGroups(module);
		for (const [from, to] of result.nameAliases)
			allNameAliases.set(from, to);
		return { module, children: result.children };
	});

	const sections = processedModules.map(({ module, children: rawChildren }) => {
		let children = hoistStaticMembers(
			sortChildren(rawChildren, module.name)
				.filter(child => !(options.stripDefaultExports && module.name !== options.rootModuleName && child.name === "default")),
		);

		if (module.name === options.rootModuleName && extensions) {
			const coreExtensions = filterExtensions(extensions, method =>
				!hasTestSources(method)
				&& !extensionModulePaths.some(modulePath => methodBelongsToModule(method, modulePath)),
			);

			children = children.map(child =>
				child.name === options.extensionsInterfaceName && child.kind === ReflectionKind.Interface
					? { ...extensions, children: coreExtensions?.children ?? [] }
					: child,
			);
		} else if (extensions) {
			const modulePath = `src/${module.name}.ts`;
			const extensionMethods = (extensions.children ?? []).filter(method =>
				!hasTestSources(method)
				&& methodBelongsToModule(method, modulePath),
			);

			if (extensionMethods.length > 0) {
				children.unshift({
					...extensions,
					children: extensionMethods,
					sources: undefined,
					comment: undefined,
				});
			}
		}

		return {
			anchorScope: module.name,
			children,
			module,
			sectionTitle: extractModuleName(module.name),
		};
	});

	const declarationLinks = new Map<string, string>();
	for (const section of sections)
		collectDeclarationLinks(section.children, options.declarationLinkPath, section.anchorScope, declarationLinks);

	return {
		declarationLinks,
		nameAliases: allNameAliases,
		sections,
	};
}
