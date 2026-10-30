// Measures kitsui under realistic heavy scenarios in happy-dom.
//   pnpm bench [--filter <text>] [--save <name>] [--compare <name>] [--source <path/to/src/index.ts>]
// Times are the fastest of several runs; memory figures are medians. --save writes .bench/<name>.json; --compare prints deltas against it.
// --source benchmarks another checkout of kitsui, e.g. an exported older revision, with the same scenarios.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { installDOM } from "./bench/dom";
import { measureScenario, type ScenarioResult } from "./bench/measure";
import { scenarios, type Kitsui } from "./bench/scenarios";

const resultsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".bench");

function formatNumber (value: number): string {
	return value >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function formatDelta (current: number, baseline: number | undefined): string {
	if (baseline === undefined || baseline === 0) {
		return "";
	}

	const percent = ((current - baseline) / baseline) * 100;
	return ` (${percent >= 0 ? "+" : ""}${percent.toFixed(0)}%)`;
}

function printResults (results: ScenarioResult[], baseline: ScenarioResult[] | null): void {
	for (const result of results) {
		const previous = baseline?.find(entry => entry.name === result.name);
		console.log(`\n${result.name}: ${result.description}`);
		for (const [phase, sample] of Object.entries(result.phases)) {
			const previousSample = previous?.phases[phase];
			console.log(`  ${phase.padEnd(20)} ${formatNumber(sample.ms).padStart(8)} ms${formatDelta(sample.ms, previousSample?.ms).padEnd(8)}  gc ${formatNumber(sample.gcMs)} ms${formatDelta(sample.gcMs, previousSample?.gcMs)}`);
		}
		console.log(`  ${"deferred cpu".padEnd(20)} ${formatNumber(result.deferredCpuMs).padStart(8)} ms${formatDelta(result.deferredCpuMs, previous?.deferredCpuMs)}`);
		console.log(`  ${"retained".padEnd(20)} ${formatNumber(result.retainedKiB).padStart(8)} KiB${formatDelta(result.retainedKiB, previous?.retainedKiB)}`);
		console.log(`  ${"leaked".padEnd(20)} ${formatNumber(result.leakedKiB).padStart(8)} KiB`);
	}
}

async function main (): Promise<void> {
	const { values } = parseArgs({
		options: {
			compare: { type: "string" },
			filter: { type: "string" },
			save: { type: "string" },
			source: { type: "string" },
		},
	});

	installDOM();
	const kitsui = (values.source
		? await import(pathToFileURL(path.resolve(values.source)).href)
		: await import("../src/index")) as Kitsui;

	const selected = scenarios.filter(scenario => !values.filter || scenario.name.includes(values.filter));
	const results: ScenarioResult[] = [];
	for (const scenario of selected) {
		results.push(await measureScenario(scenario, kitsui));
	}

	const baseline = values.compare
		? JSON.parse(await readFile(path.join(resultsDirectory, `${values.compare}.json`), "utf8")) as ScenarioResult[]
		: null;
	printResults(results, baseline);

	if (values.save) {
		await mkdir(resultsDirectory, { recursive: true });
		await writeFile(path.join(resultsDirectory, `${values.save}.json`), `${JSON.stringify(results, null, "\t")}\n`, "utf8");
	}
}

void main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
