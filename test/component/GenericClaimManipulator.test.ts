import { describe, expect, it } from "vitest";
import { GenericClaimManipulator } from "../../src/component/GenericClaimManipulator";
import { Owner, State } from "../../src/state/State";

class TestOwner extends Owner { }

/** Test-only harness exposing the protected claim state and register API. */
class ClaimManipulatorHarness extends GenericClaimManipulator<TestOwner> {
	get claimState (): State<boolean> {
		return this.hasClaim;
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
	it("exposes the protected hasClaim state through a test-only subclass", () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);

		expect(manipulator.claimState, "The subclass should be able to read the protected hasClaim state").toBeInstanceOf(State);
		expect(manipulator.claimState.value, "hasClaim should start false before any claims are registered").toBe(false);
	});

	it("keeps anonymous claims active until the last overlapping claim is released", () => {
		const owner = new TestOwner();
		const manipulator = new ClaimManipulatorHarness(owner);
		const firstClaim = new TestOwner();
		const secondClaim = new TestOwner();

		manipulator.register(null, firstClaim);
		manipulator.register(null, secondClaim);

		expect(manipulator.claimState.value, "hasClaim should be true while at least one anonymous claim is active").toBe(true);

		firstClaim.dispose();
		expect(manipulator.claimState.value, "Releasing one anonymous claim should keep hasClaim true while another claim remains active").toBe(true);

		secondClaim.dispose();
		expect(manipulator.claimState.value, "hasClaim should clear only after the last anonymous claim is released").toBe(false);
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
});