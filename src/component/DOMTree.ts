import { runCleanupSteps } from "../utility/cleanup";

export type DOMParent = ParentNode & Node & {
	insertBefore (node: Node, child: Node | null): Node;
	moveBefore?: (node: Node, child: Node | null) => unknown;
};

export type DOMPlacement =
	| { type: "append"; parent: DOMParent }
	| { type: "prepend"; parent: DOMParent }
	| { type: "before"; reference: Node }
	| { type: "after"; reference: Node };

type PlacementOperation = {
	nodes: PlacementNode[];
	onPlaced: (node: Node) => void;
	placement: DOMPlacement;
	reportedRecursiveNodes: Set<Node>;
	targetRegistration: DOMTreeNodeRegistration | null;
	type: "place";
};

type PlacementNode = {
	node: Node;
	registration: DOMTreeNodeRegistration | null;
};

type EffectivePlacement = {
	onPlaced: ((node: Node) => void) | null;
	operationIndex: number;
	placementNode: PlacementNode;
};

type RemovalOperation = {
	node: Node;
	type: "remove";
};

type DOMTreeOperation = PlacementOperation | RemovalOperation;

type DOMTreeNodeOwner = {
	readonly disposed: boolean;
};

export type DOMTreeNodeRegistration = {
	active: boolean;
	readonly owner: WeakRef<DOMTreeNodeOwner>;
};

type ParentPlan = {
	current: Node[];
	desired: Node[];
	parent: DOMParent;
	retained: Set<Node>;
};

export const recursiveTreeErrorMessage = "Cannot move a node into itself or one of its descendants.";
const registrations = new WeakMap<Node, DOMTreeNodeRegistration>();

export function registerDOMTreeNode (node: Node, owner: DOMTreeNodeOwner): DOMTreeNodeRegistration {
	const registration: DOMTreeNodeRegistration = {
		active: true,
		owner: new WeakRef(owner),
	};
	registrations.set(node, registration);
	return registration;
}

export function unregisterDOMTreeNode (registration: DOMTreeNodeRegistration): void {
	// Keep an inactive tombstone so raw descendants still inherit disposal until a rewrap replaces this generation.
	registration.active = false;
}

function runPlacementCallbacks (placementNode: PlacementNode, onPlaced: (node: Node) => void): void {
	if (!isPlacementNodeLive(placementNode)) {
		return;
	}

	onPlaced(placementNode.node);
}

function isRegistrationDisposed (registration: DOMTreeNodeRegistration): boolean {
	return !registration.active || registration.owner.deref()?.disposed === true;
}

function isDisposedNode (node: Node): boolean {
	const registration = registrations.get(node);
	return registration ? isRegistrationDisposed(registration) : false;
}

function snapshotPlacementNode (node: Node): PlacementNode {
	return {
		node,
		registration: registrations.get(node) ?? null,
	};
}

function isPlacementNodeLive (placementNode: PlacementNode): boolean {
	const currentRegistration = registrations.get(placementNode.node) ?? null;
	if (currentRegistration !== placementNode.registration) {
		return false;
	}

	return !currentRegistration || !isRegistrationDisposed(currentRegistration);
}

function placementTargetNode (placement: DOMPlacement): Node {
	return placement.type === "append" || placement.type === "prepend"
		? placement.parent
		: placement.reference;
}

export function isDOMParent (value: Node | ParentNode | null): value is DOMParent {
	return value !== null && typeof (value as Partial<DOMParent>).insertBefore === "function";
}

function physicalParentOf (node: Node): DOMParent | null {
	return isDOMParent(node.parentNode) ? node.parentNode : null;
}

function physicalContains (node: Node, candidate: Node): boolean {
	// The physical composed tree is acyclic, so walking ancestors needs no visited set.
	let current: Node | null = candidate;
	while (current) {
		if (current === node) {
			return true;
		}

		current = resolveComposedParent(current);
	}
	return false;
}

function isConsumableDocumentFragment (node: Node): node is DocumentFragment {
	// ShadowRoot also has nodeType 11, but unlike DocumentFragment it remains a persistent parent after insertion.
	return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !("host" in node);
}

function shadowHostOf (node: Node): Element | null {
	return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && "host" in node
		? (node as ShadowRoot).host
		: null;
}

function resolveComposedParent (
	node: Node,
	parentOf: (node: Node) => DOMParent | null = physicalParentOf,
): DOMParent | null {
	return parentOf(node) ?? shadowHostOf(node);
}

function physicalMove (parent: DOMParent, node: Node, beforeNode: Node | null): boolean {
	if (physicalContains(node, parent)) {
		console.error(recursiveTreeErrorMessage);
		return false;
	}

	try {
		if (typeof parent.moveBefore === "function" && parent.isConnected && node.isConnected) {
			parent.moveBefore(node, beforeNode);
			return true;
		}

		parent.insertBefore(node, beforeNode);
		return true;
	} catch (error) {
		if (error instanceof DOMException && error.name === "HierarchyRequestError") {
			console.error(recursiveTreeErrorMessage);
			return false;
		}

		throw error;
	}
}

function isPlacementTargetDisposed (
	placement: DOMPlacement,
	parentOf: (node: Node) => DOMParent | null = physicalParentOf,
): boolean {
	let current: Node | null = placement.type === "append" || placement.type === "prepend"
		? placement.parent
		: placement.reference;
	// Guards against cycles a virtual tree could report mid-transaction; physical walks never revisit a node.
	const visited: Set<Node> | null = parentOf === physicalParentOf ? null : new Set();

	while (current && !visited?.has(current)) {
		if (isDisposedNode(current)) {
			return true;
		}

		visited?.add(current);
		current = parentOf(current) ?? shadowHostOf(current);
	}

	return false;
}

class VirtualDOMTree {
	readonly affectedParents = new Set<DOMParent>();
	readonly deferredPlacements = new Set<PlacementOperation>();
	readonly operationByNode = new Map<Node, EffectivePlacement>();
	readonly lists = new Map<DOMParent, Node[]>();
	readonly virtualParents = new Map<Node, DOMParent | null>();

	constructor (
		private readonly operations: readonly DOMTreeOperation[],
		private readonly excludedPlacements: ReadonlySet<PlacementOperation> = new Set(),
	) {
		this.replay();
	}

	childrenOf (parent: DOMParent): Node[] {
		return this.initialiseParent(parent);
	}

	parentOf (node: Node): DOMParent | null {
		return this.getVirtualParent(node);
	}

	contains (node: Node, candidate: Node): boolean {
		let current: Node | null = candidate;
		const visited = new Set<Node>();
		while (current && !visited.has(current)) {
			if (current === node) {
				return true;
			}

			visited.add(current);
			current = resolveComposedParent(current, candidateNode => this.getVirtualParent(candidateNode));
		}
		return false;
	}

	isConnected (node: Node): boolean {
		let current: Node | null = node;
		const visited = new Set<Node>();
		while (current && !visited.has(current)) {
			visited.add(current);
			const hadVirtualParent = this.virtualParents.has(current);
			const parent = this.getVirtualParent(current);
			if (parent) {
				current = parent;
				continue;
			}

			const shadowHost = shadowHostOf(current);
			if (shadowHost) {
				current = shadowHost;
				continue;
			}

			return current.nodeType === Node.DOCUMENT_NODE || (!hadVirtualParent && current.isConnected);
		}
		return false;
	}

	private initialiseParent (parent: DOMParent): Node[] {
		const existing = this.lists.get(parent);
		if (existing) {
			return existing;
		}

		const children = Array.from(parent.childNodes);
		this.lists.set(parent, children);
		for (const child of children) {
			if (!this.virtualParents.has(child)) {
				this.virtualParents.set(child, parent);
			}
		}
		return children;
	}

	private getVirtualParent (node: Node): DOMParent | null {
		if (this.virtualParents.has(node)) {
			return this.virtualParents.get(node) ?? null;
		}

		const parent = physicalParentOf(node);
		this.virtualParents.set(node, parent);
		if (parent) {
			this.initialiseParent(parent);
		}
		return parent;
	}

	private resolveDestination (placement: DOMPlacement): { index: number; parent: DOMParent } | null {
		if (placement.type === "append") {
			const children = this.initialiseParent(placement.parent);
			return { index: children.length, parent: placement.parent };
		}

		if (placement.type === "prepend") {
			return { index: 0, parent: placement.parent };
		}

		const parent = this.getVirtualParent(placement.reference);
		if (!parent) {
			return null;
		}

		const children = this.initialiseParent(parent);
		const referenceIndex = children.indexOf(placement.reference);
		if (referenceIndex < 0) {
			return null;
		}

		return {
			index: placement.type === "before" ? referenceIndex : referenceIndex + 1,
			parent,
		};
	}

	private createsRecursiveTree (parent: DOMParent, node: Node): boolean {
		return this.contains(node, parent);
	}

	private removeVirtualNode (node: Node): void {
		const parent = this.getVirtualParent(node);
		if (!parent) {
			return;
		}

		const children = this.initialiseParent(parent);
		const index = children.indexOf(node);
		if (index >= 0) {
			children.splice(index, 1);
			this.affectedParents.add(parent);
		}
		this.virtualParents.set(node, null);
	}

	private replayPlacement (operation: PlacementOperation, operationIndex: number): void {
		const targetNode = placementTargetNode(operation.placement);
		if (operation.targetRegistration && registrations.get(targetNode) !== operation.targetRegistration) {
			return;
		}

		if (isPlacementTargetDisposed(operation.placement, node => this.getVirtualParent(node))) {
			return;
		}

		const seenNodes = new Set<Node>();
		const placementNodes = operation.nodes.flatMap((placementNode) => {
			if (!isPlacementNodeLive(placementNode)) {
				return [];
			}

			if (!isConsumableDocumentFragment(placementNode.node)) {
				return [placementNode];
			}

			return [...this.initialiseParent(placementNode.node)]
				.map(snapshotPlacementNode)
				.filter(isPlacementNodeLive);
		}).filter((placementNode) => {
			const latestOperation = this.operationByNode.get(placementNode.node);
			return !latestOperation || latestOperation.operationIndex <= operationIndex;
		}).filter((placementNode) => {
			if (seenNodes.has(placementNode.node)) {
				return false;
			}

			seenNodes.add(placementNode.node);
			return true;
		});
		const nodes = placementNodes.map(placementNode => placementNode.node);
		if (nodes.length === 0) {
			return;
		}

		const reference = operation.placement.type === "before" || operation.placement.type === "after"
			? operation.placement.reference
			: null;
		if (reference && this.getVirtualParent(reference) === null) {
			this.deferredPlacements.add(operation);
			return;
		}

		const destinationBeforeRemoval = this.resolveDestination(operation.placement);
		if (!destinationBeforeRemoval) {
			return;
		}

		if (reference !== null && nodes.includes(reference)) {
			const withoutReference = placementNodes.filter(placementNode => placementNode.node !== reference);
			if (withoutReference.length > 0) {
				this.replayPlacement({ ...operation, nodes: withoutReference }, operationIndex);
			}
			return;
		}

		const validPlacementNodes = placementNodes.filter(placementNode => {
			if (!this.createsRecursiveTree(destinationBeforeRemoval.parent, placementNode.node)) {
				return true;
			}

			if (!operation.reportedRecursiveNodes.has(placementNode.node)) {
				operation.reportedRecursiveNodes.add(placementNode.node);
				console.error(recursiveTreeErrorMessage);
			}
			return false;
		});
		const validNodes = validPlacementNodes.map(placementNode => placementNode.node);

		for (const node of validNodes) {
			this.removeVirtualNode(node);
		}

		const destination = this.resolveDestination(operation.placement);
		if (!destination) {
			return;
		}

		const children = this.initialiseParent(destination.parent);
		children.splice(destination.index, 0, ...validNodes);
		for (const placementNode of validPlacementNodes) {
			const node = placementNode.node;
			this.virtualParents.set(node, destination.parent);
			this.operationByNode.set(node, { onPlaced: operation.onPlaced, operationIndex, placementNode });
		}
		this.affectedParents.add(destination.parent);
	}

	private replay (): void {
		for (const [operationIndex, operation] of this.operations.entries()) {
			this.apply(operation, operationIndex);
		}
		this.settleDeferredPlacements();
	}

	private settleDeferredPlacements (): void {
		let pending = [...this.deferredPlacements];
		while (pending.length > 0) {
			this.deferredPlacements.clear();
			let progressed = false;
			for (const operation of pending) {
				const placement = operation.placement;
				if (
					(placement.type === "before" || placement.type === "after")
					&& this.getVirtualParent(placement.reference) !== null
				) {
					this.replayPlacement(operation, this.operations.indexOf(operation));
					progressed = true;
				}
				else {
					this.deferredPlacements.add(operation);
				}
			}

			if (!progressed) {
				return;
			}

			pending = [...this.deferredPlacements];
		}
	}

	applyIncremental (operation: DOMTreeOperation, operationIndex: number): void {
		this.apply(operation, operationIndex);
		this.settleDeferredPlacements();
	}

	apply (operation: DOMTreeOperation, operationIndex = this.operations.length): void {
		if (operation.type === "remove") {
			const latestOperation = this.operationByNode.get(operation.node);
			this.operationByNode.set(operation.node, {
				onPlaced: latestOperation?.onPlaced ?? null,
				operationIndex,
				placementNode: latestOperation?.placementNode ?? snapshotPlacementNode(operation.node),
			});
			this.removeVirtualNode(operation.node);
			return;
		}

		if (!this.excludedPlacements.has(operation)) {
			this.replayPlacement(operation, operationIndex);
		}
	}
}

class DOMTreeTransactionContext {
	readonly operations: DOMTreeOperation[] = [];
	readonly tree = new VirtualDOMTree(this.operations);

	add (operation: DOMTreeOperation): void {
		const operationIndex = this.operations.length;
		this.operations.push(operation);
		this.tree.applyIncremental(operation, operationIndex);
	}
}

class DOMTreeTransactionScope {
	private active = true;

	constructor (
		readonly parent: DOMTreeTransactionScope | null,
		readonly context: DOMTreeTransactionContext,
	) { }

	add (operation: DOMTreeOperation): void {
		this.context.add(operation);
	}

	commit (): void {
		if (!this.active) {
			return;
		}

		if (activeScopes.at(-1) !== this) {
			throw new Error("DOM tree transactions must close in stack order.");
		}

		this.active = false;
		activeScopes.pop();
		if (this.parent) {
			return;
		}

		commitOperations(this.context.operations, createVirtualTree(this.context.operations));
	}
}

const activeScopes: DOMTreeTransactionScope[] = [];

function currentScope (): DOMTreeTransactionScope | null {
	return activeScopes.at(-1) ?? null;
}

function currentTree (): VirtualDOMTree | null {
	return currentScope()?.context.tree ?? null;
}

function createPlacementOperation (
	nodes: readonly Node[],
	placement: DOMPlacement,
	onPlaced: (node: Node) => void,
): PlacementOperation {
	return {
		nodes: nodes.map(snapshotPlacementNode),
		onPlaced,
		placement,
		reportedRecursiveNodes: new Set(),
		targetRegistration: registrations.get(placementTargetNode(placement)) ?? null,
		type: "place",
	};
}

function createVirtualTree (operations: readonly DOMTreeOperation[]): VirtualDOMTree {
	const excludedPlacements = new Set<PlacementOperation>();
	while (true) {
		const tree = new VirtualDOMTree(operations, excludedPlacements);
		let changed = false;
		for (const operation of operations) {
			if (operation.type !== "place" || excludedPlacements.has(operation)) {
				continue;
			}

			if (operation.placement.type !== "before" && operation.placement.type !== "after") {
				continue;
			}

			const reference = operation.placement.reference;
			if (
				(operation.targetRegistration !== null && registrations.get(reference) !== operation.targetRegistration)
				|| isDisposedNode(reference)
				|| tree.parentOf(reference) === null
			) {
				excludedPlacements.add(operation);
				changed = true;
			}
		}

		if (!changed) {
			return tree;
		}
	}
}

/** Live, deduplicated nodes to place, with fragments expanded and invalid targets reported and dropped. */
function collectPlacementNodes (nodes: readonly Node[], parent: DOMParent, reference: Node | null): PlacementNode[] {
	const placementNodes: PlacementNode[] = [];
	const seen = new Set<Node>();
	const consider = (node: Node): void => {
		if (node === reference || seen.has(node)) {
			return;
		}

		seen.add(node);
		const placementNode = snapshotPlacementNode(node);
		if (!isPlacementNodeLive(placementNode)) {
			return;
		}

		if (physicalContains(node, parent)) {
			console.error(recursiveTreeErrorMessage);
			return;
		}

		placementNodes.push(placementNode);
	};

	for (const node of nodes) {
		if (isConsumableDocumentFragment(node)) {
			for (const child of Array.from(node.childNodes)) {
				consider(child);
			}
		} else {
			consider(node);
		}
	}

	return placementNodes;
}

/** The first sibling from `start` onwards that is not itself being placed. */
function firstUnplacedSibling (start: Node | null, placementNodes: readonly PlacementNode[]): Node | null {
	const placed = placementNodes.length === 1 ? null : new Set(placementNodes.map(placementNode => placementNode.node));
	let anchor = start;
	while (anchor !== null && (placed ? placed.has(anchor) : anchor === placementNodes[0].node)) {
		anchor = anchor.nextSibling;
	}
	return anchor;
}

/** The sibling the nodes are inserted before, skipping nodes that are themselves being placed. */
function placementAnchor (parent: DOMParent, placement: DOMPlacement, placementNodes: readonly PlacementNode[]): Node | null {
	switch (placement.type) {
		case "append":
			return null;
		case "before":
			return placement.reference;
		case "prepend":
			return firstUnplacedSibling(parent.firstChild, placementNodes);
		case "after":
			return firstUnplacedSibling(placement.reference.nextSibling, placementNodes);
	}
}

/** Whether the nodes already sit, in order, exactly where the placement would put them. */
function isPlacementSatisfied (parent: DOMParent, placement: DOMPlacement, placementNodes: readonly PlacementNode[]): boolean {
	const count = placementNodes.length;
	if (placement.type === "append" || placement.type === "before") {
		let sibling: Node | null = placement.type === "append" ? parent.lastChild : placement.reference.previousSibling;
		for (let index = count - 1; index >= 0; index--) {
			const node = placementNodes[index].node;
			if (sibling !== node) return false;
			sibling = node.previousSibling;
		}
		return true;
	}

	let sibling: Node | null = placement.type === "prepend" ? parent.firstChild : placement.reference.nextSibling;
	for (let index = 0; index < count; index++) {
		const node = placementNodes[index].node;
		if (sibling !== node) return false;
		sibling = node.nextSibling;
	}
	return true;
}

function placePhysically (nodes: readonly Node[], placement: DOMPlacement, onPlaced: (node: Node) => void): void {
	if (isPlacementTargetDisposed(placement)) {
		return;
	}

	const reference = placement.type === "before" || placement.type === "after" ? placement.reference : null;
	const parent = reference === null
		? (placement as { parent: DOMParent }).parent
		: physicalParentOf(reference);
	if (!parent) {
		return;
	}

	const placementNodes = collectPlacementNodes(nodes, parent, reference);
	if (placementNodes.length === 0) return;

	const alreadySatisfied = isPlacementSatisfied(parent, placement, placementNodes);
	const anchor = alreadySatisfied ? null : placementAnchor(parent, placement, placementNodes);
	const placedNodes: PlacementNode[] = [];
	for (const placementNode of placementNodes) {
		if (alreadySatisfied || physicalMove(parent, placementNode.node, anchor)) {
			placedNodes.push(placementNode);
		}
	}

	let failed = false;
	let firstError: unknown;
	for (const placementNode of placedNodes) {
		if (physicalParentOf(placementNode.node) !== parent) {
			continue;
		}

		try {
			runPlacementCallbacks(placementNode, onPlaced);
		} catch (error) {
			if (!failed) {
				failed = true;
				firstError = error;
			}
		}
	}

	if (failed) {
		throw firstError;
	}
}

function removeImmediately (node: Node): void {
	if (!node.parentNode) {
		return;
	}

	node.parentNode.removeChild(node);
}

function commitOperations (operations: readonly DOMTreeOperation[], tree = createVirtualTree(operations)): void {
	if (operations.length === 0) {
		return;
	}

	const failedMoves = new Set<Node>();
	const plans: ParentPlan[] = [...tree.affectedParents].map(parent => {
		const current = Array.from(parent.childNodes);
		const desired = tree.childrenOf(parent).filter(node => !isDisposedNode(node));
		return {
			current,
			desired,
			parent,
			retained: longestRetainedSubsequence(current, desired, tree.operationByNode),
		};
	});

	for (const plan of plans) {
		let anchor: Node | null = null;
		for (let index = plan.desired.length - 1; index >= 0; index -= 1) {
			const node = plan.desired[index];
			if (!tree.operationByNode.has(node)) {
				anchor = node;
				continue;
			}

			if (plan.retained.has(node) && node.parentNode === plan.parent) {
				anchor = node;
				continue;
			}

			if (node.parentNode === plan.parent && node.nextSibling === anchor) {
				anchor = node;
				continue;
			}

			if (physicalMove(plan.parent, node, anchor)) {
				failedMoves.delete(node);
				anchor = node;
			} else {
				failedMoves.add(node);
			}
		}

		for (const node of plan.current) {
			if (tree.operationByNode.has(node) && tree.parentOf(node) === null && node.parentNode === plan.parent) {
				node.parentNode?.removeChild(node);
			}
		}
	}

	const effectivePlacements = [...tree.operationByNode.values()]
		.filter((placement): placement is EffectivePlacement & { onPlaced: (node: Node) => void } => placement.onPlaced !== null)
		.sort((left, right) => left.operationIndex - right.operationIndex);
	runCleanupSteps(effectivePlacements.map(placement => () => {
		const node = placement.placementNode.node;
		const parent = tree.parentOf(node);
		// Placement callbacks confirm final materialization, even when retaining the node avoided a physical move.
		if (
			!parent
			|| failedMoves.has(node)
			|| physicalParentOf(node) !== parent
			|| !isPlacementNodeLive(placement.placementNode)
		) {
			return;
		}

		runPlacementCallbacks(placement.placementNode, placement.onPlaced);
	}));
}

function longestIncreasingNodes (entries: Array<{ currentIndex: number; node: Node }>): Set<Node> {
	const tails: number[] = [];
	const previous = new Array<number>(entries.length).fill(-1);
	for (let index = 0; index < entries.length; index += 1) {
		let low = 0;
		let high = tails.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (entries[tails[middle]].currentIndex < entries[index].currentIndex) {
				low = middle + 1;
			} else {
				high = middle;
			}
		}

		if (low > 0) {
			previous[index] = tails[low - 1];
		}
		tails[low] = index;
	}

	const retained = new Set<Node>();
	if (tails.length === 0) {
		return retained;
	}

	let index = tails[tails.length - 1];
	while (index >= 0) {
		retained.add(entries[index].node);
		index = previous[index];
	}
	return retained;
}

function longestRetainedSubsequence (current: readonly Node[], desired: readonly Node[], movable: Pick<ReadonlySet<Node>, "has">): Set<Node> {
	const desiredNodes = new Set(desired);
	const retained = new Set(current.filter(node => !movable.has(node) && desiredNodes.has(node)));
	const currentIndexes = new Map(current.map((node, index) => [node, index]));
	const currentSegments = new Map<Node, number>();
	let segment = 0;
	for (const node of current) {
		if (!movable.has(node) && desiredNodes.has(node)) {
			segment += 1;
			continue;
		}

		if (movable.has(node)) {
			currentSegments.set(node, segment);
		}
	}

	const entriesBySegment = new Map<number, Array<{ currentIndex: number; node: Node }>>();
	segment = 0;
	for (const node of desired) {
		if (!movable.has(node) && retained.has(node)) {
			segment += 1;
			continue;
		}

		const currentIndex = currentIndexes.get(node);
		if (currentIndex === undefined || currentSegments.get(node) !== segment) {
			continue;
		}

		const entries = entriesBySegment.get(segment) ?? [];
		entries.push({ currentIndex, node });
		entriesBySegment.set(segment, entries);
	}

	for (const entries of entriesBySegment.values()) {
		for (const node of longestIncreasingNodes(entries)) {
			retained.add(node);
		}
	}

	return retained;
}

export interface DOMTreeTransaction {
	commit (): void;
}

export function beginDOMTreeTransaction (): DOMTreeTransaction {
	const parent = currentScope();
	const scope = new DOMTreeTransactionScope(parent, parent?.context ?? new DOMTreeTransactionContext());
	activeScopes.push(scope);
	return scope;
}

export const DOMTree = {
	get active (): boolean {
		return activeScopes.length > 0;
	},
	parentOf (node: Node): DOMParent | null {
		const tree = currentTree();
		return tree ? tree.parentOf(node) : physicalParentOf(node);
	},
	composedParentOf (node: Node): DOMParent | null {
		const tree = currentTree();
		return resolveComposedParent(node, candidate => tree ? tree.parentOf(candidate) : physicalParentOf(candidate));
	},
	/** Whether the open transaction has changed this parent's children, so its physical children are not the virtual ones. */
	hasPendingChildChanges (parent: Node): boolean {
		return currentTree()?.affectedParents.has(parent as DOMParent) ?? false;
	},
	childrenOf (parent: DOMParent): Node[] {
		const tree = currentTree();
		return tree ? [...tree.childrenOf(parent)] : Array.from(parent.childNodes);
	},
	firstChildOf (parent: DOMParent): Node | null {
		return this.childrenOf(parent)[0] ?? null;
	},
	nextSiblingOf (node: Node): Node | null {
		const parent = this.parentOf(node);
		if (!parent) {
			return null;
		}
		const children = this.childrenOf(parent);
		const index = children.indexOf(node);
		return index < 0 ? null : children[index + 1] ?? null;
	},
	contains (node: Node, candidate: Node): boolean {
		return currentTree()?.contains(node, candidate) ?? physicalContains(node, candidate);
	},
	isConnected (node: Node): boolean {
		return currentTree()?.isConnected(node) ?? node.isConnected;
	},
	canPlace (nodes: readonly Node[], placement: DOMPlacement): boolean {
		const tree = currentTree();
		if (isPlacementTargetDisposed(placement, node => tree ? tree.parentOf(node) : physicalParentOf(node))) return false;
		const parent = placement.type === "append" || placement.type === "prepend"
			? placement.parent
			: tree?.parentOf(placement.reference) ?? physicalParentOf(placement.reference);
		if (!parent) return false;
		for (const node of nodes) {
			if (this.contains(node, parent)) {
				console.error(recursiveTreeErrorMessage);
				return false;
			}
		}
		return true;
	},
	place (nodes: readonly Node[], placement: DOMPlacement, onPlaced: (node: Node) => void = () => { }): void {
		const liveNodes = nodes.filter(node => !isDisposedNode(node));
		if (liveNodes.length === 0) {
			return;
		}

		const operation = createPlacementOperation(liveNodes, placement, onPlaced);
		const scope = currentScope();
		if (scope) {
			scope.add(operation);
			return;
		}

		placePhysically(liveNodes, placement, onPlaced);
	},
	remove (node: Node): void {
		const scope = currentScope();
		if (scope) {
			scope.add({ node, type: "remove" });
			return;
		}
		removeImmediately(node);
	},
	physical: {
		parentOf: physicalParentOf,
		childrenOf (parent: DOMParent): Node[] {
			return Array.from(parent.childNodes);
		},
		place: placePhysically,
		remove (node: Node): void {
			removeImmediately(node);
		},
	},
};
