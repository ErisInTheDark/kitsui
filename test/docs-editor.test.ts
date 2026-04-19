import { afterEach, describe, expect, it, vi } from "vitest";
import { rewritePreviewModuleImports } from "../scripts/docs/client/preview";

const KITSUI_MODULE_URL = "https://kitsui.local/docs/kitsui.esm.js";

interface FakeMonacoModel {
	dispose (): void;
	setValue (value: string): void;
	uri: { toString (): string };
	value: string;
}

function makeEditorHtml (): string {
	return [
		'<div class="docs-editor-wrap">',
		'<select id="docs-editor-example-select"></select>',
		'<div id="docs-editor-container"></div>',
		'<div id="docs-editor-result-panel"></div>',
		"</div>",
	].join("");
}

function createFetchResponse (body: string): Response {
	return {
		json: async () => JSON.parse(body) as unknown,
		ok: true,
		text: async () => body,
	} as Response;
}

function installMatchMediaStub (): void {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: vi.fn(() => ({
			addEventListener: vi.fn(),
			matches: false,
			removeEventListener: vi.fn(),
		})),
	});
}

async function flushPromises (): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function installEditorFetchStub (examples: Record<string, string>): void {
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.endsWith("examples/examples.json")) {
			return createFetchResponse(JSON.stringify({ examples: Object.keys(examples) }));
		}

		const exampleName = Object.keys(examples).find((name) => url.endsWith(`examples/${name}`));
		if (exampleName) {
			return createFetchResponse(examples[exampleName]);
		}

		if (url.endsWith("kitsui.d.ts")) {
			return createFetchResponse('declare module "kitsui" {}');
		}

		throw new Error(`Unexpected fetch: ${url}`);
	}));
}

async function importEditorModule () {
	vi.resetModules();
	return import("../scripts/docs/client/editor");
}

function createFakeMonaco () {
	const models = new Map<string, FakeMonacoModel>();

	const monaco = {
		Uri: {
			parse (value: string) {
				return {
					toString () {
						return value;
					},
				};
			},
		},
		editor: {
			create: vi.fn(() => ({
				dispose: vi.fn(),
				onDidChangeModelContent: vi.fn(() => ({
					dispose: vi.fn(),
				})),
			})),
			createModel: vi.fn((value: string, _language: string, uri: { toString (): string }) => {
				const key = uri.toString();
				if (models.has(key)) {
					throw new Error("ModelService: Cannot add model because it already exists!");
				}

				const model: FakeMonacoModel = {
					dispose () {
						models.delete(key);
					},
					setValue (nextValue: string) {
						model.value = nextValue;
					},
					uri,
					value,
				};

				models.set(key, model);
				return model;
			}),
			getModel: vi.fn((uri: { toString (): string }) => models.get(uri.toString()) ?? null),
			setTheme: vi.fn(),
		},
		typescript: {
			ModuleKind: { ESNext: "ESNext" },
			ModuleResolutionKind: { NodeJs: "NodeJs" },
			ScriptTarget: { ESNext: "ESNext" },
			getTypeScriptWorker: vi.fn(async () => async () => ({
				getEmitOutput: async () => ({ outputFiles: [] }),
			})),
			typescriptDefaults: {
				addExtraLib: vi.fn(),
				setCompilerOptions: vi.fn(),
			},
		},
	};

	return { models, monaco };
}

afterEach(() => {
	vi.restoreAllMocks();
	document.head.innerHTML = "";
	document.body.innerHTML = "";
	history.replaceState(null, "", "/docs/playground.html");
	Reflect.deleteProperty(window, "require");
	Reflect.deleteProperty(window, "matchMedia");
	Reflect.deleteProperty(globalThis, "fetch");
});

describe("docs editor preview import rewriting", () => {
	it("rewrites static and side-effect kitsui imports to the absolute docs URL", () => {
		const source = [
			'import { Component } from "kitsui";',
			"import 'kitsui';",
			'export { State } from "kitsui";',
			'import "kitsui";',
		].join("\n");

		const rewritten = rewritePreviewModuleImports(source, KITSUI_MODULE_URL);

		expect(rewritten).toContain(`import { Component } from "${KITSUI_MODULE_URL}";`);
		expect(rewritten).toContain(`import "${KITSUI_MODULE_URL}";`);
		expect(rewritten).toContain(`export { State } from "${KITSUI_MODULE_URL}";`);
		expect(rewritten.match(new RegExp(`import \"${KITSUI_MODULE_URL.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\";`, "gu"))?.length).toBe(2);
	});

	it("rewrites dynamic import and require calls to the absolute docs URL", () => {
		const source = [
			'const dynamicModule = import("kitsui");',
			'const requiredModule = require("kitsui");',
			"const requiredModuleSingle = require('kitsui');",
		].join("\n");

		const rewritten = rewritePreviewModuleImports(source, KITSUI_MODULE_URL);

		expect(rewritten).toContain(`const dynamicModule = import("${KITSUI_MODULE_URL}");`);
		expect(rewritten).toContain(`const requiredModule = require("${KITSUI_MODULE_URL}");`);
		expect(rewritten).toContain(`const requiredModuleSingle = require("${KITSUI_MODULE_URL}");`);
	});

	it("does not rewrite kitsui text inside ordinary strings or comments", () => {
		const source = [
			'const code = "import { Component } from \\\"kitsui\\\"";',
			"const label = 'kitsui';",
			'const pattern = /import\\(\"kitsui\"\\)/u;',
			'// import("kitsui") should stay untouched in comments',
			'/* require("kitsui") should stay untouched in block comments */',
		].join("\n");

		const rewritten = rewritePreviewModuleImports(source, KITSUI_MODULE_URL);

		expect(rewritten).toContain('const code = "import { Component } from \\\"kitsui\\\"";');
		expect(rewritten).toContain("const label = 'kitsui';");
		expect(rewritten).toContain('const pattern = /import\\(\"kitsui\"\\)/u;');
		expect(rewritten).toContain('// import("kitsui") should stay untouched in comments');
		expect(rewritten).toContain('/* require("kitsui") should stay untouched in block comments */');
		expect(rewritten.includes(KITSUI_MODULE_URL)).toBe(false);
	});

	it("reuses the existing AMD loader global instead of injecting loader.js again", async () => {
		const { monaco } = createFakeMonaco();
		const { loadMonaco } = await importEditorModule();

		(window as any).require = Object.assign(
			(dependencies: string[], onLoad: (monacoModule: unknown) => void) => {
				expect(dependencies).toEqual(["vs/editor/editor.main"]);
				onLoad(monaco);
			},
			{ config: vi.fn() },
		);

		await expect(loadMonaco()).resolves.toBe(monaco);
		expect(document.getElementById("monaco-loader")).toBeNull();
		expect(document.querySelector("link[data-monaco-editor-styles='true']")).not.toBeNull();
	});

	it("can initialize the playground twice in the same document without creating a duplicate Monaco model", async () => {
		const { initEditor } = await importEditorModule();
		document.body.innerHTML = makeEditorHtml();
		installMatchMediaStub();

		const { monaco } = createFakeMonaco();
		const loader = document.createElement("script");
		loader.id = "monaco-loader";
		document.head.appendChild(loader);

		(window as any).require = Object.assign(
			(_dependencies: string[], onLoad: (monacoModule: unknown) => void) => {
				onLoad(monaco);
			},
			{ config: vi.fn() },
		);

		installEditorFetchStub({
			"hello-world.ts": "export default function () { return document.createElement('div'); }",
		});

		await expect(initEditor()).resolves.toBeUndefined();
		expect(monaco.editor.createModel).toHaveBeenCalledTimes(1);
		await expect(initEditor()).resolves.toBeUndefined();
		expect(monaco.editor.createModel).toHaveBeenCalledTimes(2);
	});

	it("cancels a pending editor bootstrap when page cleanup runs during async startup", async () => {
		const [{ initEditor }, { runPageCleanup }] = await Promise.all([
			importEditorModule(),
			import("../scripts/docs/client/lifecycle"),
		]);
		document.body.innerHTML = makeEditorHtml();
		installMatchMediaStub();

		const { monaco } = createFakeMonaco();
		const loader = document.createElement("script");
		loader.id = "monaco-loader";
		document.head.appendChild(loader);

		installEditorFetchStub({
			"hello-world.ts": "export default function () { return document.createElement('div'); }",
		});

		const initPromise = initEditor();
		runPageCleanup();

		(window as any).require = Object.assign(
			(_dependencies: string[], onLoad: (monacoModule: unknown) => void) => {
				onLoad(monaco);
			},
			{ config: vi.fn() },
		);
		loader.dispatchEvent(new Event("load"));

		await expect(initPromise).resolves.toBeUndefined();
		expect(monaco.editor.createModel).not.toHaveBeenCalled();
	});

	it("restores the selected example from the URL search params on init", async () => {
		history.replaceState(null, "", "/docs/playground.html?example=second.ts");
		const { initEditor } = await importEditorModule();
		document.body.innerHTML = makeEditorHtml();
		installMatchMediaStub();

		const { models, monaco } = createFakeMonaco();
		const loader = document.createElement("script");
		loader.id = "monaco-loader";
		document.head.appendChild(loader);

		(window as any).require = Object.assign(
			(_dependencies: string[], onLoad: (monacoModule: unknown) => void) => {
				onLoad(monaco);
			},
			{ config: vi.fn() },
		);

		installEditorFetchStub({
			"first.ts": "export default function first () {}",
			"second.ts": "export default function second () {}",
		});

		await expect(initEditor()).resolves.toBeUndefined();

		const select = document.getElementById("docs-editor-example-select") as HTMLSelectElement;
		expect(select.value).toBe("second.ts");
		expect(models.get("inmemory://playground/main.ts")?.value).toContain("function second");
	});

	it("replaces an invalid example param with the loaded fallback on init", async () => {
		history.replaceState(null, "", "/docs/playground.html?debug=true&example=missing.ts#preview");
		const { initEditor } = await importEditorModule();
		document.body.innerHTML = makeEditorHtml();
		installMatchMediaStub();

		const { models, monaco } = createFakeMonaco();
		const loader = document.createElement("script");
		loader.id = "monaco-loader";
		document.head.appendChild(loader);

		(window as any).require = Object.assign(
			(_dependencies: string[], onLoad: (monacoModule: unknown) => void) => {
				onLoad(monaco);
			},
			{ config: vi.fn() },
		);

		installEditorFetchStub({
			"first.ts": "export default function first () {}",
			"second.ts": "export default function second () {}",
		});

		await expect(initEditor()).resolves.toBeUndefined();

		const url = new URL(window.location.href);
		expect(url.searchParams.get("debug")).toBe("true");
		expect(url.searchParams.get("example")).toBe("first.ts");
		expect(url.hash).toBe("#preview");
		expect(models.get("inmemory://playground/main.ts")?.value).toContain("function first");
	});

	it("updates the URL search params when switching examples", async () => {
		history.replaceState(null, "", "/docs/playground.html?debug=true#preview");
		const { initEditor } = await importEditorModule();
		document.body.innerHTML = makeEditorHtml();
		installMatchMediaStub();

		const { models, monaco } = createFakeMonaco();
		const loader = document.createElement("script");
		loader.id = "monaco-loader";
		document.head.appendChild(loader);

		(window as any).require = Object.assign(
			(_dependencies: string[], onLoad: (monacoModule: unknown) => void) => {
				onLoad(monaco);
			},
			{ config: vi.fn() },
		);

		installEditorFetchStub({
			"first.ts": "export default function first () {}",
			"second.ts": "export default function second () {}",
		});

		await expect(initEditor()).resolves.toBeUndefined();

		const select = document.getElementById("docs-editor-example-select") as HTMLSelectElement;
		select.value = "second.ts";
		select.dispatchEvent(new Event("change"));
		await flushPromises();

		const url = new URL(window.location.href);
		expect(url.searchParams.get("debug")).toBe("true");
		expect(url.searchParams.get("example")).toBe("second.ts");
		expect(url.hash).toBe("#preview");
		expect(models.get("inmemory://playground/main.ts")?.value).toContain("function second");
	});
});