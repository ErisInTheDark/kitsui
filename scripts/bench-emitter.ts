// Measures Emitter dispatch cost and per-emitter memory on a 5-deep class hierarchy, with no DOM.
//   pnpm bench:emitter [--adapter <module>]... [--save <name>]
// --adapter adds another emitter implementation as a control: a module whose default export is an EmitterBenchAdapter.
// Times are the fastest of several runs. --save writes .bench/<name>.json.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Emitter } from "../src/event/Emitter";

const HOT_ITERATIONS = 3_000_000;
const MEASURED_RUNS = 7;
const ROTATING_HOSTS = 1000;
const MEMORY_HOSTS = 10_000;

export type BenchHandler = (host: unknown, value: number) => number;

/** One subscription setup of one emitter implementation. Loops live in the adapter so each has its own call sites. */
export interface BenchFixture {
	create (): object;
	/** Fires `tick` `iterations` times, cycling through `hosts`. */
	emit (hosts: object[], iterations: number): void;
	first (hosts: object[], iterations: number): void;
	reduce (hosts: object[], iterations: number): void;
	/** Touches the verbs a typical entity uses, so lazily created state is included in memory figures. */
	touch (host: object): void;
	subscribeInstance (host: object, handler: BenchHandler): void;
}

export interface BenchAdapter {
	readonly name: string;
	/** Defines a fresh 5-deep hierarchy with `classHandlers` spread over its levels and `ownHandlers` as one level's built-in handlers, like decorated methods. */
	fixture (classHandlers: readonly BenchHandler[], ownHandlers: readonly BenchHandler[]): BenchFixture;
}

interface TickEvents {
	tick (value: number): number;
	other (value: number): number;
	third (value: number): number;
}

class EmitterRoot {
	readonly event = new Emitter<this, TickEvents>(this);
}

const kitsuiAdapter: BenchAdapter = {
	name: "kitsui",
	fixture (classHandlers, ownHandlers) {
		class Level1 extends EmitterRoot { }
		class Level2 extends Level1 { }
		class Level3 extends Level2 { }
		class Level4 extends Level3 { }
		const levels = [Level4, Level3, Level2, Level1, EmitterRoot];
		classHandlers.forEach((handler, index) => Emitter.of(levels[index % levels.length]).on.tick(null, handler));
		ownHandlers.forEach(handler => Emitter.of(Level2).on.tick(null, handler));

		return {
			create: () => new Level4(),
			emit (hosts, iterations) {
				const instances = hosts as EmitterRoot[];
				for (let index = 0; index < iterations; index++) {
					instances[index % instances.length].event.emit.tick(index);
				}
			},
			first (hosts, iterations) {
				const instances = hosts as EmitterRoot[];
				for (let index = 0; index < iterations; index++) {
					sink += instances[index % instances.length].event.first.tick(index) ?? 0;
				}
			},
			reduce (hosts, iterations) {
				const instances = hosts as EmitterRoot[];
				for (let index = 0; index < iterations; index++) {
					sink += instances[index % instances.length].event.reduce.tick(index);
				}
			},
			touch (host) {
				const instance = host as EmitterRoot;
				instance.event.emit.tick(1);
				instance.event.emit.other(1);
				instance.event.first.tick(1);
				instance.event.reduce.third(1);
			},
			subscribeInstance (host, handler) {
				(host as EmitterRoot).event.on.tick(null, handler);
			},
		};
	},
};

let sink = 0;

/** Distinct compiled functions, so call sites see the polymorphism real handlers cause rather than one inlinable closure. */
function createHandlers (count: number, label: string): BenchHandler[] {
	const handlers: BenchHandler[] = [];
	for (let index = 0; index < count; index++) {
		handlers.push(new Function("host", "value", `/* ${label} ${index} */ return value + ${index};`) as BenchHandler);
	}

	return handlers;
}

function fastestNanoseconds (iterations: number, run: () => void): number {
	let best = Infinity;
	for (let attempt = 0; attempt < MEASURED_RUNS; attempt++) {
		const start = process.hrtime.bigint();
		run();
		const perOperation = Number(process.hrtime.bigint() - start) / iterations;
		best = Math.min(best, perOperation);
	}

	return best;
}

function heapUsed (): number {
	const gc = globalThis.gc;
	if (!gc) {
		throw new Error("Run the benchmark with --expose-gc.");
	}

	gc();
	gc();
	return process.memoryUsage().heapUsed;
}

function bytesPerHost (create: () => object): number {
	const before = heapUsed();
	const hosts: object[] = [];
	for (let index = 0; index < MEMORY_HOSTS; index++) {
		hosts.push(create());
	}

	const used = heapUsed() - before;
	sink += hosts.length;
	return used / MEMORY_HOSTS;
}

interface Measurement {
	readonly adapter: string;
	readonly results: Record<string, number>;
}

function measure (adapter: BenchAdapter): Measurement {
	const results: Record<string, number> = {};
	const timed = (name: string, iterations: number, run: () => void): void => {
		results[`${name} ns`] = fastestNanoseconds(iterations, run);
	};

	for (const classCount of [0, 1, 4]) {
		const fixture = adapter.fixture(createHandlers(classCount, `class ${adapter.name}`), []);
		const one = [fixture.create()];
		const many = Array.from({ length: ROTATING_HOSTS }, () => fixture.create());
		timed(`emit ${classCount} class subs, one host`, HOT_ITERATIONS, () => fixture.emit(one, HOT_ITERATIONS));
		timed(`emit ${classCount} class subs, ${ROTATING_HOSTS} hosts`, HOT_ITERATIONS, () => fixture.emit(many, HOT_ITERATIONS));
		timed(`first ${classCount} class subs, ${ROTATING_HOSTS} hosts`, HOT_ITERATIONS, () => fixture.first(many, HOT_ITERATIONS));
		timed(`reduce ${classCount} class subs, ${ROTATING_HOSTS} hosts`, HOT_ITERATIONS, () => fixture.reduce(many, HOT_ITERATIONS));
	}

	const instanceFixture = adapter.fixture(createHandlers(1, `mixed ${adapter.name}`), []);
	const instanceHosts = Array.from({ length: ROTATING_HOSTS }, () => instanceFixture.create());
	const [instanceHandler] = createHandlers(1, `instance ${adapter.name}`);
	for (const host of instanceHosts) {
		instanceFixture.subscribeInstance(host, instanceHandler);
	}
	timed(`emit 1 class + 1 instance sub, ${ROTATING_HOSTS} hosts`, HOT_ITERATIONS, () => instanceFixture.emit(instanceHosts, HOT_ITERATIONS));

	const ownFixture = adapter.fixture([], createHandlers(3, `own ${adapter.name}`));
	const ownHosts = Array.from({ length: ROTATING_HOSTS }, () => ownFixture.create());
	timed(`emit 3 own handlers, ${ROTATING_HOSTS} hosts`, HOT_ITERATIONS, () => ownFixture.emit(ownHosts, HOT_ITERATIONS));

	const emptyFixture = adapter.fixture([], []);
	results["memory bare B/emitter"] = bytesPerHost(() => emptyFixture.create());
	results["memory after emitting B/emitter"] = bytesPerHost(() => {
		const host = emptyFixture.create();
		emptyFixture.touch(host);
		return host;
	});
	results["memory 3 own handlers, after emitting B/emitter"] = bytesPerHost(() => {
		const host = ownFixture.create();
		ownFixture.touch(host);
		return host;
	});
	const [memoryHandler] = createHandlers(1, `memory ${adapter.name}`);
	results["memory 1 instance sub, after emitting B/emitter"] = bytesPerHost(() => {
		const host = emptyFixture.create();
		emptyFixture.subscribeInstance(host, memoryHandler);
		emptyFixture.touch(host);
		return host;
	});

	return { adapter: adapter.name, results };
}

function print (measurements: readonly Measurement[]): void {
	const names = Object.keys(measurements[0]?.results ?? {});
	const width = Math.max(...names.map(name => name.length));
	console.log(`${"".padEnd(width)}  ${measurements.map(measurement => measurement.adapter.padStart(10)).join("  ")}`);
	for (const name of names) {
		console.log(`${name.padEnd(width)}  ${measurements.map(measurement => (measurement.results[name]?.toFixed(name.endsWith(" ns") ? 1 : 0) ?? "-").padStart(10)).join("  ")}`);
	}
}

async function main (): Promise<void> {
	const { values } = parseArgs({
		options: {
			adapter: { multiple: true, type: "string" },
			save: { type: "string" },
		},
	});

	const adapters = [kitsuiAdapter];
	for (const modulePath of values.adapter ?? []) {
		const loaded = await import(pathToFileURL(path.resolve(modulePath)).href) as { default: BenchAdapter };
		adapters.push(loaded.default);
	}

	const measurements = adapters.map(measure);
	print(measurements);
	console.log(`(sink ${sink})`);

	if (values.save) {
		const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".bench");
		await mkdir(directory, { recursive: true });
		await writeFile(path.join(directory, `${values.save}.json`), `${JSON.stringify(measurements, null, "\t")}\n`, "utf8");
	}
}

void main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
