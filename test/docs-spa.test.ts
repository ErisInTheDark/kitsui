import { describe, expect, it, vi } from "vitest";
import { capturePersistentRuntimeNodes, restorePersistentRuntimeNodes, scrollPostNavigate } from "../scripts/docs/client/spa";

function makeHtml (body: string): string {
	return `<!doctype html><html lang="en"><head><title>docs</title></head><body>${body}</body></html>`;
}

describe("docs SPA scrollPostNavigate", () => {
	it("scrolls to top when there is no hash", () => {
		const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

		const result = scrollPostNavigate(new URL("https://kitsui.local/State.html"), document, window);

		expect(result).toBe("top");
		expect(scrollToSpy).toHaveBeenCalledWith({
			behavior: "smooth",
			left: 0,
			top: 0,
		});
	});

	it("scrolls to the target element when a hash is present", () => {
		document.documentElement.innerHTML = makeHtml("<main><section id=\"section-state\">State</section></main>");
		const target = document.getElementById("section-state")!;
		const scrollIntoViewSpy = vi.fn();
		target.scrollIntoView = scrollIntoViewSpy;

		const result = scrollPostNavigate(new URL("https://kitsui.local/State.html#section-state"), document, window);

		expect(result).toBe("hash");
		expect(scrollIntoViewSpy).toHaveBeenCalledWith({
			behavior: "smooth",
			block: "start",
		});
	});

	it("returns none when the hash target does not exist or is malformed", () => {
		document.documentElement.innerHTML = makeHtml("<main><section id=\"section-state\">State</section></main>");

		expect(scrollPostNavigate(new URL("https://kitsui.local/State.html#missing"), document, window)).toBe("none");
		expect(scrollPostNavigate(new URL("https://kitsui.local/State.html#bad%GG"), document, window)).toBe("none");
	});

	it("preserves Monaco runtime styles and aria nodes across page HTML swaps", () => {
		document.documentElement.innerHTML = makeHtml("<div class=\"monaco-aria-container\"></div>");

		const monacoColors = document.createElement("style");
		monacoColors.className = "monaco-colors";
		monacoColors.textContent = ":root { --vscode-editor-background: #fff; }";
		document.head.appendChild(monacoColors);

		const monacoStylesheet = document.createElement("link");
		monacoStylesheet.rel = "stylesheet";
		monacoStylesheet.setAttribute("data-monaco-editor-styles", "true");
		monacoStylesheet.href = "./vs/editor/editor.main.css";
		document.head.appendChild(monacoStylesheet);

		const persistentRuntimeNodes = capturePersistentRuntimeNodes(document);
		document.documentElement.innerHTML = makeHtml("<main>next page</main>");
		restorePersistentRuntimeNodes(persistentRuntimeNodes, document);

		expect(document.head.querySelector("style.monaco-colors")).toBe(monacoColors);
		expect(document.head.querySelector("link[data-monaco-editor-styles='true']")).toBe(monacoStylesheet);
		expect(document.body.querySelector(".monaco-aria-container")).not.toBeNull();
	});
});
