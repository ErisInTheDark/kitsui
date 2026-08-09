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

type AuthorityRecord = {
	active: boolean;
	cleanup: ((preservePosition: boolean) => void) | null;
	cleanupAssigned: boolean;
	owner: Owner | null;
	preservePosition: boolean;
	readonly node: Node;
};

const authorities = new WeakMap<Node, AuthorityRecord>();
const authoringGenerations = new WeakMap<Node, number>();
let nextAuthoringGeneration = 0;

function releaseRecord (record: AuthorityRecord, preservePosition: boolean): void {
	if (record.active) {
		record.active = false;
		record.preservePosition = preservePosition;
		if (authorities.get(record.node) === record) {
			authorities.delete(record.node);
		}
	}

	const cleanup = record.cleanup;
	if (cleanup) {
		record.cleanup = null;
		cleanup(record.preservePosition);
	}
}

function installPlacementAuthority (node: Node, owner: Owner | null, generation: number): PlacementAuthority {
	const previous = authorities.get(node);
	const record: AuthorityRecord = {
		active: true,
		cleanup: null,
		cleanupAssigned: false,
		node,
		owner,
		preservePosition: true,
	};
	authoringGenerations.set(node, generation);
	authorities.set(node, record);
	previous && releaseRecord(previous, true);

	return {
		owner,
		node,
		isCurrent: () => record.active && authorities.get(node) === record,
		relinquish: () => {
			if (!record.active) return;
			record.active = false;
			if (authorities.get(node) === record) authorities.delete(node);
			record.cleanup = null;
		},
		release: (preservePosition = false) => releaseRecord(record, preservePosition),
		setCleanup: (cleanup) => {
			if (record.cleanupAssigned) {
				throw new Error("Placement authority cleanup can only be assigned once.");
			}
			record.cleanupAssigned = true;
			record.cleanup = cleanup;
			if (!record.active || authorities.get(node) !== record) {
				releaseRecord(record, true);
			}
		},
	};
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
	const authority = authorities.get(node);
	if (authority) {
		releaseRecord(authority, preservePosition);
	}
}

export function placementAuthorityOwner (node: Node): Owner | null {
	const authority = authorities.get(node);
	return authority?.active ? authority.owner : null;
}
