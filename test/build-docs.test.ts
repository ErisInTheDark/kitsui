import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDocsSite } from "../scripts/docs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const docsPublicDirectory = path.join(projectRoot, "scripts", "docs", "public");
let docsDirectory = "";

async function listPublicPages (directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const pages: string[] = [];

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			pages.push(...await listPublicPages(entryPath));
			continue;
		}

		if (!entry.isFile() || path.extname(entry.name) !== ".ts") {
			continue;
		}

		pages.push(path.relative(docsPublicDirectory, entryPath).replace(/\.ts$/u, ".html"));
	}

	return pages.sort((left, right) => left.localeCompare(right));
}

beforeAll(async () => {
	docsDirectory = await mkdtemp(path.join(os.tmpdir(), "kitsui-docs-test-"));
	await buildDocsSite({ outputDirectory: docsDirectory });
}, 20_000);

afterAll(async () => {
	if (!docsDirectory) {
		return;
	}

	await rm(docsDirectory, { force: true, recursive: true });
});

describe("build:docs pipeline", () => {
	it("emits the docs site, the typedoc json model, and every expected page", async () => {
		const docsJsonPath = path.join(docsDirectory, "kitsui.json");
		await expect(access(docsDirectory)).resolves.toBeUndefined();
		await expect(access(docsJsonPath)).resolves.toBeUndefined();

		const expectedPages = await listPublicPages(docsPublicDirectory);
		for (const page of expectedPages) {
			await expect(access(path.join(docsDirectory, page))).resolves.toBeUndefined();
		}

		const docsJson = JSON.stringify(JSON.parse(await readFile(docsJsonPath, "utf8")));
		const indexHtml = await readFile(path.join(docsDirectory, "index.html"), "utf8");
		const componentHtml = await readFile(path.join(docsDirectory, "Component.html"), "utf8");
		const stateHtml = await readFile(path.join(docsDirectory, "State.html"), "utf8");
		expect(indexHtml.includes('<html lang="en">'), "Missing html element with lang attribute").toBe(true);
		expect(indexHtml.includes('name="viewport"'), "Missing viewport meta tag").toBe(true);
		expect(indexHtml.includes('<title>kitsui</title>'), "Missing title tag").toBe(true);
		expect(indexHtml.includes("Overview"), "Missing Overview section").toBe(true);
		expect(indexHtml.includes("A DOM-first UI library built around owned components and reactive state."), "Missing description").toBe(true);
		expect(indexHtml.includes("DOM-first UI library built around owned"), "Missing description snippet").toBe(true);
		expect(componentHtml.includes('<span class="docs-declaration-name">Component.extend</span>'), "Missing Component.extend declaration name").toBe(true);
		expect(componentHtml.includes('<span class="docs-signature-name">Component.extend</span>'), "Missing Component.extend signature name").toBe(true);
		expect(componentHtml.includes('<span class="docs-declaration-name">extend</span><span class="docs-flags"><span class="docs-flag">static</span></span>'), "Found nested static extend declaration").toBe(false);
		expect(componentHtml.includes('<span class="docs-signature-punctuation">get </span><span class="docs-signature-name">class</span>'), "Missing punctuation-coloured get keyword in accessor signature").toBe(true);
		expect(componentHtml.includes('class="docs-declaration-anchor" href="#decl-'), "Missing declaration # quick-link anchors").toBe(true);
		expect(componentHtml.includes('class="docs-type-reference-link" href="Component.html#decl-'), "Missing internal type reference links").toBe(true);
		expect(stateHtml.includes('<title>State - kitsui</title>'), "Missing State page title").toBe(true);
		expect(stateHtml.includes('<h1 class="docs-component-title">State</h1>'), "Missing State page heading").toBe(true);
		expect(stateHtml.includes('<a class="docs-sidebar-link docs-sidebar-link-active" href="State.html">State</a>'), "State page is not active in sidebar").toBe(true);
		expect(stateHtml.includes('<span class="docs-declaration-name">StateExtensions</span>'), "Missing StateExtensions declaration").toBe(true);
		expect(stateHtml.includes('<span class="docs-declaration-name">State.extend</span>'), "Missing State.extend declaration name").toBe(true);
		expect(stateHtml.includes('<span class="docs-signature-name">State.extend</span>'), "Missing State.extend signature name").toBe(true);
		expect(stateHtml.includes('<h2 class="docs-component-section-title">mappingExtension</h2>'), "Missing State mapping extension section").toBe(true);
		const declarationAnchorIds = [...componentHtml.matchAll(/id="(decl-[^"]+)"/g)].map(match => match[1]);
		expect(new Set(declarationAnchorIds).size === declarationAnchorIds.length, "Found duplicate declaration anchor IDs").toBe(true);
		const declarationAnchorTargets = new Set(declarationAnchorIds.map(id => `#${id}`));
		const hashLinks = [...componentHtml.matchAll(/href="(#[^"]+)"/g)].map(match => match[1]);
		expect(hashLinks.every(href => declarationAnchorTargets.has(href)), "Found declaration # links pointing to missing anchors").toBe(true);
		const componentPageLinks = [...componentHtml.matchAll(/href="Component\.html(#[^"]+)"/g)].map(match => match[1]);
		expect(componentPageLinks.every(hash => declarationAnchorTargets.has(hash)), "Found type links pointing to missing declaration anchors").toBe(true);
		const stateAnchorIds = [...stateHtml.matchAll(/id="(decl-[^"]+)"/g)].map(match => match[1]);
		expect(new Set(stateAnchorIds).size === stateAnchorIds.length, "Found duplicate State declaration anchor IDs").toBe(true);
		const stateAnchorTargets = new Set(stateAnchorIds.map(id => `#${id}`));
		const stateHashLinks = [...stateHtml.matchAll(/href="(#[^"]+)"/g)].map(match => match[1]);
		expect(stateHashLinks.every(href => stateAnchorTargets.has(href)), "Found State declaration # links pointing to missing anchors").toBe(true);
		const statePageLinks = [...stateHtml.matchAll(/href="State\.html(#[^"]+)"/g)].map(match => match[1]);
		expect(statePageLinks.every(hash => stateAnchorTargets.has(hash)), "Found State type links pointing to missing declaration anchors").toBe(true);
		expect(docsJson.includes('"name":"Component"'), "Missing Component in JSON").toBe(true);
		expect(docsJson.includes('"name":"State"'), "Missing State in JSON").toBe(true);
		expect(docsJson.includes('"name":"Style"'), "Missing Style in JSON").toBe(true);
	});
});