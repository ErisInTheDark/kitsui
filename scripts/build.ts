import { build } from "esbuild";
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { writeDeclarationBundle } from "./dts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const defaultDistDirectory = path.join(projectRoot, "dist");
const tsgoBinary = path.join(projectRoot, "node_modules", "@typescript", "native-preview", "bin", "tsgo.js");
const execFileAsync = promisify(execFile);
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

/**
 * Builds the bundles and declarations into `distDirectory`.
 * Other projects may read the shared `dist/` directly, so tests should pass their own directory.
 */
export async function buildProject (isDev = false, distDirectory = defaultDistDirectory): Promise<void> {
	const outputFile = path.join(distDirectory, "kitsui.umd.js");
	const esmOutputFile = path.join(distDirectory, "kitsui.esm.js");
	await rm(distDirectory, { force: true, recursive: true });
	await mkdir(distDirectory, { recursive: true });

	await Promise.all([
		build({
			absWorkingDir: projectRoot,
			banner: { js: umdBanner },
			bundle: true,
			entryPoints: ["src/index.ts"],
			footer: { js: umdFooter },
			format: "iife",
			globalName: "__kitsui_factory__",
			outfile: outputFile,
			platform: "browser",
			sourcemap: "linked",
			target: "es2020",
		}),
		build({
			absWorkingDir: projectRoot,
			bundle: true,
			entryPoints: ["src/index.ts"],
			format: "esm",
			minify: !isDev,
			outfile: esmOutputFile,
			platform: "browser",
			sourcemap: "linked",
			target: "es2020",
		}),
		execFileAsync(process.execPath, [tsgoBinary, "-p", "tsconfig.build.json", "--outDir", distDirectory], {
			cwd: projectRoot,
		}),
	]);

	await writeDeclarationBundle({
		log: false,
		outputFile: path.join(distDirectory, "kitsui.d.ts"),
		sourceDirectory: distDirectory,
	});

	console.log(`Built kitsui.umd.js, kitsui.esm.js, index.d.ts, and kitsui.d.ts in ${path.relative(projectRoot, distDirectory) || "."}`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	buildProject();
}
