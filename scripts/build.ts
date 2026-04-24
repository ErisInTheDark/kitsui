import { build } from "esbuild";
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { writeDeclarationBundle } from "./dts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const distDirectory = path.join(projectRoot, "dist");
const outputFile = path.join(distDirectory, "kitsui.umd.js");
const esmOutputFile = path.join(distDirectory, "kitsui.esm.js");
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

export async function buildProject (isDev = false): Promise<void> {
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
		execFileAsync(process.execPath, [tsgoBinary, "-p", "tsconfig.build.json"], {
			cwd: projectRoot,
		}),
	]);

	await writeDeclarationBundle({
		log: false,
		sourceDirectory: distDirectory,
	});

	console.log(`Built ${path.relative(projectRoot, outputFile)}, ${path.relative(projectRoot, esmOutputFile)}, dist/index.d.ts, and dist/kitsui.d.ts`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	buildProject();
}
