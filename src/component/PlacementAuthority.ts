import type { Owner } from "../state/State";

export interface PlacementAuthority {
	readonly owner: Owner | null;
	readonly node: Node;
	isCurrent (): boolean;
	relinquish (): void;
	release (preservePosition?: boolean): void;
	setCleanup (cleanup: (preservePosition: boolean) => void): void;
}

export interface PlacementAuthorityAuthor {
	claim (node: Node, owner?: Owner | null): PlacementAuthority | null;
}

const authorities = new WeakMap<Node, AuthorityRecord>();
const authoringGenerations = new WeakMap<Node, number>();
let nextAuthoringGeneration = 0;

/** The current right to place one node, held by whichever placement flow claimed it last. */
class AuthorityRecord implements PlacementAuthority {
	private active = true;
	private cleanup: ((preservePosition: boolean) => void) | null = null;
	private cleanupAssigned = false;
	private preservePosition = true;

	constructor (
		readonly node: Node,
		readonly owner: Owner | null,
	) { }

	isCurrent (): boolean {
		return this.active && authorities.get(this.node) === this;
	}

	relinquish (): void {
		if (!this.active) return;
		this.active = false;
		if (authorities.get(this.node) === this) authorities.delete(this.node);
		this.cleanup = null;
	}

	release (preservePosition = false): void {
		if (this.active) {
			this.active = false;
			this.preservePosition = preservePosition;
			if (authorities.get(this.node) === this) {
				authorities.delete(this.node);
			}
		}

		const cleanup = this.cleanup;
		if (cleanup) {
			this.cleanup = null;
			cleanup(this.preservePosition);
		}
	}

	setCleanup (cleanup: (preservePosition: boolean) => void): void {
		if (this.cleanupAssigned) {
			throw new Error("Placement authority cleanup can only be assigned once.");
		}
		this.cleanupAssigned = true;
		this.cleanup = cleanup;
		if (!this.isCurrent()) {
			this.release(true);
		}
	}
}

function installPlacementAuthority (node: Node, owner: Owner | null, generation: number): PlacementAuthority {
	const previous = authorities.get(node);
	const record = new AuthorityRecord(node, owner);
	authoringGenerations.set(node, generation);
	authorities.set(node, record);
	previous?.release(true);
	return record;
}

export function createPlacementAuthorityAuthor (): PlacementAuthorityAuthor {
	const generation = ++nextAuthoringGeneration;

	return {
		claim: (node, owner = null) => {
			if ((authoringGenerations.get(node) ?? 0) > generation) {
				return null;
			}

			return installPlacementAuthority(node, owner, generation);
		},
	};
}

export function replacePlacementAuthority (node: Node, owner: Owner | null = null): PlacementAuthority {
	return installPlacementAuthority(node, owner, ++nextAuthoringGeneration);
}

export function releasePlacementAuthority (node: Node, preservePosition = true): void {
	authorities.get(node)?.release(preservePosition);
}

export function placementAuthorityOwner (node: Node): Owner | null {
	const authority = authorities.get(node);
	return authority?.isCurrent() ? authority.owner : null;
}
