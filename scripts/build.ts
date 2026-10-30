import { arcTree, type WorkbenchArcTree } from "@inthedark/wb";
import { build, type BuildOptions } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import arcSourcePlugin from "./arc/arcSourcePlugin";
import TypeScriptCompiler from "./arc/TypeScriptCompiler";
import { bundleDeclarations } from "./dts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const defaultDistDirectory = path.join(projectRoot, "dist");
const umdBanner = `(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    define([], factory);
  } else {
    root.Kitsui = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";`;
const umdFooter = `
  return __kitsui_factory__;
});`;

/** Built files keyed by path relative to the output directory. */
export type BuildOutput = Map<string, string | Uint8Array>;

export interface BuildProjectOptions {
	isDev?: boolean;
	/** Where outputs are written, and what their source map links are relative to. Defaults to the shared `dist/`. */
	outputDirectory?: string;
	/** Replace `outputDirectory` with the outputs. Off, nothing touches disk. Defaults to true. */
	write?: boolean;
	/** The arc view to build from; loaded for the calling agent when omitted. */
	tree?: WorkbenchArcTree;
}

/** Builds the UMD and ESM bundles, raw declarations, and the bundled `kitsui.d.ts` from the calling agent's arc view. */
export async function buildProject (options: BuildProjectOptions = {}): Promise<BuildOutput> {
	const outputDirectory = options.outputDirectory ?? defaultDistDirectory;
	const tree = options.tree ?? await arcTree({ cwd: projectRoot });

	try {
		const output = await buildOutputs(tree, outputDirectory, options.isDev ?? false);
		if (options.write ?? true) {
			await writeOutputs(outputDirectory, output);
			console.log(`Built kitsui.umd.js, kitsui.esm.js, index.d.ts, and kitsui.d.ts in ${path.relative(projectRoot, outputDirectory) || "."}`);
		}

		return output;
	} finally {
		if (!options.tree) {
			await tree.dispose();
		}
	}
}

async function buildOutputs (tree: WorkbenchArcTree, outputDirectory: string, isDev: boolean): Promise<BuildOutput> {
	const bundleOptions: BuildOptions = {
		absWorkingDir: projectRoot,
		bundle: true,
		entryPoints: ["src/index.ts"],
		platform: "browser",
		plugins: [arcSourcePlugin(tree)],
		sourcemap: "linked",
		target: "es2020",
		write: false,
	};

	const compiler = TypeScriptCompiler.open(projectRoot, tree);
	try {
		const [umd, esm, declarations] = await Promise.all([
			build({
				...bundleOptions,
				banner: { js: umdBanner },
				footer: { js: umdFooter },
				format: "iife",
				globalName: "__kitsui_factory__",
				outfile: path.join(outputDirectory, "kitsui.umd.js"),
			}),
			build({
				...bundleOptions,
				format: "esm",
				minify: !isDev,
				outfile: path.join(outputDirectory, "kitsui.esm.js"),
			}),
			compiler.emitDeclarations({ configPath: path.join(projectRoot, "tsconfig.build.json") }),
		]);

		if (declarations.diagnostics.length) {
			throw new Error(`Declaration emit failed:\n${declarations.output}`);
		}

		const output: BuildOutput = new Map();
		for (const file of [...umd.outputFiles ?? [], ...esm.outputFiles ?? []]) {
			output.set(path.relative(outputDirectory, file.path).replaceAll("\\", "/"), file.contents);
		}
		for (const [relativePath, text] of declarations.files) {
			output.set(relativePath, text);
		}
		output.set("kitsui.d.ts", bundleDeclarations(declarations.files));
		return output;
	} finally {
		await compiler[Symbol.asyncDispose]();
	}
}

async function writeOutputs (outputDirectory: string, output: BuildOutput): Promise<void> {
	await rm(outputDirectory, { force: true, recursive: true });
	for (const [relativePath, contents] of output) {
		const filePath = path.join(outputDirectory, relativePath);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, contents);
	}
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	void buildProject().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
