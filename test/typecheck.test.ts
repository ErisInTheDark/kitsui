import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listTypecheckProjects, runTypecheckProjects } from "../scripts/typecheck";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const packageJsonPath = path.join(projectRoot, "package.json");
const docsClientTsconfigPath = path.join(projectRoot, "scripts", "docs", "client", "tsconfig.json");
const tempDirectories: string[] = [];

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(tempDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })));
});

describe("typecheck configuration", () => {
	it("routes the package typecheck script through the dedicated driver", async () => {
		const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
			scripts?: Record<string, string>;
		};

		expect(packageJson.scripts?.typecheck).toBe("tsx ./scripts/typecheck.ts");
	});

	it("points the docs client project at source types instead of dist declarations", async () => {
		const docsClientTsconfig = await readFile(docsClientTsconfigPath, "utf8");

		expect(docsClientTsconfig).toMatch(/"kitsui"\s*:\s*\["\.\.\/\.\.\/\.\.\/src\/index\.ts"\]/u);
	});

	it("always includes bundled declaration validation", async () => {
		const tempRoot = await mkdtemp(path.join(os.tmpdir(), "kitsui-typecheck-test-"));
		tempDirectories.push(tempRoot);

		await mkdir(path.join(tempRoot, "scripts", "docs", "examples"), { recursive: true });
		await mkdir(path.join(tempRoot, "scripts", "docs", "client"), { recursive: true });
		await writeFile(path.join(tempRoot, "tsconfig.json"), "{}", "utf8");
		await writeFile(path.join(tempRoot, "scripts", "docs", "client", "tsconfig.json"), "{}", "utf8");
		await writeFile(path.join(tempRoot, "scripts", "docs", "examples", "tsconfig.json"), "{}", "utf8");
		await writeFile(path.join(tempRoot, "tsconfig.kitsui-dts.json"), "{}", "utf8");

		const projects = await listTypecheckProjects(tempRoot);
		expect(projects.map((project: { configPath: string }) => path.relative(tempRoot, project.configPath).replaceAll("\\", "/"))).toEqual([
			"tsconfig.json",
			"scripts/docs/client/tsconfig.json",
			"scripts/docs/examples/tsconfig.json",
			"tsconfig.kitsui-dts.json",
		]);
	});

	it("fails when the bundled declaration project fails", async () => {
		const tempRoot = await mkdtemp(path.join(os.tmpdir(), "kitsui-typecheck-runner-test-"));
		tempDirectories.push(tempRoot);

		await mkdir(path.join(tempRoot, "scripts", "docs", "examples"), { recursive: true });
		await mkdir(path.join(tempRoot, "scripts", "docs", "client"), { recursive: true });
		await mkdir(path.join(tempRoot, "dist"), { recursive: true });
		await writeFile(path.join(tempRoot, "tsconfig.json"), "{}", "utf8");
		await writeFile(path.join(tempRoot, "scripts", "docs", "client", "tsconfig.json"), "{}", "utf8");
		await writeFile(path.join(tempRoot, "scripts", "docs", "examples", "tsconfig.json"), "{}", "utf8");
		await writeFile(path.join(tempRoot, "tsconfig.kitsui-dts.json"), "{}", "utf8");
		await writeFile(path.join(tempRoot, "dist", "kitsui.d.ts"), 'declare module "kitsui" {}\n', "utf8");

		const calls: string[] = [];

		await expect(runTypecheckProjects(tempRoot, async (project) => {
			calls.push(path.relative(tempRoot, project.configPath).replaceAll("\\", "/"));
			if (project.configPath.endsWith("tsconfig.kitsui-dts.json")) {
				throw new Error("broken bundle");
			}
		})).rejects.toThrow("Typecheck failed for bundled declaration project");

		expect(calls).toEqual([
			"tsconfig.json",
			"scripts/docs/client/tsconfig.json",
			"scripts/docs/examples/tsconfig.json",
			"tsconfig.kitsui-dts.json",
		]);
	});

	it("fails when a required typecheck project fails", async () => {
		const tempRoot = await mkdtemp(path.join(os.tmpdir(), "kitsui-typecheck-required-test-"));
		tempDirectories.push(tempRoot);

		await mkdir(path.join(tempRoot, "scripts", "docs", "client"), { recursive: true });
		await writeFile(path.join(tempRoot, "tsconfig.json"), "{}", "utf8");
		await writeFile(path.join(tempRoot, "scripts", "docs", "client", "tsconfig.json"), "{}", "utf8");

		await expect(runTypecheckProjects(tempRoot, async (project) => {
			if (project.configPath.endsWith(path.join("scripts", "docs", "client", "tsconfig.json"))) {
				throw new Error("docs client broken");
			}
		})).rejects.toThrow("Typecheck failed for docs client project");
	});
});