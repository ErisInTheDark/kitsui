import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildDeclarationBundle } from "./dts";

const execFileAsync = promisify(execFile);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const tsgoBinary = path.join(projectRoot, "node_modules", "@typescript", "native-preview", "bin", "tsgo.js");

export type TypecheckRunner = (project: TypecheckProject, rootDirectory: string) => Promise<void>;

export interface TypecheckProject {
	configPath: string;
	compiler: "tsgo" | "tsgo-bundled-dts";
	description: string;
	required: boolean;
}

function formatTypecheckFailure (error: unknown): string {
	if (!error || typeof error !== "object") {
		return String(error);
	}

	const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
	const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";

	if (stdout || stderr) {
		return [stdout, stderr].filter(Boolean).join("\n\n");
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

async function runTsgoTypecheck (configPath: string, rootDirectory: string, noEmit = true): Promise<void> {
	const args = noEmit ? [tsgoBinary, "--noEmit", "-p", configPath] : [tsgoBinary, "-p", configPath];

	await execFileAsync(process.execPath, args, {
		cwd: rootDirectory,
	});
}

async function runBundledDeclarationTypecheck (rootDirectory: string): Promise<void> {
	const rootBuildTsconfigPath = path.join(rootDirectory, "tsconfig.build.json");
	const probeSourcePath = path.join(rootDirectory, "scripts", "typecheck", "kitsui-dts-check.ts");
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "kitsui-dts-typecheck-"));
	const tempDeclarationDirectory = path.join(tempDirectory, "dist");
	const tempBuildTsconfigPath = path.join(tempDirectory, "tsconfig.build.json");
	const bundleProbePath = path.join(tempDirectory, "kitsui.generated.ts");
	const probePath = path.join(tempDirectory, "kitsui-check.ts");
	const tempTsconfigPath = path.join(tempDirectory, "tsconfig.json");

	try {
		const probeSource = await readFile(probeSourcePath, "utf8");

		await writeFile(tempBuildTsconfigPath, JSON.stringify({
			extends: path.relative(tempDirectory, rootBuildTsconfigPath).replaceAll("\\", "/"),
			compilerOptions: {
				outDir: "./dist",
			},
		}, null, "\t"), "utf8");

		await runTsgoTypecheck(tempBuildTsconfigPath, tempDirectory, false);

		const bundledDeclarationSource = await buildDeclarationBundle({
			log: false,
			sourceDirectory: tempDeclarationDirectory,
		});

		const rootTsconfigRelativePath = path.relative(tempDirectory, path.join(rootDirectory, "tsconfig.json")).replaceAll("\\", "/");

		await Promise.all([
			writeFile(bundleProbePath, bundledDeclarationSource, "utf8"),
			writeFile(probePath, probeSource, "utf8"),
			writeFile(tempTsconfigPath, JSON.stringify({
				extends: rootTsconfigRelativePath,
				compilerOptions: {
					paths: {
						kitsui: ["./kitsui.generated.ts"],
					},
				},
				include: ["./kitsui.generated.ts", "./kitsui-check.ts"],
				exclude: [],
			}, null, "\t"), "utf8"),
		]);

		await runTsgoTypecheck(tempTsconfigPath, tempDirectory);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
}

async function runProjectTypecheck (project: TypecheckProject, rootDirectory: string): Promise<void> {
	if (project.compiler === "tsgo") {
		await runTsgoTypecheck(project.configPath, rootDirectory);
		return;
	}

	await runBundledDeclarationTypecheck(rootDirectory);
}

export async function listTypecheckProjects (rootDirectory = projectRoot): Promise<TypecheckProject[]> {
	const projects: TypecheckProject[] = [
		{
			configPath: path.join(rootDirectory, "tsconfig.json"),
			compiler: "tsgo",
			description: "root project",
			required: true,
		},
		{
			configPath: path.join(rootDirectory, "scripts", "docs", "client", "tsconfig.json"),
			compiler: "tsgo",
			description: "docs client project",
			required: true,
		},
		{
			configPath: path.join(rootDirectory, "scripts", "docs", "examples", "tsconfig.json"),
			compiler: "tsgo",
			description: "docs examples project",
			required: true,
		},
		{
			configPath: path.join(rootDirectory, "tsconfig.kitsui-dts.json"),
			compiler: "tsgo-bundled-dts",
			description: "bundled declaration project",
			required: true,
		},
	];

	return projects;
}

export async function runTypecheckProjects (rootDirectory = projectRoot, runner: TypecheckRunner = runProjectTypecheck): Promise<void> {
	const projects = await listTypecheckProjects(rootDirectory);

	for (const project of projects) {
		const relativeConfigPath = path.relative(rootDirectory, project.configPath);
		console.log(`Typechecking ${project.description} (${relativeConfigPath})`);

		try {
			await runner(project, rootDirectory);
		} catch (error) {
			if (!project.required) {
				console.warn(`Warning: typecheck failed for ${project.description} (${relativeConfigPath}).`);
				console.warn(formatTypecheckFailure(error));
				continue;
			}

			throw new Error(`Typecheck failed for ${project.description} (${relativeConfigPath}).`, {
				cause: error,
			});
		}
	}
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	void runTypecheckProjects().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}