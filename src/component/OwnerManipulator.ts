import { Owner, type CleanupFunction } from "../state/State";
import { GenericClaimManipulator } from "./GenericClaimManipulator";

interface OwnerClaimEntry {
	active: boolean;
	id: string | null;
	owner: Owner;
	releaseLifecycle: CleanupFunction;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

/**
 * Manages explicit lifecycle owners for a component-like host.
 * Multiple owners may overlap; the host remains explicitly owned while any claim is present.
 * @typeParam HOST The owning host type returned for fluent chaining.
 */
export class OwnerManipulator<HOST extends Owner & { remove (): void; }> extends GenericClaimManipulator<HOST> {
	private readonly anonymousEntries = new Map<Owner, OwnerClaimEntry>();
	private readonly entriesByOwner = new Map<Owner, Set<OwnerClaimEntry>>();
	private readonly keyedEntries = new Map<string, OwnerClaimEntry>();

	constructor (
		owner: HOST,
		private readonly refreshManagement: () => void,
	) {
		super(owner);

		owner.onCleanup(() => {
			this.clearEntries();
		});
	}

	/**
	 * Adds an explicit owner claim to the host.
	 * A non-null id replaces any previous claim registered in the same slot.
	 * Anonymous claims are deduplicated by owner.
	 * @param owner Explicit owner to register.
	 * @param id Optional keyed claim slot.
	 * @returns The owning host for fluent chaining.
	 */
	add (owner: Owner, id: string | null = null): HOST {
		if (id === null) {
			if (this.anonymousEntries.has(owner)) {
				return this.owner;
			}
		}
		else {
			const existingEntry = this.keyedEntries.get(id);
			if (existingEntry?.owner === owner) {
				return this.owner;
			}

			if (existingEntry) {
				this.unregisterEntry(existingEntry, true);
			}
		}

		const entry: OwnerClaimEntry = {
			active: true,
			id,
			owner,
			releaseLifecycle: noop,
		};

		entry.releaseLifecycle = owner.onCleanup(() => {
			if (!entry.active) {
				return;
			}

			this.unregisterEntry(entry, true);
			if (this.getAll().length === 0) {
				this.owner.remove();
			}
		});

		this.trackEntry(entry);
		this.registerClaim(id, owner);
		this.refreshManagement();
		return this.owner;
	}

	/**
	 * Removes explicit owner claims by owner, by keyed id, or by the `(id, owner)` composite.
	 * @param owner Explicit owner whose claims should be removed.
	 * @returns The owning host for fluent chaining.
	 */
	remove (owner: Owner): HOST;
	/**
	 * Removes the explicit owner claim registered for a keyed id.
	 * @param id Keyed claim slot to clear.
	 * @returns The owning host for fluent chaining.
	 */
	remove (id: string): HOST;
	/**
	 * Removes the explicit owner claim matching the provided composite.
	 * When `id` is null, this removes the anonymous claim for that owner if present.
	 * @param id Keyed claim slot, or null for the anonymous owner slot.
	 * @param owner Explicit owner that registered the claim.
	 * @returns The owning host for fluent chaining.
	 */
	remove (id: string | null, owner: Owner): HOST;
	remove (idOrOwner: string | Owner | null, owner?: Owner): HOST {
		if (owner !== undefined) {
			if (idOrOwner === null) {
				const anonymousEntry = this.anonymousEntries.get(owner);
				if (anonymousEntry) {
					this.unregisterEntry(anonymousEntry, true);
				}

				return this.owner;
			}

			const keyedEntry = this.keyedEntries.get(idOrOwner as string);
			if (keyedEntry?.owner === owner) {
				this.unregisterEntry(keyedEntry, true);
			}

			return this.owner;
		}

		if (typeof idOrOwner === "string") {
			const keyedEntry = this.keyedEntries.get(idOrOwner);
			if (keyedEntry) {
				this.unregisterEntry(keyedEntry, true);
			}

			return this.owner;
		}

		if (idOrOwner !== null) {
			const entries = this.entriesByOwner.get(idOrOwner);
			for (const entry of [...(entries ?? [])]) {
				this.unregisterEntry(entry, true);
			}
		}

		return this.owner;
	}

	/**
	 * Returns one explicit owner if any are registered.
	 * When multiple owners are present, which owner is returned is not guaranteed.
	 * @returns One explicit owner or null when no owners are registered.
	 */
	get (): Owner | null {
		for (const entry of this.keyedEntries.values()) {
			return entry.owner;
		}

		for (const entry of this.anonymousEntries.values()) {
			return entry.owner;
		}

		return null;
	}

	/**
	 * Returns every currently registered explicit owner without duplicates.
	 * @returns All explicit owners currently managing the host.
	 */
	getAll (): Owner[] {
		return [...new Set([
			...this.keyedEntries.values(),
			...this.anonymousEntries.values(),
		].map(entry => entry.owner))];
	}

	private clearEntries (): void {
		for (const entry of [
			...this.keyedEntries.values(),
			...this.anonymousEntries.values(),
		]) {
			this.untrackEntry(entry);
			entry.active = false;
			entry.releaseLifecycle();
		}
	}

	private trackEntry (entry: OwnerClaimEntry): void {
		if (entry.id === null) {
			this.anonymousEntries.set(entry.owner, entry);
		}
		else {
			this.keyedEntries.set(entry.id, entry);
		}

		let entries = this.entriesByOwner.get(entry.owner);
		if (!entries) {
			entries = new Set<OwnerClaimEntry>();
			this.entriesByOwner.set(entry.owner, entries);
		}

		entries.add(entry);
	}

	private untrackEntry (entry: OwnerClaimEntry): void {
		if (entry.id === null) {
			if (this.anonymousEntries.get(entry.owner) === entry) {
				this.anonymousEntries.delete(entry.owner);
			}
		}
		else if (this.keyedEntries.get(entry.id) === entry) {
			this.keyedEntries.delete(entry.id);
		}

		const ownerEntries = this.entriesByOwner.get(entry.owner);
		if (!ownerEntries) {
			return;
		}

		ownerEntries.delete(entry);
		if (ownerEntries.size === 0) {
			this.entriesByOwner.delete(entry.owner);
		}
	}

	private unregisterEntry (entry: OwnerClaimEntry, deregisterClaim: boolean): void {
		if (!entry.active) {
			return;
		}

		entry.active = false;
		this.untrackEntry(entry);
		entry.releaseLifecycle();

		if (deregisterClaim) {
			this.deregisterClaim(entry.id, entry.owner);
		}

		this.refreshManagement();
	}
}