import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleTimeout, type ScheduledTimeoutHandle } from "../../src/utility/timer";

const activeHandles: ScheduledTimeoutHandle[] = [];

function schedule (callback: () => void, milliseconds: number): ScheduledTimeoutHandle {
	const handle = scheduleTimeout(callback, milliseconds);
	activeHandles.push(handle);
	return handle;
}

afterEach(() => {
	for (const handle of activeHandles.splice(0)) {
		handle.cancel();
	}

	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("shared timer", () => {
	it("uses one native timer for multiple deadlines and runs them in deadline order", () => {
		vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
		const calls: string[] = [];

		schedule(() => calls.push("late"), 30);
		schedule(() => calls.push("early"), 10);
		schedule(() => calls.push("middle"), 20);

		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(10);
		expect(calls).toEqual(["early"]);
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(10);
		expect(calls).toEqual(["early", "middle"]);
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(10);
		expect(calls).toEqual(["early", "middle", "late"]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("preserves insertion order for equal deadlines", () => {
		vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
		const calls: number[] = [];

		schedule(() => calls.push(1), 10);
		schedule(() => calls.push(2), 10);
		schedule(() => calls.push(3), 10);
		vi.advanceTimersByTime(10);

		expect(calls).toEqual([1, 2, 3]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rearms when the earliest deadline changes and sleeps when all jobs are cancelled", () => {
		vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
		const late = schedule(vi.fn(), 100);
		const early = schedule(vi.fn(), 20);

		expect(vi.getTimerCount()).toBe(1);
		early.cancel();
		expect(vi.getTimerCount()).toBe(1);
		late.cancel();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("defers jobs added by a callback to a later scheduler turn", () => {
		vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
		const calls: string[] = [];

		schedule(() => {
			calls.push("first");
			schedule(() => calls.push("second"), 0);
		}, 0);

		vi.advanceTimersToNextTimer();
		expect(calls).toEqual(["first"]);
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersToNextTimer();
		expect(calls).toEqual(["first", "second"]);
	});

	it("isolates callback failures until every due callback runs", () => {
		vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
		const queuedErrors: VoidFunction[] = [];
		vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
			queuedErrors.push(callback);
		});
		const sibling = vi.fn();

		schedule(() => {
			throw new Error("timer failed");
		}, 0);
		schedule(sibling, 0);
		vi.advanceTimersToNextTimer();

		expect(sibling).toHaveBeenCalledOnce();
		expect(queuedErrors).toHaveLength(1);
		expect(() => queuedErrors[0]()).toThrow("timer failed");
	});

	it("caps native delays for deadlines beyond the platform timeout range", () => {
		vi.useFakeTimers({ toFake: ["clearTimeout", "performance", "setTimeout"] });
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

		const handle = schedule(vi.fn(), 3_000_000_000);

		expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 2_147_483_647);
		handle.cancel();
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, "1"])("rejects invalid duration %s", (milliseconds) => {
		expect(() => scheduleTimeout(vi.fn(), milliseconds as number)).toThrow(RangeError);
	});
});
