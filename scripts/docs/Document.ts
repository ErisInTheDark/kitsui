import { Window } from "happy-dom";
import { JSONOutput } from "typedoc";
import { Component, pseudoAfter, pseudoBefore, Style, StyleImport, StyleReset, StyleSelector } from "../../src";
import { mountStylesheet, unmountStylesheet } from "../../src/component/Style";
import { setExtraTypeDeclarationLinks, setTypeDeclarationLinks, setTypeNameAliases } from "./components/Type";

export interface DocumentComponent extends Component {
	setTitle (title: string): void;
}

export interface DocumentExtraLinks {
	declarationLinks: Map<string, string>;
	declarationLinksById: Map<number, string>;
}

export type DocumentBuilder<TData = unknown> = (path: string, data: TData) => Promise<string>;
export type DocumentBuilderWithExtras<TData = unknown> = (path: string, data: TData, extraLinks?: DocumentExtraLinks, cacheBust?: boolean) => Promise<string>;

function install (path: string): { document: Document; restore: () => void; clearPendingTimers: () => void } { 
	const window = new Window({
		url: `https://kitsui.local/${path}`,
	});

	const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;

	const trackedSetTimeout = ((...args: Parameters<typeof setTimeout>) => {
		const id = originalSetTimeout(...args);
		pendingTimers.add(id);
		return id;
	}) as typeof setTimeout;

	const trackedClearTimeout = ((id: ReturnType<typeof setTimeout>) => {
		pendingTimers.delete(id);
		originalClearTimeout(id);
	}) as typeof clearTimeout;
	
	const globals: Record<string, unknown> = {
		window,
		document: window.document,
		Document: window.Document,
		Node: window.Node,
		Element: window.Element,
		HTMLElement: window.HTMLElement,
		HTMLStyleElement: window.HTMLStyleElement,
		Text: window.Text,
		Comment: window.Comment,
		DocumentFragment: window.DocumentFragment,
		Event: window.Event,
		EventTarget: window.EventTarget,
		CustomEvent: window.CustomEvent,
		MutationObserver: window.MutationObserver,
		navigator: window.navigator,
		location: window.location,
		getComputedStyle: window.getComputedStyle.bind(window),
		requestAnimationFrame: window.requestAnimationFrame.bind(window),
		cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
		setTimeout: trackedSetTimeout,
		clearTimeout: trackedClearTimeout,
	};
	const previousGlobals = new Map<string, PropertyDescriptor | undefined>();

	for (const [key, value] of Object.entries(globals)) {
		previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		Object.defineProperty(globalThis, key, {
			configurable: true,
			value,
			writable: true,
		});
	}
	
	document.documentElement.lang = "en";

	Component("meta").attribute.set("charset", "utf-8").appendTo(document.head);
	Component("meta")
		.attribute.set("name", "viewport")
		.attribute.set("content", "width=device-width, initial-scale=1")
		.appendTo(document.head);

	return {
		document,
		clearPendingTimers () {
			for (const id of pendingTimers) {
				originalClearTimeout(id);
			}
			pendingTimers.clear();
		},
		restore () {
			for (const [key, descriptor] of previousGlobals) {
				if (descriptor) {
					Object.defineProperty(globalThis, key, descriptor);
					continue;
				}

				Reflect.deleteProperty(globalThis, key);
			}
		},
	};
}

export default function Document (builder: (doc: DocumentComponent, project: JSONOutput.ProjectReflection, path: string) => unknown | Promise<unknown>): DocumentBuilderWithExtras<JSONOutput.ProjectReflection> {
	return async (path: string, project: JSONOutput.ProjectReflection, extraLinks?: DocumentExtraLinks, cacheBust = false) => { 
		const { document, restore, clearPendingTimers } = install(path);

		try {
			setTypeNameAliases(new Map());
			setTypeDeclarationLinks(new Map(), new Map());
			setExtraTypeDeclarationLinks(extraLinks?.declarationLinks ?? new Map(), extraLinks?.declarationLinksById ?? new Map());

			const bodyStyle = Style.Class("docs-body", { margin: "0" });

			mountStylesheet();

			StyleImport("https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap")
				.appendTo(document.head);
			StyleImport("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap")
				.appendTo(document.head);

			StyleReset({
				boxSizing: "border-box",
				margin: "0",
				padding: "0",
				...pseudoBefore({ boxSizing: "border-box" }),
				...pseudoAfter({ boxSizing: "border-box" }),
			}).appendTo(document.head);

			StyleSelector("::view-transition-old(root)", {
				animationName: "none",
				opacity: 1,
			}).appendTo(document.head);
			StyleSelector("::view-transition-group(root)", {
				animationName: "none",
			}).appendTo(document.head);
			StyleSelector("::view-transition-new(root)", {
				animationName: "none",
				opacity: 1,
			}).appendTo(document.head);

			StyleSelector("::view-transition-group(docs-header)", {
				animationDuration: "0.2s",
				animationTimingFunction: "ease-out",
			}).appendTo(document.head);
			StyleSelector("::view-transition-old(docs-header)", {
				opacity: 0.9,
			}).appendTo(document.head);
			StyleSelector("::view-transition-new(docs-header)", {
				opacity: 1,
			}).appendTo(document.head);

			StyleSelector("::view-transition-group(docs-main)", {
				animationDuration: "0.24s",
				animationTimingFunction: "ease-out",
			}).appendTo(document.head);
			StyleSelector("::view-transition-old(docs-main)", {
				opacity: 0.85,
			}).appendTo(document.head);
			StyleSelector("::view-transition-new(docs-main)", {
				opacity: 1,
			}).appendTo(document.head);

			Component(document.body).class.add(bodyStyle);

			const root = Component(document.documentElement);
			const doc = Object.assign(root, {
				setTitle (title: string) {
					Component("title").text.set(title).appendTo(document.head);
				},
			}) as DocumentComponent;

			const output = await builder(doc, project, path);
			if (output instanceof Component) {
				output.appendTo(document.body);
			}

			const cacheBustParam = cacheBust ? `?cacheBust=${Date.now()}` : "";

			// Add client-side JS bundle
			Component("script")
				.attribute.set("type", "module")
				.attribute.set("src", `kitsui.esm.js${cacheBustParam}`)
				.appendTo(document.body);
			Component("script")
				.attribute.set("type", "module")
				.attribute.set("src", `client.js${cacheBustParam}`)
				.appendTo(document.body);

			return `<!doctype html>\n${document.documentElement.outerHTML.replaceAll("data-kitsui-styles=\"true\"", "")}`;
		} finally {
			clearPendingTimers();
			unmountStylesheet();
			restore();
		}
	};
}
