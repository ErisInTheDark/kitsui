import { Owner, type CleanupFunction } from "../state/State";
import { EventManipulator } from "./EventManipulator";

declare global {
	interface Node {
		readonly marker: Marker | undefined;
	}
}

export interface MarkerEventMap {
	Mount: CustomEvent;
	Dispose: CustomEvent;
}

export interface MarkerExtensions { }

export interface MarkerStaticExtensions { }

export type ExtendableMarkerClass = MarkerConstructor & MarkerStaticExtensions;

export interface MarkerBuilderDefinition<A extends any[]> {
	id (...args: A): string;
	build (marker: Marker, ...args: A): CleanupFunction;
}

/** @group Marker */
type MarkerConstructor = {
	(id: string): Marker;
	new(id: string): Marker;
	prototype: Marker;
	extend (): ExtendableMarkerClass;
	builder<A extends any[]> (definition: MarkerBuilderDefinition<A>): (...args: A) => Marker;
};

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

const orphanedMarkerErrorMessage = "Markers must be connected to the document or have a managed owner before the next tick.";
const markers = new WeakMap<Comment, WeakRef<MarkerClass>>();
let markerAccessorInstalled = false;

type OwnerWithNode = Owner & Partial<{
	element: Node;
	node: Node;
	getOwner: () => Owner | null;
	isManaged: () => boolean;
}>;

function getLiveMarker (node: Comment): MarkerClass | undefined {
	const marker = markers.get(node)?.deref();

	if (!marker) {
		markers.delete(node);
		return undefined;
	}

	return marker;
}

function installNodeMarkerAccessor (): void {
	if (markerAccessorInstalled) {
		return;
	}

	markerAccessorInstalled = true;
	Object.defineProperty(Node.prototype, "marker", {
		configurable: true,
		enumerable: false,
		get (this: Node): Marker | undefined {
			if (!(this instanceof Comment)) {
				return undefined;
			}

			return getLiveMarker(this);
		},
	});
}

function getWrappedNodeOwner (node: Node): Owner | null {
	const maybeMarker = (node as Node & { marker?: Marker }).marker;
	if (maybeMarker) {
		return maybeMarker;
	}

	const maybeComponent = (node as Node & { component?: Owner }).component;
	return maybeComponent ?? null;
}

function getOwnerNode (owner: Owner): Node | null {
	const value = owner as OwnerWithNode;

	if (value.node instanceof Node) {
		return value.node;
	}

	if (value.element instanceof Node) {
		return value.element;
	}

	return null;
}

function getExplicitOwner (owner: Owner): Owner | null {
	const value = owner as OwnerWithNode;
	return typeof value.getOwner === "function" ? value.getOwner() : null;
}

function isManagedOwner (owner: Owner | null, visitedOwners: Set<Owner>): boolean {
	if (!owner || owner.disposed) {
		return false;
	}

	if (visitedOwners.has(owner)) {
		return false;
	}

	visitedOwners.add(owner);

	const value = owner as OwnerWithNode;
	const ownerNode = getOwnerNode(owner);
	if (ownerNode && isManagedNode(ownerNode, visitedOwners)) {
		return true;
	}

	const explicitOwner = getExplicitOwner(owner);
	if (explicitOwner) {
		return isManagedOwner(explicitOwner, visitedOwners);
	}

	if (ownerNode && "element" in value && typeof value.isManaged === "function") {
		return value.isManaged();
	}

	return ownerNode === null;
}

function isManagedNode (node: Node, visitedOwners: Set<Owner> = new Set()): boolean {
	if (node.isConnected) {
		return true;
	}

	let current: Node | null = node;
	while (current) {
		const wrappedOwner = getWrappedNodeOwner(current);
		if (wrappedOwner && isManagedOwner(wrappedOwner, visitedOwners)) {
			return true;
		}

		current = current.parentNode;
	}

	return false;
}

/** @group Marker */
class MarkerClass extends Owner {
	readonly node: Comment;
	private explicitOwner: Owner | null = null;
	private releaseExplicitOwner: CleanupFunction = noop;
	private mounted = false;
	private orphanCheckId: ReturnType<typeof setTimeout> | null = null;

	constructor (id: string) {
		super();
		installNodeMarkerAccessor();
		this.node = document.createComment(id);
		markers.set(this.node, new WeakRef(this));
		this.refreshOrphanCheck();
	}

	get event (): EventManipulator<this, "marker", MarkerEventMap> {
		this.ensureActive();

		const manipulator = new EventManipulator<this, "marker", MarkerEventMap>(this, this.node, "marker");
		Object.defineProperty(this, "event", {
			configurable: true,
			enumerable: true,
			value: manipulator,
			writable: false,
		});

		return manipulator;
	}

	remove (): void {
		super.dispose();
	}

	setOwner (owner: Owner | null): this {
		this.ensureActive();

		if (this.explicitOwner === owner) {
			return this;
		}

		this.releaseExplicitOwner();
		this.releaseExplicitOwner = noop;
		this.explicitOwner = owner;

		if (owner) {
			this.releaseExplicitOwner = owner.onCleanup(() => {
				this.remove();
			});
		}

		this.refreshOrphanCheck();
		return this;
	}

	getOwner (): Owner | null {
		return this.explicitOwner;
	}

	use (onMount: () => CleanupFunction | undefined, onDispose?: () => unknown): this {
		let disposeCleanup: CleanupFunction | undefined;

		this.event.owned.on.Mount(() => {
			disposeCleanup = onMount();
		});

		this.event.owned.on.Dispose(() => {
			disposeCleanup?.()
			onDispose?.()
			disposeCleanup = undefined
			onDispose = undefined
		});

		return this
	}

	protected beforeDispose (): void {
		this.node.dispatchEvent(new CustomEvent("Dispose"));
		this.clearOrphanCheck();
		this.releaseExplicitOwner();
		this.releaseExplicitOwner = noop;
		this.explicitOwner = null;

		if (getLiveMarker(this.node) === this) {
			markers.delete(this.node);
		}
	}

	protected afterDispose (): void {
		this.node.remove();
	}

	/** @internal */
	private dispatchMount (): void {
		if (this.mounted) {
			return;
		}

		this.mounted = true;
		this.node.dispatchEvent(new CustomEvent("Mount"));
	}

	private ensureActive (): void {
		if (this.disposed) {
			throw new Error("Disposed markers cannot be modified.");
		}
	}

	private clearOrphanCheck (): void {
		if (this.orphanCheckId === null) {
			return;
		}

		clearTimeout(this.orphanCheckId);
		this.orphanCheckId = null;
	}

	/** @internal */
	refreshOrphanCheck (): void {
		if (this.disposed || this.isManaged()) {
			this.clearOrphanCheck();
			return;
		}

		if (this.orphanCheckId !== null) {
			return;
		}

		this.orphanCheckId = setTimeout(() => {
			this.orphanCheckId = null;

			if (this.disposed) {
				return;
			}

			if (this.isManaged()) {
				this.dispatchMount();
				return;
			}

			throw new Error(orphanedMarkerErrorMessage);
		}, 0);
	}

	private isManaged (): boolean {
		if (isManagedNode(this.node)) {
			return true;
		}

		return isManagedOwner(this.explicitOwner, new Set());
	}
}

interface MarkerClass extends MarkerExtensions { }

/** @group Marker */
export type Marker = MarkerClass;

/** @group Marker */
export const Marker = function Marker (id: string): Marker {
	return new MarkerClass(id);
} as MarkerConstructor & MarkerStaticExtensions;

Marker.prototype = MarkerClass.prototype;

Marker.extend = function extend (): ExtendableMarkerClass {
	return MarkerClass as ExtendableMarkerClass;
};

Marker.builder = function builder<A extends any[]> (definition: MarkerBuilderDefinition<A>): (...args: A) => Marker {
	return (...args: A) => {
		const id = definition.id(...args);
		const marker = new MarkerClass(id);

		marker.event.owned.on.Mount(() => {
			const cleanup = definition.build(marker, ...args);
			if (cleanup) marker.event.owned.on.Dispose(() => cleanup?.());
		});

		return marker;
	}
}
