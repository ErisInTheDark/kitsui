import { Owner } from "../state/State";
import { GenericClaimManipulator } from "./GenericClaimManipulator";

/**
 * Manages explicit lifecycle owners for a component-like host.
 * Multiple owners may overlap; the host remains explicitly owned while any claim is present.
 * @typeParam HOST The owning host type returned for fluent chaining.
 */
export class OwnerManipulator<HOST extends Owner & { remove (): void; }> extends GenericClaimManipulator<HOST> {
	constructor (
		owner: HOST,
		private readonly refreshManagement: () => void,
	) {
		super(owner);
	}

	/**
	 * Adds an explicit owner claim to the host.
	 * A non-null id replaces any previous claim registered in the same slot.
	 * Anonymous claims are deduplicated by owner.
	 * @param owner Explicit owner to register.
	 * @param id Optional keyed claim slot.
	 * @returns The owning host for fluent chaining.
	 * @throws If the host attempts to own itself.
	 */
	add (owner: Owner, id: string | null = null): HOST {
		if (this.owner.disposed || owner.disposed) {
			throw new Error("Disposed owners cannot be modified.");
		}
		if (owner === this.owner) {
			throw new Error("An owner cannot own itself.");
		}

		if (id === null) {
			if (this.hasAnonymousClaim(owner)) {
				return this.owner;
			}
		}
		else if (this.getRegisteredClaimant(id) === owner) {
			return this.owner;
		}

		this.registerClaim(id, owner);
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
			this.deregisterClaim(idOrOwner as string | null, owner);
			return this.owner;
		}

		if (typeof idOrOwner === "string") {
			this.deregisterClaim(idOrOwner);
			return this.owner;
		}

		if (idOrOwner !== null) {
			this.deregisterClaim(idOrOwner);
		}

		return this.owner;
	}

	/**
	 * Returns one explicit owner if any are registered.
	 * When multiple owners are present, which owner is returned is not guaranteed.
	 * @returns One explicit owner or null when no owners are registered.
	 */
	get (): Owner | null {
		return this.getRegisteredClaimants()[0] as Owner | undefined ?? null;
	}

	/**
	 * Returns every currently registered explicit owner without duplicates.
	 * @returns All explicit owners currently managing the host.
	 */
	getAll (): Owner[] {
		return [...new Set(this.getRegisteredClaimants() as Owner[])];
	}

	protected onClaimsChanged (disposedOwnerRemoved = false): void {
		this.refreshManagement();
		if (disposedOwnerRemoved && this.getAll().length === 0 && !this.owner.disposed) {
			this.owner.remove();
		}
	}
}
