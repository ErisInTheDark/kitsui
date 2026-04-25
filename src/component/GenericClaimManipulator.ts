import { Owner, State, type CleanupFunction } from "../state/State";

type Claimant = Owner | State<boolean>;

interface ClaimRecord {
	id: string | null;
	claimant: Claimant;
	active: boolean;
	cleanup: CleanupFunction;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

function isBooleanStateClaim (claim: Claimant): claim is State<boolean> {
	return claim instanceof State;
}

/**
 * Tracks overlapping boolean claims from owners and boolean states.
 * Subclasses define their own public API and use `registerClaim()` to contribute claims.
 * The protected `hasClaim` state is true whenever any registered claim is active.
 * @typeParam OWNER The owning lifecycle manager for the manipulator.
 */
export abstract class GenericClaimManipulator<OWNER extends Owner> {
	private readonly anonymousClaims = new Set<ClaimRecord>();
	private readonly claimsByClaimant = new Map<Claimant, Set<ClaimRecord>>();
	private readonly keyedClaims = new Map<string, ClaimRecord>();
	private activeClaimCount = 0;

	/**
	 * True while any registered claim is currently active.
	 * Subclasses can observe or bind this state through their own public API.
	 */
	protected readonly hasClaim: State<boolean>;

	constructor (
		protected readonly owner: OWNER,
	) {
		this.hasClaim = State(owner, false);
	}

	/**
	 * Registers a claim against this manipulator.
	 * A non-null id reserves a single slot, so later claims with the same id replace the previous claimant.
	 * A null id registers an anonymous claim that overlaps with any number of other anonymous claims.
	 * Owner claims stay active until that owner is cleaned up, and State claims stay active while their value is true.
	 * @param id Unique claim slot to replace, or null to register an overlapping anonymous claim.
	 * @param claim Owner or boolean state contributing the claim.
	 */
	protected registerClaim (id: string | null, claim: Claimant): void {
		this.ensureActive();

		if (id === null) {
			const record = this.createClaimRecord(id, claim);
			this.anonymousClaims.add(record);
			this.trackClaimant(record);
			return;
		}

		const record = this.createClaimRecord(id, claim);
		const previousClaim = this.keyedClaims.get(id);
		this.keyedClaims.set(id, record);
		this.trackClaimant(record);
		previousClaim?.cleanup();
	}

	/**
	 * Deregisters claims by claimant, by keyed id, or by the `(id, claimant)` composite used during registration.
	 * When `id` is null, the composite form removes all anonymous claims currently registered for that claimant.
	 * @param claimant Owner or boolean state whose claims should be removed.
	 */
	protected deregisterClaim (claimant: Claimant): void;
	/**
	 * Deregisters the currently registered keyed claim for the provided id.
	 * @param id Unique keyed claim id.
	 */
	protected deregisterClaim (id: string): void;
	/**
	 * Deregisters the claim matching the provided registration composite.
	 * @param id Unique claim slot, or null for anonymous claims.
	 * @param claimant Owner or boolean state contributing the claim.
	 */
	protected deregisterClaim (id: string | null, claimant: Claimant): void;
	protected deregisterClaim (idOrClaimant: string | Claimant | null, claimant?: Claimant): void {
		this.ensureActive();

		if (claimant !== undefined) {
			if (idOrClaimant === null) {
				this.cleanupMatchingClaims(this.claimsByClaimant.get(claimant), record => record.id === null);
				return;
			}

			const keyedClaim = this.keyedClaims.get(idOrClaimant as string);
			if (keyedClaim?.claimant === claimant) {
				keyedClaim.cleanup();
			}

			return;
		}

		if (typeof idOrClaimant === "string") {
			this.keyedClaims.get(idOrClaimant)?.cleanup();
			return;
		}

		if (idOrClaimant !== null) {
			this.cleanupMatchingClaims(this.claimsByClaimant.get(idOrClaimant));
		}
	}

	private createClaimRecord (id: string | null, claim: Claimant): ClaimRecord {
		let record!: ClaimRecord;
		const releaseClaimRecord = () => {
			if (id === null) {
				this.anonymousClaims.delete(record);
			}
			else if (this.keyedClaims.get(id) === record) {
				this.keyedClaims.delete(id);
			}

			this.untrackClaimant(record);
		};

		record = isBooleanStateClaim(claim)
			? this.createStateClaimRecord(id, claim, releaseClaimRecord)
			: this.createOwnerClaimRecord(id, claim, releaseClaimRecord);

		return record;
	}

	private createOwnerClaimRecord (id: string | null, claim: Owner, onCleanup: CleanupFunction): ClaimRecord {
		const record: ClaimRecord = {
			id,
			claimant: claim,
			active: false,
			cleanup: noop,
		};

		let active = true;
		let releaseOwner = noop;
		let releaseClaim = noop;
		const cleanup = () => {
			if (!active) {
				return;
			}

			active = false;
			this.setClaimActive(record, false);
			onCleanup();
			releaseOwner();
			releaseClaim();
		};

		record.cleanup = cleanup;
		releaseOwner = this.owner.onCleanup(cleanup);
		this.setClaimActive(record, true);
		releaseClaim = claim.onCleanup(cleanup);
		return record;
	}

	private createStateClaimRecord (id: string | null, claim: State<boolean>, onCleanup: CleanupFunction): ClaimRecord {
		const record: ClaimRecord = {
			id,
			claimant: claim,
			active: false,
			cleanup: noop,
		};

		let active = true;
		let releaseOwner = noop;
		let releaseClaim = noop;
		let releaseClaimOwner = noop;
		const cleanup = () => {
			if (!active) {
				return;
			}

			active = false;
			this.setClaimActive(record, false);
			onCleanup();
			releaseOwner();
			releaseClaim();
			releaseClaimOwner();
		};

		record.cleanup = cleanup;
		releaseOwner = this.owner.onCleanup(cleanup);
		this.setClaimActive(record, claim.value);
		releaseClaimOwner = claim.onCleanup(cleanup);
		releaseClaim = claim.subscribe(this.owner, (value) => {
			if (!active) {
				return;
			}

			this.setClaimActive(record, value);
		});
		return record;
	}

	private cleanupMatchingClaims (records: Iterable<ClaimRecord> | undefined, predicate?: (record: ClaimRecord) => boolean): void {
		if (!records) {
			return;
		}

		for (const record of [...records]) {
			if (predicate && !predicate(record)) {
				continue;
			}

			record.cleanup();
		}
	}

	private trackClaimant (record: ClaimRecord): void {
		let records = this.claimsByClaimant.get(record.claimant);
		if (!records) {
			records = new Set<ClaimRecord>();
			this.claimsByClaimant.set(record.claimant, records);
		}

		records.add(record);
	}

	private untrackClaimant (record: ClaimRecord): void {
		const records = this.claimsByClaimant.get(record.claimant);
		if (!records) {
			return;
		}

		records.delete(record);
		if (records.size === 0) {
			this.claimsByClaimant.delete(record.claimant);
		}
	}

	private setClaimActive (record: ClaimRecord, active: boolean): void {
		if (record.active === active) {
			return;
		}

		record.active = active;
		this.activeClaimCount += active ? 1 : -1;
		this.syncHasClaim();
	}

	private syncHasClaim (): void {
		if (this.hasClaim.disposed) {
			return;
		}

		const nextValue = this.activeClaimCount > 0;
		if (this.hasClaim.value === nextValue) {
			return;
		}

		this.hasClaim.set(nextValue);
	}

	private ensureActive (): void {
		if (this.owner.disposed) {
			throw new Error("Disposed owners cannot be modified.");
		}
	}
}