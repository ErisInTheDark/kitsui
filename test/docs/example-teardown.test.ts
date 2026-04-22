import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const exampleTempDirectoryPrefix = "kitsui-example-teardown-";
const exampleTempDirectories = new Set<string>();

afterEach(async () => {
	document.body.innerHTML = "";
	await Promise.all(Array.from(exampleTempDirectories, async (directory) => {
		await rm(directory, { force: true, recursive: true });
		exampleTempDirectories.delete(directory);
	}));
});

async function settleExampleLifecycle (): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function expectTeardownToStayQuiet (teardown: () => void): Promise<void> {
	const uncaughtErrors: unknown[] = [];
	const onUncaughtException = (error: unknown) => {
		uncaughtErrors.push(error);
	};
	const onUnhandledRejection = (reason: unknown) => {
		uncaughtErrors.push(reason);
	};

	process.on("uncaughtException", onUncaughtException);
	process.on("unhandledRejection", onUnhandledRejection);

	try {
		expect(teardown, "teardown should not throw synchronously").not.toThrow();
		await settleExampleLifecycle();
	} finally {
		process.off("uncaughtException", onUncaughtException);
		process.off("unhandledRejection", onUnhandledRejection);
	}

	expect(uncaughtErrors, "teardown should not emit deferred runtime errors").toEqual([]);
}

type ExampleRoot = {
	element: HTMLElement;
	remove (): void;
};

type ImportedExampleModule = {
	default: () => ExampleRoot;
	cleanup (): Promise<void>;
};

async function listExampleTempDirectories (): Promise<string[]> {
	const workspaceRoot = process.cwd();
	const tempRoot = join(workspaceRoot, "test", ".tmp");
	let entries: string[];

	try {
		entries = await readdir(tempRoot, "utf8");
	} catch {
		return [];
	}

	return entries
		.filter((entry) => entry.startsWith(exampleTempDirectoryPrefix))
		.map((entry) => join(tempRoot, entry));
}

async function importExampleModule (exampleFileName: string): Promise<ImportedExampleModule> {
	const workspaceRoot = process.cwd();
	const sourcePath = join(workspaceRoot, "scripts", "docs", "examples", exampleFileName);
	const scratchRoot = join(workspaceRoot, "test", ".tmp");
	await mkdir(scratchRoot, { recursive: true });
	const tempRoot = await mkdtemp(join(scratchRoot, exampleTempDirectoryPrefix));
	const tempExamplePath = join(tempRoot, "scripts", "docs", "examples", basename(sourcePath));
	exampleTempDirectories.add(tempRoot);
	await mkdir(dirname(tempExamplePath), { recursive: true });

	const source = await readFile(sourcePath, "utf8");
	const kitsuiImportPath = relative(dirname(tempExamplePath), join(workspaceRoot, "src", "index.ts")).replace(/\\/g, "/");
	const rewrittenSource = source.replace(/from ["']kitsui["']/g, `from "${kitsuiImportPath}"`);

	await writeFile(tempExamplePath, rewrittenSource, "utf8");

	const importedModule = await import(pathToFileURL(tempExamplePath).href) as { default: () => ExampleRoot };
	const cleanup = async (): Promise<void> => {
		await rm(tempRoot, { force: true, recursive: true });
		exampleTempDirectories.delete(tempRoot);
	};

	return {
		...importedModule,
		cleanup,
	};
}

describe("docs example teardown", () => {
	/** Verifies the fishing simulator example can mount and dispose without throwing. */
	it("tears down highly-accurate-fishing-simulator cleanly", async () => {
		const { default: HighlyAccurateFishingSimulator, cleanup } = await importExampleModule("highly-accurate-fishing-simulator.ts");

		try {
			const root = HighlyAccurateFishingSimulator();
			document.body.appendChild(root.element);

			expect(root.element.isConnected, "the fishing simulator example should mount").toBe(true);
			await settleExampleLifecycle();
			await expectTeardownToStayQuiet(() => root.remove());
		} finally {
			await cleanup();
		}
	});

	/** Verifies example imports do not leave behind their temporary workspace directories. */
	it("removes the example import temp directory after loading a module", async () => {
		const leakedBefore = await listExampleTempDirectories();
		await Promise.all(leakedBefore.map((directory) => rm(directory, { force: true, recursive: true })));

		try {
			const importedExample = await importExampleModule("counter.ts");
			await importedExample.cleanup();

			const leakedAfter = await listExampleTempDirectories();
			expect(leakedAfter, "importing an example should not leave behind temp directories in test/.tmp").toEqual([]);
			expect(exampleTempDirectories.size, "cleanup should clear tracked example temp directories").toBe(0);
		} finally {
			const leakedAfter = await listExampleTempDirectories();
			await Promise.all(leakedAfter.map((directory) => rm(directory, { force: true, recursive: true })));
		}
	});

	/** Verifies the mount/dispose example can tear down after its Dispose handler mutates state. */
	it("tears down mount-dispose cleanly", async () => {
		const { default: MountDisposeExample, cleanup } = await importExampleModule("mount-dispose.ts");

		try {
			const root = MountDisposeExample();
			document.body.appendChild(root.element);

			expect(root.element.isConnected, "the mount/dispose example should mount").toBe(true);
			await settleExampleLifecycle();
			await expectTeardownToStayQuiet(() => root.remove());
		} finally {
			await cleanup();
		}
	});
});