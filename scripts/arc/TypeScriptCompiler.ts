import path from "node:path";
import type { WorkbenchArcTree } from "@inthedark/wb";
import { API, formatDiagnosticsWithColorAndContext, type Diagnostic, type Program, type RawCompilerOptions } from "typescript-7/async";
import createArcTreeFileSystem from "./ArcTreeFileSystem";

export interface CompileResult {
	diagnostics: readonly Diagnostic[];
	/** Pretty-printed diagnostics, empty when there are none. */
	output: string;
}

export interface ProgramSource {
	/** tsconfig whose files and options define the program. */
	configPath: string;
	/** Replaces the config's root files. */
	rootFiles?: readonly string[];
	/** Merged over the config's compiler options. */
	options?: RawCompilerOptions;
}

/**
 * The TypeScript 7 compiler run in process against the calling agent's arc view, plus any in-memory `virtualFiles`.
 * Checks and emits never write to disk.
 */
export default class TypeScriptCompiler implements AsyncDisposable {
	private constructor (private readonly api: API) { }

	static open (cwd: string, tree: WorkbenchArcTree, virtualFiles?: ReadonlyMap<string, string>): TypeScriptCompiler {
		return new TypeScriptCompiler(new API({ cwd, fs: createArcTreeFileSystem(tree, virtualFiles) }));
	}

	/** Type-checks a program the way `tsc --noEmit -p` would. */
	async check (source: ProgramSource): Promise<CompileResult> {
		// noEmit also skips emit-only option checks (like rootDir containment), exactly as `tsc --noEmit` does.
		return this.withProgram({ ...source, options: { ...source.options, noEmit: true } }, async (program, configErrors) => this.result([
			...configErrors,
			...await program.getProgramDiagnostics(),
			...await program.getSyntacticDiagnostics(),
			...await program.getGlobalDiagnostics(),
			...await program.getSemanticDiagnostics(),
		]));
	}

	/**
	 * Emits a program's declarations in memory.
	 * @returns emitted files keyed by path relative to the program's `outDir`.
	 */
	async emitDeclarations (source: ProgramSource): Promise<CompileResult & { files: Map<string, string> }> {
		return this.withProgram(source, async (program, configErrors, outDir) => {
			const emitted = await program.emitToString();
			const files = new Map<string, string>();
			for (const [fileName, file] of emitted.outputFiles) {
				files.set(path.relative(outDir, fileName).replaceAll("\\", "/"), file.text);
			}

			return {
				...this.result([...configErrors, ...await program.getDeclarationDiagnostics(), ...emitted.diagnostics]),
				files,
			};
		});
	}

	async [Symbol.asyncDispose] (): Promise<void> {
		await this.api.close();
	}

	private async withProgram<T> (source: ProgramSource, use: (program: Program, configErrors: readonly Diagnostic[], outDir: string) => Promise<T>): Promise<T> {
		const parsed = await this.api.parseConfigFile(source.configPath);
		const options = { ...parsed.options, ...source.options } as RawCompilerOptions;
		const program = await this.api.createProgram(source.rootFiles ?? parsed.fileNames, options);
		try {
			const outDir = typeof options.outDir === "string" ? options.outDir : path.dirname(source.configPath);
			return await use(program, parsed.errors ?? [], outDir);
		} finally {
			await program.dispose();
		}
	}

	private result (diagnostics: readonly Diagnostic[]): CompileResult {
		return {
			diagnostics,
			output: diagnostics.length ? formatDiagnosticsWithColorAndContext(diagnostics, this.api) : "",
		};
	}
}
