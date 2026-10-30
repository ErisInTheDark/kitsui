import { Window } from "happy-dom";

/** Installs a happy-dom window as the global DOM, matching the globals kitsui and the test environment rely on. */
export function installDOM (): Window {
	const window = new Window({ url: "https://kitsui.bench/" });
	Object.assign(globalThis, {
		Comment: window.Comment,
		CustomEvent: window.CustomEvent,
		Document: window.Document,
		DocumentFragment: window.DocumentFragment,
		DOMException: window.DOMException,
		Element: window.Element,
		Event: window.Event,
		EventTarget: window.EventTarget,
		HTMLElement: window.HTMLElement,
		HTMLStyleElement: window.HTMLStyleElement,
		HTMLTemplateElement: window.HTMLTemplateElement,
		MouseEvent: window.MouseEvent,
		MutationObserver: window.MutationObserver,
		Node: window.Node,
		PointerEvent: window.PointerEvent,
		ShadowRoot: window.ShadowRoot,
		Text: window.Text,
		document: window.document,
		window,
	});
	return window;
}
