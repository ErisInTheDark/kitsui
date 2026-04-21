import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDocsSite } from "../scripts/docs";
import { createSectionAnchorId } from "../scripts/docs/components/ApiModulePage";

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

function declarationSlice (html: string, declarationName: string): string {
	const headerNeedle = `<span class="docs-declaration-name">${declarationName}</span>`;
	const headerIndex = html.lastIndexOf(headerNeedle);
	expect(headerIndex, `Missing ${declarationName} declaration`).toBeGreaterThanOrEqual(0);

	const anchorSnippet = html.slice(headerIndex, headerIndex + 240);
	const anchorMatch = anchorSnippet.match(/href="#([^"]+)"/u);
	expect(anchorMatch, `Missing ${declarationName} declaration anchor`).not.toBeNull();

	const declarationPattern = new RegExp(`<details class="[^"]*docs-declaration[^"]*" id="${anchorMatch![1]}"`, "u");
	const declarationMatch = html.slice(0, headerIndex).match(declarationPattern);
	const declarationStart = declarationMatch ? html.lastIndexOf(declarationMatch[0], headerIndex) : -1;
	expect(declarationStart, `Missing ${declarationName} declaration container`).toBeGreaterThanOrEqual(0);

	const declarationEnd = html.indexOf("</summary></details>", headerIndex);
	expect(declarationEnd, `Missing ${declarationName} declaration end`).toBeGreaterThanOrEqual(0);

	return html.slice(declarationStart, declarationEnd + "</summary></details>".length);
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
		const kitsuiDeclarationPath = path.join(docsDirectory, "kitsui.d.ts");
		const exampleSourcePath = path.join(docsDirectory, "examples", "cookie-clicker.ts");
		const examplesJsonPath = path.join(docsDirectory, "examples", "examples.json");
		await expect(access(docsDirectory)).resolves.toBeUndefined();
		await expect(access(docsJsonPath)).resolves.toBeUndefined();
		await expect(access(kitsuiDeclarationPath)).resolves.toBeUndefined();
		await expect(access(exampleSourcePath)).resolves.toBeUndefined();

		const expectedPages = await listPublicPages(docsPublicDirectory);
		for (const page of expectedPages) {
			await expect(access(path.join(docsDirectory, page))).resolves.toBeUndefined();
		}

		const docsJson = JSON.stringify(JSON.parse(await readFile(docsJsonPath, "utf8")));
		const examplesJson = await readFile(examplesJsonPath, "utf8");
		const clientJs = await readFile(path.join(docsDirectory, "client.js"), "utf8");
		const kitsuiDeclaration = await readFile(kitsuiDeclarationPath, "utf8");
		const docsModel = JSON.parse(await readFile(docsJsonPath, "utf8")) as {
			children?: Array<{
				name: string;
				children?: Array<{
					name: string;
					sources?: Array<{ fileName?: string; line?: number }>;
					extendedTypes?: Array<{ type: string; name: string }>;
				}>;
			}>;
		};
		const indexHtml = await readFile(path.join(docsDirectory, "index.html"), "utf8");
		const notFoundHtml = await readFile(path.join(docsDirectory, "404.html"), "utf8");
		const playgroundHtml = await readFile(path.join(docsDirectory, "playground.html"), "utf8");
		const componentHtml = await readFile(path.join(docsDirectory, "Component.html"), "utf8");
		const stateHtml = await readFile(path.join(docsDirectory, "State.html"), "utf8");
		const styleHtml = await readFile(path.join(docsDirectory, "Style.html"), "utf8");
		const markerHtml = await readFile(path.join(docsDirectory, "Marker.html"), "utf8");
		const eventHtml = await readFile(path.join(docsDirectory, "EventManipulator.html"), "utf8");
		const manipulatorModules = (docsModel.children ?? [])
			.filter(child => child.name.startsWith("component/") && child.name.endsWith("Manipulator"))
			.map(child => child.name.slice(child.name.lastIndexOf("/") + 1))
			.sort((left, right) => left.localeCompare(right));
		expect(manipulatorModules.length, "Expected at least one component manipulator module in TypeDoc output").toBeGreaterThan(0);
		for (const manipulatorModule of manipulatorModules) {
			await expect(access(path.join(docsDirectory, `${manipulatorModule}.html`))).resolves.toBeUndefined();
		}
		const firstManipulator = manipulatorModules[0];
		const firstManipulatorHtml = await readFile(path.join(docsDirectory, `${firstManipulator}.html`), "utf8");
		expect(indexHtml.includes('<html lang="en">'), "Missing html element with lang attribute").toBe(true);
		expect(examplesJson.includes("cookie-clicker.ts"), "Expected docs/examples/examples.json to list cookie-clicker.ts").toBe(true);
		expect(kitsuiDeclaration.includes('declare module "kitsui" {'), "Missing kitsui module declaration bundle for Monaco").toBe(true);
		expect(kitsuiDeclaration.includes('export interface ComponentExtensions {'), "Missing flattened ComponentExtensions interface in the main kitsui module").toBe(true);
		expect(kitsuiDeclaration.includes('export interface StateExtensions<T> {'), "Missing flattened StateExtensions interface in the main kitsui module").toBe(true);
		expect(kitsuiDeclaration.includes('export interface StateStaticExtensions {'), "Missing flattened StateStaticExtensions interface in the main kitsui module").toBe(true);
		expect(kitsuiDeclaration.includes('appendTo(target: PlacementContainer): this;'), "Missing merged placeExtension methods on ComponentExtensions").toBe(true);
		expect(kitsuiDeclaration.includes('Group: GroupConstructor;'), "Missing merged State.Group declaration on StateStaticExtensions").toBe(true);
		expect(/^\s*declare module "kitsui\//mu.test(kitsuiDeclaration), "Declaration bundle should not emit secondary kitsui submodule declarations").toBe(false);
		expect(/^\s*declare global\s*\{/mu.test(kitsuiDeclaration), "Declaration bundle should not leak global declarations into the public bundle").toBe(false);
		expect(kitsuiDeclaration.includes('from "./') || kitsuiDeclaration.includes('from "../'), "Declaration bundle should not contain unresolved relative import specifiers").toBe(false);
		expect(kitsuiDeclaration.includes('declare module "./') || kitsuiDeclaration.includes('declare module "../'), "Declaration bundle should not contain unresolved relative declaration-module specifiers").toBe(false);
		expect(clientJs.includes('lib: ['), "Playground editor should rely on Monaco's built-in default libs instead of overriding the lib list").toBe(false);
		expect(clientJs.includes('from "./kitsui.esm.js"'), "Playground preview bundle should not rewrite kitsui imports to a blob-relative path").toBe(false);
		expect(clientJs.includes('new URL("kitsui.esm.js"'), "Playground preview bundle should resolve kitsui against the docs runtime URL").toBe(true);
		expect(clientJs.includes('createElement("iframe")'), "Playground preview should render inside an isolated iframe so each run gets a fresh runtime and stylesheet scope").toBe(true);
		expect(indexHtml.includes('name="viewport"'), "Missing viewport meta tag").toBe(true);
		expect(indexHtml.includes('<title>kitsui</title>'), "Missing title tag").toBe(true);
		expect(indexHtml.includes("Overview"), "Missing Overview section").toBe(true);
		expect(indexHtml.includes('<a class="docs-sidebar-link" href="playground.html">Playground</a>'), "Playground should move out of the sidebar on regular docs pages").toBe(false);
		expect(/class="docs-header-right"[^>]*><a class="docs-header-link" href="playground.html">Playground<\/a><\/div>/u.test(indexHtml), "Regular docs pages should expose Playground in the masthead").toBe(true);
		expect(/class="docs-header-right"[^>]*><a class="docs-header-link" href="playground.html">Playground<\/a><\/div>/u.test(componentHtml), "API docs pages should expose Playground in the masthead").toBe(true);
		expect(styleHtml.includes('id="mountStylesheet"'), "mountStylesheet should not appear in the public Style docs").toBe(false);
		expect(styleHtml.includes('id="unmountStylesheet"'), "unmountStylesheet should not appear in the public Style docs").toBe(false);
		const markerEventMapDeclaration = declarationSlice(markerHtml, "MarkerEventMap");
		expect(markerEventMapDeclaration.includes("Lifecycle event map emitted by Marker instances."), "MarkerEventMap should render its JSDoc summary").toBe(true);
		expect(markerHtml.includes("A wrapper around a DOM comment used where an actual DOM element is not needed."), "Marker should render its JSDoc summary on the public docs page").toBe(true);
		const markerExtendDeclaration = declarationSlice(markerHtml, "Marker.extend");
		expect(markerExtendDeclaration.includes("Returns the underlying Marker class for prototype extension."), "Marker.extend should render its JSDoc summary").toBe(true);
		const markerBuilderDeclaration = declarationSlice(markerHtml, "Marker.builder");
		expect(markerBuilderDeclaration.includes("Creates a marker factory from an id/build definition pair."), "Marker.builder should render its JSDoc summary").toBe(true);
		expect(markerBuilderDeclaration.includes('href="Marker.html#MarkerBuilderDefinition"'), "Marker.builder should link to MarkerBuilderDefinition").toBe(true);
		const extendableMarkerClassDeclaration = declarationSlice(markerHtml, "ExtendableMarkerClass");
		expect(extendableMarkerClassDeclaration.includes('href="Marker.html#Marker.extend"'), "ExtendableMarkerClass should link to Marker.extend").toBe(true);
		const markerBuilderDefinitionDeclaration = declarationSlice(markerHtml, "MarkerBuilderDefinition");
		expect(markerBuilderDefinitionDeclaration.includes('href="Marker.html#Marker.builder"'), "MarkerBuilderDefinition should link to Marker.builder").toBe(true);
		expect(/id="MarkerBuilderDefinition\.id"[\s\S]*?identifier text/u.test(markerHtml), "MarkerBuilderDefinition.id should render its JSDoc summary").toBe(true);
		expect(/id="MarkerBuilderDefinition\.build"[\s\S]*?Runs when the marker mounts/u.test(markerHtml), "MarkerBuilderDefinition.build should render its JSDoc summary").toBe(true);
		expect(markerHtml.includes('href="#section-placeextension"'), "Marker docs should include a dedicated placeExtension section").toBe(true);
		expect(markerHtml.includes('id="placeExtension.MarkerExtensions"'), "Marker placeExtension section should render the MarkerExtensions declaration").toBe(true);
		expect(markerHtml.includes('id="PlacementTarget"'), "Marker docs should keep placeExtension declarations that are actually referenced by Marker signatures").toBe(true);
		expect(markerHtml.includes('id="Place"'), "Marker docs should omit unrelated placeExtension declarations like Place").toBe(false);
		expect(markerHtml.includes('id="PlacerFunction"'), "Marker docs should omit unrelated placeExtension declarations like PlacerFunction").toBe(false);
		expect(componentHtml.includes('id="Place"'), "Component docs should keep placeExtension declarations that Component signatures actually use").toBe(true);
		expect(componentHtml.includes('id="PlacerFunction"'), "Component docs should keep PlacerFunction because Component signatures use it").toBe(true);
		expect(/id="MarkerExtensions\.appendTo"[\s\S]*?href="Marker\.html#Marker\.appendTo"/u.test(markerHtml), "MarkerExtensions.appendTo should collapse into the documented Marker.appendTo declaration").toBe(true);
		expect(/id="MarkerExtensions\.prependTo"[\s\S]*?href="Marker\.html#Marker\.prependTo"/u.test(markerHtml), "MarkerExtensions.prependTo should collapse into the documented Marker.prependTo declaration").toBe(true);
		expect(/id="MarkerExtensions\.insertTo"[\s\S]*?href="Marker\.html#Marker\.insertTo"/u.test(markerHtml), "MarkerExtensions.insertTo should collapse into the documented Marker.insertTo declaration").toBe(true);
		expect(/id="Marker\.node"[\s\S]*?underlying DOM comment node/u.test(markerHtml), "Marker.node should render its JSDoc summary").toBe(true);
		expect(/id="Marker\.event"[\s\S]*?Lazily creates the marker's event manipulator/u.test(markerHtml), "Marker.event should render its JSDoc summary").toBe(true);
		expect(/id="Marker\.remove"[\s\S]*?Disposes the marker and removes its comment node/u.test(markerHtml), "Marker.remove should render its JSDoc summary").toBe(true);
		expect(/id="Marker\.setOwner"[\s\S]*?Assigns or clears the explicit owner/u.test(markerHtml), "Marker.setOwner should render its JSDoc summary").toBe(true);
		expect(/id="Marker\.getOwner"[\s\S]*?current explicit owner/u.test(markerHtml), "Marker.getOwner should render its JSDoc summary").toBe(true);
		expect(/id="Marker\.use"[\s\S]*?Registers mount and optional dispose hooks/u.test(markerHtml), "Marker.use should render its JSDoc summary").toBe(true);
		const eventManipulatorDeclaration = declarationSlice(eventHtml, "EventManipulator");
		expect(eventManipulatorDeclaration.includes("Manages event listeners for a host owner with automatic cleanup and reactive listener support."), "EventManipulator should render its JSDoc summary").toBe(true);
		const ownedEventManipulatorDeclaration = declarationSlice(eventHtml, "OwnedEventManipulator");
		expect(ownedEventManipulatorDeclaration.includes("Fluent interface exposed by"), "OwnedEventManipulator should render its JSDoc summary").toBe(true);
		const styleAnimationDeclaration = declarationSlice(styleHtml, "StyleAnimation");
		expect(styleAnimationDeclaration.includes("Registers a named keyframes animation and returns a marker exposing the generated animation name."), "StyleAnimation should render its JSDoc summary").toBe(true);
		const animationMarkerDeclaration = declarationSlice(styleHtml, "AnimationMarker");
		expect(animationMarkerDeclaration.includes("A mounted animation marker whose generated"), "AnimationMarker should render its JSDoc summary").toBe(true);
		const keyframesDeclaration = declarationSlice(styleHtml, "KeyframesDefinition");
		expect(keyframesDeclaration.includes("Keyframe definitions keyed by percentage selectors"), "KeyframesDefinition should render its JSDoc summary").toBe(true);
		const styleImportDeclaration = declarationSlice(styleHtml, "StyleImport");
		expect(styleImportDeclaration.includes("Registers a stylesheet import rule"), "StyleImport should render its JSDoc summary").toBe(true);
		const mapperDeclaration = declarationSlice(stateHtml, "Mapper");
		expect(mapperDeclaration.includes("Maps a source state value"), "Mapper should render its JSDoc summary").toBe(true);
		const recomputableStateSummaryDeclaration = declarationSlice(stateHtml, "RecomputableState");
		expect(recomputableStateSummaryDeclaration.includes("mapped state that can be manually recomputed"), "RecomputableState should render its JSDoc summary").toBe(true);
		expect(/class="docs-header-right"[^>]*><a class="docs-header-link docs-header-link-active" href="playground.html">Playground<\/a><\/div>/u.test(playgroundHtml), "Playground page should mark the masthead link active").toBe(true);
		expect(playgroundHtml.includes('<main class="docs-playground-main" role="main">'), "Playground page should render a dedicated full-height main region").toBe(true);
		expect(playgroundHtml.includes('class="docs-layout-shell"'), "Playground page should not render the standard docs sidebar shell").toBe(false);
		expect(playgroundHtml.includes('class="docs-footer"'), "Playground page should not render the standard docs footer").toBe(false);
		expect(playgroundHtml.includes('<section class="docs-playground-hero">'), "Playground page should not render a standalone hero above the editor").toBe(false);
		expect(indexHtml.includes("::view-transition-old(root)"), "Missing disabled root old-transition selector").toBe(true);
		expect(indexHtml.includes("::view-transition-new(root)"), "Missing disabled root new-transition selector").toBe(true);
		expect(indexHtml.includes("::view-transition-group(docs-header)"), "Missing header view-transition group selector").toBe(true);
		expect(indexHtml.includes("::view-transition-old(docs-header)"), "Missing header old-transition selector").toBe(true);
		expect(indexHtml.includes("::view-transition-new(docs-header)"), "Missing header new-transition selector").toBe(true);
		expect(indexHtml.includes("::view-transition-group(docs-main)"), "Missing main-content view-transition group selector").toBe(true);
		expect(indexHtml.includes("::view-transition-old(docs-main)"), "Missing main-content old-transition selector").toBe(true);
		expect(indexHtml.includes("::view-transition-new(docs-main)"), "Missing main-content new-transition selector").toBe(true);
		expect(stateHtml.includes("::view-transition-group(docs-sidebar-sections-state-html)"), "Missing page-specific sidebar-sections view-transition group selector").toBe(true);
		expect(stateHtml.includes("::view-transition-old(docs-sidebar-sections-state-html)"), "Missing page-specific sidebar-sections old-transition selector").toBe(true);
		expect(stateHtml.includes("::view-transition-new(docs-sidebar-sections-state-html)"), "Missing page-specific sidebar-sections new-transition selector").toBe(true);
		expect(componentHtml.includes("view-transition-name: docs-header"), "Header should define docs-header view-transition-name").toBe(true);
		expect(componentHtml.includes("view-transition-name: docs-main"), "Main content should define docs-main view-transition-name").toBe(true);
		expect(componentHtml.includes("view-transition-name: docs-sidebar-sections-component-html"), "Sidebar subsections should define a page-specific wrapper view-transition-name").toBe(true);
		expect(componentHtml.includes("docs-sidebar-section-link\" style=\"view-transition-name:"), "Sidebar links should not get individual view-transition-name styles").toBe(false);
		expect(indexHtml.includes('<section class="docs-home-hero">'), "Missing index hero section class").toBe(true);
		expect(indexHtml.includes('<h1 class="docs-home-title">kitsui</h1>'), "Missing index hero title class").toBe(true);
		expect(indexHtml.includes('<p class="docs-home-summary">'), "Missing index hero summary class").toBe(true);
		expect(notFoundHtml.includes('<section class="docs-home-hero">'), "Missing 404 hero section class").toBe(true);
		expect(notFoundHtml.includes('<h1 class="docs-home-title">404</h1>'), "Missing 404 hero title class").toBe(true);
		expect(notFoundHtml.includes('<p class="docs-home-summary">The page you are looking for does not exist.</p>'), "Missing 404 hero summary class").toBe(true);
		expect(indexHtml.includes("A DOM-first UI library built around owned components and reactive state."), "Missing description").toBe(true);
		expect(indexHtml.includes("DOM-first UI library built around owned"), "Missing description snippet").toBe(true);
		expect(componentHtml.includes('<span class="docs-declaration-name">Component.extend</span>'), "Missing Component.extend declaration name").toBe(true);
		expect(componentHtml.includes('<span class="docs-signature-name">Component.extend</span>'), "Missing Component.extend signature name").toBe(true);
		expect(componentHtml.includes('<span class="docs-declaration-name">Component.query</span>'), "Missing Component.query declaration name").toBe(true);
		expect(componentHtml.includes('<span class="docs-signature-name">Component.query</span>'), "Missing Component.query signature name").toBe(true);
		expect(componentHtml.includes('<span class="docs-declaration-name">Component.fromHTML</span>'), "Missing Component.fromHTML declaration name").toBe(true);
		expect(componentHtml.includes('<span class="docs-signature-name">Component.fromHTML</span>'), "Missing Component.fromHTML signature name").toBe(true);
		expect(componentHtml.includes('<span class="docs-declaration-name">extend</span><span class="docs-flags"><span class="docs-flag">static</span></span>'), "Found nested static extend declaration").toBe(false);
		expect(componentHtml.includes('<span class="docs-signature-punctuation">get </span><span class="docs-signature-name">class</span>'), "Missing punctuation-coloured get keyword in accessor signature").toBe(true);
		expect(/class="docs-declaration-anchor" href="#[^"]+"/u.test(componentHtml), "Missing declaration # quick-link anchors").toBe(true);
		expect(/class="docs-type-reference-link" href="Component\.html#[^"]+"/u.test(componentHtml), "Missing internal type reference links").toBe(true);
		expect(componentHtml.includes('id="Component.attribute"'), "Missing semantic Component.attribute anchor").toBe(true);
		expect(componentHtml.includes('id="ComponentExtensions.appendTo"'), "Missing semantic ComponentExtensions.appendTo anchor").toBe(true);
		expect(stateHtml.includes('<title>State - kitsui</title>'), "Missing State page title").toBe(true);
		expect(stateHtml.includes('<h1 class="docs-component-title">State</h1>'), "Missing State page heading").toBe(true);
		expect(stateHtml.includes('<a class="docs-sidebar-link docs-sidebar-link-active" href="State.html">State</a>'), "State page is not active in sidebar").toBe(true);
		expect(/class="docs-sidebar-section-link"[^>]*href="#section-state"[^>]*>State<\/a>/u.test(stateHtml), "State page should include section sidebar button for State section").toBe(true);
		expect(/class="docs-sidebar-section-link"[^>]*href="#section-mappingextension"[^>]*>mappingExtension<\/a>/u.test(stateHtml), "State page should include section sidebar button for mappingExtension section").toBe(true);
		expect(indexHtml.includes('<a class="docs-sidebar-section-link"'), "Overview page should not render section sidebar buttons").toBe(false);
		const stateSectionContainerCount = (stateHtml.match(/<div class="docs-sidebar-sections"[^>]*>/gu) ?? []).length;
		expect(stateSectionContainerCount, "State page should render exactly one sidebar sections container under active page").toBe(1);
		const stateSidebarSectionLinkCount = (stateHtml.match(/<a class="docs-sidebar-section-link"/gu) ?? []).length;
		const stateSectionHeadingCount = (stateHtml.match(/<h2 class="docs-component-section-title" id="section-/gu) ?? []).length;
		expect(stateSidebarSectionLinkCount, "State page sidebar section-link count should match section heading count").toBe(stateSectionHeadingCount);
		expect(stateHtml.includes('<span class="docs-declaration-name">StateExtensions</span>'), "Missing StateExtensions declaration").toBe(true);
		expect(stateHtml.includes('<span class="docs-declaration-name">State.extend</span>'), "Missing State.extend declaration name").toBe(true);
		expect(stateHtml.includes('<span class="docs-signature-name">State.extend</span>'), "Missing State.extend signature name").toBe(true);
		expect(stateHtml.includes('class="docs-component-section-title"') && stateHtml.includes('>mappingExtension</h2>'), "Missing State mapping extension section").toBe(true);
		expect(styleHtml.includes('<title>Style - kitsui</title>'), "Missing Style page title").toBe(true);
		expect(styleHtml.includes('<h1 class="docs-component-title">Style</h1>'), "Missing Style page heading").toBe(true);
		for (const manipulatorModule of manipulatorModules) {
			expect(componentHtml.includes(`href="${manipulatorModule}.html">${manipulatorModule}</a>`), `Sidebar should include generated manipulator page link for ${manipulatorModule} on static pages`).toBe(true);
		}
		const classLinkIndex = componentHtml.indexOf('href="ClassManipulator.html">ClassManipulator</a>');
		const attributeLinkIndex = componentHtml.indexOf('href="AttributeManipulator.html">AttributeManipulator</a>');
		const ariaLinkIndex = componentHtml.indexOf('href="AriaManipulator.html">AriaManipulator</a>');
		const textLinkIndex = componentHtml.indexOf('href="TextManipulator.html">TextManipulator</a>');
		const eventLinkIndex = componentHtml.indexOf('href="EventManipulator.html">EventManipulator</a>');
		expect(classLinkIndex, "Sidebar should include ClassManipulator link").toBeGreaterThanOrEqual(0);
		expect(attributeLinkIndex, "Sidebar should include AttributeManipulator link").toBeGreaterThanOrEqual(0);
		expect(ariaLinkIndex, "Sidebar should include AriaManipulator link").toBeGreaterThanOrEqual(0);
		expect(textLinkIndex, "Sidebar should include TextManipulator link").toBeGreaterThanOrEqual(0);
		expect(eventLinkIndex, "Sidebar should include EventManipulator link").toBeGreaterThanOrEqual(0);
		expect(classLinkIndex < attributeLinkIndex, "ClassManipulator should come before AttributeManipulator in sidebar").toBe(true);
		expect(attributeLinkIndex < ariaLinkIndex, "AttributeManipulator should come before AriaManipulator in sidebar").toBe(true);
		expect(ariaLinkIndex < textLinkIndex, "AriaManipulator should come before TextManipulator in sidebar").toBe(true);
		expect(textLinkIndex < eventLinkIndex, "TextManipulator should come before EventManipulator in sidebar").toBe(true);
		expect(firstManipulatorHtml.includes(`<title>${firstManipulator} - kitsui</title>`), "Generated manipulator page should set title").toBe(true);
		expect(firstManipulatorHtml.includes(`<h1 class="docs-component-title">${firstManipulator}</h1>`), "Generated manipulator page should render heading").toBe(true);
		expect(firstManipulatorHtml.includes(`<a class="docs-sidebar-link docs-sidebar-link-active" href="${firstManipulator}.html">${firstManipulator}</a>`), "Generated manipulator page should be active in sidebar").toBe(true);
		const manipulatorActiveLinkCount = (firstManipulatorHtml.match(/docs-sidebar-link docs-sidebar-link-active/g) ?? []).length;
		expect(manipulatorActiveLinkCount, "Generated manipulator page should have exactly one active sidebar link").toBe(1);
		expect(stateHtml.includes('id="State.value"'), "Missing semantic State.value anchor").toBe(true);
		const styleClassDeclaration = declarationSlice(styleHtml, "Style.Class");
		expect(styleClassDeclaration.includes('<span class="docs-declaration-name">className</span>'), "Style.Class declaration should include class members").toBe(true);
		const styleClassAnchorCount = (styleHtml.match(/id="Style\.Class"/gu) ?? []).length;
		expect(styleClassAnchorCount, "Style.Class should have a single declaration anchor").toBe(1);
		const styleAnchorCount = (styleHtml.match(/id="Style"/gu) ?? []).length;
		expect(styleAnchorCount, "Style should not produce duplicate top-level anchors").toBe(1);
		expect(styleHtml.includes('class="docs-declaration docs-declaration-depth-0" id="Style.after"'), "Undocumented namespace members should be hoisted to top-level declarations").toBe(true);
		expect(styleHtml.includes('class="docs-declaration docs-declaration-depth-1" id="Style.after"'), "Hoisted namespace members should not remain nested under the hidden namespace").toBe(false);
		const styleResetDeclaration = declarationSlice(styleHtml, "StyleReset");
		expect(styleResetDeclaration.includes('<span class="docs-signature-name">StyleReset</span>'), "Function-typed const declarations should render signature blocks").toBe(true);
		expect(styleResetDeclaration.includes('<span class="docs-declaration-keyword">const </span>'), "Function-typed const declarations should not render a const type row").toBe(false);
		expect(styleResetDeclaration.includes('class="docs-declaration-type"'), "Function-typed const declarations should not render a declaration type row").toBe(false);
		const resetSignatureIndex = styleResetDeclaration.indexOf('class="docs-signature');
		const resetCommentIndex = styleResetDeclaration.indexOf("Registers global CSS reset rules");
		expect(resetSignatureIndex, "StyleReset should render a signature wrapper").toBeGreaterThanOrEqual(0);
		expect(resetCommentIndex, "StyleReset comment text should be present").toBeGreaterThanOrEqual(0);
		expect(resetSignatureIndex < resetCommentIndex, "Single-signature declaration comments should render inside the signature box").toBe(true);
		const styleClassConstructorDeclaration = declarationSlice(styleHtml, "StyleClassConstructor");
		expect(styleClassConstructorDeclaration.includes('class="docs-signature docs-signature-accent-method"'), "Signature boxes should use method accent styling").toBe(true);
		const styleClassConstructorSignatureCount = (styleClassConstructorDeclaration.match(/class="docs-signature docs-signature-accent-method"/gu) ?? []).length;
		expect(styleClassConstructorSignatureCount, "Paired call/constructor signatures should render in a single signature container").toBe(1);
		expect(styleClassConstructorDeclaration.includes('<br>'), "Paired call/constructor signatures should render both forms in one signature code block").toBe(true);
		const componentDeclaration = declarationSlice(componentHtml, "Component");
		const componentSignatureSection = componentDeclaration.split('<div class="docs-declaration-children">')[0] ?? componentDeclaration;
		const componentSignatureCount = (componentSignatureSection.match(/class="docs-signature docs-signature-accent-method"/gu) ?? []).length;
		const normalizedComponentDeclaration = componentSignatureSection.replace(/\s+/gu, " ");
		expect(componentSignatureCount, "Component should render three paired callable/constructable signature groups").toBe(3);
		expect(/<span class="docs-parameter-name">tagName<\/span>[\s\S]*?<br><span class="docs-signature-punctuation">new <\/span><span class="docs-signature-name">Component<\/span>[\s\S]*?<span class="docs-parameter-name">tagName<\/span>/u.test(normalizedComponentDeclaration), "Component(tagName) should pair with new Component(tagName)").toBe(true);
		expect(/<span class="docs-parameter-name">element<\/span>[\s\S]*?<br><span class="docs-signature-punctuation">new <\/span><span class="docs-signature-name">Component<\/span>[\s\S]*?<span class="docs-parameter-name">element<\/span>/u.test(normalizedComponentDeclaration), "Component(element) should pair with new Component(element)").toBe(true);
		const styleValueDeclaration = declarationSlice(styleHtml, "StyleValue");
		expect(styleValueDeclaration.includes('class="docs-declaration-fancy docs-declaration-fancy-accent-reference"'), "Declarations without signatures should render their comment/type content in a fancy bordered wrapper").toBe(true);
		const stateDeclarationForCommentPlacement = declarationSlice(stateHtml, "State");
		const stateSignatureCount = (stateDeclarationForCommentPlacement.match(/class="docs-signature docs-signature-accent-method"/gu) ?? []).length;
		expect(stateSignatureCount, "State declaration should render multiple signature groups").toBeGreaterThan(1);
		const stateConstructorCommentIndex = stateDeclarationForCommentPlacement.indexOf("the implicit owner is cleared and an explicit owner is required");
		const stateFirstSignatureIndex = stateDeclarationForCommentPlacement.indexOf('class="docs-signature');
		expect(stateConstructorCommentIndex, "State declaration comment should be present").toBeGreaterThanOrEqual(0);
		expect(stateFirstSignatureIndex, "State declaration should render constructor signatures").toBeGreaterThanOrEqual(0);
		expect(stateConstructorCommentIndex < stateFirstSignatureIndex, "When multiple signature groups exist, declaration comment should remain outside signature boxes").toBe(true);
		expect(/class="docs-declaration-fancy[^"]*"><div class="docs-comment"><\/div><\/div>/u.test(stateHtml), "Undocumented declarations should not render empty fancy accent boxes").toBe(false);
		const groupSectionStart = stateHtml.indexOf('class="docs-component-section-title" id="section-groupextension">groupExtension</h2>');
		expect(groupSectionStart, "Missing groupExtension section in rendered State page").toBeGreaterThanOrEqual(0);
		const groupSectionHtml = stateHtml.slice(groupSectionStart);
		expect(groupSectionHtml.includes('id="State.Group"'), "State.Group should render as a top-level declaration in the groupExtension section").toBe(true);
		const stateGroupAnchorCount = (groupSectionHtml.match(/id="State\.Group"/gu) ?? []).length;
		expect(stateGroupAnchorCount, "State.Group should render once in the groupExtension section").toBe(1);
		const stateGroupDeclaration = declarationSlice(stateHtml, "State.Group");
		expect(stateGroupDeclaration.includes('class="docs-declaration-fancy'), "State.Group should not wrap signatures in an additional declaration fancy box").toBe(false);
		expect(stateGroupDeclaration.includes('class="docs-declaration-type"'), "State.Group should not render a redundant declaration type code block when signatures exist").toBe(false);
		expect(stateGroupDeclaration.includes('docs-kind-property'), "Constructor-backed static extensions should not use property icon styling").toBe(false);
		expect(stateGroupDeclaration.includes('docs-kind-reference'), "Constructor-backed static extensions should use class/reference icon styling").toBe(true);
		expect(stateGroupDeclaration.includes('<br>'), "State.Group should preserve both call and constructor signatures").toBe(true);
		expect(/docs-signature-param-row[\s\S]*?<span class="docs-parameter-name">owner<\/span>[\s\S]*?<div class="docs-comment"><span><span class="docs-comment">The owner that manages the grouped state's lifecycle\./u.test(stateGroupDeclaration), "State.Group should render the owner description in the signature parameter details").toBe(true);
		expect(/docs-signature-param-row[\s\S]*?<span class="docs-parameter-name">states<\/span>[\s\S]*?<div class="docs-comment"><span><span class="docs-comment">A record of source states to group\./u.test(stateGroupDeclaration), "State.Group should render the states description in the signature parameter details").toBe(true);
		const mainStateSectionEnd = groupSectionStart;
		const mainStateSectionHtml = stateHtml.slice(0, mainStateSectionEnd);
		expect(mainStateSectionHtml.includes('id="StateStaticExtensions.Group"'), "State.Group should not remain nested in the main State section").toBe(false);
		expect(mainStateSectionHtml.includes('src/state/extensions/groupExtension.ts:'), "groupExtension declarations should not leak into the main State section").toBe(false);
		expect(stateHtml.includes('GroupedStateObject'), "State.Group should render its grouped state constraint type on the docs page").toBe(true);
		expect(stateHtml.includes('GroupedValue'), "State.Group should render its grouped value return type on the docs page").toBe(true);
		expect(groupSectionHtml.includes('id="GroupConstructor"'), "Consumed helper type aliases should not render as standalone declarations").toBe(false);
		const recomputableStateDeclaration = declarationSlice(stateHtml, "RecomputableState");
		expect(recomputableStateDeclaration.includes('<div class="docs-comment"></div>'), "RecomputableState should not render an empty comment container").toBe(false);
		const whenActiveDeclaration = declarationSlice(styleHtml, "whenActive");
		const whenActiveSignatureIndex = whenActiveDeclaration.indexOf('class="docs-signature');
		const whenActiveCommentIndex = whenActiveDeclaration.indexOf("Creates a spreadable pseudo-class selector that matches when the element or any");
		expect(whenActiveSignatureIndex, "whenActive should render a signature wrapper").toBeGreaterThanOrEqual(0);
		expect(whenActiveCommentIndex, "whenActive declaration comment should be present").toBeGreaterThanOrEqual(0);
		expect(whenActiveSignatureIndex < whenActiveCommentIndex, "Single-signature method declarations should merge declaration comments into signature boxes").toBe(true);
		expect(recomputableStateDeclaration.includes('class="docs-declaration-relationship-label">extends</span>'), "Missing RecomputableState extends relationship").toBe(true);
		expect(/href="State\.html#[^"]+"><span class="docs-type-reference">State<\/span>/u.test(recomputableStateDeclaration), "Missing RecomputableState extends link to State").toBe(true);
		expect(recomputableStateDeclaration.includes('<span class="docs-declaration-name">value</span>'), "RecomputableState should not duplicate inherited State members").toBe(false);
		const mappingModule = docsModel.children?.find(child => child.name === "state/extensions/mappingExtension");
		expect(mappingModule, "Missing mappingExtension module in TypeDoc model").toBeDefined();
		const recomputableStateModel = mappingModule?.children?.find(child => child.name === "RecomputableState");
		expect(
			recomputableStateModel?.extendedTypes?.some(type => type.type === "reference" && type.name === "State"),
			"Test precondition failed: RecomputableState should extend State in TypeDoc output",
		).toBe(true);
		const leakedTopLevelStateValue = mappingModule?.children?.some(child =>
			child.name === "value"
			&& child.sources?.some(source => source.fileName === "src/state/State.ts"),
		);
		expect(
			leakedTopLevelStateValue,
			"Test precondition failed: expected TypeDoc model to contain leaked top-level State.value accessor in mappingExtension",
		).toBe(true);
		const mappingSectionStart = stateHtml.indexOf('class="docs-component-section-title" id="section-mappingextension">mappingExtension</h2>');
		expect(mappingSectionStart, "Missing mappingExtension section in rendered State page").toBeGreaterThanOrEqual(0);
		const mappingSectionHtml = stateHtml.slice(mappingSectionStart);
		const stateDeclaration = declarationSlice(stateHtml, "State");
		expect(stateDeclaration.includes('<span class="docs-declaration-name">value</span>'), "State declaration should retain value accessor").toBe(true);
		expect(/class="[^"]*docs-declaration-collapsed-link[^"]*"/u.test(mappingSectionHtml), "mappingExtension section should render collapsed extension links").toBe(true);
		expect(/class="[^"]*docs-declaration-collapsed-link[^"]*" href="State\.html#State\.[^"]+"/u.test(mappingSectionHtml), "Collapsed extension links should target main State declarations").toBe(true);
		expect(/class="[^"]*docs-declaration-collapsed-link[^"]*" href="State\.html#StateExtensions\./u.test(mappingSectionHtml), "Collapsed extension links should not target extension-section anchors").toBe(false);
		expect(mappingSectionHtml.includes('class="docs-declaration-collapsed-arrow"'), "Collapsed extension links should include trailing arrow icon").toBe(true);
		expect(mappingSectionHtml.includes('Creates a new ownerless state containing the mapped value of this state.'), "mappingExtension collapsed links should not include full method declaration comments").toBe(false);
		expect(
			/<summary class="docs-declaration-header docs-declaration-header-sticky-depth-0">[\s\S]*?src\/state\/State\.ts:/u.test(mappingSectionHtml),
			"mappingExtension section should not render top-level declarations sourced from src/state/State.ts",
		).toBe(false);
		const declarationAnchorIds = [...componentHtml.matchAll(/<(?:details|div) class="docs-declaration[^"]*" id="([^"]+)"/g)].map(match => match[1]);
		expect(new Set(declarationAnchorIds).size === declarationAnchorIds.length, "Found duplicate declaration anchor IDs").toBe(true);
		const sectionAnchorIds = [...componentHtml.matchAll(/id="(section-[^"]+)"/gu)].map(match => match[1]);
		const declarationAnchorTargets = new Set([...declarationAnchorIds, ...sectionAnchorIds].map(id => `#${id}`));
		const hashLinks = [...componentHtml.matchAll(/href="(#[^"]+)"/g)].map(match => match[1]);
		expect(hashLinks.every(href => declarationAnchorTargets.has(href)), "Found declaration # links pointing to missing anchors").toBe(true);
		const componentPageLinks = [...componentHtml.matchAll(/href="Component\.html(#[^"]+)"/g)].map(match => match[1]);
		expect(componentPageLinks.every(hash => declarationAnchorTargets.has(hash)), "Found type links pointing to missing declaration anchors").toBe(true);
		const stateAnchorIds = [...stateHtml.matchAll(/<(?:details|div) class="docs-declaration[^"]*" id="([^"]+)"/g)].map(match => match[1]);
		expect(new Set(stateAnchorIds).size === stateAnchorIds.length, "Found duplicate State declaration anchor IDs").toBe(true);
		const stateSectionAnchorIds = [...stateHtml.matchAll(/id="(section-[^"]+)"/gu)].map(match => match[1]);
		const stateAnchorTargets = new Set([...stateAnchorIds, ...stateSectionAnchorIds].map(id => `#${id}`));
		const stateHashLinks = [...stateHtml.matchAll(/href="(#[^"]+)"/g)].map(match => match[1]);
		expect(stateHashLinks.every(href => stateAnchorTargets.has(href)), "Found State declaration # links pointing to missing anchors").toBe(true);
		const statePageLinks = [...stateHtml.matchAll(/href="State\.html(#[^"]+)"/g)].map(match => match[1]);
		expect(statePageLinks.every(hash => stateAnchorTargets.has(hash)), "Found State type links pointing to missing declaration anchors").toBe(true);
		const styleAnchorIds = [...styleHtml.matchAll(/<(?:details|div) class="docs-declaration[^"]*" id="([^"]+)"/g)].map(match => match[1]);
		expect(new Set(styleAnchorIds).size === styleAnchorIds.length, "Found duplicate Style declaration anchor IDs").toBe(true);
		const styleSectionAnchorIds = [...styleHtml.matchAll(/id="(section-[^"]+)"/gu)].map(match => match[1]);
		const styleAnchorTargets = new Set([...styleAnchorIds, ...styleSectionAnchorIds].map(id => `#${id}`));
		const styleHashLinks = [...styleHtml.matchAll(/href="(#[^"]+)"/g)].map(match => match[1]);
		expect(styleHashLinks.every(href => styleAnchorTargets.has(href)), "Found Style declaration # links pointing to missing anchors").toBe(true);
		const stylePageLinks = [...styleHtml.matchAll(/href="Style\.html(#[^"]+)"/g)].map(match => match[1]);
		expect(stylePageLinks.every(hash => styleAnchorTargets.has(hash)), "Found Style type links pointing to missing declaration anchors").toBe(true);
		expect(docsJson.includes('"name":"Component"'), "Missing Component in JSON").toBe(true);
		expect(docsJson.includes('"name":"State"'), "Missing State in JSON").toBe(true);
		expect(docsJson.includes('"name":"Style"'), "Missing Style in JSON").toBe(true);

		// Cross-page links: Component.html should link to State declarations
		expect(/href="State\.html#[^"]+"><span class="docs-type-reference">State<\/span>/u.test(componentHtml), "Component.html should link State type references to State.html").toBe(true);
	});

	it("dedupes section anchor ids for duplicate section titles", () => {
		const seen = new Map<string, number>();
		expect(createSectionAnchorId("State", seen)).toBe("section-state");
		expect(createSectionAnchorId("State", seen)).toBe("section-state-2");
		expect(createSectionAnchorId("State!", seen)).toBe("section-state-3");
	});
});