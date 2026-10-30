import fs from "node:fs";
import path from "node:path";
import type { WorkbenchArcTree } from "@inthedark/wb";
import { serverFS, type FileSystemCallbacks, type FileSystemEntries } from "typescript-7/fs";

interface DirectoryChildren {
	directories: Set<string>;
	files: Set<string>;
}

const caseInsensitive = process.platform === "win32";

function toKey (filePath: string): string {
	const normalized = path.resolve(filePath).replaceAll("\\", "/");
	return caseInsensitive ? normalized.toLowerCase() : normalized;
}

/**
 * TypeScript API filesystem callbacks for the calling agent's arc view: held files read as the tree has them, and
 * `virtualFiles` (absolute paths) exist only in memory. Everything else is the compiler's own disk access.
 * Writes are refused, so nothing the compiler does can touch disk. `undefined` when there is nothing to overlay.
 */
export default function createArcTreeFileSystem (tree: WorkbenchArcTree, virtualFiles: ReadonlyMap<string, string> = new Map()): FileSystemCallbacks | undefined {
	if (tree.isEmpty && virtualFiles.size === 0) {
		return undefined;
	}

	const overlay = new Map<string, string | null>();
	for (const [filePath, contents] of tree.files) {
		overlay.set(toKey(filePath), contents?.toString("utf8") ?? null);
	}
	for (const [filePath, contents] of virtualFiles) {
		overlay.set(toKey(filePath), contents);
	}

	const presentDirectories = new Set<string>();
	const changedListings = new Map<string, DirectoryChildren>();
	for (const [key, contents] of overlay) {
		let child = key;
		let isFile = true;
		for (let parent = path.posix.dirname(child); parent !== child; child = parent, parent = path.posix.dirname(parent)) {
			const listing = changedListings.get(parent) ?? { directories: new Set(), files: new Set() };
			changedListings.set(parent, listing);
			if (contents === null) {
				break;
			}

			presentDirectories.add(parent);
			(isFile ? listing.files : listing.directories).add(path.posix.basename(child));
			isFile = false;
		}
	}

	const isDecided = (filePath: string) => overlay.has(toKey(filePath)) || presentDirectories.has(toKey(filePath));

	return {
		readFile: fileName => overlay.has(toKey(fileName)) ? overlay.get(toKey(fileName)) ?? undefined : serverFS.useOS,
		fileExists: fileName => overlay.has(toKey(fileName)) ? overlay.get(toKey(fileName)) !== null : serverFS.useOS,
		directoryExists: directoryName => presentDirectories.has(toKey(directoryName)) || serverFS.useOS,
		getAccessibleEntries: directoryName => {
			const listing = changedListings.get(toKey(directoryName));
			return listing ? listEntries(directoryName, listing, overlay) : serverFS.useOS;
		},
		stat: filePath => isDecided(filePath) ? serverFS.fakeStat : serverFS.useOS,
		realpath: filePath => isDecided(filePath) ? serverFS.identity : serverFS.useOS,
		writeFile: serverFS.error,
		removeFile: serverFS.error,
	};
}

/** Disk entries with overlay paths applied: overlay files added, overlay-absent files hidden. */
function listEntries (directoryName: string, listing: DirectoryChildren, overlay: ReadonlyMap<string, string | null>): FileSystemEntries {
	const files = new Set(listing.files);
	const directories = new Set(listing.directories);
	const symlinks = new Set<string>();

	for (const entry of readDirectory(directoryName)) {
		const childPath = path.join(directoryName, entry.name);
		if (overlay.has(toKey(childPath))) {
			continue;
		}

		// TypeScript API filesystem callbacks are synchronous.
		const isDirectory = entry.isSymbolicLink() ? fs.statSync(childPath, { throwIfNoEntry: false })?.isDirectory() : entry.isDirectory();
		(isDirectory ? directories : files).add(entry.name);
		if (entry.isSymbolicLink()) {
			symlinks.add(entry.name);
		}
	}

	return { files: [...files], directories: [...directories], symlinks: symlinks.size ? [...symlinks] : undefined };
}

function readDirectory (directoryName: string): fs.Dirent[] {
	try {
		return fs.readdirSync(directoryName, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}

		throw error;
	}
}
