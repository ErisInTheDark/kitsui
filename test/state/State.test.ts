import { describe, expect, it, vi } from "vitest";
import { Component } from "../../src/component/Component";
import { State } from "../../src/state/State";
import mappingExtension from "../../src/state/extensions/mappingExtension";

declare module "../../src/state/State" {
	interface StateExtensions<TValue> {
		testStateExtension (): TValue;
	}
}

mappingExtension();

function mountedOwner (tagName: string = "div"): Component {
	return Component(tagName).mount(document.body);
}

async function flushEffects (): Promise<void> {
	const schedulerRef = globalThis as typeof globalThis & {
		scheduler?: {
			yield?: () => Promise<unknown>;
		};
	};

	if (typeof schedulerRef.scheduler?.yield === "function") {
		await schedulerRef.scheduler.yield();
		return;
	}

	await Promise.resolve();
}

describe("State", () => {
	it("can be constructed with or without new and still supports instanceof", () => {
		const owner = mountedOwner();
		const withNew = new State(owner, 1);
		const withoutNew = State(owner, 1);

		expect(withNew).toBeInstanceOf(State);
		expect(withoutNew).toBeInstanceOf(State);
	});

	it("supports prototype extension through State.extend", () => {
		const StateClass = State.extend<number>();
		const previousExtension = StateClass.prototype.testStateExtension;
		const owner = mountedOwner();

		StateClass.prototype.testStateExtension = function testStateExtension () {
			return this.value;
		};

		expect(State(owner, 3).testStateExtension()).toBe(3);

		if (previousExtension) {
			StateClass.prototype.testStateExtension = previousExtension;
			return;
		}

		delete (StateClass.prototype as { testStateExtension?: () => number }).testStateExtension;
	});

	it("stores and updates values", () => {
		const state = State(mountedOwner(), 1);

		expect(state.value).toBe(1);

		state.update((currentValue) => currentValue + 1);
		expect(state.value).toBe(2);
	});

	it("batches queued subscribers with the original and final values", async () => {
		const state = State(mountedOwner(), "idle");
		const calls: Array<[string, string]> = [];
		const unsubscribe = state.subscribeUnbound((value, previousValue) => {
			calls.push([previousValue, value]);
		});

		state.set("running");
		state.set("done");
		await flushEffects();

		unsubscribe();
		state.set("complete");
		await flushEffects();

		expect(calls).toEqual([["idle", "done"]]);
	});

	it("supports immediate subscribers for state derivation", () => {
		const state = State(mountedOwner(), "idle");
		const calls: Array<[string, string]> = [];
		const unsubscribe = state.subscribeImmediateUnbound((value, previousValue) => {
			calls.push([previousValue, value]);
		});

		state.set("running");
		state.set("done");
		unsubscribe();

		expect(calls).toEqual([
			["idle", "running"],
			["running", "done"],
		]);
	});

	it("does not notify queued listeners for identical values", async () => {
		const state = State(mountedOwner(), "ready");
		const listener = vi.fn();

		state.subscribeUnbound(listener);
		state.set("ready");
		await flushEffects();

		expect(listener).not.toHaveBeenCalled();
	});

	it("binds queued subscriptions to an owner", async () => {
		const state = State(mountedOwner(), 0);
		const owner = mountedOwner();
		const calls: number[] = [];

		state.subscribe(owner, (value) => {
			calls.push(value);
		});

		state.set(1);
		await flushEffects();
		owner.remove();
		state.set(2);
		await flushEffects();

		expect(calls).toEqual([1]);
	});

	it("allows queued owner-bound subscriptions to be manually released", async () => {
		const state = State(mountedOwner(), 0);
		const owner = mountedOwner();
		const listener = vi.fn();
		const cleanup = state.subscribe(owner, listener);

		cleanup();
		state.set(1);
		await flushEffects();

		expect(listener).not.toHaveBeenCalled();
	});

	it("immediately tears down queued owner-bound subscriptions when the owner is already disposed", async () => {
		const state = State(mountedOwner(), 0);
		const owner = mountedOwner();
		const listener = vi.fn();

		owner.remove();
		state.subscribe(owner, listener);
		state.set(1);
		await flushEffects();

		expect(listener).not.toHaveBeenCalled();
	});

	it("maps values into a derived state until the owner is disposed", () => {
		const sourceOwner = mountedOwner();
		const source = State(sourceOwner, 2);
		const owner = mountedOwner();
		const mapped = source.map(owner, (value) => `value:${value}`);

		expect(mapped.value).toBe("value:2");

		source.set(4);
		expect(mapped.value).toBe("value:4");

		owner.remove();
		expect(mapped.disposed).toBe(true);

		source.set(5);
		expect(mapped.value).toBe("value:4");
	});

	it("exposes memoized truthy and falsy derived states", () => {
		const source = State<string | null>(mountedOwner(), null);

		expect(source.truthy).toBe(source.truthy);
		expect(source.falsy).toBe(source.falsy);
		expect(source.truthy.value).toBe(false);
		expect(source.falsy.value).toBe(true);

		source.set("ready");

		expect(source.truthy.value).toBe(true);
		expect(source.falsy.value).toBe(false);
	});

	it("creates nullish fallback states with or", () => {
		const source = State<string | null>(mountedOwner(), null);
		let fallbackCalls = 0;
		const resolved = source.or(() => {
			fallbackCalls += 1;
			return "fallback";
		});

		expect(resolved.value).toBe("fallback");
		expect(fallbackCalls).toBe(1);

		source.set("value");
		expect(resolved.value).toBe("value");

		source.set(null);
		expect(resolved.value).toBe("fallback");
		expect(fallbackCalls).toBe(2);
	});

	it("disposes derived mapping states when the source is disposed", () => {
		const source = State(mountedOwner(), 1);
		const owner = mountedOwner();
		const mapped = source.map(owner, (value) => value + 1);

		source.dispose();

		expect(mapped.disposed).toBe(true);
	});

	it("disposes a state when its creation owner is disposed", () => {
		const owner = mountedOwner();
		const state = State(owner, 1);

		owner.remove();

		expect(state.disposed).toBe(true);
	});

	it("supports custom equality functions", async () => {
		const owner = mountedOwner();
		const state = State(owner, { id: 1 }, {
			equals: (currentValue, nextValue) => currentValue.id === nextValue.id,
		});
		const listener = vi.fn();

		state.subscribeUnbound(listener);
		state.set({ id: 1 });
		state.set({ id: 2 });
		await flushEffects();

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith({ id: 2 }, { id: 1 });

		state.setEquality(() => true);
		state.set({ id: 3 });
		await flushEffects();

		expect(listener).toHaveBeenCalledTimes(1);
	});
});