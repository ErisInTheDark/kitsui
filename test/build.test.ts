import { execFile } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const distDirectory = path.join(projectRoot, "dist");
const bundleFile = path.join(distDirectory, "kitsui.umd.js");
const declarationFile = path.join(distDirectory, "index.d.ts");
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

		expect(packageJson.types).toBe("./dist/index.d.ts");
		expect(packageJson.exports?.["."]).toEqual({
			default: "./dist/kitsui.umd.js",
			types: "./dist/index.d.ts"
		});

		await execFileAsync(process.execPath, ["./scripts/build.mjs"], {
			cwd: projectRoot
		});

		await expect(access(bundleFile)).resolves.toBeUndefined();
		await expect(access(declarationFile)).resolves.toBeUndefined();

		const declarationContents = await readFile(declarationFile, "utf8");

		expect(declarationContents).toContain('export { Component } from "./component/Component";');
		expect(declarationContents).toContain('export { Owner, State } from "./state/State";');
	});
});