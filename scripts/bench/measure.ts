import { GCProfiler } from "node:v8";
import type { Scenario, Kitsui } from "./scenarios";

export interface PhaseSample {
	/** Fastest wall time of the synchronous work plus the microtasks it queued. */
	ms: number;
	/** Time V8 spent collecting garbage during the phase. */
	gcMs: number;
}

export interface ScenarioResult {
	name: string;
	description: string;
	phases: Record<string, PhaseSample>;
	/** CPU time spent in deferred (timer-driven) work after build, such as orphan checks. */
	deferredCpuMs: number;
	/** Heap retained by a live instance after build settles. */
	retainedKiB: number;
	/** Heap still retained after dispose settles; non-zero suggests a leak. */
	leakedKiB: number;
}

const WARMUP_RUNS = 2;
const MEASURED_RUNS = 7;

function collectGarbage (): void {
	const gc = globalThis.gc;
	if (!gc) {
		throw new Error("Run the benchmark with --expose-gc.");
	}

	gc();
	gc();
}

async function flushMicrotasks (): Promise<void> {
	for (let index = 0; index < 10; index++) {
		await Promise.resolve();
	}
}

function nextMacrotask (): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

async function settleTimers (): Promise<number> {
	const start = process.cpuUsage();
	await nextMacrotask();
	await flushMicrotasks();
	await nextMacrotask();
	await flushMicrotasks();
	const usage = process.cpuUsage(start);
	return (usage.user + usage.system) / 1000;
}

async function measurePhase (run: () => void): Promise<PhaseSample> {
	const profiler = new GCProfiler();
	profiler.start();
	const start = performance.now();
	run();
	await flushMicrotasks();
	const ms = performance.now() - start;
	const gcMs = (profiler.stop()?.statistics ?? []).reduce((total, entry) => total + entry.cost, 0) / 1000;
	return { ms, gcMs };
}

function heapUsed (): number {
	collectGarbage();
	return process.memoryUsage().heapUsed;
}

function median (values: number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

interface RunSample {
	phases: Record<string, PhaseSample>;
	deferredCpuMs: number;
	retainedBytes: number;
	leakedBytes: number;
}

async function runOnce (scenario: Scenario, kitsui: Kitsui): Promise<RunSample> {
	const instance = scenario.create(kitsui);
	const phases: Record<string, PhaseSample> = {};

	const before = heapUsed();
	phases.build = await measurePhase(() => instance.build());
	const deferredCpuMs = await settleTimers();
	const retainedBytes = heapUsed() - before;

	for (const [name, step] of Object.entries(instance.steps)) {
		phases[name] = await measurePhase(step);
		await settleTimers();
	}

	phases.dispose = await measurePhase(() => instance.dispose());
	await settleTimers();
	const leakedBytes = heapUsed() - before;

	return { phases, deferredCpuMs, retainedBytes, leakedBytes };
}

export async function measureScenario (scenario: Scenario, kitsui: Kitsui): Promise<ScenarioResult> {
	for (let run = 0; run < WARMUP_RUNS; run++) {
		await runOnce(scenario, kitsui);
	}

	const samples: RunSample[] = [];
	for (let run = 0; run < MEASURED_RUNS; run++) {
		samples.push(await runOnce(scenario, kitsui));
	}

	const phases: Record<string, PhaseSample> = {};
	for (const name of Object.keys(samples[0].phases)) {
		phases[name] = {
			// The fastest run is the one least disturbed by other processes on the machine.
			ms: Math.min(...samples.map(sample => sample.phases[name].ms)),
			gcMs: median(samples.map(sample => sample.phases[name].gcMs)),
		};
	}

	return {
		name: scenario.name,
		description: scenario.description,
		phases,
		deferredCpuMs: median(samples.map(sample => sample.deferredCpuMs)),
		retainedKiB: median(samples.map(sample => sample.retainedBytes)) / 1024,
		leakedKiB: median(samples.map(sample => sample.leakedBytes)) / 1024,
	};
}
