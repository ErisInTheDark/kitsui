import esbuild from "esbuild";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { JSONOutput } from "typedoc";
import { buildProject } from "./build";
import type { DocumentBuilder } from "./docs/Document";

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

	for (const page of sitePages) {
		const outputRelativePath = toOutputRelativePath(page);
		const outputPath = path.join(docsOutputDirectory, outputRelativePath);
		const outputDirectory = path.dirname(outputPath);
		const pageModule = await import(pathToFileURL(page).href + `?cacheBust=${Date.now()}`);
		const renderPage = pageModule.default as DocumentBuilder<JSONOutput.ProjectReflection> | undefined;

		if (typeof renderPage !== "function") {
			throw new Error(`Docs page '${page}' must export a default Document builder function.`);
		}

		await mkdir(outputDirectory, { recursive: true });
		let html: string;

		try {
			html = await renderPage(toDocumentPath(outputRelativePath), kitsuiTypedoc);
		} catch (error) {
			throw new Error(`Docs page '${page}' failed to render.`, {
				cause: error,
			});
		}

		if (options.reloadPort) {
			const reloadScript = `<script>!function(){var s=new WebSocket("ws://localhost:${options.reloadPort}");s.onmessage=function(){fetch(location.href).then(r=>r.text()).then(html=>{document.documentElement.innerHTML=html;document.dispatchEvent(new Event("DOMContentLoaded"))})}}()</script>`;
			html = html.replace("</body>", reloadScript + "</body>");
		}

		await writeFile(outputPath, html, "utf-8");
		console.log(`Built docs/${toDocumentPath(outputRelativePath)}`);
	}

	const isDev = !!options.reloadPort;

	// Bundle kitsui ESM for runtime usage
	await buildProject(isDev);
	await copyFile(path.join(distDirectory, "kitsui.esm.js"), path.join(docsOutputDirectory, "kitsui.esm.js"));
	await copyFile(path.join(distDirectory, "kitsui.esm.js.map"), path.join(docsOutputDirectory, "kitsui.esm.js.map"));

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