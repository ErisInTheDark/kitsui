import { access, copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assertCommittedVersion, prepareVersion, stagePackage } from "../scripts/publish-package";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const tempDirectories: string[] = [];

const builtDistFiles = [
	"kitsui.umd.js",
	"kitsui.umd.js.map",
	"kitsui.esm.js",
	"kitsui.esm.js.map",
	"kitsui.d.ts",
	"index.d.ts",
	"component/Component.d.ts",
];

afterEach(async () => {
	await Promise.all(tempDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })));
});

async function createRoot (manifest: object): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), "kitsui-publish-test-"));
	tempDirectories.push(root);
	await writeFile(path.join(root, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
	return root;
}

async function createBuiltRoot (manifest: object): Promise<string> {
	const root = await createRoot(manifest);
	for (const file of builtDistFiles) {
		await mkdir(path.dirname(path.join(root, "dist", file)), { recursive: true });
		await writeFile(path.join(root, "dist", file), `// ${file}\n`, "utf8");
	}

	await writeFile(path.join(root, "README.md"), "# readme\n", "utf8");
	await writeFile(path.join(root, "LICENSE"), "MIT\n", "utf8");
	return root;
}

async function readJson (file: string): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
}

async function listFiles (directory: string, prefix = ""): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(entries.map(async entry => entry.isDirectory()
		? listFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`)
		: [`${prefix}${entry.name}`]));
	return files.flat().sort();
}

describe("prepareVersion", () => {
	it("increments the committed patch and keeps other manifest fields", async () => {
		const root = await createRoot({ name: "@inthedark/kitsui", version: "1.4.9", main: "./dist/kitsui.umd.js" });

		await expect(prepareVersion(root)).resolves.toBe("1.4.10");
		await expect(readJson(path.join(root, "package.json"))).resolves.toEqual({
			name: "@inthedark/kitsui",
			version: "1.4.10",
			main: "./dist/kitsui.umd.js",
		});
	});

	it("sets an explicitly requested version", async () => {
		const root = await createRoot({ name: "pkg", version: "1.4.9" });

		await expect(prepareVersion(root, "2.0.0")).resolves.toBe("2.0.0");
		expect((await readJson(path.join(root, "package.json"))).version).toBe("2.0.0");
	});

	it("leaves the manifest untouched when the requested version is already committed", async () => {
		const root = await createRoot({ name: "pkg", version: "1.4.9" });
		const before = await readFile(path.join(root, "package.json"), "utf8");

		await expect(prepareVersion(root, "1.4.9")).resolves.toBe("1.4.9");
		expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(before);
	});

	it("rejects versions that are not plain major.minor.patch", async () => {
		const root = await createRoot({ name: "pkg", version: "1.4.9" });
		const before = await readFile(path.join(root, "package.json"), "utf8");

		await expect(prepareVersion(root, "2.0.0-beta.1")).rejects.toThrow("major.minor.patch");
		await expect(prepareVersion(root, "01.0.0")).rejects.toThrow("major.minor.patch");
		expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(before);

		const prereleaseRoot = await createRoot({ name: "pkg", version: "1.0.0-rc.1" });
		await expect(prepareVersion(prereleaseRoot)).rejects.toThrow("major.minor.patch");
	});
});

describe("assertCommittedVersion", () => {
	it("accepts the committed version and rejects any other", async () => {
		const root = await createRoot({ name: "pkg", version: "1.4.9" });

		await expect(assertCommittedVersion("1.4.9", root)).resolves.toBeUndefined();
		await expect(assertCommittedVersion("1.4.10", root)).rejects.toThrow("Expected version 1.4.10, package.json has 1.4.9.");
	});
});

describe("stagePackage", () => {
	it("ships only the bundles, bundled declarations, readme and license", async () => {
		const root = await createBuiltRoot({ name: "pkg", version: "1.0.0" });

		const stageDirectory = await stagePackage(root);

		expect(await listFiles(stageDirectory)).toEqual([
			"LICENSE",
			"README.md",
			"dist/kitsui.d.ts",
			"dist/kitsui.esm.js",
			"dist/kitsui.esm.js.map",
			"dist/kitsui.umd.js",
			"dist/kitsui.umd.js.map",
			"package.json",
		]);
	});

	it("strips development-only manifest fields", async () => {
		const root = await createBuiltRoot({
			name: "pkg",
			version: "1.0.0",
			engines: { node: ">=20" },
			devEngines: { runtime: { name: "node", version: "24.0.0" } },
			packageManager: "pnpm@12.0.0",
			scripts: { build: "tsx ./scripts/build.ts" },
			devDependencies: { vitest: "4.0.0" },
			pnpm: { onlyBuiltDependencies: [] },
		});

		const stageDirectory = await stagePackage(root);

		await expect(readJson(path.join(stageDirectory, "package.json"))).resolves.toEqual({
			name: "pkg",
			version: "1.0.0",
			engines: { node: ">=20" },
		});
	});

	it("replaces a previous stage instead of merging into it", async () => {
		const root = await createBuiltRoot({ name: "pkg", version: "1.0.0" });
		await mkdir(path.join(root, "build", "dist"), { recursive: true });
		await writeFile(path.join(root, "build", "dist", "stale.js"), "", "utf8");

		const stageDirectory = await stagePackage(root);

		expect(await listFiles(stageDirectory)).not.toContain("dist/stale.js");
	});

	it("refuses to stage without a complete build", async () => {
		const root = await createBuiltRoot({ name: "pkg", version: "1.0.0" });
		await rm(path.join(root, "dist", "kitsui.d.ts"));

		await expect(stagePackage(root)).rejects.toThrow("dist/kitsui.d.ts is missing");
		await expect(access(path.join(root, "build"))).rejects.toThrow();
	});

	it("ships every file the project manifest points consumers at", async () => {
		const root = await createBuiltRoot({});
		await copyFile(path.join(projectRoot, "package.json"), path.join(root, "package.json"));

		const stageDirectory = await stagePackage(root);
		const manifest = await readJson(path.join(stageDirectory, "package.json")) as {
			name: string;
			main: string;
			types: string;
			unpkg: string;
			jsdelivr: string;
			exports: Record<string, Record<string, string>>;
		};
		const entryPoints = [
			manifest.main,
			manifest.types,
			manifest.unpkg,
			manifest.jsdelivr,
			...Object.values(manifest.exports).flatMap(conditions => Object.values(conditions)),
		];

		expect(manifest.name).toBe("@inthedark/kitsui");
		for (const entryPoint of entryPoints) {
			await expect(access(path.join(stageDirectory, entryPoint)), entryPoint).resolves.toBeUndefined();
		}
	});
});
