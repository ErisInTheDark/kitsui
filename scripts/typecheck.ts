import { arcTree, type WorkbenchArcTree } from "@inthedark/wb";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TypeScriptCompiler, { type CompileResult } from "./arc/TypeScriptCompiler";
import { bundleDeclarations } from "./dts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const rootConfig = path.join(projectRoot, "tsconfig.json");
const buildConfig = path.join(projectRoot, "tsconfig.build.json");
const declarationProbe = path.join(projectRoot, "scripts", "typecheck", "kitsui-dts-check.ts");
/** Exists only in memory: the published declaration bundle, as consumers import it. */
const generatedBundle = path.join(projectRoot, "scripts", "typecheck", "kitsui.generated.ts");

type ProjectCheck = (compiler: TypeScriptCompiler, tree: WorkbenchArcTree) => Promise<CompileResult>;

const projects: Record<string, ProjectCheck> = {
	"root": compiler => compiler.check({ configPath: rootConfig }),
	"docs client": compiler => compiler.check({ configPath: path.join(projectRoot, "scripts", "docs", "client", "tsconfig.json") }),
	"docs examples": compiler => compiler.check({ configPath: path.join(projectRoot, "scripts", "docs", "examples", "tsconfig.json") }),
	"bundled declarations": checkBundledDeclarations,
};

export type TypecheckProjectName = keyof typeof projects;

export interface TypecheckResult extends CompileResult {
	project: string;
}

/** Emits declarations in memory, bundles them as published, and checks the consumer probe against that bundle. */
async function checkBundledDeclarations (compiler: TypeScriptCompiler, tree: WorkbenchArcTree): Promise<CompileResult> {
	const emitted = await compiler.emitDeclarations({ configPath: buildConfig });
	if (emitted.diagnostics.length) {
		return emitted;
	}

	await using probeCompiler = TypeScriptCompiler.open(projectRoot, tree, new Map([[generatedBundle, bundleDeclarations(emitted.files)]]));
	return await probeCompiler.check({
		configPath: rootConfig,
		options: { paths: { "@inthedark/kitsui": [generatedBundle] } },
		rootFiles: [generatedBundle, declarationProbe],
	});
}

/** Typechecks every project (or `only` these) against `tree`, the calling agent's arc view by default. Never writes to disk. */
export async function runTypecheck (options: { tree?: WorkbenchArcTree; only?: readonly TypecheckProjectName[] } = {}): Promise<TypecheckResult[]> {
	const tree = options.tree ?? await arcTree({ cwd: projectRoot, warn: message => console.warn(message) });
	try {
		await using compiler = TypeScriptCompiler.open(projectRoot, tree);
		const results: TypecheckResult[] = [];
		for (const project of options.only ?? Object.keys(projects)) {
			results.push({ project, ...await projects[project](compiler, tree) });
		}

		return results;
	} finally {
		if (!options.tree) {
			await tree.dispose();
		}
	}
}

async function main (): Promise<void> {
	let failed = false;
	for (const result of await runTypecheck()) {
		console.log(`Typechecked ${result.project}: ${result.diagnostics.length ? `${result.diagnostics.length} error(s)` : "ok"}`);
		if (result.diagnostics.length) {
			failed = true;
			process.stdout.write(result.output);
		}
	}

	if (failed) {
		process.exitCode = 1;
	}
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
	void main().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
