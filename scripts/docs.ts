import { arcTree, type WorkbenchArcTree } from "@inthedark/wb";
import esbuild from "esbuild";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Application, JSONOutput, normalizePath, TSConfigReader, TypeDocReader } from "typedoc";
import arcSourcePlugin from "./arc/arcSourcePlugin";
import { buildProject } from "./build";
import type { DocumentBuilderWithExtras, DocumentExtraLinks } from "./docs/Document";
import { createManipulatorPageBuilder } from "./docs/manipulatorPage";
import { prepareModuleSections, type PrepareModuleSectionsOptions } from "./docs/modulePage/reflection";
import { listManipulatorModules, manipulatorModuleShortName } from "./docs/navigation";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const docsSourceDirectory = path.resolve(scriptDirectory, "docs");
const docsPublicDirectory = path.join(docsSourceDirectory, "public");
const docsClientEntry = path.join(docsSourceDirectory, "client", "index.ts");
const projectRoot = path.resolve(scriptDirectory, "..");
const defaultDocsOutputDirectory = path.join(projectRoot, "docs");
const distDirectory = path.join(projectRoot, "dist");
const srcDirectory = path.join(projectRoot, "src");
const typedocConfigPath = path.join(projectRoot, "typedoc.json");
const typedocModelFile = "kitsui.json";

/** Docs site files keyed by path relative to the docs output directory. */
export type DocsOutput = Map<string, string | Uint8Array>;

export interface BuildDocsOptions {
	outputDirectory?: string;
	/** Where the library build the docs bundle is copied from goes; defaults to the shared `dist/`. */
	distDirectory?: string;
	/** Reuse the TypeDoc model already written to `outputDirectory` instead of regenerating it. Requires `write`. */
	skipTypedoc?: boolean;
	reloadPort?: number;
	/**
	 * Write the site to `outputDirectory` and the library build to `distDirectory`. Off, nothing touches disk and the
	 * returned site omits the third-party Monaco assets. Defaults to true.
	 */
	write?: boolean;
	/** The arc view to build from; loaded for the calling agent when omitted. */
	tree?: WorkbenchArcTree;
}

/** Generates the TypeDoc JSON model in memory through TypeDoc's API. */
async function generateTypedocModel (): Promise<JSONOutput.ProjectReflection> {
	// Explicit readers: the defaults also parse process.argv, which belongs to whoever is running this.
	const app = await Application.bootstrapWithPlugins({ options: typedocConfigPath }, [new TypeDocReader(), new TSConfigReader()]);
	const project = await app.convert();
	if (!project || app.logger.hasErrors()) {
		throw new Error("TypeDoc failed while generating the docs model.");
	}

	return app.serializer.projectToObject(project, normalizePath(projectRoot));
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

/**
 * Builds the docs site from the calling agent's arc view.
 * @returns every site file except the copied Monaco assets.
 */
export async function buildDocsSite (options: BuildDocsOptions = {}): Promise<DocsOutput> {
	const docsOutputDirectory = options.outputDirectory ?? defaultDocsOutputDirectory;
	const write = options.write ?? true;
	if (options.skipTypedoc && !write) {
		throw new Error("skipTypedoc reuses the model on disk, so it requires write.");
	}

	const tree = options.tree ?? await arcTree({ cwd: projectRoot });
	try {
		const site = await buildSiteFiles(options, docsOutputDirectory, tree);
		if (write) {
			await writeSite(docsOutputDirectory, site, !options.skipTypedoc);
		}

		return site;
	} finally {
		if (!options.tree) {
			await tree.dispose();
		}
	}
}

async function writeSite (docsOutputDirectory: string, site: DocsOutput, clean: boolean): Promise<void> {
	if (clean) {
		await rm(docsOutputDirectory, { force: true, recursive: true });
	}

	for (const [relativePath, contents] of site) {
		const filePath = path.join(docsOutputDirectory, relativePath);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	// Copy Monaco editor from node_modules so the playground works offline without a CDN
	try {
		await cp(path.join(projectRoot, "node_modules", "monaco-editor", "min", "vs"), path.join(docsOutputDirectory, "vs"), { recursive: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		// monaco-editor not installed — playground will fall back to degraded mode
	}
}

async function buildSiteFiles (options: BuildDocsOptions, docsOutputDirectory: string, tree: WorkbenchArcTree): Promise<DocsOutput> {
	const site: DocsOutput = new Map();
	const kitsuiTypedoc = options.skipTypedoc
		? JSON.parse(await readFile(path.join(docsOutputDirectory, typedocModelFile), "utf-8")) as JSONOutput.ProjectReflection
		: await generateTypedocModel();
	site.set(typedocModelFile, JSON.stringify(kitsuiTypedoc));
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
		let html: string;

		try {
			html = await renderPage(toDocumentPath(outputRelativePath), kitsuiTypedoc, extraLinks, true);
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

		site.set(toDocumentPath(outputRelativePath), html);
	}

	const isDev = !!options.reloadPort;

	// Examples ship as sources, listed by examples.json
	const examplesSourceDirectory = path.join(docsSourceDirectory, "examples");
	const exampleFiles: string[] = [];
	for (const entry of await readdir(examplesSourceDirectory, { withFileTypes: true })) {
		if (!entry.isFile() || path.extname(entry.name) !== ".ts") continue;
		site.set(`examples/${entry.name}`, await tree.readFile(path.join(examplesSourceDirectory, entry.name)));
		exampleFiles.push(entry.name);
	}

	exampleFiles.sort((a, b) => a.localeCompare(b));
	site.set("examples/examples.json", JSON.stringify({ examples: exampleFiles }, null, "\t"));

	// The kitsui runtime and its declarations for the playground; a written site also refreshes the library build
	const library = await buildProject({
		isDev,
		outputDirectory: options.distDirectory ?? distDirectory,
		tree,
		write: options.write ?? true,
	});
	for (const file of ["kitsui.d.ts", "kitsui.esm.js", "kitsui.esm.js.map"]) {
		const contents = library.get(file);
		if (contents !== undefined) site.set(file, contents);
	}

	// Bundle client-side JS
	const client = await esbuild.build({
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
		}, arcSourcePlugin(tree)],
		target: "es2020",
		write: false,
	});
	for (const file of client.outputFiles) {
		site.set(path.relative(docsOutputDirectory, file.path).replaceAll("\\", "/"), file.contents);
	}

	return site;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	void buildDocsSite({
		outputDirectory: resolveCliOutputDirectory(),
	}).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
