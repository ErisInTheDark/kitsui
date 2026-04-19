import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildProject } from "../scripts/build";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const distDirectory = path.join(projectRoot, "dist");
const bundleFile = path.join(distDirectory, "kitsui.umd.js");
const rawDeclarationFile = path.join(distDirectory, "index.d.ts");
const bundledDeclarationFile = path.join(distDirectory, "kitsui.d.ts");
const packageJsonPath = path.join(projectRoot, "package.json");

afterEach(async () => {
	await rm(distDirectory, { force: true, recursive: true });
});

describe("build output", () => {
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

		await buildProject();

		await expect(access(bundleFile)).resolves.toBeUndefined();
		await expect(access(rawDeclarationFile)).resolves.toBeUndefined();
		await expect(access(bundledDeclarationFile)).resolves.toBeUndefined();

		const rawDeclarationContents = await readFile(rawDeclarationFile, "utf8");
		const bundledDeclarationContents = await readFile(bundledDeclarationFile, "utf8");

		expect(rawDeclarationContents.includes('export { Component } from "./component/Component";'), "exports Component").toBe(true);
		expect(rawDeclarationContents.includes('export { Owner, State } from "./state/State";'), "exports Owner and State").toBe(true);
		expect(bundledDeclarationContents.includes('declare module "kitsui" {'), "declares module kitsui").toBe(true);
		expect(bundledDeclarationContents.includes('export interface ComponentExtensions {'), "exports ComponentExtensions").toBe(true);
		expect(bundledDeclarationContents.includes('export interface StateExtensions<T> {'), "exports StateExtensions").toBe(true);
		expect(bundledDeclarationContents.includes('appendTo(target: PlacementContainer): this;'), "exports appendTo").toBe(true);
		expect(bundledDeclarationContents.includes('Group: GroupConstructor;'), "exports Group").toBe(true);
		expect(bundledDeclarationContents.includes('interface ComponentHTMLElementEventMap extends HTMLElementEventMap {'), "exports ComponentHTMLElementEventMap").toBe(true);
		expect(bundledDeclarationContents.includes('Mount: CustomEvent;'), "exports Mount event").toBe(true);
		expect(bundledDeclarationContents.includes('Dispose: CustomEvent;'), "exports Dispose event").toBe(true);
		expect(bundledDeclarationContents.includes('OwnedEventOnProxyFor<THost, "component", ComponentHTMLElementEventMap>'), "exports OwnedEventOnProxyFor").toBe(true);
		expect(/^\s*declare module "kitsui\//mu.test(bundledDeclarationContents), "does not declare submodules").toBe(false);
		expect(/^\s*declare global\s*\{/mu.test(bundledDeclarationContents), "does not declare global").toBe(false);
		expect(bundledDeclarationContents.includes('from "./') || bundledDeclarationContents.includes('from "../'), "does not include relative imports").toBe(false);
	});
});