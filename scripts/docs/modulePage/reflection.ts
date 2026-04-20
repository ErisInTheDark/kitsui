import { JSONOutput, ReflectionKind } from "typedoc";
import { declarationAnchorId } from "../components/Declaration";

export interface PreparedModuleSection {
	anchorScope: string;
	children: PreparedDeclarationReflection[];
	module: JSONOutput.DeclarationReflection;
	sectionTitle: string;
}

export interface PreparedModuleLinks {
	declarationLinks: Map<string, string>;
	declarationLinksById: Map<number, string>;
	nameAliases: Map<string, string>;
}

export interface PreparedDeclarationReflection extends JSONOutput.DeclarationReflection {
	anchorName?: string;
	collapseToTargetId?: number;
	extendsReferences?: JSONOutput.ReferenceType[];
}

export interface PrepareModuleSectionsOptions {
	declarationLinkPath: string;
	extensionsInterfaceName?: string;
	modulePrefix?: string;
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
	declarationLinksById: Map<number, string>;
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
	const consumedNamespaceChildIdsByParentId = new Map<number, Set<number>>();
	const syntheticEntries: JSONOutput.DeclarationReflection[] = [];

	for (const group of groups) {
		if (STANDARD_GROUP_TITLES.has(group.title))
			continue;

		const groupMembers = (group.children ?? [])
			.map(id => byId.get(id))
			.filter((member): member is JSONOutput.DeclarationReflection => member !== undefined);
		const members = [...groupMembers];

		const lastDot = group.title.lastIndexOf(".");
		const namespaceName = lastDot > 0 ? group.title.slice(0, lastDot) : undefined;
		const namespaceMemberName = lastDot > 0 ? group.title.slice(lastDot + 1) : undefined;
		const namespaceDeclaration = namespaceName
			? children.find(child => child.kind === ReflectionKind.Namespace && child.name === namespaceName)
			: undefined;

		const namespaceMembers = namespaceDeclaration?.children?.filter(member =>
			member.name === namespaceMemberName
			&& (false
				|| member.kind === ReflectionKind.Variable
				|| member.kind === ReflectionKind.Function
				|| member.kind === ReflectionKind.TypeAlias
				|| member.kind === ReflectionKind.Class
			),
		) ?? [];

		for (const namespaceMember of namespaceMembers) {
			if (members.some(member => member.id === namespaceMember.id)) {
				continue;
			}

			members.push(namespaceMember);
		}

		if (lastDot > 0 && namespaceMemberName) {
			const compactGroupName = group.title.replaceAll(".", "");
			const constructorAliasNames = new Set<string>([
				`${group.title}Constructor`,
				`${namespaceMemberName}Constructor`,
				`${compactGroupName}Constructor`,
			]);

			for (const child of children) {
				if (child.kind !== ReflectionKind.TypeAlias || !constructorAliasNames.has(child.name)) {
					continue;
				}

				if (members.some(member => member.id === child.id)) {
					continue;
				}

				members.push(child);
			}
		}

		if (members.length === 0)
			continue;

		const merged = mergeCallableClassGroup(group.title, members);
		if (!merged)
			continue;

		for (const member of groupMembers)
			consumedIds.add(member.id);

		if (namespaceDeclaration && namespaceMembers.length > 0) {
			const consumedNamespaceChildren = consumedNamespaceChildIdsByParentId.get(namespaceDeclaration.id) ?? new Set<number>();
			consumedNamespaceChildIdsByParentId.set(namespaceDeclaration.id, consumedNamespaceChildren);

			for (const namespaceMember of namespaceMembers) {
				consumedNamespaceChildren.add(namespaceMember.id);
			}
		}

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

		const consumedNamespaceChildren = consumedNamespaceChildIdsByParentId.get(child.id);
		if (consumedNamespaceChildren && child.children && child.children.length > 0) {
			const retainedChildren = child.children.filter(namespaceChild => !consumedNamespaceChildren.has(namespaceChild.id));
			result.push({
				...child,
				children: retainedChildren.length > 0 ? retainedChildren : undefined,
			});
			continue;
		}

		result.push(child);
	}

	if (!insertedSynthetics && syntheticEntries.length > 0) {
		result.unshift(...syntheticEntries);
	}

	return { children: result, nameAliases };
}

function mergeCallableClassGroup (
	groupName: string,
	members: JSONOutput.DeclarationReflection[],
): MergeResult | undefined {
	const lastDot = groupName.lastIndexOf(".");
	const shortGroupName = lastDot > 0 ? groupName.slice(lastDot + 1) : groupName;
	const classDecl = members.find(member => member.kind === ReflectionKind.Class);
	const typeAlias = members.find(member =>
		member.kind === ReflectionKind.TypeAlias
		&& (member.name === groupName || member.name === shortGroupName),
	);

	if (!classDecl)
		return undefined;

	const isFactory = (member: JSONOutput.DeclarationReflection) => member.kind === ReflectionKind.Variable || member.kind === ReflectionKind.Function;
	const factory = members.find(member => isFactory(member) && (member.name === groupName || member.name === shortGroupName))
		?? members.find(isFactory);

	const constructorType = members.find(member =>
		member.kind === ReflectionKind.TypeAlias && (member.name === `${groupName}Constructor` || member.name === `${shortGroupName}Constructor`),
	) ?? members.find(member =>
		member.kind === ReflectionKind.TypeAlias && member.name.endsWith("Constructor"),
	);

	const name = groupName;
	const rawComment = factory?.comment ?? typeAlias?.comment ?? classDecl.comment;
	const comment = rawComment ? stripSignatureBlockTags(rawComment) : undefined;
	const mergedSignatures = extractCallConstructSignatures(factory) ?? extractCallConstructSignatures(constructorType);

	const mergedChildren = (classDecl.children ?? [])
		.filter(child => child.kind !== ReflectionKind.Constructor);

	const constructorStaticChildren = extractConstructorChildren(constructorType);
	if (constructorStaticChildren)
		mergedChildren.unshift(...constructorStaticChildren);

	const aliases = new Map<string, string>();
	if (classDecl.name !== name)
		aliases.set(classDecl.name, name);
	if (typeAlias && typeAlias.name !== name)
		aliases.set(typeAlias.name, name);

	return {
		aliases,
		declaration: {
			...classDecl,
			name,
			kind: ReflectionKind.Class,
			comment,
			signatures: applySignatureLikeCommentToSignatures(mergedSignatures, rawComment),
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
		return filterSignaturesByKind(constructorType.signatures, ReflectionKind.ConstructorSignature);

	if (!constructorType.type)
		return undefined;

	const type = constructorType.type;
	if (typeof type !== "object" || !("type" in type) || type.type !== "reflection")
		return undefined;

	const declaration = (type as JSONOutput.ReflectionType).declaration;
	return filterSignaturesByKind(declaration?.signatures, ReflectionKind.ConstructorSignature);
}

function extractCallableSignatures (
	declaration: JSONOutput.DeclarationReflection | undefined,
): JSONOutput.SignatureReflection[] | undefined {
	if (!declaration)
		return undefined;

	if (declaration.signatures && declaration.signatures.length > 0)
		return filterSignaturesByKind(declaration.signatures, ReflectionKind.CallSignature);

	if (!declaration.type)
		return undefined;

	const type = declaration.type;
	if (typeof type !== "object" || !("type" in type))
		return undefined;

	if (type.type !== "reflection")
		return undefined;

	const reflectionDeclaration = (type as JSONOutput.ReflectionType).declaration;
	return filterSignaturesByKind(reflectionDeclaration?.signatures, ReflectionKind.CallSignature);
}

function extractCallConstructSignatures (
	declaration: JSONOutput.DeclarationReflection | undefined,
): JSONOutput.SignatureReflection[] | undefined {
	const callSignatures = extractCallableSignatures(declaration);
	const constructorSignatures = extractConstructorSignatures(declaration);

	if (callSignatures && constructorSignatures) {
		return [...callSignatures, ...constructorSignatures];
	}

	return callSignatures ?? constructorSignatures;
}

function mergeCommentBlockTags (
	left: JSONOutput.CommentTag[] | undefined,
	right: JSONOutput.CommentTag[] | undefined,
): JSONOutput.CommentTag[] | undefined {
	if (!left || left.length === 0) {
		return right && right.length > 0 ? right : undefined;
	}

	if (!right || right.length === 0) {
		return left;
	}

	return [...left, ...right];
}

function applySignatureLikeCommentToSignatures (
	signatures: JSONOutput.SignatureReflection[] | undefined,
	comment: JSONOutput.Comment | undefined,
): JSONOutput.SignatureReflection[] | undefined {
	if (!signatures || signatures.length === 0 || !comment) {
		return signatures;
	}

	const paramComments = new Map<string, JSONOutput.CommentDisplayPart[]>();
	const signatureTags = (comment.blockTags ?? []).filter(tag => {
		if (tag.tag === "@param" && tag.name) {
			paramComments.set(tag.name, tag.content);
			return false;
		}

		return tag.tag === "@returns" || tag.tag === "@throws";
	});

	const signatureComment = signatureTags.length > 0
		? {
			summary: [] as JSONOutput.CommentDisplayPart[],
			blockTags: signatureTags,
		} satisfies JSONOutput.Comment
		: undefined;

	return signatures.map(signature => ({
		...signature,
		comment: signatureComment
			? {
				...(signature.comment ?? signatureComment),
				summary: signature.comment?.summary ?? signatureComment.summary,
				blockTags: mergeCommentBlockTags(signature.comment?.blockTags, signatureComment.blockTags),
			}
			: signature.comment,
		parameters: signature.parameters?.map(parameter => {
			const parameterCommentSummary = paramComments.get(parameter.name);
			if (!parameterCommentSummary || parameter.comment) {
				return parameter;
			}

			return {
				...parameter,
				comment: { summary: parameterCommentSummary },
			};
		}),
	}));
}

function filterSignaturesByKind (
	signatures: JSONOutput.SignatureReflection[] | undefined,
	kind: ReflectionKind.CallSignature | ReflectionKind.ConstructorSignature,
): JSONOutput.SignatureReflection[] | undefined {
	if (!signatures || signatures.length === 0)
		return undefined;

	const filtered = signatures.filter(signature => signature.kind === kind);
return filtered.length > 0 ? filtered : undefined;
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

function hasMeaningfulComment (comment: JSONOutput.Comment | undefined): boolean {
	if (!comment) {
		return false;
	}

	return comment.summary?.some(part => part.kind === "text" && part.text.trim().length > 0) ?? false;
}

function flattenDisplayNamespaces (children: JSONOutput.DeclarationReflection[]): JSONOutput.DeclarationReflection[] {
	const flattened: JSONOutput.DeclarationReflection[] = [];
	for (const child of children) {
		if (child.kind !== ReflectionKind.Namespace) {
			flattened.push(child);
			continue;
		}

		const isUndocumented = !hasMeaningfulComment(child.comment);
		if (!child.children || child.children.length === 0) {
			if (!isUndocumented) {
				flattened.push(child);
			}
			continue;
		}

		if (!isUndocumented) {
			flattened.push(child);
			continue;
		}

		for (const namespaceChild of child.children) {
			flattened.push({
				...namespaceChild,
				name: `${child.name}.${namespaceChild.name}`,
			});
		}
	}

	return flattened;
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

function findRootClassDeclaration (
	children: PreparedDeclarationReflection[],
	rootClassName: string,
): PreparedDeclarationReflection | undefined {
	return children.find(child =>
		child.kind === ReflectionKind.Class
		&& child.name === rootClassName,
	);
}

function hasMatchingSource (
	left: JSONOutput.DeclarationReflection,
	right: JSONOutput.DeclarationReflection,
): boolean {
	if (!left.sources || !right.sources)
		return false;

	for (const leftSource of left.sources) {
		for (const rightSource of right.sources) {
			if (leftSource.fileName === rightSource.fileName && leftSource.line === rightSource.line)
				return true;
		}
	}

	return false;
}

function findRootClassMemberTargetId (
	extensionMethod: JSONOutput.DeclarationReflection,
	rootClass: PreparedDeclarationReflection,
): number | undefined {
	const candidates = (rootClass.children ?? []).filter(child => child.name === extensionMethod.name);
	if (candidates.length === 0)
		return undefined;

	const sourceMatched = candidates.find(candidate => hasMatchingSource(candidate, extensionMethod));
	if (sourceMatched)
		return sourceMatched.id;

	if (candidates.length === 1)
		return candidates[0].id;

	const kindMatched = candidates.find(candidate => candidate.kind === extensionMethod.kind);
	if (kindMatched)
		return kindMatched.id;

	return undefined;
}

function collectDeclarationsById (
	children: PreparedDeclarationReflection[],
	declarationsById: Map<number, PreparedDeclarationReflection>,
): void {
	for (const child of children) {
		declarationsById.set(child.id, child);

		if (child.children && child.children.length > 0)
			collectDeclarationsById(child.children as PreparedDeclarationReflection[], declarationsById);
	}
}

function collectExtendedTypesByChildId (
	children: PreparedDeclarationReflection[],
	declarationsById: Map<number, PreparedDeclarationReflection>,
	extendedTypesByChildId: Map<number, JSONOutput.ReferenceType[]>,
): void {
	for (const child of children) {
		for (const extendedChild of child.extendedBy ?? []) {
			if (typeof extendedChild.target !== "number")
				continue;

			if (!declarationsById.has(extendedChild.target))
				continue;

			const existing = extendedTypesByChildId.get(extendedChild.target) ?? [];
			existing.push({
				type: "reference",
				target: child.id,
				name: child.name,
				package: extendedChild.package,
			});
			extendedTypesByChildId.set(extendedChild.target, existing);
		}

		if (child.children && child.children.length > 0)
			collectExtendedTypesByChildId(child.children as PreparedDeclarationReflection[], declarationsById, extendedTypesByChildId);
	}
}

function inheritedParentName (declaration: JSONOutput.DeclarationReflection): string | undefined {
	const reference = declaration.inheritedFrom
		?? declaration.getSignature?.inheritedFrom
		?? declaration.setSignature?.inheritedFrom
		?? declaration.signatures?.find(signature => signature.inheritedFrom)?.inheritedFrom;

	if (!reference?.name)
		return undefined;

	const separatorIndex = reference.name.lastIndexOf(".");
	const parentName = separatorIndex >= 0 ? reference.name.slice(0, separatorIndex) : reference.name;
	return parentName.replace(/<.*$/u, "");
}

function shouldPruneInheritedChild (
	child: JSONOutput.DeclarationReflection,
	extendedParentNames: Set<string>,
): boolean {
	if (extendedParentNames.size === 0)
		return false;

	const isInherited = !!child.flags?.isInherited
		|| !!child.getSignature?.flags?.isInherited
		|| !!child.setSignature?.flags?.isInherited
		|| !!child.signatures?.some(signature => !!signature.flags?.isInherited);

	if (!isInherited)
		return false;

	const parentName = inheritedParentName(child);
	return !!parentName && extendedParentNames.has(parentName);
}

function referenceExtendedTypes (declaration: JSONOutput.DeclarationReflection): JSONOutput.ReferenceType[] {
	return (declaration.extendedTypes ?? []).filter(
		(type): type is JSONOutput.ReferenceType => type.type === "reference",
	);
}

function annotateInheritance (
	children: PreparedDeclarationReflection[],
	extendedTypesByChildId: Map<number, JSONOutput.ReferenceType[]>,
): PreparedDeclarationReflection[] {
	return children.map(child => {
		const extendedTypes = referenceExtendedTypes(child);
		const resolvedExtendedTypes = extendedTypes.length > 0 ? extendedTypes : extendedTypesByChildId.get(child.id);
		const extendedParentNames = new Set((resolvedExtendedTypes ?? []).map(type => type.name));
		const filteredChildren = child.children
			?.filter(grandchild => !shouldPruneInheritedChild(grandchild, extendedParentNames));

		return {
			...child,
			children: filteredChildren ? annotateInheritance(filteredChildren as PreparedDeclarationReflection[], extendedTypesByChildId) : undefined,
			extendsReferences: resolvedExtendedTypes,
		};
	});
}

function collectDeclarationLinks (
	children: PreparedDeclarationReflection[],
	pagePath: string,
	anchorScope: string,
	links: Map<string, string>,
	idLinks: Map<number, string>,
): void {
	for (const child of children) {
		const link = `${pagePath}#${declarationAnchorId(child, anchorScope)}`;

		if (!links.has(child.name)) {
			links.set(child.name, link);
		}

		if (!idLinks.has(child.id))
			idLinks.set(child.id, link);

		if (child.children && child.children.length > 0)
			collectDeclarationLinks(child.children, pagePath, anchorScope, links, idLinks);
	}
}

function assignSemanticAnchors (
	children: PreparedDeclarationReflection[],
	context: {
		anchorScope: string;
		extensionsInterfaceName?: string;
		sectionTitle: string;
	},
	usedAnchors: Set<string>,
	parentPath?: string,
): PreparedDeclarationReflection[] {
	return children.map(child => {
		const basePath = parentPath ? `${parentPath}.${child.name}` : child.name;
		const isSyntheticExtensionWrapper = !parentPath
			&& child.name === context.extensionsInterfaceName
			&& !child.sources
			&& !child.comment;
		const anchorName = isSyntheticExtensionWrapper
			? `${context.sectionTitle}.${child.name}`
			: basePath;

		if (usedAnchors.has(anchorName)) {
			console.error(`Duplicate docs anchor '${anchorName}' in section '${context.anchorScope}'`);
		}

		usedAnchors.add(anchorName);

		const childParentPath = isSyntheticExtensionWrapper ? child.name : basePath;
		const anchoredChildren = child.children
			? assignSemanticAnchors(child.children as PreparedDeclarationReflection[], context, usedAnchors, childParentPath)
			: undefined;

		return {
			...child,
			anchorName,
			children: anchoredChildren,
		};
	});
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

function resolveReferencedTypeAlias (
	declaration: JSONOutput.DeclarationReflection,
	searchSpace: JSONOutput.DeclarationReflection[],
): JSONOutput.DeclarationReflection | undefined {
	if (!declaration.type || declaration.type.type !== "reference")
		return undefined;

	const typeRef = declaration.type;
	if (typeof typeRef.target === "number") {
		const byId = searchSpace.find(child => child.id === typeRef.target);
		if (byId?.kind === ReflectionKind.TypeAlias)
			return byId;
	}

	return searchSpace.find(child =>
		child.kind === ReflectionKind.TypeAlias
		&& child.name === typeRef.name,
	);
}

function collectReferencedDeclarationTargets (
	value: unknown,
	referencedIds: Set<number>,
	referencedNames: Set<string>,
	seen = new WeakSet<object>(),
): void {
	if (!value)
		return;

	if (Array.isArray(value)) {
		for (const item of value)
			collectReferencedDeclarationTargets(item, referencedIds, referencedNames, seen);
		return;
	}

	if (typeof value !== "object")
		return;

	if (seen.has(value))
		return;

	seen.add(value);

	const record = value as Record<string, unknown>;
	if (record.type === "reference") {
		if (typeof record.target === "number") {
			referencedIds.add(record.target);
		}

		if (typeof record.name === "string") {
			referencedNames.add(record.name);
		}
	}

	for (const child of Object.values(record)) {
		collectReferencedDeclarationTargets(child, referencedIds, referencedNames, seen);
	}
}

export function prepareModuleSections (
	project: JSONOutput.ProjectReflection,
	options: PrepareModuleSectionsOptions,
): PreparedModuleSectionsResult {
	const modules = (project.children ?? [])
		.filter((child): child is JSONOutput.DeclarationReflection =>
			child.kind === ReflectionKind.Module
			&& (child.name === options.rootModuleName || (!!options.modulePrefix && child.name.startsWith(options.modulePrefix))),
		)
		.sort((left, right) => {
			if (left.name === options.rootModuleName) return -1;
			if (right.name === options.rootModuleName) return 1;
			return left.name.localeCompare(right.name);
		});

	const rootModule = modules.find(module => module.name === options.rootModuleName);
	const extensions = rootModule && options.extensionsInterfaceName
		? findExtensionsInterface(rootModule.children ?? [], options.extensionsInterfaceName)
		: undefined;
	const staticExtensionsInterfaceName = `${extractModuleName(options.rootModuleName)}StaticExtensions`;
	const staticExtensions = rootModule
		? findExtensionsInterface(rootModule.children ?? [], staticExtensionsInterfaceName)
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

	const rootClassName = extractModuleName(options.rootModuleName);
	let rootClassForExtensionLinks: PreparedDeclarationReflection | undefined;
	const rootVisibleReferenceIds = new Set<number>();
	const rootVisibleReferenceNames = new Set<string>();
	let rootVisibleReferenceText = "";

	const sections = processedModules.map(({ module, children: rawChildren }) => {
		const modulePath = `src/${module.name}.ts`;
		let children = flattenDisplayNamespaces(sortChildren(rawChildren, module.name))
			.filter(child => !(options.stripDefaultExports && module.name !== options.rootModuleName && child.name === "default"));

		if (module.name !== options.rootModuleName) {
			children = children.filter(child =>
				!child.sources || child.sources.length === 0 || methodBelongsToModule(child, modulePath),
			);
		} else {
			children = children.filter(child => {
				if (child.name === options.extensionsInterfaceName)
					return true;
				if (child.name === staticExtensionsInterfaceName)
					return true;
				if (!child.sources || child.sources.length === 0)
					return true;

				return !extensionModulePaths.some(extensionPath => methodBelongsToModule(child, extensionPath));
			});
		}

		children = hoistStaticMembers(children) as PreparedDeclarationReflection[];

		if (module.name === options.rootModuleName && extensions) {
			const coreExtensions = filterExtensions(extensions, method =>
				!hasTestSources(method)
				&& !extensionModulePaths.some(modulePath => methodBelongsToModule(method, modulePath)),
			);

			const coreStaticExtensions = staticExtensions
				? filterExtensions(staticExtensions, method =>
					!hasTestSources(method)
					&& !extensionModulePaths.some(modulePath => methodBelongsToModule(method, modulePath)),
				)
				: undefined;

			children = children.map(child =>
				child.name === options.extensionsInterfaceName && child.kind === ReflectionKind.Interface
					? { ...extensions, children: coreExtensions?.children ?? [] }
					: child.name === staticExtensionsInterfaceName && child.kind === ReflectionKind.Interface && staticExtensions
						? { ...staticExtensions, children: coreStaticExtensions?.children ?? [] }
					: child,
			);

			rootClassForExtensionLinks = findRootClassDeclaration(children, rootClassName);
			collectReferencedDeclarationTargets(children, rootVisibleReferenceIds, rootVisibleReferenceNames);
			rootVisibleReferenceText = JSON.stringify(children);
		} else if (extensions || staticExtensions) {
			const rootExtensionDeclarations = children
				.filter(child =>
					child.name !== options.extensionsInterfaceName
					&& child.name !== staticExtensionsInterfaceName
					&& !hasTestSources(child)
					&& methodBelongsToModule(child, modulePath),
				);

			const extensionMethods = (extensions?.children ?? []).filter(method =>
				!hasTestSources(method)
				&& methodBelongsToModule(method, modulePath),
			);

			const staticExtensionMethods = (staticExtensions?.children ?? []).filter(method =>
				!hasTestSources(method)
				&& methodBelongsToModule(method, modulePath),
			);
			const sectionReferenceIds = new Set<number>();
			const sectionReferenceNames = new Set<string>();
			collectReferencedDeclarationTargets(extensionMethods, sectionReferenceIds, sectionReferenceNames);
			collectReferencedDeclarationTargets(staticExtensionMethods, sectionReferenceIds, sectionReferenceNames);
			let sectionReferenceText = JSON.stringify(extensionMethods) + JSON.stringify(staticExtensionMethods);
			const rootSearchSpace = (rootModule?.children as JSONOutput.DeclarationReflection[] | undefined) ?? [];
			const staticSignatureSearchSpace = [...rootSearchSpace, ...children];
			const consumedHelperTypeAliasIds = new Set<number>();

			const staticTopLevelMethods = staticExtensionMethods.map(method => {
				const helperAlias = resolveReferencedTypeAlias(method, staticSignatureSearchSpace);
				if (helperAlias?.kind === ReflectionKind.TypeAlias) {
					consumedHelperTypeAliasIds.add(helperAlias.id);
					collectReferencedDeclarationTargets(helperAlias, sectionReferenceIds, sectionReferenceNames);
					sectionReferenceText += JSON.stringify(helperAlias);
				}

				const methodComment = method.comment ? stripSignatureBlockTags(method.comment) : method.comment;
				const helperSignatures = extractCallConstructSignatures(helperAlias) ?? method.signatures;

				return {
					...method,
					name: `${rootClassName}.${method.name}`,
					comment: methodComment,
					signatures: applySignatureLikeCommentToSignatures(helperSignatures, method.comment),
				};
			}) as PreparedDeclarationReflection[];

			const isDirectlyRelevant = (declaration: JSONOutput.DeclarationReflection): boolean => (
				rootVisibleReferenceIds.size === 0
				|| sectionReferenceIds.has(declaration.id)
				|| sectionReferenceNames.has(declaration.name)
				|| sectionReferenceText.includes(`"name":"${declaration.name}"`)
				|| rootVisibleReferenceIds.has(declaration.id)
				|| rootVisibleReferenceNames.has(declaration.name)
				|| rootVisibleReferenceText.includes(`"name":"${declaration.name}"`)
			);

			const callableRelevantDeclarations = rootExtensionDeclarations.filter(declaration =>
				isDirectlyRelevant(declaration)
				&& (extractCallConstructSignatures(declaration)?.length ?? 0) > 0,
			);
			const callableRelevantReferenceIds = new Set<number>();
			const callableRelevantReferenceNames = new Set<string>();
			collectReferencedDeclarationTargets(callableRelevantDeclarations, callableRelevantReferenceIds, callableRelevantReferenceNames);
			const shouldFilterAuxiliaryDeclarations = module.name.endsWith("placeExtension");

			const filteredRootExtensionDeclarations = rootExtensionDeclarations.filter(declaration =>
				!consumedHelperTypeAliasIds.has(declaration.id)
				&& (
					!shouldFilterAuxiliaryDeclarations
					|| isDirectlyRelevant(declaration)
					|| callableRelevantReferenceIds.has(declaration.id)
					|| callableRelevantReferenceNames.has(declaration.name)
				),
			);

			const collapsedExtensionMethods = extensionMethods.map(method => {
				const targetId = rootClassForExtensionLinks
					? findRootClassMemberTargetId(method, rootClassForExtensionLinks)
					: undefined;

				if (!targetId)
					return method;

				return {
					...method,
					collapseToTargetId: targetId,
				};
			});

			if (shouldFilterAuxiliaryDeclarations) {
				const extensionSectionChildren: PreparedDeclarationReflection[] = [];

				if (staticTopLevelMethods.length > 0) {
					extensionSectionChildren.unshift(...staticTopLevelMethods);
				}

				if (collapsedExtensionMethods.length > 0 && extensions) {
					extensionSectionChildren.unshift({
						...extensions,
						children: collapsedExtensionMethods,
						sources: undefined,
						comment: undefined,
					});
				}

				if (filteredRootExtensionDeclarations.length > 0) {
					extensionSectionChildren.push(...filteredRootExtensionDeclarations as PreparedDeclarationReflection[]);
				}

				children = extensionSectionChildren;
			} else {
				const existingChildIds = new Set(children.map(child => child.id));
				for (const declaration of filteredRootExtensionDeclarations) {
					if (!existingChildIds.has(declaration.id)) {
						children.push(declaration as PreparedDeclarationReflection);
					}
				}

				if (staticTopLevelMethods.length > 0) {
					children.unshift(...staticTopLevelMethods);
				}

				if (collapsedExtensionMethods.length > 0 && extensions) {
					children.unshift({
						...extensions,
						children: collapsedExtensionMethods,
						sources: undefined,
						comment: undefined,
					});
				}
			}
		}

		return {
			anchorScope: module.name,
			children,
			module,
			sectionTitle: extractModuleName(module.name),
		};
	});

	const declarationsById = new Map<number, PreparedDeclarationReflection>();
	for (const section of sections)
		collectDeclarationsById(section.children, declarationsById);

	const extendedTypesByChildId = new Map<number, JSONOutput.ReferenceType[]>();
	for (const section of sections)
		collectExtendedTypesByChildId(section.children, declarationsById, extendedTypesByChildId);

	const annotatedSections = sections.map(section => ({
		...section,
		children: annotateInheritance(section.children, extendedTypesByChildId),
	}));

	const usedAnchors = new Set<string>();
	const anchoredSections = annotatedSections.map(section => ({
		...section,
		children: assignSemanticAnchors(
			section.children,
			{
				anchorScope: section.anchorScope,
				extensionsInterfaceName: options.extensionsInterfaceName,
				sectionTitle: section.sectionTitle,
			},
			usedAnchors,
		),
	}));

	const declarationLinks = new Map<string, string>();
	const declarationLinksById = new Map<number, string>();
	for (const section of anchoredSections)
		collectDeclarationLinks(section.children, options.declarationLinkPath, section.anchorScope, declarationLinks, declarationLinksById);

	return {
		declarationLinks,
		declarationLinksById,
		nameAliases: allNameAliases,
		sections: anchoredSections,
	};
}