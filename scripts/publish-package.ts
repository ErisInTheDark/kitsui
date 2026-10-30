// Prepares and publishes the npm package.
//   --prepare-version [--version <x.y.z>]  bump (or set) package.json's version; prints it
//   --stage                                build, then write the publishable package to build/
//   --publish --version <x.y.z>            check the committed version, stage, then pnpm publish build/
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProject } from "./build";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface PackageManifest {
	[field: string]: JsonValue;
	name: string;
	version: string;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stageDirectoryName = "build";
const shippedDistFiles = ["kitsui.umd.js", "kitsui.umd.js.map", "kitsui.esm.js", "kitsui.esm.js.map", "kitsui.d.ts"];
const shippedRootFiles = ["README.md", "LICENSE"];
const devOnlyManifestFields = ["devDependencies", "devEngines", "packageManager", "pnpm", "scripts"];
const usage = "usage: see the header of scripts/publish-package.ts";

function parseStableVersion (value: string): [number, number, number] {
	const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(value);
	if (!match) {
		throw new Error(`Version must be major.minor.patch; got ${JSON.stringify(value)}.`);
	}

	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

async function readManifest (rootDirectory: string): Promise<PackageManifest> {
	return JSON.parse(await readFile(path.join(rootDirectory, "package.json"), "utf8")) as PackageManifest;
}

async function writeManifest (directory: string, manifest: PackageManifest): Promise<void> {
	await writeFile(path.join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function prepareVersion (rootDirectory = projectRoot, requested?: string): Promise<string> {
	const manifest = await readManifest(rootDirectory);
	const [major, minor, patch] = parseStableVersion(manifest.version);
	const version = requested ?? `${major}.${minor}.${patch + 1}`;
	parseStableVersion(version);

	if (version !== manifest.version) {
		await writeManifest(rootDirectory, { ...manifest, version });
	}

	return version;
}

export async function assertCommittedVersion (expected: string, rootDirectory = projectRoot): Promise<void> {
	const committed = (await readManifest(rootDirectory)).version;
	if (committed !== expected) {
		throw new Error(`Expected version ${expected}, package.json has ${committed}.`);
	}
}

/** Writes the publishable package from an existing build; returns the stage directory. */
export async function stagePackage (rootDirectory = projectRoot): Promise<string> {
	const distDirectory = path.join(rootDirectory, "dist");
	const stageDirectory = path.join(rootDirectory, stageDirectoryName);

	for (const file of shippedDistFiles) {
		await access(path.join(distDirectory, file)).catch((error: unknown) => {
			throw new Error(`dist/${file} is missing; run the build first.`, { cause: error });
		});
	}

	const manifest = await readManifest(rootDirectory);
	for (const field of devOnlyManifestFields) {
		delete manifest[field];
	}

	await rm(stageDirectory, { force: true, recursive: true });
	await mkdir(path.join(stageDirectory, "dist"), { recursive: true });
	await Promise.all([
		...shippedDistFiles.map(file => copyFile(path.join(distDirectory, file), path.join(stageDirectory, "dist", file))),
		...shippedRootFiles.map(file => copyFile(path.join(rootDirectory, file), path.join(stageDirectory, file))),
		writeManifest(stageDirectory, manifest),
	]);

	return stageDirectory;
}

function pnpm (args: string[]): void {
	// pnpm is a .cmd shim on Windows, which only a shell runs.
	const result = process.platform === "win32"
		? spawnSync(["pnpm", ...args.map(arg => `"${arg}"`)].join(" "), { cwd: projectRoot, shell: true, stdio: "inherit" })
		: spawnSync("pnpm", args, { cwd: projectRoot, stdio: "inherit" });

	if (result.status !== 0) {
		throw new Error(`pnpm ${args.join(" ")} failed`);
	}
}

async function main (args: string[]): Promise<void> {
	const [mode, flag, value] = args;
	if (args.length > 3 || (flag !== undefined && (flag !== "--version" || !value))) {
		throw new Error(usage);
	}

	if (mode === "--prepare-version") {
		process.stdout.write(`${await prepareVersion(projectRoot, value)}\n`);
	} else if (mode === "--stage" && flag === undefined) {
		await buildProject();
		await stagePackage();
	} else if (mode === "--publish" && value) {
		await assertCommittedVersion(value);
		await buildProject();
		pnpm(["publish", await stagePackage(), "--provenance", "--no-git-checks"]);
	} else {
		throw new Error(usage);
	}
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	void main(process.argv.slice(2)).catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	});
}
