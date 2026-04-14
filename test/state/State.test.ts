import { describe, expect, it, vi } from "vitest";
import { Component } from "../../src/component/Component";
import placeExtension from "../../src/component/extensions/placeExtension";
import { State } from "../../src/state/State";
import mappingExtension from "../../src/state/extensions/mappingExtension";

placeExtension();

declare module "../../src/state/State" {
	interface StateExtensions<T> {
		/** @hidden */
		testStateExtension (): T;
	}
}

mappingExtension();

function mountedOwner (tagName: string = "div"): Component {
	return Component(tagName).appendTo(document.body);
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

function captureOrphanCheck (): {
	orphanCheck: (() => void) | null;
	restore: () => void;
} {
	let orphanCheck: (() => void) | null = null;
	const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((handler: TimerHandler) => {
		if (typeof handler === "function") {
			orphanCheck = handler as unknown as () => void;
		}

		return 0 as unknown as ReturnType<typeof setTimeout>;
	}) as unknown as typeof setTimeout);

	return {
		get orphanCheck (): (() => void) | null {
			return orphanCheck;
		},
		restore (): void {
			setTimeoutSpy.mockRestore();
		},
	};
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

	/** Verifies ownerless construction preserves the value and reports no owner. */
	it("can be constructed without an owner", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(5);

			expect(state.value, "ownerless state should preserve its initial value").toBe(5);
			expect(state.getOwner(), "ownerless state should report a null owner").toBeNull();
			expect(orphanCheckSpy.orphanCheck, "ownerless state should schedule an orphan check").not.toBeNull();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies an ownerless state throws if it still has no owner on the next tick. */
	it("throws when ownerless state has no owner by next tick", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			State(1);

			expect(orphanCheckSpy.orphanCheck, "ownerless state should register an orphan check callback").not.toBeNull();
			expect(() => orphanCheckSpy.orphanCheck!(), "ownerless state should throw if it remains ownerless on the next tick").toThrowError("States must have an owner before the next tick.");
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies an implicit owner prevents the orphan check from throwing. */
	it("does not throw when ownerless state gains an implicit owner before next tick", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(1);
			const owner = mountedOwner();

			state.subscribe(owner, () => undefined);

			expect(orphanCheckSpy.orphanCheck, "ownerless state should schedule an orphan check before gaining an owner").not.toBeNull();
			expect(() => orphanCheckSpy.orphanCheck!(), "the orphan check should not throw after an implicit owner is assigned").not.toThrow();

			owner.remove();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies Component subscriptions assign the component as the implicit owner. */
	it("sets implicit owner when subscribed by a Component", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(1);
			const owner = mountedOwner();

			state.subscribe(owner, () => undefined);

			expect(state.getOwner(), "a subscribing Component should become the implicit owner").toBe(owner);

			owner.remove();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies immediate subscriptions also assign the component as the implicit owner. */
	it("sets implicit owner from subscribeImmediate", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(1);
			const owner = mountedOwner();

			state.subscribeImmediate(owner, () => undefined);

			expect(state.getOwner(), "subscribeImmediate should also make the subscribing Component the implicit owner").toBe(owner);

			owner.remove();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies State owners do not become implicit owners for other states. */
	it("does not set implicit owner when subscribed by a State", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(1);
			const subscriber = State(0);

			state.subscribeImmediate(subscriber, () => undefined);

			expect(state.getOwner(), "a State subscriber should not become an implicit owner").toBeNull();

			subscriber.dispose();
			state.dispose();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies a different Component clears the implicit owner and requires an explicit owner. */
	it("clears implicit owner when a different non-State owner subscribes", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(1);
			const firstOwner = mountedOwner();
			const secondOwner = mountedOwner();

			state.subscribe(firstOwner, () => undefined);
			state.subscribe(secondOwner, () => undefined);

			expect(state.getOwner(), "a conflicting Component subscription should clear the implicit owner").toBeNull();

			firstOwner.remove();
			secondOwner.remove();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies the orphan check still throws after an implicit owner conflict. */
	it("throws orphan error when implicit owner is conflicted", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(1);
			const firstOwner = mountedOwner();
			const secondOwner = mountedOwner();

			state.subscribe(firstOwner, () => undefined);
			state.subscribe(secondOwner, () => undefined);

			expect(orphanCheckSpy.orphanCheck, "a conflicted ownerless state should reschedule its orphan check").not.toBeNull();
			expect(() => orphanCheckSpy.orphanCheck!(), "a conflicted ownerless state should still throw if it has no explicit owner by the next tick").toThrowError("States must have an owner before the next tick.");

			firstOwner.remove();
			secondOwner.remove();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies later Components cannot recover ownership after the conflict path has started. */
	it("does not allow a third owner to become implicit after conflict", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(1);
			const firstOwner = mountedOwner();
			const secondOwner = mountedOwner();
			const thirdOwner = mountedOwner();

			state.subscribe(firstOwner, () => undefined);
			state.subscribe(secondOwner, () => undefined);
			state.subscribe(thirdOwner, () => undefined);

			expect(state.getOwner(), "a third Component should not be able to restore implicit ownership after a conflict").toBeNull();
			expect(orphanCheckSpy.orphanCheck, "the conflicted state should still have an orphan check scheduled").not.toBeNull();
			expect(() => orphanCheckSpy.orphanCheck!(), "the conflicted state should still fail if no explicit owner is assigned").toThrowError("States must have an owner before the next tick.");

			firstOwner.remove();
			secondOwner.remove();
			thirdOwner.remove();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies an explicit owner is never replaced by a later implicit owner candidate. */
	it("does not override explicit owner with implicit", () => {
		const explicitOwner = mountedOwner();
		const state = State(explicitOwner, 1);
		const implicitOwner = mountedOwner();

		state.subscribe(implicitOwner, () => undefined);

		expect(state.getOwner(), "an explicit owner should stay in place when a Component subscribes later").toBe(explicitOwner);

		implicitOwner.remove();
		explicitOwner.remove();
	});

	/** Verifies the same implicit owner can subscribe more than once without conflict. */
	it("same implicit owner subscribing twice is fine", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(1);
			const owner = mountedOwner();

			state.subscribe(owner, () => undefined);
			state.subscribe(owner, () => undefined);

			expect(state.getOwner(), "repeating the same implicit owner should not clear ownership").toBe(owner);

			owner.remove();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies disposing the implicit owner disposes the state as well. */
	it("disposes state when implicit owner is disposed", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(1);
			const owner = mountedOwner();

			state.subscribe(owner, () => undefined);
			owner.remove();

			expect(state.disposed, "disposing the implicit owner should dispose the state").toBe(true);
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies ownerless map returns an ownerless derived state. */
	it("ownerless map creates an ownerless mapped state", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const sourceOwner = mountedOwner();
			const mapped = State(sourceOwner, 5).map((value) => value * 2);

			expect(mapped.value, "ownerless mapped state should derive the source value").toBe(10);
			expect(mapped.getOwner(), "ownerless mapped state should not start with an owner").toBeNull();
			expect(orphanCheckSpy.orphanCheck, "ownerless mapped state should schedule an orphan check").not.toBeNull();

			sourceOwner.remove();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies ownerless mapped states can gain an implicit owner through subscription. */
	it("ownerless mapped state gains implicit owner when subscribed", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const sourceOwner = mountedOwner();
			const mapped = State(sourceOwner, 5).map((value) => value * 2);
			const owner = mountedOwner();

			mapped.subscribe(owner, () => undefined);

			expect(mapped.getOwner(), "a subscribing Component should become the mapped state's implicit owner").toBe(owner);

			owner.remove();
			sourceOwner.remove();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});
});