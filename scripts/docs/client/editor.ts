// Client-side Monaco editor initialisation.
// Only runs on pages that contain the editor container element.

import { registerPageCleanup } from "./lifecycle";
import { rewritePreviewModuleImports } from "./preview";

const MONACO_BASE = "./vs";
const MONACO_EDITOR_STYLESHEET = `${MONACO_BASE}/editor/editor.main.css`;
const PLAYGROUND_MODEL_URI = "inmemory://playground/main.ts";
const PLAYGROUND_TYPES_URI = "inmemory://kitsui-types/kitsui.d.ts";

interface Disposable {
	dispose (): void;
}

interface ExamplesManifest {
	examples: string[];
}

interface EditorRuntime {
	cleanupRegistration: () => void;
	editor: Disposable;
	exampleFetchAbort: AbortController | null;
	model: Disposable & {
		setValue (value: string): void;
	};
	panel: HTMLElement | null;
	previewFrame: HTMLIFrameElement | null;
	previewModuleUrl: string | null;
	previewRunId: number;
	runTimeout: ReturnType<typeof setTimeout> | null;
	select: HTMLSelectElement | null;
	selectChangeListener: ((event: Event) => void | Promise<void>) | null;
	themeMediaQuery: MediaQueryList;
	themeMediaQueryListener: ((event: MediaQueryListEvent) => void) | null;
	typesDisposable: Disposable | null;
	updatePreview (): void;
	updatePreviewVersion (): number;
}

let monacoLoadPromise: Promise<typeof import("monaco-editor")> | null = null;
let currentEditorRuntime: EditorRuntime | null = null;
let pendingInitAbortController: AbortController | null = null;

function getAmdRequire (): undefined | (((dependencies: string[], onLoad: (monaco: unknown) => void, onError?: (reason: unknown) => void) => void) & { config?: (config: unknown) => void }) {
	const amdRequire = (window as any).require;
	return typeof amdRequire === "function"
		? amdRequire as ((dependencies: string[], onLoad: (monaco: unknown) => void, onError?: (reason: unknown) => void) => void) & { config?: (config: unknown) => void }
		: undefined;
}

function resolveMonacoFromAmdLoader (resolve: (value: typeof import("monaco-editor")) => void, reject: (reason?: unknown) => void): void {
	const amdRequire = getAmdRequire();
	if (!amdRequire) {
		reject(new Error("Monaco AMD loader did not expose window.require."));
		return;
	}

	amdRequire.config?.({ paths: { vs: MONACO_BASE } });
	amdRequire(["vs/editor/editor.main"], (monaco: unknown) => {
		ensureMonacoStylesheet();
		resolve(monaco as typeof import("monaco-editor"));
	}, reject);
}

function ensureMonacoStylesheet (): void {
	const existingStylesheet = Array.from(document.querySelectorAll("link[rel='stylesheet']"))
		.find((link) => (link as HTMLLinkElement).href.includes("/vs/editor/editor.main.css") || (link as HTMLLinkElement).href.endsWith(MONACO_EDITOR_STYLESHEET.slice(1)));

	if (existingStylesheet) {
		return;
	}

	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = MONACO_EDITOR_STYLESHEET;
	link.setAttribute("data-monaco-editor-styles", "true");
	document.head.appendChild(link);
}

function escapeHtmlAttribute (value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("\"", "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function collectPreviewGlobalMarkup (): string {
	return Array.from(document.head.querySelectorAll("style, link[rel='stylesheet']"))
		.filter((node) => {
			if (node instanceof HTMLLinkElement) {
				return !node.href.includes("/vs/editor/editor.main.css");
			}

			return !(node instanceof HTMLStyleElement && node.classList.contains("monaco-colors"));
		})
		.map((node) => node.outerHTML)
		.join("\n");
}

function reapplyMonacoTheme (
	monaco: typeof import("monaco-editor"),
	preferredTheme: "vs" | "vs-dark",
): void {
	const resetTheme = preferredTheme === "vs-dark" ? "vs" : "vs-dark";
	monaco.editor.setTheme(resetTheme);
	monaco.editor.setTheme(preferredTheme);
}

function clearPreviewFrame (runtime: EditorRuntime): void {
	if (runtime.previewModuleUrl) {
		URL.revokeObjectURL(runtime.previewModuleUrl);
		runtime.previewModuleUrl = null;
	}

	if (runtime.previewFrame) {
		runtime.previewFrame.remove();
		runtime.previewFrame = null;
	}

	if (runtime.panel) {
		runtime.panel.innerHTML = "";
	}
}

function disposeRuntime (): void {
	const runtime = currentEditorRuntime;
	if (!runtime) {
		return;
	}

	currentEditorRuntime = null;
	runtime.cleanupRegistration();
	runtime.exampleFetchAbort?.abort();

	if (runtime.runTimeout !== null) {
		clearTimeout(runtime.runTimeout);
	}

	runtime.select?.removeEventListener("change", runtime.selectChangeListener as EventListener);
	runtime.themeMediaQuery.removeEventListener("change", runtime.themeMediaQueryListener as EventListener);
	clearPreviewFrame(runtime);
	runtime.typesDisposable?.dispose();
	runtime.editor.dispose();
	runtime.model.dispose();
}

function createPreviewFrame (panel: HTMLElement): HTMLIFrameElement {
	const frame = document.createElement("iframe");
	frame.setAttribute("title", "Playground output");
	frame.style.background = "transparent";
	frame.style.border = "0";
	frame.style.display = "block";
	frame.style.minHeight = "320px";
	frame.style.width = "100%";
	return panel.appendChild(frame);
}

function showPreviewErrorInFrame (runtime: EditorRuntime, error: unknown): void {
	if (!runtime.panel) {
		return;
	}

	clearPreviewFrame(runtime);
	const frame = runtime.previewFrame = createPreviewFrame(runtime.panel);
	frame.srcdoc = `<!doctype html>
<html lang="en">
<body style="margin:0; padding:24px; font:13px/1.5 'JetBrains Mono', 'Fira Code', monospace; white-space:pre-wrap; color:#b42318;">${String(error)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")}</body>
</html>`;
}

function mountPreviewFrame (runtime: EditorRuntime, js: string): void {
	if (!runtime.panel) {
		return;
	}

	clearPreviewFrame(runtime);

	const frame = runtime.previewFrame = createPreviewFrame(runtime.panel);
	const moduleUrl = runtime.previewModuleUrl = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
	const previewGlobalMarkup = collectPreviewGlobalMarkup();
	frame.srcdoc = `<!doctype html>
<html lang="en" class="docs-theme">
<head>
	<meta charset="utf-8">
	${previewGlobalMarkup}
	<style>
		html, body { margin: 0; min-height: 100%; }
		body {
			background: var(--bg-page, transparent);
			color: var(--text-primary, inherit);
			min-height: 100vh;
		}
		#preview-root-shell {
			background: var(--bg-page, transparent);
			min-height: 100vh;
		}
		pre {
			color: #b42318;
			font: 13px/1.5 'JetBrains Mono', 'Fira Code', monospace;
			margin: 0;
			white-space: pre-wrap;
		}
	</style>
</head>
<body class="docs-body">
	<div id="preview-root-shell"><div id="preview-root"></div></div>
	<script type="module">
		const root = document.getElementById("preview-root");
		const showError = (error) => {
			root.innerHTML = "";
			const pre = document.createElement("pre");
			pre.textContent = String(error);
			root.appendChild(pre);
		};

		try {
			const mod = await import(${JSON.stringify(moduleUrl)});
			const render = mod.default;
			if (typeof render === "function") {
				const result = render();
				if (result && typeof result === "object" && "element" in result && result.element instanceof HTMLElement) {
					root.appendChild(result.element);
					if (typeof result.remove === "function") {
						window.addEventListener("pagehide", () => result.remove(), { once: true });
					}
				} else if (result instanceof HTMLElement) {
					root.appendChild(result);
				}
			}
		} catch (error) {
			showError(error);
		}
	</script>
</body>
</html>`;
}

export async function loadMonaco (): Promise<typeof import("monaco-editor")> {
	if (monacoLoadPromise) {
		return monacoLoadPromise;
	}

	monacoLoadPromise = new Promise((resolve, reject) => {
		const resetPromise = (error: unknown) => {
			monacoLoadPromise = null;
			reject(error);
		};

		if (getAmdRequire()) {
			resolveMonacoFromAmdLoader(resolve, resetPromise);
			return;
		}

		const existingLoader = document.getElementById("monaco-loader") as HTMLScriptElement | null;
		if (existingLoader) {
			const onLoad = () => resolveMonacoFromAmdLoader(resolve, resetPromise);
			existingLoader.addEventListener("load", onLoad, { once: true });
			existingLoader.addEventListener("error", resetPromise as EventListener, { once: true });
			return;
		}

		const script = document.createElement("script");
		script.id = "monaco-loader";
		script.src = `${MONACO_BASE}/loader.js`;
		script.onload = () => resolveMonacoFromAmdLoader(resolve, resetPromise);
		script.onerror = resetPromise;
		document.head.appendChild(script);
	});

	return monacoLoadPromise;
}

async function fetchExamplesManifest (): Promise<ExamplesManifest> {
	const res = await fetch("examples/examples.json");
	if (!res.ok) throw new Error(`Failed to fetch examples manifest: ${res.status}`);
	return res.json() as Promise<ExamplesManifest>;
}

async function fetchExampleSource (name: string): Promise<string> {
	const res = await fetch(`examples/${name}`);
	if (!res.ok) throw new Error(`Failed to fetch example '${name}': ${res.status}`);
	return res.text();
}

async function fetchKitsuiDeclaration (): Promise<string> {
	const declarationUrl = new URL("kitsui.d.ts", import.meta.url).toString();
	const res = await fetch(declarationUrl);
	if (!res.ok) throw new Error(`Failed to fetch kitsui.d.ts: ${res.status}`);
	return res.text();
}

function setErrorInPanel (panel: HTMLElement, err: unknown): void {
	panel.innerHTML = "";
	const pre = document.createElement("pre");
	pre.style.color = "red";
	pre.style.fontSize = "13px";
	pre.textContent = String(err);
	panel.appendChild(pre);
}

export async function initEditor (): Promise<void> {
	const container = document.getElementById("docs-editor-container");
	if (!container) return;
	disposeRuntime();
	pendingInitAbortController?.abort();

	const initAbortController = new AbortController();
	pendingInitAbortController = initAbortController;
	let unregisterPendingInitCleanup: () => void = () => undefined;
	unregisterPendingInitCleanup = registerPageCleanup(() => {
		initAbortController.abort();
		unregisterPendingInitCleanup();
	});

	const isInitAborted = () => initAbortController.signal.aborted
		|| pendingInitAbortController !== initAbortController
		|| !container.isConnected;

	const resultPanel = document.getElementById("docs-editor-result-panel");
	const select = document.getElementById("docs-editor-example-select") as HTMLSelectElement | null;

	try {
		const [monaco, manifest] = await Promise.all([
			loadMonaco(),
			fetchExamplesManifest(),
		]);

		if (isInitAborted()) {
			return;
		}

		// Populate the dropdown
		if (select) {
			select.innerHTML = "";
			for (const exampleFile of manifest.examples) {
				const option = document.createElement("option");
				option.value = exampleFile;
				option.textContent = exampleFile.replace(/\.ts$/u, "").replace(/-/gu, " ");
				select.appendChild(option);
			}
		}

		// Configure TypeScript compiler options for the editor
		// Monaco's bundled worker provides its own default lib set; overriding `lib`
		// here can suppress those built-ins and break standard DOM/ES diagnostics.
		monaco.typescript.typescriptDefaults.setCompilerOptions({
			experimentalDecorators: false,
			module: monaco.typescript.ModuleKind.ESNext,
			moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
			strict: true,
			target: monaco.typescript.ScriptTarget.ESNext,
		});

		let kitsuiDeclaration = "";
		try {
			kitsuiDeclaration = await fetchKitsuiDeclaration();
		} catch (error) {
			console.warn(error);
			kitsuiDeclaration = "declare module \"kitsui\" {}";
		}

		if (isInitAborted()) {
			return;
		}

		const existingModel = monaco.editor.getModel(monaco.Uri.parse(PLAYGROUND_MODEL_URI));
		existingModel?.dispose();

		const typesDisposable = monaco.typescript.typescriptDefaults.addExtraLib(
			kitsuiDeclaration,
			PLAYGROUND_TYPES_URI,
		);

		// Load the first example as the initial content
		const initialExample = manifest.examples[0] ?? "";
		let initialSource = "";
		if (initialExample) {
			try {
				initialSource = await fetchExampleSource(initialExample);
			} catch {
				initialSource = `// Could not load example "${initialExample}"`;
			}
		}

		if (isInitAborted()) {
			typesDisposable?.dispose();
			return;
		}

		const model = monaco.editor.createModel(
			initialSource,
			"typescript",
			monaco.Uri.parse(PLAYGROUND_MODEL_URI),
		);

		const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "vs";
		const editor = monaco.editor.create(container, {
			automaticLayout: true,
			fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
			fontSize: 13,
			lineNumbers: "on",
			minimap: { enabled: false },
			model,
			scrollBeyondLastLine: false,
			theme: preferredTheme,
		});
		reapplyMonacoTheme(monaco, preferredTheme);

		// Update theme when system preference changes
		const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const themeMediaQueryListener = (e: MediaQueryListEvent) => {
			reapplyMonacoTheme(monaco, e.matches ? "vs-dark" : "vs");
		};
		themeMediaQuery.addEventListener("change", themeMediaQueryListener);

		const runtime: EditorRuntime = {
			cleanupRegistration: () => undefined,
			editor,
			exampleFetchAbort: null,
			model,
			panel: resultPanel,
			previewFrame: null,
			previewModuleUrl: null,
			previewRunId: 0,
			runTimeout: null,
			select,
			selectChangeListener: null,
			themeMediaQuery,
			themeMediaQueryListener,
			typesDisposable: typesDisposable ?? null,
			updatePreview: () => runPreview(monaco, runtime),
			updatePreviewVersion: () => ++runtime.previewRunId,
		};
		runtime.cleanupRegistration = registerPageCleanup(() => {
			if (currentEditorRuntime === runtime) {
				disposeRuntime();
			}
		});
		currentEditorRuntime = runtime;

		// Rerun output when editor content changes (debounced)
		function scheduleRun (): void {
			if (runtime.runTimeout !== null) clearTimeout(runtime.runTimeout);
			runtime.runTimeout = setTimeout(() => {
				runtime.runTimeout = null;
				runtime.updatePreview();
			}, 800);
		}
		const modelChangeDisposable = editor.onDidChangeModelContent(scheduleRun) as Disposable | void;
		if (modelChangeDisposable && typeof modelChangeDisposable.dispose === "function") {
			const originalDispose = runtime.editor.dispose.bind(runtime.editor);
			runtime.editor.dispose = () => {
				modelChangeDisposable.dispose();
				originalDispose();
			};
		}

		// Switch example via dropdown — AbortController prevents stale-fetch race on rapid switching
		if (select) {
			runtime.selectChangeListener = async () => {
				runtime.exampleFetchAbort?.abort();
				runtime.exampleFetchAbort = new AbortController();
				const controller = runtime.exampleFetchAbort;
				try {
					const res = await fetch(`examples/${select.value}`, { signal: controller.signal });
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const src = await res.text();
					if (!controller.signal.aborted) model.setValue(src);
				} catch (err) {
					if (err instanceof DOMException && err.name === "AbortError") return;
					if (!controller.signal.aborted && resultPanel) setErrorInPanel(resultPanel, err);
				}
			};
			select.addEventListener("change", runtime.selectChangeListener);
		}

		// Run initial preview
		runtime.updatePreview();
	} finally {
		if (pendingInitAbortController === initAbortController) {
			pendingInitAbortController = null;
		}

		unregisterPendingInitCleanup();
	}
}

function runPreview (
	monaco: typeof import("monaco-editor"),
	runtime: EditorRuntime,
): void {
	const panel = runtime.panel;
	if (!panel) return;

	const currentRunId = runtime.updatePreviewVersion();
	const uri = monaco.Uri.parse(PLAYGROUND_MODEL_URI);
	const model = monaco.editor.getModel(uri);
	if (!model) {
		clearPreviewFrame(runtime);
		return;
	}

	monaco.typescript.getTypeScriptWorker().then(async (getWorker) => {
		const worker = await getWorker(uri);
		const output = await worker.getEmitOutput(uri.toString());
		if (currentEditorRuntime !== runtime || currentRunId !== runtime.previewRunId) {
			return;
		}

		const jsFile = output.outputFiles.find((f: { name: string }) => f.name.endsWith(".js"));
		if (!jsFile) {
			clearPreviewFrame(runtime);
			return;
		}

		const kitsuiModuleUrl = new URL("kitsui.esm.js", import.meta.url).toString();
		const js = rewritePreviewModuleImports(jsFile.text, kitsuiModuleUrl);

		try {
			if (currentEditorRuntime !== runtime || currentRunId !== runtime.previewRunId) {
				return;
			}

			mountPreviewFrame(runtime, js);
		} catch (err) {
			showPreviewErrorInFrame(runtime, err);
		}
	}).catch((err: unknown) => {
		showPreviewErrorInFrame(runtime, err);
	});
}

initEditor().catch(console.error);
