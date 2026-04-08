import { build } from "esbuild";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const distDirectory = path.join(projectRoot, "dist");
const outputFile = path.join(distDirectory, "kitsui.umd.js");
const tsgoBinary = path.join(projectRoot, "node_modules", "@typescript", "native-preview", "bin", "tsgo.js");
const execFileAsync = promisify(execFile);

await rm(distDirectory, { force: true, recursive: true });
await mkdir(distDirectory, { recursive: true });

const result = await build({
  absWorkingDir: projectRoot,
  bundle: true,
  entryPoints: ["src/index.ts"],
  format: "iife",
  globalName: "__kitsui_factory__",
  platform: "browser",
  target: "es2020",
  write: false
});

const [{ text }] = result.outputFiles;

const umdBundle = `(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    define([], factory);
  } else {
    root.Kitsui = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

${text}

  return __kitsui_factory__;
});
`;

await Promise.all([
  writeFile(outputFile, umdBundle),
  execFileAsync(process.execPath, [tsgoBinary, "-p", "tsconfig.build.json"], {
    cwd: projectRoot
  })
]);

console.log(`Built ${path.relative(projectRoot, outputFile)} and dist/index.d.ts`);