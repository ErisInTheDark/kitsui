import { afterEach, describe, expect, it, vi } from "vitest";
import temporalExtension from "../../src/state/extensions/temporalExtension";
import { Owner, State, type StateListener } from "../../src/state/State";

temporalExtension();

const activeOwners = new Set<Owner>();

function createOwner (): Owner {
	const owner = Owner();
	activeOwners.add(owner);
	return owner;
}

async function flushEffects (): Promise<void> {
	const schedulerRef = globalThis as typeof globalThis & {
		scheduler?: {
			yield?: () => Promise<unknown>;
		};
	};

	if (typeof schedulerRef.scheduler?.yield === "function") {
		await schedulerRef.scheduler.yield();
		await schedulerRef.scheduler.yield();
		return;
	}

	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

function useTimerClock (): void {
	vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
}

function own<T> (state: State.Readonly<T>, listener: StateListener<T> = () => undefined): Owner {
	const owner = createOwner();
	state.subscribe(owner, listener);
	return owner;
}

afterEach(() => {
	for (const owner of activeOwners) {
		owner.dispose();
	}
	activeOwners.clear();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("State temporal extensions", () => {
	it("debounce exposes the initial value and delays one queued source update", async () => {
		useTimerClock();
		const sourceOwner = createOwner();
		const source = State(sourceOwner, "initial");
		const debounced = source.debounce(100);
		const derivedOwner = own(debounced);

		expect(debounced.value).toBe("initial");
		source.set("next");
		expect(debounced.value).toBe("initial");
		await flushEffects();
		vi.advanceTimersByTime(99);
		expect(debounced.value).toBe("initial");
		vi.advanceTimersByTime(1);
		expect(debounced.value).toBe("next");

		derivedOwner.dispose();
		sourceOwner.dispose();
	});

	it("debounce resets its deadline and emits only the latest quiet value", async () => {
		useTimerClock();
		const sourceOwner = createOwner();
		const source = State(sourceOwner, "a");
		const debounced = source.debounce(100);
		const listener = vi.fn();
		const derivedOwner = own(debounced, listener);

		source.set("b");
		await flushEffects();
		vi.advanceTimersByTime(60);
		source.set("c");
		await flushEffects();
		vi.advanceTimersByTime(99);
		expect(debounced.value).toBe("a");
		vi.advanceTimersByTime(1);
		await flushEffects();
		expect(debounced.value).toBe("c");
		expect(listener).toHaveBeenCalledOnce();

		derivedOwner.dispose();
		sourceOwner.dispose();
	});

	it("debounce coalesces synchronous writes before scheduling and suppresses a batch that returns to its origin", async () => {
		useTimerClock();
		const sourceOwner = createOwner();
		const source = State(sourceOwner, "a");
		const debounced = source.debounce(50);
		const listener = vi.fn();
		const derivedOwner = own(debounced, listener);

		source.set("b");
		source.set("c");
		source.set("d");
		await flushEffects();
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(50);
		await flushEffects();
		expect(debounced.value).toBe("d");
		expect(listener).toHaveBeenCalledOnce();

		source.set("other");
		source.set("d");
		await flushEffects();
		expect(vi.getTimerCount()).toBe(0);
		expect(listener).toHaveBeenCalledOnce();

		derivedOwner.dispose();
		sourceOwner.dispose();
	});

	it("throttle emits the first queued change immediately and the latest trailing value at the boundary", async () => {
		useTimerClock();
		const sourceOwner = createOwner();
		const source = State(sourceOwner, "a");
		const throttled = source.throttle(100);
		const listener = vi.fn();
		const derivedOwner = own(throttled, listener);

		source.set("b");
		await flushEffects();
		expect(throttled.value).toBe("b");
		source.set("c");
		await flushEffects();
		source.set("d");
		await flushEffects();
		expect(throttled.value).toBe("b");
		vi.advanceTimersByTime(100);
		await flushEffects();
		expect(throttled.value).toBe("d");
		expect(listener).toHaveBeenCalledTimes(2);

		derivedOwner.dispose();
		sourceOwner.dispose();
	});

	it("throttle coalesces a synchronous source burst before its leading emission", async () => {
		useTimerClock();
		const sourceOwner = createOwner();
		const source = State(sourceOwner, 0);
		const throttled = source.throttle(100);
		const listener = vi.fn();
		const derivedOwner = own(throttled, listener);

		source.set(1);
		source.set(2);
		source.set(3);
		await flushEffects();

		expect(throttled.value).toBe(3);
		expect(listener).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(1);

		derivedOwner.dispose();
		sourceOwner.dispose();
	});

	it("throttle keeps continuous input rate-limited and eventually reaches the final source value", async () => {
		useTimerClock();
		const sourceOwner = createOwner();
		const source = State(sourceOwner, 0);
		const throttled = source.throttle(10);
		const values: number[] = [];
		const derivedOwner = own(throttled, value => values.push(value));

		source.set(1);
		await flushEffects();
		for (let value = 2; value <= 5; value++) {
			vi.advanceTimersByTime(3);
			source.set(value);
			await flushEffects();
		}
		vi.advanceTimersByTime(20);
		await flushEffects();

		expect(values).toEqual([1, 4, 5]);
		expect(throttled.value).toBe(source.value);
		expect(vi.getTimerCount()).toBe(0);

		derivedOwner.dispose();
		sourceOwner.dispose();
	});

	it("throttle applies normal equality to a repeated trailing value and ends the following empty interval", async () => {
		useTimerClock();
		const sourceOwner = createOwner();
		const source = State(sourceOwner, "a");
		const throttled = source.throttle(20);
		const listener = vi.fn();
		const derivedOwner = own(throttled, listener);

		source.set("b");
		await flushEffects();
		expect(listener).toHaveBeenCalledOnce();

		source.set("c");
		await flushEffects();
		source.set("b");
		await flushEffects();
		vi.advanceTimersByTime(20);
		await flushEffects();
		expect(listener).toHaveBeenCalledOnce();
		expect(throttled.value).toBe("b");
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(20);
		expect(vi.getTimerCount()).toBe(0);

		derivedOwner.dispose();
		sourceOwner.dispose();
	});

	it.each(["debounce", "throttle"] as const)("%s uses zero duration as queued identity without a timer", async (method) => {
		useTimerClock();
		const sourceOwner = createOwner();
		const source = State(sourceOwner, 0);
		const derived = source[method](0);
		const derivedOwner = own(derived);

		source.set(1);
		source.set(2);
		expect(derived.value).toBe(0);
		await flushEffects();
		expect(derived.value).toBe(2);
		expect(vi.getTimerCount()).toBe(0);

		derivedOwner.dispose();
		sourceOwner.dispose();
	});

	it.each(["debounce", "throttle"] as const)("%s cancels active timing work on derived or source disposal", async (method) => {
		useTimerClock();
		const sourceOwner = createOwner();
		const source = State(sourceOwner, 0);
		const derived = source[method](100);
		const derivedOwner = own(derived);

		source.set(1);
		await flushEffects();
		expect(vi.getTimerCount()).toBe(1);
		derivedOwner.dispose();
		expect(derived.disposed).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(100);
		expect(derived.value).toBe(method === "throttle" ? 1 : 0);

		const second = source[method](100);
		const secondOwner = own(second);
		source.set(2);
		await flushEffects();
		source.dispose();
		expect(second.disposed).toBe(true);
		expect(vi.getTimerCount()).toBe(0);

		secondOwner.dispose();
		sourceOwner.dispose();
	});

	it.each(["debounce", "throttle"] as const)("%s follows map-style implicit owner propagation", (method) => {
		useTimerClock();
		const source = State(0);
		const derived = source[method](10);
		const owner = own(derived);

		expect(derived.getOwner()).toBe(owner);
		expect(source.getOwner()).toBe(owner);
		owner.dispose();
		expect(source.disposed).toBe(true);
		expect(derived.disposed).toBe(true);
	});

	it.each(["debounce", "throttle"] as const)("%s accepts an explicit owner and cancels pending work with that owner", async (method) => {
		useTimerClock();
		const sourceOwner = createOwner();
		const derivedOwner = createOwner();
		const source = State(sourceOwner, 0);
		const derived = source[method](derivedOwner, 100);

		expect(derived.getOwner()).toBe(derivedOwner);
		expect(source.getOwner()).toBe(sourceOwner);

		source.set(1);
		await flushEffects();
		expect(vi.getTimerCount()).toBe(1);

		derivedOwner.dispose();

		expect(derived.disposed).toBe(true);
		expect(source.disposed).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		sourceOwner.dispose();
	});

	it("shares one native timer across many temporal derivations", async () => {
		useTimerClock();
		const sourceOwner = createOwner();
		const source = State(sourceOwner, 0);
		const derivedOwner = createOwner();
		const derivations = Array.from({ length: 25 }, () => source.debounce(100));

		for (const derived of derivations) {
			derived.subscribe(derivedOwner, () => undefined);
		}

		source.set(1);
		await flushEffects();
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(100);
		expect(derivations.every(derived => derived.value === 1)).toBe(true);

		derivedOwner.dispose();
		sourceOwner.dispose();
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, "1"])("rejects invalid duration %s", (milliseconds) => {
		const owner = createOwner();
		const source = State(owner, 0);

		expect(() => source.debounce(milliseconds as number)).toThrow(RangeError);
		expect(() => source.throttle(milliseconds as number)).toThrow(RangeError);
		owner.dispose();
	});
});
