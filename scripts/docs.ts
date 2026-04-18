import esbuild from "esbuild";
import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { JSONOutput } from "typedoc";
import { buildProject } from "./build";
import type { DocumentBuilderWithExtras, DocumentExtraLinks } from "./docs/Document";
import { createManipulatorPageBuilder } from "./docs/manipulatorPage";
import { prepareModuleSections, type PrepareModuleSectionsOptions } from "./docs/modulePage/reflection";
import { listManipulatorModules, manipulatorModuleShortName } from "./docs/navigation";

const execFileAsync = promisify(execFile);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const docsSourceDirectory = path.resolve(scriptDirectory, "docs");
const docsPublicDirectory = path.join(docsSourceDirectory, "public");
const docsClientEntry = path.join(docsSourceDirectory, "client", "index.ts");
const projectRoot = path.resolve(scriptDirectory, "..");
const defaultDocsOutputDirectory = path.join(projectRoot, "docs");
const distDirectory = path.join(projectRoot, "dist");
const srcDirectory = path.join(projectRoot, "src");
const typedocBinary = path.join(projectRoot, "node_modules", "typedoc", "bin", "typedoc");
const typedocConfigPath = path.join(projectRoot, "typedoc.json");

async function copyFileIfExists (from: string, to: string): Promise<void> {
	try {
		await copyFile(from, to);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return;
		}

		throw error;
	}
}

export interface BuildDocsOptions {
	outputDirectory?: string;
	skipTypedoc?: boolean;
	reloadPort?: number;
}

async function listPageFiles (directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const pages: string[] = [];

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			pages.push(...await listPageFiles(entryPath));
			continue;
		}

		if (!entry.isFile() || path.extname(entry.name) !== ".ts") {
			continue;
		}

		pages.push(entryPath);
	}

	return pages.sort((left, right) => left.localeCompare(right));
}

function toOutputRelativePath (pagePath: string): string {
	const relativePagePath = path.relative(docsPublicDirectory, pagePath);
	return relativePagePath.replace(/\.ts$/u, ".html");
}

function toDocumentPath (outputRelativePath: string): string {
	return outputRelativePath.replaceAll(path.sep, "/");
}

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

function rewriteDeclarationSpecifiers (sourceText: string, sourceRelativePath: string): string {
	const sourceDir = path.posix.dirname(sourceRelativePath.replaceAll("\\", "/"));

	function rewriteSpecifier (specifier: string): string {
		if (!specifier.startsWith(".")) {
			return specifier;
		}

		const resolved = path.posix.normalize(path.posix.join(sourceDir, specifier));
		return `kitsui/${resolved}`;
	}

	return sourceText
		.replace(/(from\s+["'])([^"']+)(["'])/gu, (_, prefix: string, specifier: string, suffix: string) => {
			return `${prefix}${rewriteSpecifier(specifier)}${suffix}`;
		})
		.replace(/(import\s+["'])([^"']+)(["'])/gu, (_, prefix: string, specifier: string, suffix: string) => {
			return `${prefix}${rewriteSpecifier(specifier)}${suffix}`;
		})
		.replace(/(import\(["'])([^"']+)(["']\))/gu, (_, prefix: string, specifier: string, suffix: string) => {
			return `${prefix}${rewriteSpecifier(specifier)}${suffix}`;
		})
		.replace(/(declare\s+module\s+["'])([^"']+)(["'])/gu, (_, prefix: string, specifier: string, suffix: string) => {
			return `${prefix}${rewriteSpecifier(specifier)}${suffix}`;
		});
}

function splitDeclareModuleBlocks (sourceText: string): { body: string; moduleBlocks: string[] } {
	const moduleBlocks: string[] = [];
	const bodyRanges: Array<[number, number]> = [];

	let cursor = 0;
	while (cursor < sourceText.length) {
		const start = sourceText.indexOf("declare module", cursor);
		if (start === -1) {
			break;
		}

		const openBrace = sourceText.indexOf("{", start);
		if (openBrace === -1) {
			break;
		}

		let depth = 0;
		let end = openBrace;
		for (; end < sourceText.length; end++) {
			const ch = sourceText[end];
			if (ch === "{") depth++;
			if (ch === "}") {
				depth--;
				if (depth === 0) {
					end++;
					break;
				}
			}
		}

		if (end <= openBrace) {
			break;
		}

		moduleBlocks.push(sourceText.slice(start, end).trim());
		bodyRanges.push([start, end]);
		cursor = end;
	}

	if (bodyRanges.length === 0) {
		return { body: sourceText.trim(), moduleBlocks };
	}

	let body = "";
	let last = 0;
	for (const [start, end] of bodyRanges) {
		body += sourceText.slice(last, start);
		last = end;
	}
	body += sourceText.slice(last);

	return {
		body: body.trim(),
		moduleBlocks,
	};
}

async function buildKitsuiDeclarationBundle (): Promise<string> {
	const declarationFiles = await collectDeclarationFiles(distDirectory);
	const indexPath = path.join(distDirectory, "index.d.ts");
	const indexDeclaration = rewriteDeclarationSpecifiers(
		await readFile(indexPath, "utf-8"),
		"index",
	).trim();

	const moduleBlocks: string[] = [];
	const augmentationBlocks: string[] = [];
	for (const declarationFile of declarationFiles.sort((a, b) => a.localeCompare(b))) {
		if (path.resolve(declarationFile) === path.resolve(indexPath)) {
			continue;
		}

		const sourceRelativePath = path.relative(distDirectory, declarationFile).replaceAll("\\", "/").replace(/\.d\.ts$/u, "");
		const moduleName = `kitsui/${sourceRelativePath}`;
		const sourceText = await readFile(declarationFile, "utf-8");
		const rewritten = rewriteDeclarationSpecifiers(sourceText, sourceRelativePath);
		const { body, moduleBlocks: fileModuleBlocks } = splitDeclareModuleBlocks(rewritten);
		augmentationBlocks.push(...fileModuleBlocks);

		if (body.length === 0) {
			continue;
		}

		moduleBlocks.push(`declare module "${moduleName}" {\n${body}\n}`);
	}

	const uniqueAugmentations = [...new Set(augmentationBlocks)];
	const augmentationBlockText = uniqueAugmentations.length > 0
		? `\n\n${uniqueAugmentations.join("\n\n")}`
		: "";

	return `declare module "kitsui" {\n${indexDeclaration}\n}\n\n${moduleBlocks.join("\n\n")}${augmentationBlockText}\n`;
}


function resolveCliOutputDirectory (): string | undefined {
	const args = process.argv.slice(2);

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];

		if (arg === "--output" || arg === "--output-dir") {
			const outputDirectory = args[index + 1];

			if (!outputDirectory) {
				throw new Error(`Expected a path after '${arg}'.`);
			}

			return path.resolve(projectRoot, outputDirectory);
		}
	}

	return undefined;
}

export async function buildDocsSite (options: BuildDocsOptions = {}): Promise<void> {
	const docsOutputDirectory = options.outputDirectory ?? defaultDocsOutputDirectory;
	const typedocJsonPath = path.join(docsOutputDirectory, "kitsui.json");

	if (!options.skipTypedoc) {
		await rm(docsOutputDirectory, { force: true, recursive: true });
		await mkdir(docsOutputDirectory, { recursive: true });

		try {
			await execFileAsync(process.execPath, [typedocBinary, "--options", typedocConfigPath, "--json", typedocJsonPath], {
				cwd: projectRoot,
			});
		} catch (error) {
			throw new Error("TypeDoc failed while generating docs/kitsui.json.", {
				cause: error,
			});
		}
	}

	const kitsuiTypedoc = JSON.parse(await readFile(typedocJsonPath, "utf-8")) as JSONOutput.ProjectReflection;
	const sitePages = await listPageFiles(docsPublicDirectory);

	// Clear cached modules under scripts/docs/ so watch rebuilds pick up changes
	if (typeof require !== "undefined" && require.cache) {
		const docsPrefix = path.resolve(docsSourceDirectory);
		const srcPrefix = path.resolve(srcDirectory);
		for (const key of Object.keys(require.cache)) {
			if (key.startsWith(docsPrefix) || key.startsWith(srcPrefix)) {
				delete require.cache[key];
			}
		}
	}

	// First pass: collect all pages' link maps so each page can link to declarations on other pages
	const allLinksById = new Map<number, string>();
	const allLinksByName = new Map<string, string>();

	const pageModules: Array<{ page: string; renderPage: DocumentBuilderWithExtras<JSONOutput.ProjectReflection>; outputRelativePath: string }> = [];
	const outputPathSources = new Map<string, string>();

	for (const page of sitePages) {
		const outputRelativePath = toOutputRelativePath(page);
		const documentPath = toDocumentPath(outputRelativePath);
		const pageModule = await import(pathToFileURL(page).href + `?cacheBust=${Date.now()}`);
		const renderPage = pageModule.default as DocumentBuilderWithExtras<JSONOutput.ProjectReflection> | undefined;

		if (typeof renderPage !== "function") {
			throw new Error(`Docs page '${page}' must export a default Document builder function.`);
		}

		pageModules.push({ page, renderPage, outputRelativePath });
		outputPathSources.set(outputRelativePath, page);

		const moduleOptions = (pageModule.componentModuleOptions ?? pageModule.stateModuleOptions) as Omit<PrepareModuleSectionsOptions, "declarationLinkPath"> | undefined;
		if (moduleOptions) {
			const prepared = prepareModuleSections(kitsuiTypedoc, { ...moduleOptions, declarationLinkPath: documentPath });
			for (const [id, href] of prepared.declarationLinksById)
				allLinksById.set(id, href);
			for (const [name, href] of prepared.declarationLinks) {
				allLinksByName.set(name, href);
				// Also register aliased name so cross-page renders using the alias can resolve the link
				const alias = prepared.nameAliases.get(name);
				if (alias)
					allLinksByName.set(alias, href);
			}
		}
	}

	for (const manipulatorModule of listManipulatorModules(kitsuiTypedoc)) {
		const shortName = manipulatorModuleShortName(manipulatorModule);
		const outputRelativePath = `${shortName}.html`;
		const existingSource = outputPathSources.get(outputRelativePath);
		if (existingSource) {
			throw new Error(`Duplicate docs output path '${outputRelativePath}' for '${manipulatorModule}' conflicts with '${existingSource}'.`);
		}

		outputPathSources.set(outputRelativePath, manipulatorModule);
		const documentPath = toDocumentPath(outputRelativePath);
		const renderPage = createManipulatorPageBuilder(manipulatorModule);

		pageModules.push({
			page: `generated:${manipulatorModule}`,
			renderPage,
			outputRelativePath,
		});

		const prepared = prepareModuleSections(kitsuiTypedoc, {
			declarationLinkPath: documentPath,
			rootModuleName: manipulatorModule,
			stripDefaultExports: true,
		});

		for (const [id, href] of prepared.declarationLinksById)
			allLinksById.set(id, href);
		for (const [name, href] of prepared.declarationLinks) {
			allLinksByName.set(name, href);
			const alias = prepared.nameAliases.get(name);
			if (alias)
				allLinksByName.set(alias, href);
		}
	}

	// Second pass: render each page with peer pages' link maps available as extras
	const extraLinks: DocumentExtraLinks = { declarationLinks: allLinksByName, declarationLinksById: allLinksById };
	for (const { page, renderPage, outputRelativePath } of pageModules) {
		const outputPath = path.join(docsOutputDirectory, outputRelativePath);
		const outputDirectory = path.dirname(outputPath);

		await mkdir(outputDirectory, { recursive: true });
		let html: string;

		try {
			html = await renderPage(toDocumentPath(outputRelativePath), kitsuiTypedoc, extraLinks, !!options.reloadPort);
		} catch (error) {
			throw new Error(`Docs page '${page}' failed to render.`, {
				cause: error,
			});
		}

		if (options.reloadPort) {
			const reloadScript = `<script>
				if (!window.reloaderSocket || window.reloaderSocket.readyState === WebSocket.CLOSED || window.reloaderSocket.readyState === WebSocket.CLOSING) {
					window.reloaderSocket = new WebSocket("ws://localhost:${options.reloadPort}")
					window.reloaderSocket.addEventListener("message", () => navigation.reload())
				}
			</script>`;
			html = html.replace("</body>", reloadScript + "</body>");
		}

		await writeFile(outputPath, html, "utf-8");
		console.log(`Built docs/${toDocumentPath(outputRelativePath)}`);
	}

	const isDev = !!options.reloadPort;

	// Copy examples to docs/examples/ and generate examples.json manifest
	const examplesSourceDirectory = path.join(docsSourceDirectory, "examples");
	const examplesOutputDirectory = path.join(docsOutputDirectory, "examples");
	await mkdir(examplesOutputDirectory, { recursive: true });

	const exampleEntries = await readdir(examplesSourceDirectory, { withFileTypes: true });
	const exampleFiles: string[] = [];

	for (const entry of exampleEntries) {
		if (!entry.isFile() || path.extname(entry.name) !== ".ts") continue;
		await copyFile(
			path.join(examplesSourceDirectory, entry.name),
			path.join(examplesOutputDirectory, entry.name),
		);
		exampleFiles.push(entry.name);
	}

	exampleFiles.sort((a, b) => a.localeCompare(b));
	await writeFile(
		path.join(examplesOutputDirectory, "examples.json"),
		JSON.stringify({ examples: exampleFiles }, null, "\t"),
		"utf-8",
	);

	// Copy Monaco editor from node_modules so the playground works offline without a CDN
	const monacoSource = path.join(projectRoot, "node_modules", "monaco-editor", "min", "vs");
	const monacoOutput = path.join(docsOutputDirectory, "vs");
	try {
		await cp(monacoSource, monacoOutput, { recursive: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		// monaco-editor not installed — playground will fall back to degraded mode
	}

	// Bundle kitsui ESM for runtime usage
	await buildProject(isDev);

	const declarationBundle = await buildKitsuiDeclarationBundle();
	await writeFile(path.join(docsOutputDirectory, "kitsui.d.ts"), declarationBundle, "utf-8");

	await copyFile(path.join(distDirectory, "kitsui.esm.js"), path.join(docsOutputDirectory, "kitsui.esm.js"));
	await copyFileIfExists(path.join(distDirectory, "kitsui.esm.js.map"), path.join(docsOutputDirectory, "kitsui.esm.js.map"));

	// Bundle client-side JS
	await esbuild.build({
		absWorkingDir: projectRoot,
		bundle: true,
		entryPoints: [docsClientEntry],
		format: "esm",
		minify: !isDev,
		outfile: path.join(docsOutputDirectory, "client.js"),
		platform: "browser",
		sourcemap: isDev ? "linked" : false,
		plugins: [{
			name: "kitsui-external",
			setup (build) {
				build.onResolve({ filter: /[\\/]src(?:[\\/]index)?$/ }, () => ({
					path: "./kitsui.esm.js",
					external: true,
				}));
			},
		}],
		target: "es2020",
	});
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	void buildDocsSite({
		outputDirectory: resolveCliOutputDirectory(),
	}).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}