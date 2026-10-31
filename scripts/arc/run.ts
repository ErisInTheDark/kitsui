// Runs a command against the calling agent's arc view: files other agent threads hold read as this thread's
// baseline has them, for the command and every Node process it starts. Outside agent threads it runs unchanged.
// The command's temp directory is a fresh folder under node_modules/.tmp, deleted when it exits: agent sandboxes
// cannot write the user temp directory, which vitest needs.
//   tsx ./scripts/arc/run.ts <command> [...args]
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { arcTree } from "@inthedark/wb";

const temporaryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", ".tmp");

async function main (args: string[]): Promise<number> {
	const [command, ...commandArgs] = args;
	if (!command) {
		throw new Error("usage: tsx ./scripts/arc/run.ts <command> [...args]");
	}

	const tree = await arcTree({ warn: message => console.warn(message) });
	try {
		const env = await tree.nodeEnvironment();
		await mkdir(temporaryRoot, { recursive: true });
		const temporaryDirectory = await mkdtemp(path.join(temporaryRoot, "arc-run-"));
		// Ctrl+C reaches the child too; stay alive until it exits so the temp directory is still cleaned.
		const ignoreInterrupt = (): void => { };
		process.on("SIGINT", ignoreInterrupt);
		try {
			// Package binaries are .cmd shims on Windows, which only a shell runs.
			const child = spawn(command, commandArgs, {
				env: { ...process.env, ...env, TEMP: temporaryDirectory, TMP: temporaryDirectory, TMPDIR: temporaryDirectory },
				shell: process.platform === "win32",
				stdio: "inherit",
			});
			return await new Promise<number>((resolve, reject) => {
				child.once("error", reject);
				child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
			});
		} finally {
			process.off("SIGINT", ignoreInterrupt);
			await rm(temporaryDirectory, { force: true, recursive: true, maxRetries: 3 });
		}
	} finally {
		await tree.dispose();
	}
}

void main(process.argv.slice(2)).then((code) => {
	process.exitCode = code;
}, (error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
