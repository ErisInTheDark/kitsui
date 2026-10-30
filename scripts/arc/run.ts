// Runs a command against the calling agent's arc view: files other agent threads hold read as this thread's
// baseline has them, for the command and every Node process it starts. Outside agent threads it runs unchanged.
//   tsx ./scripts/arc/run.ts <command> [...args]
import { spawn } from "node:child_process";
import { arcTree } from "@inthedark/wb";

async function main (args: string[]): Promise<number> {
	const [command, ...commandArgs] = args;
	if (!command) {
		throw new Error("usage: tsx ./scripts/arc/run.ts <command> [...args]");
	}

	const tree = await arcTree({ warn: message => console.warn(message) });
	try {
		const env = { ...process.env, ...await tree.nodeEnvironment() };
		// Package binaries are .cmd shims on Windows, which only a shell runs.
		const child = spawn(command, commandArgs, { env, shell: process.platform === "win32", stdio: "inherit" });
		return await new Promise<number>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
		});
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
