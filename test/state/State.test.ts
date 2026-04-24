import { describe, expect, it, vi } from "vitest";
import { Component } from "../../src/component/Component";
import placeExtension from "../../src/component/extensions/placeExtension";
import { State } from "../../src/state/State";
import groupExtension from "../../src/state/extensions/groupExtension";
import mappingExtension from "../../src/state/extensions/mappingExtension";

placeExtension();

declare module "../../src/state/State" {
	interface StateExtensions<T> {
		/** @hidden */
		testStateExtension (): T;
	}
}

mappingExtension();
groupExtension();

function mountedOwner<NAME extends keyof HTMLElementTagNameMap = "div">(tagName: NAME = "div" as NAME): Component<HTMLElementTagNameMap[NAME]> {
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
	timeoutHandler: (() => void) | null;
	orphanCheck: (() => void) | null;
	queuedError: (() => void) | null;
	restore: () => void;
} {
	let timeoutHandler: (() => void) | null = null;
	let orphanCheck: (() => void) | null = null;
	let queuedError: (() => void) | null = null;
	const originalThen = Promise.prototype.then;
	const patchedThen: typeof Promise.prototype.then = function patchedThen<TResult1 = any, TResult2 = never> (
		this: Promise<any>,
		onFulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		if (typeof onFulfilled === "function") {
			orphanCheck = onFulfilled as unknown as () => void;
		}

		return originalThen.call(this, onFulfilled, onRejected) as Promise<TResult1 | TResult2>;
	};
	Promise.prototype.then = patchedThen;
	const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback: VoidFunction) => {
		queuedError = callback as () => void;
	});
	const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((handler: TimerHandler) => {
		if (typeof handler === "function") {
			timeoutHandler = handler as unknown as () => void;
		}

		return 0 as unknown as ReturnType<typeof setTimeout>;
	}) as unknown as typeof setTimeout);

	return {
		get timeoutHandler (): (() => void) | null {
			return timeoutHandler;
		},
		get orphanCheck (): (() => void) | null {
			return orphanCheck;
		},
		get queuedError (): (() => void) | null {
			return queuedError;
		},
		restore (): void {
			Promise.prototype.then = originalThen;
			queueMicrotaskSpy.mockRestore();
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

	it("notifies immediate and queued subscribers when update returns the current value", async () => {
		const state = State(mountedOwner(), "ready");
		const immediateListener = vi.fn();
		const queuedListener = vi.fn();

		state.subscribeImmediateUnbound(immediateListener);
		state.subscribeUnbound(queuedListener);

		const returnedValue = state.update((currentValue) => currentValue);

		expect(returnedValue, "update should return the current value when the updater returns it unchanged").toBe("ready");
		expect(immediateListener, "update should still notify immediate subscribers even when the effective value is unchanged").toHaveBeenCalledOnce();
		expect(immediateListener, "immediate subscribers should receive equal current and previous values").toHaveBeenCalledWith("ready", "ready");

		await flushEffects();

		expect(queuedListener, "update should still notify queued subscribers even when the effective value is unchanged").toHaveBeenCalledOnce();
		expect(queuedListener, "queued subscribers should receive equal current and previous values").toHaveBeenCalledWith("ready", "ready");
		expect(state.value, "update(current => current) should leave the stored state value unchanged").toBe("ready");
	});

	it("treats undefined from update as a keep-current sentinel", async () => {
		const state = State(mountedOwner(), "ready");
		const immediateListener = vi.fn();
		const queuedListener = vi.fn();

		state.subscribeImmediateUnbound(immediateListener);
		state.subscribeUnbound(queuedListener);

		const returnedValue = state.update(() => undefined as never);

		expect(returnedValue, "update should return the current value when undefined means keep the current state").toBe("ready");
		expect(state.value, "update(() => undefined) should keep the stored state value unchanged").toBe("ready");
		expect(immediateListener, "update(() => undefined) should still notify immediate subscribers exactly once").toHaveBeenCalledOnce();
		expect(immediateListener, "immediate subscribers should receive the retained value as both current and previous values").toHaveBeenCalledWith("ready", "ready");

		await flushEffects();

		expect(queuedListener, "update(() => undefined) should still notify queued subscribers exactly once").toHaveBeenCalledOnce();
		expect(queuedListener, "queued subscribers should receive the retained value as both current and previous values").toHaveBeenCalledWith("ready", "ready");
	});

	it("rejects undefined-valued state construction at the type level", () => {
		if (false) {
			// @ts-expect-error State<string | undefined> should no longer be accepted.
			State<string | undefined>(mountedOwner(), "ready");
			// @ts-expect-error State<string | undefined> should no longer accept undefined-valued state construction.
			State<string | undefined>(mountedOwner(), undefined);
			// @ts-expect-error State.Readonly<string | undefined> should no longer accept undefined-valued construction.
			State.Readonly<string | undefined>(undefined);
		}

		expect(true).toBe(true);
	});

	/** Verifies clear updates the stored value without notifying immediate or queued listeners. */
	it("clears values without notifying listeners", async () => {
		const state = State(mountedOwner(), "idle");
		const immediateListener = vi.fn();
		const queuedListener = vi.fn();

		state.subscribeImmediateUnbound(immediateListener);
		state.subscribeUnbound(queuedListener);

		state.clear("done");

		expect(state.value, "clear should replace the current value immediately").toBe("done");
		expect(immediateListener, "clear should not notify immediate listeners").not.toHaveBeenCalled();

		await flushEffects();

		expect(queuedListener, "clear should not notify queued listeners").not.toHaveBeenCalled();
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

	it("groups state values with both call and constructor forms", () => {
		const owner = mountedOwner();
		const count = State(owner, 1);
		const label = State(owner, "one");
		const groupedFromCall = State.Group(owner, {
			count,
			label,
		});
		const groupedFromNew = new State.Group(owner, {
			count,
			label,
		});

		expect(groupedFromCall.value).toEqual({
			count: 1,
			label: "one",
		});
		expect(groupedFromNew.value).toEqual({
			count: 1,
			label: "one",
		});
	});

	it("updates grouped states on the next tick, not synchronously", async () => {
		const owner = mountedOwner();
		const count = State(owner, 0);
		const grouped = State.Group(owner, { count });

		count.set(1);
		expect(grouped.value.count).toBe(0);

		await flushEffects();
		expect(grouped.value.count).toBe(1);
	});

	it("coalesces multiple source updates into one grouped update per tick", async () => {
		const owner = mountedOwner();
		const count = State(owner, 0);
		const label = State(owner, "zero");
		const grouped = State.Group(owner, { count, label });
		const calls: Array<[{ count: number; label: string }, { count: number; label: string }]> = [];

		grouped.subscribeImmediateUnbound((value, previousValue) => {
			calls.push([previousValue, value]);
		});

		count.set(1);
		label.set("one");
		count.set(2);

		await flushEffects();

		expect(calls).toEqual([
			[
				{ count: 0, label: "zero" },
				{ count: 2, label: "one" },
			],
		]);
	});

	it("supports empty grouped state objects", async () => {
		const owner = mountedOwner();
		const grouped = State.Group(owner, {});

		expect(grouped.value).toEqual({});

		await flushEffects();
		expect(grouped.value).toEqual({});
	});

	it("disposes grouped states when their owner is disposed", () => {
		const owner = mountedOwner();
		const count = State(owner, 1);
		const grouped = State.Group(owner, { count });

		owner.remove();

		expect(grouped.disposed).toBe(true);
	});

	it("stops responding to source changes after grouped state disposal", async () => {
		const owner = mountedOwner();
		const count = State(owner, 1);
		const grouped = State.Group(owner, { count });

		grouped.dispose();
		count.set(2);
		await flushEffects();

		expect(grouped.value.count).toBe(1);
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

	/** Verifies clear can run from a state cleanup handler during disposal after disposed becomes true. */
	it("allows clear during cleanup while disposing", () => {
		const state = State(mountedOwner(), 1);
		const clearDuringCleanup = vi.fn(() => {
			expect(state.disposed, "the state should already be marked disposed inside cleanup").toBe(true);
			state.clear(2);
		});

		state.onCleanup(clearDuringCleanup);

		expect(() => state.dispose(), "clear should be allowed during state cleanup").not.toThrow();
		expect(clearDuringCleanup, "state cleanup should run during disposal").toHaveBeenCalledOnce();
		expect(state.value, "clear during cleanup should update the internal value").toBe(2);
	});

	/** Verifies readonly states ignore clear to preserve immutability. */
	it("ignores clear on readonly states", () => {
		const readonlyState = State.Readonly(1);

		expect(readonlyState.clear(2), "clear should return the retained readonly value").toBe(1);

		expect(readonlyState.value, "clear should not mutate readonly states").toBe(1);
	});

	it("rejects undefined values at runtime", () => {
		const owner = mountedOwner();
		const state = State(owner, "ready");

		try {
			expect(() => State(owner, undefined as never), "State(owner, undefined) should reject undefined initial values").toThrow();
			expect(() => State.Readonly(undefined as never), "State.Readonly(undefined) should reject undefined readonly values").toThrow();
			expect(() => state.set(undefined as never), "state.set(undefined) should reject undefined stored values").toThrow();
			expect(() => state.clear(undefined as never), "state.clear(undefined) should reject undefined stored values").toThrow();

			const returnedValue = state.update(() => undefined as never);

			expect(returnedValue, "update(() => undefined) should return the retained current value").toBe("ready");
			expect(state.value, "update(() => undefined) should keep the stored value unchanged").toBe("ready");
		}
		finally {
			owner.remove();
		}
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

	/** Verifies ownerless construction preserves the value, reports no owner, and schedules orphan validation through Promise.then. */
	it("can be constructed without an owner", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const state = State(5);

			expect(state.value, "ownerless state should preserve its initial value").toBe(5);
			expect(state.getOwner(), "ownerless state should report a null owner").toBeNull();
			expect(orphanCheckSpy.timeoutHandler, "ownerless state should still arm a timeout-backed tick").toBeTypeOf("function");
			expect(orphanCheckSpy.orphanCheck, "ownerless state should schedule the orphan check through Promise.then").not.toBeNull();
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

			expect(orphanCheckSpy.timeoutHandler, "ownerless state should still arm a timeout-backed tick").toBeTypeOf("function");
			expect(orphanCheckSpy.orphanCheck, "ownerless state should register the orphan check through Promise.then").not.toBeNull();
			expect(() => orphanCheckSpy.orphanCheck!(), "ownerless state should defer its uncaught rethrow").not.toThrow();
			expect(orphanCheckSpy.queuedError, "ownerless state should queue an uncaught rethrow").toBeTypeOf("function");
			expect(() => orphanCheckSpy.queuedError?.(), "the queued rethrow should surface the orphan error").toThrowError("States must have an owner before the next tick.");
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
			expect(orphanCheckSpy.queuedError, "the orphan check should not queue an error after ownership is assigned").toBeNull();

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
			expect(() => orphanCheckSpy.orphanCheck!(), "a conflicted ownerless state should defer its uncaught rethrow").not.toThrow();
			expect(orphanCheckSpy.queuedError, "a conflicted ownerless state should queue an uncaught rethrow").toBeTypeOf("function");
			expect(() => orphanCheckSpy.queuedError?.(), "the queued rethrow should surface the orphan error").toThrowError("States must have an owner before the next tick.");

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
			expect(() => orphanCheckSpy.orphanCheck!(), "the conflicted state should defer its uncaught rethrow").not.toThrow();
			expect(orphanCheckSpy.queuedError, "the conflicted state should queue an uncaught rethrow").toBeTypeOf("function");
			expect(() => orphanCheckSpy.queuedError?.(), "the queued rethrow should surface the orphan error").toThrowError("States must have an owner before the next tick.");

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

	/** Verifies ownerless source states inherit implicit ownership from mapped children. */
	it("ownerless source state gains implicit owner from a mapped child", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const source = State(5);
			const mapped = source.map((value) => value * 2);
			const owner = mountedOwner();

			mapped.subscribe(owner, () => undefined);

			expect(mapped.getOwner(), "the mapped child should gain the implicit owner directly").toBe(owner);
			expect(source.getOwner(), "the source state should inherit the mapped child's implicit owner").toBe(owner);

			owner.remove();

			expect(source.disposed, "disposing the inherited implicit owner should dispose the source state").toBe(true);
			expect(mapped.disposed, "disposing the inherited implicit owner should also dispose the mapped child").toBe(true);
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies implicit ownership propagates through chains of mapped states. */
	it("propagates implicit owners through chained mapped states", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const source = State(2);
			const mapped = source.map((value) => value + 1);
			const mappedAgain = mapped.map((value) => value * 3);
			const owner = mountedOwner();

			mappedAgain.subscribe(owner, () => undefined);

			expect(source.getOwner(), "the root source should inherit the descendant's implicit owner").toBe(owner);
			expect(mapped.getOwner(), "the intermediate mapped state should inherit the descendant's implicit owner").toBe(owner);
			expect(mappedAgain.getOwner(), "the subscribed descendant should keep the implicit owner").toBe(owner);

			owner.remove();

			expect(source.disposed, "disposing the implicit owner should dispose the root source state").toBe(true);
			expect(mapped.disposed, "disposing the implicit owner should dispose the intermediate mapped state").toBe(true);
			expect(mappedAgain.disposed, "disposing the implicit owner should dispose the descendant mapped state").toBe(true);
		}
		finally {
			orphanCheckSpy.restore();
		}
	});

	/** Verifies explicit ownership does not propagate back from mapped children. */
	it("does not propagate explicit owners from mapped children", () => {
		const orphanCheckSpy = captureOrphanCheck();

		try {
			const source = State(3);
			const owner = mountedOwner();
			const mapped = source.map(owner, (value) => value * 2);

			expect(mapped.getOwner(), "the mapped child should keep its explicit owner").toBe(owner);
			expect(source.getOwner(), "explicit ownership should not propagate to the source state").toBeNull();

			owner.remove();
		}
		finally {
			orphanCheckSpy.restore();
		}
	});
});