import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const distDirectory = path.join(projectRoot, "dist");
const defaultOutputFile = path.join(distDirectory, "kitsui.d.ts");

export interface BuildDeclarationBundleOptions {
	outputFile?: string;
	sourceDirectory?: string;
	log?: boolean;
}

type ModuleExportMap = Map<string, Set<string>>;

async function collectDeclarationFiles (directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const declarations: string[] = [];

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			declarations.push(...await collectDeclarationFiles(entryPath));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(".d.ts")) {
			declarations.push(entryPath);
		}
	}

	return declarations;
}

function normalizeModulePath (modulePath: string): string {
	return modulePath.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\.d\.ts$/u, "").replace(/\.ts$/u, "");
}

function resolveRelativeModulePath (fromModulePath: string, specifier: string): string {
	const fromDirectory = path.posix.dirname(fromModulePath);
	return path.posix.normalize(path.posix.join(fromDirectory, specifier));
}

function findStatementCodeStart (sourceText: string, startIndex = 0): number {
	let index = startIndex;

	while (index < sourceText.length) {
		const ch = sourceText[index];
		const next = sourceText[index + 1];

		if (/\s/u.test(ch)) {
			index++;
			continue;
		}

		if (ch === "/" && next === "/") {
			index += 2;
			while (index < sourceText.length && sourceText[index] !== "\n") {
				index++;
			}
			continue;
		}

		if (ch === "/" && next === "*") {
			index += 2;
			while (index < sourceText.length && !(sourceText[index] === "*" && sourceText[index + 1] === "/")) {
				index++;
			}
			index += 2;
			continue;
		}

		break;
	}

	return index;
}

function startsNewTopLevelStatement (codeText: string): boolean {
	return /^(declare\s+(module|global|class|function|const|namespace)|export\s+|import\s+|interface\s+|type\s+|class\s+|function\s+|const\s+|namespace\s+)/u.test(codeText);
}

function isEscapedCharacter (sourceText: string, index: number): boolean {
	let slashCount = 0;

	for (let cursor = index - 1; cursor >= 0 && sourceText[cursor] === "\\"; cursor--) {
		slashCount++;
	}

	return slashCount % 2 === 1;
}

function splitTopLevelStatements (sourceText: string): string[] {
	const statements: string[] = [];
	let statementStart = 0;
	let depth = 0;
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let inTemplate = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let index = 0; index < sourceText.length; index++) {
		const ch = sourceText[index];
		const next = sourceText[index + 1];
		const previous = sourceText[index - 1];

		if (inLineComment) {
			if (ch === "\n") {
				inLineComment = false;
			}
			continue;
		}

		if (inBlockComment) {
			if (previous === "*" && ch === "/") {
				inBlockComment = false;
			}
			continue;
		}

		if (inSingleQuote) {
			if (ch === "'" && !isEscapedCharacter(sourceText, index)) {
				inSingleQuote = false;
			}
			continue;
		}

		if (inDoubleQuote) {
			if (ch === '"' && !isEscapedCharacter(sourceText, index)) {
				inDoubleQuote = false;
			}
			continue;
		}

		if (inTemplate) {
			if (ch === "`" && !isEscapedCharacter(sourceText, index)) {
				inTemplate = false;
			}
			continue;
		}

		if (ch === "/" && next === "/") {
			inLineComment = true;
			index++;
			continue;
		}

		if (ch === "/" && next === "*") {
			inBlockComment = true;
			index++;
			continue;
		}

		if (ch === "'") {
			inSingleQuote = true;
			continue;
		}

		if (ch === '"') {
			inDoubleQuote = true;
			continue;
		}

		if (ch === "`") {
			inTemplate = true;
			continue;
		}

		if (ch === "{") {
			depth++;
			continue;
		}

		if (ch === "}") {
			depth = Math.max(0, depth - 1);
			if (depth === 0) {
				const nextStatementStart = findStatementCodeStart(sourceText, index + 1);
				const nextCode = sourceText.slice(nextStatementStart);
				if (nextStatementStart >= sourceText.length || startsNewTopLevelStatement(nextCode)) {
					const statement = sourceText.slice(statementStart, index + 1).trim();
					if (statement) {
						statements.push(statement);
					}
					statementStart = nextStatementStart;
				}
			}
			continue;
		}

		if (ch === ";" && depth === 0) {
			const statement = sourceText.slice(statementStart, index + 1).trim();
			if (statement) {
				statements.push(statement);
			}
			statementStart = findStatementCodeStart(sourceText, index + 1);
		}
	}

	const tail = sourceText.slice(statementStart).trim();
	if (tail) {
		statements.push(tail);
	}

	return statements;
}

function parseIndexExports (indexSourceText: string): ModuleExportMap {
	const exportsByModule: ModuleExportMap = new Map();

	for (const statement of splitTopLevelStatements(indexSourceText)) {
		const codeStart = findStatementCodeStart(statement);
		const code = statement.slice(codeStart);
		const match = code.match(/^export(?:\s+type)?\s*\{([^}]+)\}\s+from\s+["']([^"']+)["'];?$/su);

		if (!match) {
			continue;
		}

		const [, exportBlock, specifier] = match;
		const modulePath = normalizeModulePath(specifier);
		const exportsForModule = exportsByModule.get(modulePath) ?? new Set<string>();

		for (const exportEntry of exportBlock.split(",")) {
			const normalized = exportEntry.trim().replace(/^type\s+/u, "");
			if (!normalized) {
				continue;
			}

			const [localName] = normalized.split(/\s+as\s+/u);
			exportsForModule.add(localName.trim());
		}

		exportsByModule.set(modulePath, exportsForModule);
	}

	return exportsByModule;
}

function listRelativeAugmentationTargets (sourceText: string, modulePath: string): string[] {
	const targets: string[] = [];

	for (const statement of splitTopLevelStatements(sourceText)) {
		const codeStart = findStatementCodeStart(statement);
		const code = statement.slice(codeStart);
		const match = code.match(/^declare\s+module\s+["']([^"']+)["']/u);

		if (!match || !match[1].startsWith(".")) {
			continue;
		}

		targets.push(resolveRelativeModulePath(modulePath, match[1]));
	}

	return targets;
}

function statementCode (statement: string): string {
	return statement.slice(findStatementCodeStart(statement));
}

function getExportedDeclarationName (statement: string): string | null {
	const code = statementCode(statement);
	const match = code.match(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|function|const|namespace|interface|type|enum)\s+([A-Za-z_$][\w$]*)/u);
	return match?.[1] ?? null;
}

function stripExportKeyword (statement: string): string {
	const codeStart = findStatementCodeStart(statement);
	const code = statement.slice(codeStart);

	if (!code.startsWith("export ")) {
		return statement;
	}

	return `${statement.slice(0, codeStart)}${code.replace(/^export\s+/u, "")}`;
}

function ensureExportedDeclaration (statement: string): string {
	const codeStart = findStatementCodeStart(statement);
	const code = statement.slice(codeStart);

	if (code.startsWith("export ")) {
		return statement;
	}

	if (!/^(?:declare\s+)?(?:abstract\s+)?(?:class|function|const|namespace|interface|type|enum)\s+/u.test(code)) {
		return statement;
	}

	return `${statement.slice(0, codeStart)}export ${code}`;
}

function stripAmbientDeclareKeyword (statement: string): string {
	const codeStart = findStatementCodeStart(statement);
	const code = statement.slice(codeStart);
	const normalized = code.replace(/^(export\s+)?declare\s+/u, (_, exportKeyword: string | undefined) => exportKeyword ?? "");

	return `${statement.slice(0, codeStart)}${normalized}`;
}

function extractDeclaredModuleBody (statement: string): string {
	const code = statementCode(statement);
	const openBrace = code.indexOf("{");

	if (openBrace === -1) {
		return "";
	}

	let depth = 0;
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let inTemplate = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let index = openBrace; index < code.length; index++) {
		const ch = code[index];
		const next = code[index + 1];
		const previous = code[index - 1];

		if (inLineComment) {
			if (ch === "\n") {
				inLineComment = false;
			}
			continue;
		}

		if (inBlockComment) {
			if (previous === "*" && ch === "/") {
				inBlockComment = false;
			}
			continue;
		}

		if (inSingleQuote) {
			if (ch === "'" && !isEscapedCharacter(code, index)) {
				inSingleQuote = false;
			}
			continue;
		}

		if (inDoubleQuote) {
			if (ch === '"' && !isEscapedCharacter(code, index)) {
				inDoubleQuote = false;
			}
			continue;
		}

		if (inTemplate) {
			if (ch === "`" && !isEscapedCharacter(code, index)) {
				inTemplate = false;
			}
			continue;
		}

		if (ch === "/" && next === "/") {
			inLineComment = true;
			index++;
			continue;
		}

		if (ch === "/" && next === "*") {
			inBlockComment = true;
			index++;
			continue;
		}

		if (ch === "'") {
			inSingleQuote = true;
			continue;
		}

		if (ch === '"') {
			inDoubleQuote = true;
			continue;
		}

		if (ch === "`") {
			inTemplate = true;
			continue;
		}

		if (ch === "{") {
			depth++;
			continue;
		}

		if (ch === "}") {
			depth--;
			if (depth === 0) {
				return code.slice(openBrace + 1, index).trim();
			}
		}
	}

	return "";
}

function renderModuleStatements (sourceText: string, selectedExports: Set<string>): string[] {
	const rendered: string[] = [];

	for (const statement of splitTopLevelStatements(sourceText)) {
		const code = statementCode(statement);

		if (!code || code === "export {};") {
			continue;
		}

		if (code.startsWith("import ") || code.startsWith("declare global")) {
			continue;
		}

		if (code.startsWith("declare module ")) {
			const match = code.match(/^declare\s+module\s+["']([^"']+)["']/u);
			if (!match?.[1].startsWith(".")) {
				continue;
			}

			const body = extractDeclaredModuleBody(statement);
			for (const bodyStatement of splitTopLevelStatements(body)) {
				const normalized = ensureExportedDeclaration(bodyStatement).trim();
				if (normalized) {
					rendered.push(normalized);
				}
			}
			continue;
		}

		if (code.startsWith("export default ")) {
			continue;
		}

		const exportedName = getExportedDeclarationName(statement);
		if (exportedName) {
			rendered.push(stripAmbientDeclareKeyword(selectedExports.has(exportedName) ? statement : stripExportKeyword(statement)).trim());
			continue;
		}

		rendered.push(stripAmbientDeclareKeyword(statement).trim());
	}

	return rendered;
}

function orderIncludedModules (exportsByModule: ModuleExportMap, includedModules: Set<string>): string[] {
	const orderedModules: string[] = [];

	for (const modulePath of exportsByModule.keys()) {
		if (includedModules.has(modulePath)) {
			orderedModules.push(modulePath);
		}
	}

	for (const modulePath of [...includedModules].sort((left, right) => left.localeCompare(right))) {
		if (!orderedModules.includes(modulePath)) {
			orderedModules.push(modulePath);
		}
	}

	return orderedModules;
}

export async function buildDeclarationBundle (options: BuildDeclarationBundleOptions = {}): Promise<string> {
	const sourceDirectory = options.sourceDirectory ?? distDirectory;
	const declarationFiles = await collectDeclarationFiles(sourceDirectory);
	const indexPath = path.join(sourceDirectory, "index.d.ts");
	let indexSourceText: string;

	try {
		indexSourceText = await readFile(indexPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(`Cannot bundle declarations because '${path.relative(projectRoot, indexPath)}' does not exist. Run the main build first so raw declarations are emitted.`, {
				cause: error,
			});
		}

		throw error;
	}

	const exportsByModule = parseIndexExports(indexSourceText);
	const declarationTexts = new Map<string, string>();
	for (const declarationFile of declarationFiles) {
		if (path.resolve(declarationFile) === path.resolve(indexPath)) {
			continue;
		}

		const modulePath = normalizeModulePath(path.relative(sourceDirectory, declarationFile));
		declarationTexts.set(modulePath, await readFile(declarationFile, "utf-8"));
	}

	const includedModules = new Set<string>(exportsByModule.keys());
	let changed = true;
	while (changed) {
		changed = false;

		for (const [modulePath, sourceText] of declarationTexts) {
			if (includedModules.has(modulePath)) {
				continue;
			}

			const targets = listRelativeAugmentationTargets(sourceText, modulePath);
			if (targets.some(target => includedModules.has(target))) {
				includedModules.add(modulePath);
				changed = true;
			}
		}
	}

	const renderedStatements: string[] = [];
	for (const modulePath of orderIncludedModules(exportsByModule, includedModules)) {
		const sourceText = declarationTexts.get(modulePath);
		if (!sourceText) {
			throw new Error(`Cannot bundle declarations because '${modulePath}.d.ts' was not found in '${path.relative(projectRoot, sourceDirectory)}'.`);
		}

		const selectedExports = exportsByModule.get(modulePath) ?? new Set<string>();
		renderedStatements.push(...renderModuleStatements(sourceText, selectedExports));
	}

	return `declare module "kitsui" {\n${renderedStatements.join("\n\n")}\n}\n`;
}

export async function writeDeclarationBundle (options: BuildDeclarationBundleOptions = {}): Promise<string> {
	const outputFile = options.outputFile ?? defaultOutputFile;
	const declarationBundle = await buildDeclarationBundle(options);

	await mkdir(path.dirname(outputFile), { recursive: true });
	await writeFile(outputFile, declarationBundle, "utf-8");

	if (options.log !== false) {
		console.log(`Built ${path.relative(projectRoot, outputFile)}`);
	}

	return outputFile;
}

function resolveCliOutputFile (): string | undefined {
	const args = process.argv.slice(2);

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];

		if (arg === "--output" || arg === "--output-file") {
			const outputFile = args[index + 1];

			if (!outputFile) {
				throw new Error(`Expected a path after '${arg}'.`);
			}

			return path.resolve(projectRoot, outputFile);
		}
	}

	return undefined;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	void writeDeclarationBundle({
		outputFile: resolveCliOutputFile(),
	}).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}