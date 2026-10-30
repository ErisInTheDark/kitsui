import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelNextTickCheck, flushNextTickChecks, isNextTickCheckScheduled, scheduleNextTickCheck } from "../../src/utility/nextTickCheck";

async function nextTick (): Promise<void> {
	vi.advanceTimersByTime(0);
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	flushNextTickChecks();
	vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("next-tick checks", () => {
	it("runs each scheduled check once, after the tick, on one shared timer", async () => {
		const first = {};
		const second = {};
		const check = vi.fn();

		scheduleNextTickCheck(first, check);
		scheduleNextTickCheck(second, check);
		scheduleNextTickCheck(first, check);

		expect(check).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);

		await nextTick();

		expect(check.mock.calls).toEqual([[first], [second]]);
		expect(isNextTickCheckScheduled(first)).toBe(false);
	});

	it("keeps the first check when a target is scheduled again before it runs", async () => {
		const target = {};
		const firstCheck = vi.fn();
		const secondCheck = vi.fn();

		scheduleNextTickCheck(target, firstCheck);
		scheduleNextTickCheck(target, secondCheck);
		await nextTick();

		expect(firstCheck).toHaveBeenCalledOnce();
		expect(secondCheck).not.toHaveBeenCalled();
	});

	it("skips cancelled checks and releases the timer once nothing is waiting", async () => {
		const kept = {};
		const cancelled = {};
		const check = vi.fn();

		scheduleNextTickCheck(kept, check);
		scheduleNextTickCheck(cancelled, check);
		cancelNextTickCheck(cancelled);
		expect(vi.getTimerCount()).toBe(1);

		cancelNextTickCheck(kept);
		expect(vi.getTimerCount()).toBe(0);

		await nextTick();
		expect(check).not.toHaveBeenCalled();
	});

	it("lets a running check cancel a later check in the same batch", async () => {
		const first = {};
		const second = {};
		const secondCheck = vi.fn();

		scheduleNextTickCheck(first, () => cancelNextTickCheck(second));
		scheduleNextTickCheck(second, secondCheck);
		await nextTick();

		expect(secondCheck).not.toHaveBeenCalled();
	});

	it("runs a check scheduled during a batch in the next batch", async () => {
		const target = {};
		const order: string[] = [];

		scheduleNextTickCheck({}, () => {
			order.push("first batch");
			scheduleNextTickCheck(target, () => order.push("second batch"));
		});

		await nextTick();
		expect(order).toEqual(["first batch"]);

		await nextTick();
		expect(order).toEqual(["first batch", "second batch"]);
	});

	it("reports each failing check without stopping the rest of the batch", async () => {
		const reported: VoidFunction[] = [];
		vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback: VoidFunction) => {
			reported.push(callback);
		});
		const survivor = vi.fn();

		scheduleNextTickCheck({}, () => {
			throw new Error("first");
		});
		scheduleNextTickCheck({}, survivor);
		scheduleNextTickCheck({}, () => {
			throw new Error("second");
		});
		await nextTick();

		expect(survivor).toHaveBeenCalledOnce();
		expect(reported).toHaveLength(2);
		expect(reported[0]).toThrow("first");
		expect(reported[1]).toThrow("second");
	});
});
