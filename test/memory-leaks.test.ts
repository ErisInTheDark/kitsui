import { parseStacktrace } from "@vitest/utils/source-map";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, type TestError } from "vitest";
import { Component } from "../src";

type LeakScenarioResult = {
	finalized: string[];
	missing: string[];
	name: string;
	trackStacks: Record<string, string>;
};

type LeakProbeReport = {
	failures: LeakScenarioResult[];
	scenarios: LeakScenarioResult[];
};

const reportPrefix = "__KITSUI_LEAK_REPORT__";

async function leakProbe (
	_: {
		componentUrl: string;
		mappingExtensionUrl: string;
		placeExtensionUrl: string;
		stateUrl: string;
		styleUrl: string;
	},
	dependencies: {
		Component: typeof import("../src/component/Component").Component;
		Owner: typeof import("../src/state/State").Owner;
		State: typeof import("../src/state/State").State;
		Style: typeof import("../src/component/Style").Style;
		Window: typeof import("happy-dom").Window;
	},
): Promise<LeakProbeReport> {
	const {
		Component,
		Owner,
		State,
		Style,
		Window,
	} = dependencies;

	if (typeof globalThis.gc !== "function") {
		throw new Error("Leak probe requires global gc().");
	}

	const runGc = globalThis.gc;

	const windowRef = new Window({
		url: "https://kitsui.test/",
	});
	Object.assign(globalThis, {
		Comment: windowRef.Comment,
		CustomEvent: windowRef.CustomEvent,
		Document: windowRef.Document,
		Element: windowRef.Element,
		Event: windowRef.Event,
		EventTarget: windowRef.EventTarget,
		HTMLElement: windowRef.HTMLElement,
		HTMLStyleElement: windowRef.HTMLStyleElement,
		MouseEvent: windowRef.MouseEvent,
		MutationObserver: windowRef.MutationObserver,
		Node: windowRef.Node,
		Text: windowRef.Text,
		document: windowRef.document,
		window: windowRef,
		getComputedStyle: windowRef.getComputedStyle.bind(windowRef),
	});
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: windowRef.navigator,
		writable: true,
	});

	const body = windowRef.document.body as unknown as HTMLElement;

	class TestOwner extends Owner {
		// Uses Owner's default cleanup behavior.
	}

	function flushEffects (): Promise<void> {
		const schedulerRef = globalThis as typeof globalThis & {
			scheduler?: {
				yield?: () => Promise<unknown>;
			};
		};

		if (typeof schedulerRef.scheduler?.yield === "function") {
			return schedulerRef.scheduler.yield().then(() => undefined);
		}

		return Promise.resolve();
	}

	async function settle (): Promise<void> {
		await flushEffects();
		await new Promise((resolve) => setTimeout(resolve, 0));
		await flushEffects();
	}

	async function waitForFinalization (expected: string[], finalized: Set<string>): Promise<string[]> {
		const deadline = Date.now() + 2_500;

		while (Date.now() < deadline) {
			for (let index = 0; index < 6; index += 1) {
				runGc();
			}

			await settle();

			if (expected.every((label) => finalized.has(label))) {
				break;
			}
		}

		return expected.filter((label) => !finalized.has(label));
	}

	type ScenarioSetup = {
		expected: string[];
		release?: () => void | Promise<void>;
	};

	type ScenarioBuilder = (helpers: {
		hold: <T>(value: T) => T;
		track: <T extends object>(label: string, value: T) => T;
	}) => Promise<ScenarioSetup>;

	async function runScenario (name: string, build: ScenarioBuilder): Promise<LeakScenarioResult> {
		windowRef.document.body.replaceChildren();
		const finalized = new Set<string>();
		const trackStacks: Record<string, string> = {};
		const registry = new FinalizationRegistry<string>((label) => {
			finalized.add(label);
		});
		const heldRoots: unknown[] = [];

		function captureTrackStack (label: string, limit: Function): string {
			const trackError = new Error(`Tracked object: ${label}`);

			if (typeof Error.captureStackTrace === "function") {
				Error.captureStackTrace(trackError, limit);
			}

			return trackError.stack ?? `Error: Tracked object: ${label}`;
		}

		function trackValue<T extends object> (label: string, value: T): T {
			trackStacks[label] = captureTrackStack(label, trackValue);
			registry.register(value, label);
			return value;
		}

		const setup = await build({
			hold: <T> (value: T): T => {
				heldRoots.push(value);
				return value;
			},
			track: trackValue,
		});

		await settle();
		const missing = await waitForFinalization(setup.expected, finalized);

		await setup.release?.();
		heldRoots.length = 0;
		windowRef.document.body.replaceChildren();
		await settle();

		return {
			finalized: [...finalized].sort(),
			missing,
			name,
			trackStacks,
		};
	}

	const highlightStyle = Style.Class("memory-leak-highlight", {
		color: "red",
	});

	type RegisteredScenario = {
		build: ScenarioBuilder;
		name: string;
	};

	const registeredScenarios: RegisteredScenario[] = [];
	const suiteStack: string[] = [];

	function describe (name: string, define: () => void): void {
		suiteStack.push(name);
		define();
		suiteStack.pop();
	}

	function it (name: string, build: ScenarioBuilder): void {
		registeredScenarios.push({
			build,
			name: [...suiteStack, name].join(" > "),
		});
	}

	////////////////////////////////////
	//#region Tests Start
	
	describe("components", () => {
		it("mounted component cleanup", async ({ track }) => {
			let component = track("mounted component", Component("div").appendTo(body));
			track("mounted element", component.element);

			component.remove();
			component = null as never;

			return {
				expected: ["mounted component", "mounted element"],
			};
		});

		it("owned component subtree cleanup", async ({ track }) => {
			let owner = track("subtree owner", Component("section").appendTo(body));
			const child = track("subtree child", Component("div"));
			const grandchild = track("subtree grandchild", Component("span"));

			track("subtree owner element", owner.element);
			track("subtree child element", child.element);
			track("subtree grandchild element", grandchild.element);

			child.append(grandchild);
			owner.append(child);
			owner.remove();

			owner = null as never;

			return {
				expected: [
					"subtree owner",
					"subtree owner element",
					"subtree child",
					"subtree child element",
					"subtree grandchild",
					"subtree grandchild element",
				],
			};
		});

		it("wrapped element cleanup", async ({ track }) => {
			const host = windowRef.document.createElement("div");
			windowRef.document.body.append(host);
			let wrappedElement = track("wrapped element", windowRef.document.createElement("div"));
			host.append(wrappedElement);
			let component = track("wrapped component", Component(wrappedElement as unknown as HTMLElement));

			component.remove();
			host.remove();

			component = null as never;
			wrappedElement = null as never;

			return {
				expected: ["wrapped component", "wrapped element"],
			};
		});

		it("conditional parked-node cleanup", async ({ hold, track }) => {
			const stateOwner = hold(new TestOwner());
			const visible = hold(State(stateOwner, false));
			let host = track("conditional host", Component("div").appendTo(body));
			let child = track("conditional child", Component("span").text.set("child"));

			track("conditional host element", host.element);
			track("conditional child element", child.element);

			host.appendWhen(visible, child);
			visible.set(true);
			await settle();
			visible.set(false);
			await settle();
			host.remove();

			host = null as never;
			child = null as never;

			return {
				expected: [
					"conditional host",
					"conditional host element",
					"conditional child",
					"conditional child element",
				],
				release: () => {
					stateOwner.dispose();
				},
			};
		});

		it("placement controller cleanup", async ({ hold, track }) => {
			const placementOwner = hold(new TestOwner());
			const stateOwner = hold(new TestOwner());
			const currentPlace = hold(State<object | null>(stateOwner, null));
			const left = Component("div").appendTo(body);
			const right = Component("div").appendTo(body);
			let child = track("placed child", Component("span").text.set("child"));
			let leftPlace: any = null;
			let rightPlace: any = null;

			track("placed child element", child.element);

			const placed = child.place(placementOwner, (Place: any) => {
				leftPlace = track("left place", Place().appendTo(left));
				track("left marker", leftPlace.marker);
				rightPlace = track("right place", Place().appendTo(right));
				track("right marker", rightPlace.marker);
				currentPlace.set(leftPlace);
				return currentPlace as any;
			});

			if (placed !== child) {
				throw new Error("place should return the component instance for chaining");
			}

			currentPlace.set(rightPlace);
			await settle();
			currentPlace.set(null);
			await settle();
			placementOwner.dispose();
			left.remove();
			right.remove();

			child = null as never;
			leftPlace = null;
			rightPlace = null;

			return {
				expected: [
					"placed child",
					"placed child element",
					"left place",
					"left marker",
					"right place",
					"right marker",
				],
				release: () => {
					placementOwner.dispose();
					stateOwner.dispose();
				},
			};
		});
	});

	describe("state", () => {
		it("base state disposal", async ({ track }) => {
			let owner = track("base state owner", new TestOwner());
			let state = track("base state", State(owner, 1));

			owner.dispose();

			owner = null as never;
			state = null as never;

			return {
				expected: ["base state owner", "base state"],
			};
		});

		it("owner-bound state callback cleanup", async ({ hold, track }) => {
			const sourceOwner = hold(new TestOwner());
			const state = hold(State(sourceOwner, 0));
			let listenerOwner = track("state listener owner", new TestOwner());
			const queuedListener = track("queued state listener", () => {
				// Intentionally empty.
			});
			const immediateListener = track("immediate state listener", () => {
				// Intentionally empty.
			});

			state.subscribe(listenerOwner, queuedListener);
			state.subscribeImmediate(listenerOwner, immediateListener);
			state.set(1);
			await settle();
			listenerOwner.dispose();

			listenerOwner = null as never;

			return {
				expected: [
					"state listener owner",
					"queued state listener",
					"immediate state listener",
				],
				release: () => {
					sourceOwner.dispose();
				},
			};
		});

		it("mapped state cleanup while source survives", async ({ hold, track }) => {
			const sourceOwner = hold(new TestOwner());
			const source = hold(State(sourceOwner, 1));
			let mappedOwner = track("mapped owner", new TestOwner());
			const mapValue = track("mapped callback", (value: number) => {
				return value + 1;
			});
			let mapped = track("mapped state", source.map(mappedOwner, mapValue));

			mappedOwner.dispose();

			mappedOwner = null as never;
			mapped = null as never;

			return {
				expected: ["mapped owner", "mapped callback", "mapped state"],
				release: () => {
					sourceOwner.dispose();
				},
			};
		});

		it("self-owned derived state cleanup", async ({ track }) => {
			let owner = track("derived owner", new TestOwner());
			let source = track("derived source", State(owner, null as string | null));
			let truthy = track("truthy derived", source.truthy);
			let falsy = track("falsy derived", source.falsy);
			const fallbackToken = track("fallback callback token", {});
			const fallback = track("fallback callback", () => {
				void fallbackToken;
				return "fallback";
			});
			let orState = track("or derived", source.or(fallback));

			source.set("value");
			await settle();
			owner.dispose();

			owner = null as never;
			source = null as never;
			truthy = null as never;
			falsy = null as never;
			orState = null as never;

			return {
				expected: [
					"derived owner",
					"derived source",
					"truthy derived",
					"falsy derived",
					"fallback callback token",
					"fallback callback",
					"or derived",
				],
			};
		});
	});

	describe("integration", () => {
		it("use render callback cleanup", async ({ hold, track }) => {
			const stateOwner = hold(new TestOwner());
			const state = hold(State(stateOwner, 0));
			let component = track("use component", Component("div").appendTo(body));
			const render = track("use render callback", (value: number, target: Component) => {
				target.text.set(String(value));
			});

			track("use component element", component.element);
			component.use(state, render);
			state.set(1);
			await settle();
			component.remove();

			component = null as never;

			return {
				expected: ["use component", "use component element", "use render callback"],
				release: () => {
					stateOwner.dispose();
				},
			};
		});

		it("manipulator binding cleanup", async ({ hold, track }) => {
			const sourceOwner = hold(new TestOwner());
			const visible = hold(State(sourceOwner, true));
			const textValue = hold(State(sourceOwner, "alpha"));
			const attributeName = hold(State(sourceOwner, "data-bound"));
			const attributeValue = hold(State(sourceOwner, "ready"));
			const ariaLabel = hold(State(sourceOwner, "aria ready"));
			const classSelection = hold(State(sourceOwner, highlightStyle as typeof highlightStyle | null));
			let component = track("binding component", Component("div").appendTo(body));

			track("binding component element", component.element);
			component.class.add(classSelection);
			component.class.bind(visible, highlightStyle);
			component.attribute.set(attributeName, attributeValue);
			component.attribute.bind(visible, { name: "hidden", value: "" });
			component.text.bind(visible, textValue);
			component.aria.label(ariaLabel);

			visible.set(false);
			textValue.set("beta");
			attributeValue.set("done");
			ariaLabel.set("aria done");
			classSelection.set(null);
			await settle();
			component.remove();

			component = null as never;

			return {
				expected: ["binding component", "binding component element"],
				release: () => {
					sourceOwner.dispose();
				},
			};
		});
	});

	describe("events", () => {
		it("event listener cleanup", async ({ hold, track }) => {
			const explicitOwner = hold(new TestOwner());
			const sourceOwner = hold(new TestOwner());
			const listenerState = hold(State(sourceOwner, null as (() => void) | null));
			let component = track("event component", Component("button").appendTo(body));
			const explicitListener = track("explicit event listener", () => {
				// Intentionally empty.
			});
			const ownedListener = track("owned event listener", () => {
				// Intentionally empty.
			});
			const reactiveListener = track("reactive event listener", () => {
				// Intentionally empty.
			});

			track("event component element", component.element);
			component.event.on.click(explicitOwner, explicitListener);
			component.event.owned.on.click(ownedListener);
			listenerState.set(reactiveListener);
			await settle();
			component.event.owned.on.click(listenerState);
			await settle();
			component.element.dispatchEvent(new windowRef.MouseEvent("click", { bubbles: true }) as unknown as Event);
			listenerState.set(null);
			await settle();
			component.remove();

			component = null as never;

			return {
				expected: [
					"event component",
					"event component element",
					"explicit event listener",
					"owned event listener",
					"reactive event listener",
				],
				release: () => {
					explicitOwner.dispose();
					sourceOwner.dispose();
				},
			};
		});
	});

	//#endregion 
	////////////////////////////////////

	const scenarios: LeakScenarioResult[] = [];

	for (const scenario of registeredScenarios) {
		scenarios.push(await runScenario(scenario.name, scenario.build));
	}

	return {
		failures: scenarios.filter((scenario) => scenario.missing.length > 0),
		scenarios,
	};
}

async function runLeakProbe (): Promise<LeakProbeReport> {
	const cwd = process.cwd();
	const sourceFilePath = resolve(cwd, "test", "memory-leaks.test.ts");
	const trackLocations = createLeakTrackLocationMap(sourceFilePath);
	const payload = JSON.stringify({
		componentUrl: pathToFileURL(resolve(cwd, "src", "component", "Component.ts")).href,
		mappingExtensionUrl: pathToFileURL(resolve(cwd, "src", "state", "extensions", "mappingExtension.ts")).href,
		placeExtensionUrl: pathToFileURL(resolve(cwd, "src", "component", "extensions", "placeExtension.ts")).href,
		stateUrl: pathToFileURL(resolve(cwd, "src", "state", "State.ts")).href,
		styleUrl: pathToFileURL(resolve(cwd, "src", "component", "Style.ts")).href,
	});
	const probeCodeLines = [
		`const args = JSON.parse(${JSON.stringify(payload)});`,
		"try {",
		"\tconst { Window } = await import(\"happy-dom\");",
		"\tconst componentModule = await import(args.componentUrl);",
		"\tconst stateModule = await import(args.stateUrl);",
		"\tconst styleModule = await import(args.styleUrl);",
		"\tconst placeExtensionModule = await import(args.placeExtensionUrl);",
		"\tconst mappingExtensionModule = await import(args.mappingExtensionUrl);",
		"\tconst Component = componentModule.Component ?? componentModule.default?.Component;",
		"\tconst Owner = stateModule.Owner ?? stateModule.default?.Owner;",
		"\tconst State = stateModule.State ?? stateModule.default?.State;",
		"\tconst Style = styleModule.Style ?? styleModule.default?.Style;",
		"\tconst resolveExtension = (moduleValue) => moduleValue?.default?.default ?? moduleValue?.default ?? moduleValue;",
		"\tconst placeExtension = resolveExtension(placeExtensionModule);",
		"\tconst mappingExtension = resolveExtension(mappingExtensionModule);",
		"\tif (typeof Component !== \"function\") throw new Error(`Component export was not callable: ${Object.keys(componentModule).join(\",\")}`);",
		"\tif (typeof Owner !== \"function\") throw new Error(`Owner export was not callable: ${Object.keys(stateModule).join(\",\")}`);",
		"\tif (typeof State !== \"function\") throw new Error(`State export was not callable: ${Object.keys(stateModule).join(\",\")}`);",
		"\tif (typeof Style !== \"function\" || typeof Style.Class !== \"function\") throw new Error(`Style export was not callable: ${Object.keys(styleModule).join(\",\")}`);",
		"\tif (typeof placeExtension !== \"function\") throw new Error(`placeExtension export was not callable: ${Object.keys(placeExtensionModule).join(\",\")}`);",
		"\tif (typeof mappingExtension !== \"function\") throw new Error(`mappingExtension export was not callable: ${Object.keys(mappingExtensionModule).join(\",\")}`);",
		"\tplaceExtension();",
		"\tmappingExtension();",
		`	const report = await (${leakProbe.toString()})(args, { Component, Owner, State, Style, Window });`,
		`	console.log(${JSON.stringify(reportPrefix)} + JSON.stringify(report));`,
		"} catch (error) {",
		"\tconsole.error(error instanceof Error ? error.stack ?? error.message : String(error));",
		"\tprocess.exitCode = 1;",
		"}",
	];
	const probeCode = probeCodeLines.join("\n");

	const child = spawn(process.execPath, [
		"--expose-gc",
		"--input-type=module",
		"--import",
		"tsx",
		"--eval",
		probeCode,
	], {
		cwd,
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdout = "";
	let stderr = "";

	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", resolve);
	});

	const reportLine = stdout
		.split(/\r?\n/u)
		.reverse()
		.find((line) => line.startsWith(reportPrefix));

	if (exitCode !== 0) {
		throw new Error(`Leak probe failed with exit code ${exitCode}.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`);
	}

	if (!reportLine) {
		throw new Error(`Leak probe did not emit a report.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`);
	}

	return remapLeakProbeReportStacks(JSON.parse(reportLine.slice(reportPrefix.length)) as LeakProbeReport, sourceFilePath, trackLocations);
}

type LeakProbeOutcome =
	| {
		error: unknown;
		report?: never;
	}
	| {
		error?: never;
		report: LeakProbeReport;
	};

type LeakScenarioTree = {
	scenarios: Array<{
		name: string;
		result: LeakScenarioResult;
	}>;
	children: Map<string, LeakScenarioTree>;
};

type LeakTrackLocation = {
	column: number;
	line: number;
};

function createLeakTrackLocationMap (sourceFilePath: string): Record<string, LeakTrackLocation> {
	const sourceText = readFileSync(sourceFilePath, "utf8");
	const trackPattern = /track\(\s*["']([^"']+)["']/gu;
	const trackLocations: Record<string, LeakTrackLocation> = {};
	let match: RegExpExecArray | null = null;

	while ((match = trackPattern.exec(sourceText))) {
		const matchedText = match[0];
		const label = match[1];
		const trackIndex = match.index + matchedText.indexOf("track(");
		const beforeMatch = sourceText.slice(0, trackIndex);
		const line = beforeMatch.split(/\r?\n/u).length;
		const lastNewlineIndex = beforeMatch.lastIndexOf("\n");
		const column = trackIndex - lastNewlineIndex;

		trackLocations[label] = { column, line };
	}

	return trackLocations;
}

function remapLeakProbeStack (
	stack: string,
	label: string,
	sourceFilePath: string,
	trackLocations: Record<string, LeakTrackLocation>,
): string {
	const location = trackLocations[label];

	if (!location) {
		return stack;
	}

	const lines = stack.split(/\r?\n/u);
	const firstFrameIndex = lines.findIndex((line) => /\[eval1\]:\d+:\d+/u.test(line));

	if (firstFrameIndex < 0) {
		return stack;
	}

	lines[firstFrameIndex] = `    at ${sourceFilePath.replace(/\\/gu, "/")}:${location.line}:${location.column}`;
	return lines.join("\n");
}

function remapLeakProbeReportStacks (
	report: LeakProbeReport,
	sourceFilePath: string,
	trackLocations: Record<string, LeakTrackLocation>,
): LeakProbeReport {
	const remapScenario = (scenario: LeakScenarioResult): LeakScenarioResult => ({
		...scenario,
		trackStacks: Object.fromEntries(Object.entries(scenario.trackStacks).map(([label, stack]) => [
			label,
			remapLeakProbeStack(stack, label, sourceFilePath, trackLocations),
		])),
	});

	return {
		failures: report.failures.map(remapScenario),
		scenarios: report.scenarios.map(remapScenario),
	};
}

function createLeakScenarioTree (): LeakScenarioTree {
	return {
		children: new Map(),
		scenarios: [],
	};
}

function addLeakScenario (
	tree: LeakScenarioTree,
	path: string[],
	result: LeakScenarioResult,
): void {
	const [head, ...tail] = path;

	if (!head) {
		return;
	}

	if (tail.length === 0) {
		tree.scenarios.push({
			name: head,
			result,
		});
		return;
	}

	let child = tree.children.get(head);

	if (!child) {
		child = createLeakScenarioTree();
		tree.children.set(head, child);
	}

	addLeakScenario(child, tail, result);
}

function reportLeakFailure (message: string, stack: string): void {
	type Task = NonNullable<ReturnType<typeof expect.getState>["task"]>;

	const task = (globalThis as {
		__vitest_worker__?: {
			current?: Task;
		};
	}).__vitest_worker__?.current;
	const error: TestError = {
		message,
		name: "LeakAssertionError",
		stack,
	};
	
	error.stacks = parseStacktrace(stack);

	if (!task) {
		const fallbackError = new Error(message);
		fallbackError.stack = stack;
		throw fallbackError;
	}

	const mutableTask = task as {
		-readonly [Key in keyof typeof task]: (typeof task)[Key];
	};

	mutableTask.result ??= { state: "fail" };
	mutableTask.result.state = "fail";
	mutableTask.result.errors ??= [];
	mutableTask.result.errors.push(error);
}

function registerLeakScenarioTree (tree: LeakScenarioTree): void {
	for (const [suiteName, childTree] of tree.children) {
		describe(suiteName, () => {
			registerLeakScenarioTree(childTree);
		});
	}

	for (const scenario of tree.scenarios) {
		it(scenario.name, () => {
			for (const missing of scenario.result.missing) {
				reportLeakFailure(
					`Tracked label '${missing}' was not finalized in scenario '${scenario.result.name}'.`,
					scenario.result.trackStacks[missing] ?? `Error: Tracked label '${missing}' was not finalized in scenario '${scenario.result.name}'.`,
				);
			}
		});
	}
}

const leakProbeOutcome: LeakProbeOutcome = await runLeakProbe()
	.then((report) => ({ report }))
	.catch((error: unknown) => ({ error }));

describe("memory leaks", () => {
	if ("error" in leakProbeOutcome) {
		it("runs the leak probe", () => {
			throw leakProbeOutcome.error;
		});
		return;
	}

	const scenarioTree = createLeakScenarioTree();

	for (const scenario of leakProbeOutcome.report.scenarios) {
		addLeakScenario(scenarioTree, scenario.name.split(" > "), scenario);
	}

	registerLeakScenarioTree(scenarioTree);
});
