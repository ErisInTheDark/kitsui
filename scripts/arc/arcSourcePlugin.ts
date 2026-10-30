import path from "node:path";
import type { WorkbenchArcTree } from "@inthedark/wb";
import type { Loader, Plugin } from "esbuild";

const caseInsensitive = process.platform === "win32";

function toKey (filePath: string): string {
	const resolved = path.resolve(filePath);
	return caseInsensitive ? resolved.toLowerCase() : resolved;
}

const loaders: Record<string, Loader> = {
	".js": "js",
	".json": "json",
	".mjs": "js",
	".ts": "ts",
	".tsx": "tsx",
};

/**
 * Makes esbuild (which reads disk itself) see the calling agent's arc view: held files load from the tree, files the
 * view lacks fail to load. Files only the view has are not resolvable, as esbuild resolves against disk.
 */
export default function arcSourcePlugin (tree: WorkbenchArcTree): Plugin {
	const held = new Map([...tree.files].map(([filePath, contents]) => [toKey(filePath), contents]));

	return {
		name: "arc-source",
		setup (build) {
			if (held.size === 0) {
				return;
			}

			build.onLoad({ filter: /.*/ }, (args) => {
				const key = toKey(args.path);
				if (!held.has(key)) {
					return undefined;
				}

				const contents = held.get(key);
				return contents === null || contents === undefined
					? { errors: [{ text: `"${args.path}" is absent in this thread's view of the workspace` }] }
					: { contents, loader: loaders[path.extname(args.path)] ?? "default" };
			});
		},
	};
}
