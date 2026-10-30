import type { WorkbenchArcTree } from "@inthedark/wb";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * An arc view as another agent thread would leave it: `held` paths (relative to the project root) read as given,
 * `null` meaning absent, everything else from disk. Covers the tree members kitsui's build and typecheck read.
 */
export function heldTree (held: Record<string, string | null>): WorkbenchArcTree {
	const files = new Map(Object.entries(held).map(([relativePath, contents]) => [
		path.join(projectRoot, relativePath),
		contents === null ? null : Buffer.from(contents),
	]));

	const tree = {
		cwd: projectRoot,
		files,
		isEmpty: files.size === 0,
		repositories: [],
		source: "arc",
		async readFile (filePath: string, encoding?: BufferEncoding): Promise<Buffer | string> {
			const absolutePath = path.resolve(projectRoot, filePath);
			const contents = files.has(absolutePath) ? files.get(absolutePath) : await readFile(absolutePath);
			if (!contents) {
				throw Object.assign(new Error(`ENOENT: ${absolutePath}`), { code: "ENOENT" });
			}

			return encoding ? contents.toString(encoding) : contents;
		},
		async dispose (): Promise<void> { },
	};

	return tree as unknown as WorkbenchArcTree;
}

/** A project file with `search` replaced, for building a held variant of it. */
export async function withReplaced (relativePath: string, search: string, replacement: string): Promise<string> {
	const contents = await readFile(path.join(projectRoot, relativePath), "utf8");
	if (!contents.includes(search)) {
		throw new Error(`${relativePath} no longer contains ${JSON.stringify(search)}`);
	}

	return contents.replace(search, replacement);
}

/** A project file with `append` added to its end, for building a held variant of it. */
export async function withAppended (relativePath: string, append: string): Promise<string> {
	return `${await readFile(path.join(projectRoot, relativePath), "utf8")}\n${append}\n`;
}
