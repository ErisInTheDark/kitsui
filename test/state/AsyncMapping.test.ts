import { describe, expect, it, vi } from "vitest";
import mappingExtension, {
	AsyncPending,
	type AsyncRejected,
	type AsyncResolved,
} from "../../src/state/extensions/mappingExtension";
import { Owner, State } from "../../src/state/State";

mappingExtension();

function deferred<T> (): {
	promise: Promise<T>;
	reject: (error: unknown) => void;
	resolve: (value: T) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, reject, resolve };
}

async function flushMicrotasks (): Promise<void> {
	for (let index = 0; index < 6; index++) {
		await Promise.resolve();
	}
}

describe("State async mapping extension", () => {
	it("starts with the canonical frozen pending value and evaluates the current source asynchronously", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 2);
		const mapper = vi.fn(async (value: number, signal: AbortSignal) => {
			expect(signal.aborted).toBe(false);
			return String(value);
		});
		const result = source.mapAsync(asyncOwner, mapper);

		expect(result.value).toBe(AsyncPending);
		expect(result.lastSettled.value).toBeNull();
		expect(Object.isFrozen(AsyncPending)).toBe(true);
		expect(mapper).not.toHaveBeenCalled();
		await flushMicrotasks();
		expect(mapper).toHaveBeenCalledWith(2, expect.any(AbortSignal));
		expect(result.value).toEqual({ type: "resolved", value: "2" });

		asyncOwner.dispose();
		sourceOwner.dispose();
	});

	it("stores the same accepted resolved object in the main and last-settled States", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 1);
		const result = source.mapAsync(asyncOwner, async value => value + 1);

		await flushMicrotasks();
		const settled = result.value as AsyncResolved<number>;
		expect(settled).toBe(result.lastSettled.value);
		expect(settled).toEqual({ type: "resolved", value: 2 });

		asyncOwner.dispose();
		sourceOwner.dispose();
	});

	it("normalizes promise rejection and synchronous mapper throws into the same rejected shape", async () => {
		const sourceOwner = Owner();
		const rejectedOwner = Owner();
		const thrownOwner = Owner();
		const source = State(sourceOwner, 1);
		const rejection = new TypeError("rejected");
		const thrown = new Error("thrown");
		const rejectedResult = source.mapAsync<number, TypeError>(rejectedOwner, async () => Promise.reject(rejection));
		const thrownResult = source.mapAsync<number>(thrownOwner, (() => {
			throw thrown;
		}) as (value: number, signal: AbortSignal) => Promise<number>);

		await flushMicrotasks();
		const rejectedSettled = rejectedResult.value as AsyncRejected<TypeError>;
		const thrownSettled = thrownResult.value as AsyncRejected<unknown>;
		expect(rejectedSettled.error).toBe(rejection);
		expect(rejectedSettled).toBe(rejectedResult.lastSettled.value);
		expect(thrownSettled.error).toBe(thrown);
		expect(thrownSettled).toBe(thrownResult.lastSettled.value);

		rejectedOwner.dispose();
		thrownOwner.dispose();
		sourceOwner.dispose();
	});

	it("aborts superseded work, returns to pending, and leaves lastSettled unchanged", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 1);
		const evaluations = [deferred<string>(), deferred<string>(), deferred<string>()];
		const signals: AbortSignal[] = [];
		let call = 0;
		const result = source.mapAsync(asyncOwner, (_value, signal) => {
			signals.push(signal);
			return evaluations[call++].promise;
		});

		await flushMicrotasks();
		evaluations[0].resolve("first");
		await flushMicrotasks();
		const firstSettled = result.value;
		source.set(2);
		await flushMicrotasks();
		expect(result.value).toBe(AsyncPending);
		expect(result.lastSettled.value).toBe(firstSettled);

		source.set(3);
		await flushMicrotasks();
		expect(signals[1].aborted).toBe(true);
		expect(signals[2].aborted).toBe(false);
		expect(result.lastSettled.value).toBe(firstSettled);

		evaluations[1].reject(new Error("aborted"));
		evaluations[2].resolve("third");
		await flushMicrotasks();
		expect(result.value).toEqual({ type: "resolved", value: "third" });

		asyncOwner.dispose();
		sourceOwner.dispose();
	});

	it("ignores stale settlements even when a mapper ignores its aborted signal", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 1);
		const first = deferred<string>();
		const second = deferred<string>();
		const mapper = vi.fn((value: number) => value === 1 ? first.promise : second.promise);
		const result = source.mapAsync(asyncOwner, mapper);

		await flushMicrotasks();
		source.set(2);
		await flushMicrotasks();
		second.resolve("new");
		await flushMicrotasks();
		first.resolve("stale");
		await flushMicrotasks();

		expect(result.value).toEqual({ type: "resolved", value: "new" });
		expect(result.lastSettled.value).toBe(result.value);

		asyncOwner.dispose();
		sourceOwner.dispose();
	});

	it("coalesces synchronous source writes into one new mapper invocation", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 0);
		const mapper = vi.fn(async (value: number) => value);
		const result = source.mapAsync(asyncOwner, mapper);

		await flushMicrotasks();
		source.set(1);
		source.set(2);
		source.set(3);
		await flushMicrotasks();

		expect(mapper).toHaveBeenCalledTimes(2);
		expect(mapper.mock.calls[1][0]).toBe(3);
		expect(result.value).toEqual({ type: "resolved", value: 3 });

		asyncOwner.dispose();
		sourceOwner.dispose();
	});

	it("does not emit another pending notification while already pending", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 0);
		const evaluations = [deferred<number>(), deferred<number>()];
		let call = 0;
		const result = source.mapAsync(asyncOwner, () => evaluations[call++].promise);
		const listener = vi.fn();
		result.subscribeImmediateUnbound(listener);

		await flushMicrotasks();
		source.set(1);
		await flushMicrotasks();
		expect(result.value).toBe(AsyncPending);
		expect(listener).not.toHaveBeenCalled();

		evaluations[1].resolve(1);
		await flushMicrotasks();
		expect(listener).toHaveBeenCalledOnce();

		asyncOwner.dispose();
		sourceOwner.dispose();
	});

	it("aborts on owner disposal, skips pre-microtask invocation, and disposes lastSettled", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 0);
		const mapper = vi.fn(async (value: number) => value);
		const result = source.mapAsync(asyncOwner, mapper);

		asyncOwner.dispose();
		await flushMicrotasks();

		expect(mapper).not.toHaveBeenCalled();
		expect(result.disposed).toBe(true);
		expect(result.lastSettled.disposed).toBe(true);
		sourceOwner.dispose();
	});

	it("owner disposal aborts an active operation and prevents its later settlement", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 0);
		const evaluation = deferred<number>();
		const operationSignals: AbortSignal[] = [];
		const result = source.mapAsync(asyncOwner, (_value, signal) => {
			operationSignals.push(signal);
			return evaluation.promise;
		});

		await flushMicrotasks();
		asyncOwner.dispose();
		expect(operationSignals[0]?.aborted).toBe(true);
		evaluation.resolve(1);
		await flushMicrotasks();
		expect(result.value).toBe(AsyncPending);
		expect(result.lastSettled.value).toBeNull();
		expect(result.lastSettled.disposed).toBe(true);

		sourceOwner.dispose();
	});

	it("source disposal aborts active work and prevents later settlement", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 0);
		const evaluation = deferred<number>();
		const operationSignals: AbortSignal[] = [];
		const result = source.mapAsync(asyncOwner, (_value, signal) => {
			operationSignals.push(signal);
			return evaluation.promise;
		});

		await flushMicrotasks();
		source.dispose();
		expect(result.disposed).toBe(true);
		expect(operationSignals[0]?.aborted).toBe(true);
		evaluation.resolve(1);
		await flushMicrotasks();
		expect(result.value).toBe(AsyncPending);

		asyncOwner.dispose();
		sourceOwner.dispose();
	});

	it("treats AbortError as an ordinary rejection when the operation signal is not aborted", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 0);
		const abortError = new DOMException("mapper rejected", "AbortError");
		const result = source.mapAsync(asyncOwner, async () => Promise.reject(abortError));

		await flushMicrotasks();
		expect(result.value).toEqual({ error: abortError, type: "rejected" });

		asyncOwner.dispose();
		sourceOwner.dispose();
	});

	it("exposes lastSettled as a readonly non-enumerable property", () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 0);
		const result = source.mapAsync(asyncOwner, async value => value);
		const descriptor = Object.getOwnPropertyDescriptor(result, "lastSettled");

		expect(descriptor).toMatchObject({
			configurable: false,
			enumerable: false,
			writable: false,
		});
		expect(Object.keys(result)).not.toContain("lastSettled");

		asyncOwner.dispose();
		sourceOwner.dispose();
	});

	it("does not write the child settlement after a main-State listener disposes the owner", async () => {
		const sourceOwner = Owner();
		const asyncOwner = Owner();
		const source = State(sourceOwner, 0);
		const result = source.mapAsync(asyncOwner, async value => value + 1);

		result.subscribeImmediateUnbound(value => {
			if (value.type === "resolved") {
				asyncOwner.dispose();
			}
		});

		await expect(flushMicrotasks()).resolves.toBeUndefined();
		expect(result.disposed).toBe(true);
		expect(result.lastSettled.disposed).toBe(true);
		sourceOwner.dispose();
	});
});
