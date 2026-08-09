import { describe, expect, it } from "vitest";
import { GenericClaimManipulator } from "../../src/component/GenericClaimManipulator";
import { Owner, State, type CleanupFunction } from "../../src/state/State";

class TestOwner extends Owner { }

class TrackingOwner extends TestOwner {
	retainedCleanupCount = 0;

	override onCleanup (cleanupFunction: CleanupFunction): CleanupFunction {
		let active = true;
		this.retainedCleanupCount += 1;
		const release = super.onCleanup(() => {
			if (active) {
				active = false;
				this.retainedCleanupCount -= 1;
			}
			cleanupFunction();
		});

		return () => {
			if (!active) {
				return;
			}
			active = false;
			this.retainedCleanupCount -= 1;
			release();
		};
	}
}

class DisposingOnRegistrationOwner extends TestOwner {
	disposeOnCleanupRegistration = false;

	override onCleanup (cleanupFunction: CleanupFunction): CleanupFunction {
		const release = super.onCleanup(cleanupFunction);
		if (this.disposeOnCleanupRegistration) {
			this.disposeOnCleanupRegistration = false;
			this.dispose();
		}
		return release;
	}
}

/** Test-only harness exposing the protected claim state and register API. */
class ClaimManipulatorHarness extends GenericClaimManipulator<TestOwner> {
	readonly claimChanges: boolean[] = [];
	nextClaimsChangedError: Error | null = null;

	get claimState (): State<boolean> {
		return this.hasClaim;
	}

	registered (id: string): Owner | State<boolean> | null {
		return this.getRegisteredClaimant(id);
	}

	registeredClaimants (): Array<Owner | State<boolean>> {
		return this.getRegisteredClaimants();
	}

	register (id: string | null, claim: Owner | State<boolean>): void {
		this.registerClaim(id, claim);
	}

	deregisterClaimant (claim: Owner | State<boolean>): void {
		this.deregisterClaim(claim);
	}

	deregisterId (id: string): void {
		this.deregisterClaim(id);
	}

	deregisterComposite (id: string | null, claim: Owner | State<boolean>): void {
		this.deregisterClaim(id, claim);
	}

	protected onClaimsChanged (disposedClaimantRemoved = false): void {
		this.claimChanges.push(disposedClaimantRemoved);
		const error = this.nextClaimsChangedError;
		this.nextClaimsChangedError = null;
		if (error) throw error;
	}
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

describe("GenericClaimManipulator", () => {
	it("keeps anonymous claims active until the last overlapping claim is released", () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const firstClaim = new TestOwner();
		const secondClaim = new TestOwner();

		expect(manipulator.claimState, "The subclass should be able to read the protected hasClaim state").toBeInstanceOf(State);
		expect(manipulator.claimState.value, "hasClaim should start false before any claims are registered").toBe(false);

		manipulator.register(null, firstClaim);
		manipulator.register(null, secondClaim);

		expect(manipulator.claimState.value, "hasClaim should be true while at least one anonymous claim is active").toBe(true);

		firstClaim.dispose();
		expect(manipulator.claimState.value, "Releasing one anonymous claim should keep hasClaim true while another claim remains active").toBe(true);

		secondClaim.dispose();
		expect(manipulator.claimState.value, "hasClaim should clear only after the last anonymous claim is released").toBe(false);
	});

	it("settles every keyed and anonymous claim for a claimant after the first change hook cleanup error", () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const claimant = new TrackingOwner();
		const cleanupError = new Error("first claims-changed cleanup failed");
		manipulator.register("slot", claimant);
		manipulator.register(null, claimant);
		manipulator.register(null, claimant);
		manipulator.nextClaimsChangedError = cleanupError;

		let thrown: unknown;
		try {
			manipulator.deregisterClaimant(claimant);
		} catch (error) {
			thrown = error;
		}

		expect.soft(thrown).toBe(cleanupError);
		expect.soft(manipulator.registered("slot")).toBeNull();
		expect.soft(manipulator.registeredClaimants()).toEqual([]);
		expect.soft(manipulator.claimState.value).toBe(false);
		expect.soft(claimant.retainedCleanupCount).toBe(0);
		expect.soft(() => claimant.dispose()).not.toThrow();
		expect(claimant.retainedCleanupCount).toBe(0);
		owner.dispose();
	});

	it("replaces keyed claims with the newest owner and ignores stale cleanup", () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const firstClaim = new TestOwner();
		const secondClaim = new TestOwner();

		manipulator.register("slot", firstClaim);
		expect(manipulator.claimState.value, "hasClaim should become true after the first keyed claim is registered").toBe(true);

		manipulator.register("slot", secondClaim);
		expect(manipulator.claimState.value, "Replacing a keyed claim should keep hasClaim true while the replacement claim is active").toBe(true);

		firstClaim.dispose();
		expect(manipulator.claimState.value, "Disposing the replaced claim should not clear hasClaim while the replacement claim remains active").toBe(true);

		secondClaim.dispose();
		expect(manipulator.claimState.value, "hasClaim should clear when the replacement keyed claim is released").toBe(false);
	});

	it("tracks the boolean value of state-backed claims", async () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const claimOwner = new TestOwner();
		const claimState = State(claimOwner, false);

		manipulator.register("state", claimState);
		expect(manipulator.claimState.value, "hasClaim should mirror the initial boolean value of a state claim").toBe(false);

		claimState.set(true);
		await flushEffects();
		expect(manipulator.claimState.value, "hasClaim should become true when the state claim becomes true").toBe(true);

		claimState.set(false);
		await flushEffects();
		expect(manipulator.claimState.value, "hasClaim should become false when the state claim becomes false again").toBe(false);
	});

	it("releases a state-backed claim when the source state is disposed", () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const claimOwner = new TestOwner();
		const claimState = State(claimOwner, true);

		manipulator.register("state", claimState);
		expect(manipulator.claimState.value, "A true state claim should activate hasClaim immediately").toBe(true);

		claimOwner.dispose();
		expect(manipulator.claimState.value, "Disposing the source state owner should release the claim").toBe(false);
	});

	it("does not let stale keyed state changes affect the active claim", async () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const firstClaimOwner = new TestOwner();
		const firstClaimState = State(firstClaimOwner, false);
		const secondClaimOwner = new TestOwner();
		const secondClaimState = State(secondClaimOwner, true);

		manipulator.register("slot", firstClaimState);
		manipulator.register("slot", secondClaimState);
		expect(manipulator.claimState.value, "The replacement keyed state claim should be active immediately").toBe(true);

		firstClaimState.set(true);
		await flushEffects();
		expect(manipulator.claimState.value, "Stale changes from the replaced keyed state should not affect hasClaim").toBe(true);

		secondClaimState.set(false);
		await flushEffects();
		expect(manipulator.claimState.value, "The active keyed state should still control hasClaim after stale updates are ignored").toBe(false);
	});

	it("deregisters keyed claims without letting stale cleanup reactivate hasClaim", () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const claimOwner = new TestOwner();

		manipulator.register("slot", claimOwner);
		expect(manipulator.claimState.value, "A keyed claim should activate hasClaim immediately").toBe(true);

		manipulator.deregisterId("slot");
		expect(manipulator.claimState.value, "deregisterClaim(id) should clear the keyed claim immediately").toBe(false);

		claimOwner.dispose();
		expect(manipulator.claimState.value, "stale cleanup from a deregistered keyed claim should stay ignored").toBe(false);
	});

	it("rejects registration after the owning owner is disposed", () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);

		owner.dispose();

		expect(() => manipulator.register("late", new TestOwner()), "Disposed owners should reject late claim registration").toThrowError("Disposed owners cannot be modified.");
	});

	it.each([
		["Owner", () => {
			const claimant = new TestOwner();
			claimant.dispose();
			return claimant;
		}],
		["State<boolean>", () => {
			const claimantOwner = new TestOwner();
			const claimant = State(claimantOwner, true);
			claimantOwner.dispose();
			return claimant;
		}],
	] as const)("rejects an already-disposed %s claimant atomically", (_claimantType, createClaimant) => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const claimant = createClaimant();

		expect.soft(() => manipulator.register("slot", claimant)).toThrow("Disposed owners cannot be modified.");
		expect.soft(manipulator.registered("slot")).toBeNull();
		expect.soft(manipulator.claimState.value).toBe(false);
		expect(manipulator.claimChanges).toEqual([]);
	});

	it("publishes a keyed claimant before immediate observers see hasClaim become true", () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const claimant = new TestOwner();
		const observedClaimants: Array<Owner | State<boolean> | null> = [];
		manipulator.claimState.subscribeImmediate(owner, (hasClaim) => {
			if (hasClaim) {
				observedClaimants.push(manipulator.registered("slot"));
			}
		});

		manipulator.register("slot", claimant);

		expect(observedClaimants).toEqual([claimant]);
	});

	it("rolls back keyed claim activation when a hasClaim observer throws and allows retry", () => {
		const owner = new TestOwner();
		const observerOwner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const claimant = new TrackingOwner();
		const observerError = new Error("hasClaim activation observer failed");
		let failActivation = true;
		manipulator.claimState.subscribeImmediate(observerOwner, (hasClaim) => {
			if (hasClaim && failActivation) {
				failActivation = false;
				throw observerError;
			}
		});

		try {
			expect.soft(() => manipulator.register("slot", claimant)).toThrow(observerError);
			expect.soft(manipulator.registered("slot")).toBeNull();
			expect.soft(manipulator.registeredClaimants()).toEqual([]);
			expect.soft(manipulator.claimState.value).toBe(false);
			expect.soft(claimant.retainedCleanupCount).toBe(0);

			expect.soft(() => manipulator.register("slot", claimant)).not.toThrow();
			expect.soft(manipulator.registered("slot")).toBe(claimant);
			expect.soft(manipulator.registeredClaimants()).toEqual([claimant]);
			expect.soft(manipulator.claimState.value).toBe(true);
			expect.soft(claimant.retainedCleanupCount).toBe(1);

			claimant.dispose();
			expect.soft(manipulator.registered("slot")).toBeNull();
			expect.soft(manipulator.registeredClaimants()).toEqual([]);
			expect.soft(manipulator.claimState.value).toBe(false);
			expect(claimant.retainedCleanupCount).toBe(0);
		} finally {
			if (!claimant.disposed) claimant.dispose();
			if (!observerOwner.disposed) observerOwner.dispose();
			if (!owner.disposed) owner.dispose();
		}
	});

	it("releases claimant cleanup when hasClaim activation synchronously disposes the managing owner", () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const claimant = new TrackingOwner();
		manipulator.claimState.subscribeImmediate(owner, (hasClaim) => {
			if (hasClaim) {
				owner.dispose();
			}
		});

		try {
			expect.soft(() => manipulator.register("slot", claimant)).not.toThrow();
			expect.soft(owner.disposed).toBe(true);
			expect.soft(manipulator.claimChanges).toEqual([false]);
			expect.soft(manipulator.registered("slot")).toBeNull();
			expect.soft(manipulator.registeredClaimants()).toEqual([]);
			expect(claimant.retainedCleanupCount).toBe(0);
		} finally {
			claimant.dispose();
		}
	});

	it("does not retain claimant cleanup when managing owner onCleanup disposes during activation", () => {
		const owner = new DisposingOnRegistrationOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const claimant = new TrackingOwner();
		owner.disposeOnCleanupRegistration = true;

		try {
			expect.soft(() => manipulator.register("slot", claimant)).not.toThrow();
			expect.soft(owner.disposed).toBe(true);
			expect.soft(manipulator.registered("slot")).toBeNull();
			expect.soft(manipulator.claimState.value).toBe(false);
			expect(claimant.retainedCleanupCount).toBe(0);
		} finally {
			claimant.dispose();
		}
	});
});
