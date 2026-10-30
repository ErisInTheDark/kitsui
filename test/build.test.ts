import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildProject, type BuildOutput } from "../scripts/build";
import { heldTree, withAppended, withReplaced } from "./utility/heldTree";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const packageJsonPath = path.join(projectRoot, "package.json");

function text (output: BuildOutput, file: string): string {
	const contents = output.get(file);
	expect(contents, `builds ${file}`).toBeDefined();
	return typeof contents === "string" ? contents : Buffer.from(contents!).toString("utf8");
}

describe("build output", () => {
	it("bundles and declares the arc view's held files instead of disk", async () => {
		const tree = heldTree({
			"src/index.ts": await withAppended("src/index.ts", "export const arcViewMarker = \"held-by-another-thread\";"),
			"src/component/TextManipulator.ts": await withReplaced("src/component/TextManipulator.ts", "override set (value: TextInput): OWNER {", "override set (value: TextInput, heldParameter?: boolean): OWNER {"),
		});

		const output = await buildProject({ tree, write: false });

		expect(text(output, "kitsui.esm.js")).toContain("held-by-another-thread");
		expect(text(output, "kitsui.umd.js")).toContain("held-by-another-thread");
		expect(text(output, "index.d.ts")).toContain("arcViewMarker");
		expect(text(output, "component/TextManipulator.d.ts")).toContain("heldParameter?: boolean");
		expect(text(output, "kitsui.d.ts")).toContain("heldParameter?: boolean");
	});

	it("fails to build when the arc view lacks a source file", async () => {
		await expect(buildProject({ tree: heldTree({ "src/utility/reportUncaught.ts": null }), write: false })).rejects.toThrow();
	});

	it("emits declarations and exposes them through package.json", async () => {
		const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
			types?: string;
			exports?: {
				".": {
					default?: string;
					types?: string;
				} | string;
			};
		};

		expect(packageJson.types).toBe("./dist/kitsui.d.ts");
		expect(packageJson.exports?.["."]).toEqual({
			default: "./dist/kitsui.umd.js",
			types: "./dist/kitsui.d.ts"
		});

		const output = await buildProject({ write: false });

		const umdBundleContents = text(output, "kitsui.umd.js");
		const esmBundleContents = text(output, "kitsui.esm.js");
		const umdSourceMapContents = JSON.parse(text(output, "kitsui.umd.js.map")) as {
			sources?: string[];
			version?: number;
		};
		const esmSourceMapContents = JSON.parse(text(output, "kitsui.esm.js.map")) as {
			sources?: string[];
			version?: number;
		};
		const rawDeclarationContents = text(output, "index.d.ts");
		const bundledDeclarationContents = text(output, "kitsui.d.ts");

		expect(umdBundleContents.includes("//# sourceMappingURL=kitsui.umd.js.map"), "links UMD sourcemap").toBe(true);
		expect(esmBundleContents.includes("//# sourceMappingURL=kitsui.esm.js.map"), "links ESM sourcemap").toBe(true);
		expect(umdSourceMapContents.version, "writes a valid UMD sourcemap").toBe(3);
		expect(esmSourceMapContents.version, "writes a valid ESM sourcemap").toBe(3);
		expect(umdSourceMapContents.sources?.some((source) => source.endsWith("src/index.ts")), "UMD sourcemap includes src/index.ts").toBe(true);
		expect(esmSourceMapContents.sources?.some((source) => source.endsWith("src/index.ts")), "ESM sourcemap includes src/index.ts").toBe(true);
		expect(rawDeclarationContents.includes('export { Component } from "./component/Component";'), "exports Component").toBe(true);
		expect(rawDeclarationContents.includes('export { Owner, State } from "./state/State";'), "exports Owner and State").toBe(true);
		expect(rawDeclarationContents.includes('export { AsyncPending } from "./state/extensions/mappingExtension";'), "exports AsyncPending").toBe(true);
		expect(bundledDeclarationContents.includes('declare module "@inthedark/kitsui" {'), "declares module kitsui").toBe(true);
		expect(bundledDeclarationContents.includes('onCleanup(owner: Owner, cleanupFunction: CleanupFunction): CleanupFunction;'), "exports owner-bound cleanup").toBe(true);
		expect(bundledDeclarationContents.includes('export interface ComponentExtensions {'), "exports ComponentExtensions").toBe(true);
		expect(bundledDeclarationContents.includes('export interface StateExtensions<T> {'), "exports StateExtensions").toBe(true);
		expect(bundledDeclarationContents.includes('appendTo(target: PlacementContainer): this;'), "exports appendTo").toBe(true);
		expect(bundledDeclarationContents.includes('Group: GroupConstructor;'), "exports Group").toBe(true);
		expect(bundledDeclarationContents.includes('debounce(milliseconds: number): State.Readonly<T>;'), "exports debounce").toBe(true);
		expect(bundledDeclarationContents.includes('debounce(owner: Owner, milliseconds: number): State.Readonly<T>;'), "exports owner-bound debounce").toBe(true);
		expect(bundledDeclarationContents.includes('throttle(milliseconds: number): State.Readonly<T>;'), "exports throttle").toBe(true);
		expect(bundledDeclarationContents.includes('throttle(owner: Owner, milliseconds: number): State.Readonly<T>;'), "exports owner-bound throttle").toBe(true);
		expect(bundledDeclarationContents.includes('mapAsync<U, E = unknown>'), "exports mapAsync").toBe(true);
		expect(bundledDeclarationContents.includes('export interface AsyncState<T, E>'), "exports AsyncState").toBe(true);
		expect(bundledDeclarationContents.includes('interface ComponentHTMLElementEventMap extends HTMLElementEventMap {'), "exports ComponentHTMLElementEventMap").toBe(true);
		expect(bundledDeclarationContents.includes('Mount: CustomEvent;'), "exports Mount event").toBe(true);
		expect(bundledDeclarationContents.includes('Dispose: CustomEvent;'), "exports Dispose event").toBe(true);
		expect(bundledDeclarationContents.includes('OwnedEventOnProxyFor<THost, "component", ComponentHTMLElementEventMap>'), "exports OwnedEventOnProxyFor").toBe(true);
		expect(/^\s*declare module "kitsui\//mu.test(bundledDeclarationContents), "does not declare submodules").toBe(false);
		expect(/^\s*declare global\s*\{/mu.test(bundledDeclarationContents), "does not declare global").toBe(false);
		expect(bundledDeclarationContents.includes('from "./') || bundledDeclarationContents.includes('from "../'), "does not include relative imports").toBe(false);
	});
});
