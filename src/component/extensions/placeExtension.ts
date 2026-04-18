import { Owner, State, type CleanupFunction } from "../../state/State";
import { Class } from "../../utility/types";
import type { Falsy } from "../ClassManipulator";
import {
    Component,
    ComponentChild,
    registerComponentOwnerResolver,
    type InsertWhere,
} from "../Component";
import { Marker } from "../Marker";

/** A placement target: a DOM node, Component, Place marker, or null/falsy. */
export type PlacementTarget = Node | Component | Marker | Place | Falsy;

/** A DOM parent node that can host appended or prepended placements. */
export type PlacementParent = ParentNode & Node;

/** @group Place */
type PlaceConstructor = {
	(): Place;
	new(): Place;
	prototype: Place;
};

/** A function that receives a Place constructor and returns State<Place | null> for reactive placement. */
export type PlacerFunction = (Place: PlaceConstructor) => State<Place | null>;

declare module "../Component" {
	interface ComponentExtensions {
		/**
		 * Appends this component to the end of the target component or DOM parent.
		 * Sets this component's owner to the target component, or the nearest wrapped ancestor for raw DOM parents.
		 * @param target The target component or DOM parent.
		 * @returns This component for chaining.
		 * @throws If this or the target component is disposed.
		 */
		appendTo (target: PlacementContainer): this;

		/**
		 * Conditionally appends this component based on a boolean state.
		 * Automatically removes the component when the state becomes false.
		 * @param state The boolean state that controls visibility.
		 * @param target The target component or DOM parent.
		 * @returns This component for chaining.
		 */
		appendToWhen (state: State<boolean>, target: PlacementContainer): this;

		/**
		 * Prepends this component to the start of the target component or DOM parent.
		 * Sets this component's owner to the target component, or the nearest wrapped ancestor for raw DOM parents.
		 * @param target The target component or DOM parent.
		 * @returns This component for chaining.
		 * @throws If this or the target component is disposed.
		 */
		prependTo (target: PlacementContainer): this;

		/**
		 * Conditionally prepends this component based on a boolean state.
		 * Automatically removes the component when the state becomes false.
		 * @param state The boolean state that controls visibility.
		 * @param target The target component or DOM parent.
		 * @returns This component for chaining.
		 */
		prependToWhen (state: State<boolean>, target: PlacementContainer): this;

		/**
		 * Inserts this component before or after a reference node, component, or place.
		 * Sets the owner based on the target's owner if applicable.
		 * @param where \"before\" or \"after\" the target.
		 * @param target The reference node, component, place, or null.
		 * @returns This component for chaining.
		 * @throws If this component is disposed or target's parent is not a valid insert location.
		 */
		insertTo (where: InsertWhere, target: PlacementTarget): this;

		/**
		 * Conditionally inserts this component based on a boolean state.
		 * Automatically removes the component when the state becomes false.
		 * @param state The boolean state that controls visibility.
		 * @param where \"before\" or \"after\" the target.
		 * @param target The reference node, component, place, or null.
		 * @returns This component for chaining.
		 */
		insertToWhen (state: State<boolean>, where: InsertWhere, target: PlacementTarget): this;

		/**
		 * Manually controls component placement with a reactive placer function.
		 * The placer receives a Place constructor and returns State<Place | null> that controls where the component is inserted.
		 * @param owner The owner who manages the placement lifecycle.
		 * @param placer A function that produces State<Place | null> determining the component's location.
		 * @returns This component for chaining.
		 * @throws If this component is disposed.
		 */
		place (owner: Owner, placer: PlacerFunction): this;
	}
}

declare module "../Marker" {
	interface MarkerExtensions {
		appendTo (target: PlacementContainer): this;
		prependTo (target: PlacementContainer): this;
		insertTo (where: InsertWhere, target: PlacementTarget): this;
	}
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

class PlacementLifecycleOwner extends Owner {
	// Uses Owner's default lifecycle hooks.
}

type MoveParent = ParentNode & Node & {
	insertBefore (node: Node, child: Node | null): Node;
	moveBefore?: (node: Node, child: Node | null) => unknown;
};

type PlacementContainer = Component | PlacementParent;

const placementControllers = new WeakMap<Component, CleanupFunction>();
const placementOwners = new WeakMap<Component, Owner>();
const placementLifecycleOwners = new WeakMap<Component, Owner>();
const recursiveTreeErrorMessage = "Cannot move a node into itself or one of its descendants.";

let componentClass: Class<Component> | null = null;
let patched = false;

function getComponentClass (): Class<Component> {
	componentClass ??= Component.extend();
	return componentClass;
}

function isMoveParent (value: ParentNode | null): value is MoveParent {
	return value !== null && typeof (value as Partial<MoveParent>).insertBefore === "function";
}

function wouldCreateRecursiveTree (parent: MoveParent, node: Node): boolean {
	return node === parent || node.contains(parent);
}

function moveNode (parent: MoveParent, node: Node, beforeNode: Node | null): boolean {
	if (wouldCreateRecursiveTree(parent, node)) {
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

function createStorageElement (documentRef: Document): HTMLElement {
	return documentRef.createElement("kitsui-storage");
}

function ensureActive (component: Component): void {
	if (component.disposed) {
		throw new Error("Disposed components cannot be modified.");
	}
}

function isComponent (value: unknown): value is Component {
	return value instanceof getComponentClass();
}

function clearPlacement (component: Component): void {
	placementControllers.get(component)?.();
}

function getPlacementLifecycleOwner (component: Component): Owner {
	const existingOwner = placementLifecycleOwners.get(component);

	if (existingOwner) {
		return existingOwner;
	}

	const owner = new PlacementLifecycleOwner();
	placementLifecycleOwners.set(component, owner);
	component.onCleanup(() => {
		placementLifecycleOwners.delete(component);
		owner.dispose();
	});
	return owner;
}

function setPlacementController (component: Component, cleanup: CleanupFunction): CleanupFunction {
	clearPlacement(component);

	let active = true;
	let releaseDisposeCleanup: CleanupFunction = noop;

	const trackedCleanup = () => {
		if (!active) {
			return;
		}

		active = false;

		if (placementControllers.get(component) === trackedCleanup) {
			placementControllers.delete(component);
		}

		releaseDisposeCleanup();
		placementOwners.delete(component);
		cleanup();
	};

	releaseDisposeCleanup = component.onCleanup(trackedCleanup);
	placementControllers.set(component, trackedCleanup);
	return trackedCleanup;
}

/**
 * A placement marker representing a location in the DOM that components can be moved to.
 * @property marker The comment node used as a DOM anchor for this placement.
 * @property owner The owner responsible for managing this placement.
 * @group Place
 */
class PlaceClass {
	readonly marker: Marker;

	constructor (
		readonly owner: Owner,
		marker: Marker,
	) {
		this.marker = marker;
	}

	/**
	 * Moves this placement marker to the end of the target component or DOM parent.
	 * @param target The target component or DOM parent.
	 * @returns This place for chaining.
	 */
	appendTo (target: PlacementContainer): this {
		this.marker.appendTo(target);
		return this;
	}

	/**
	 * Moves this placement marker to the start of the target component or DOM parent.
	 * @param target The target component or DOM parent.
	 * @returns This place for chaining.
	 */
	prependTo (target: PlacementContainer): this {
		this.marker.prependTo(target);
		return this;
	}

	/**
	 * Moves this placement marker before or after a reference node/component/place.
	 * @param where "before" or "after" the target.
	 * @param target The reference node, component, or place.
	 * @returns This place for chaining, or this unchanged if target does not exist.
	 * @throws If the target's parent is not a valid insert location.
	 */
	insertTo (where: InsertWhere, target: PlacementTarget): this {
		this.marker.insertTo(where, target);
		return this;
	}

	/**
	 * Removes this placement marker from the DOM.
	 */
	remove (): void {
		this.marker.remove();
	}
}

/** 
 * A placement marker that anchors component positioning in the DOM. 
 * @group Place
 */
export type Place = PlaceClass;

function resolvePlacementReferenceNode (target: PlacementTarget): Node | null {
	if (!target) {
		return null;
	}

	if (isComponent(target)) {
		return target.element;
	}

	if (target instanceof Marker) {
		return target.node;
	}

	if (target instanceof PlaceClass) {
		return target.marker.node;
	}

	return target;
}

function resolvePlacementContainer (target: PlacementContainer): MoveParent {
	if (isComponent(target)) {
		ensureActive(target);
		return target.element;
	}

	if (isMoveParent(target)) {
		return target;
	}

	throw new Error("Insert target was not found.");
}

function resolveNearestWrappedAncestor (node: Node | null): Component | null {
	let current: Node | null = node;

	while (current) {
		if (current instanceof HTMLElement) {
			const component = current.component;

			if (component) {
				return component;
			}
		}

		current = current.parentNode;
	}

	return null;
}

function resolveOwnPlacementOwner (component: Component | undefined): Owner | null {
	if (!component) {
		return null;
	}

	return component.getOwner() ?? placementOwners.get(component) ?? null;
}

function resolvePlacementOwner (target: PlacementTarget | PlacementParent, component?: Component): Owner | null {
	if (!target) {
		return null;
	}

	if (isComponent(target)) {
		return target === component
			? resolveOwnPlacementOwner(component)
			: resolveOwnPlacementOwner(target);
	}

	if (target instanceof Marker) {
		return target.getOwner() ?? resolveNearestWrappedAncestor(target.node) ?? null;
	}

	if (target instanceof PlaceClass) {
		return target.owner;
	}

	const owner = resolveNearestWrappedAncestor(target);

	if (owner === component) {
		return resolveOwnPlacementOwner(component);
	}

	return owner;
}

function resolvePlacementContainerOwner (target: PlacementContainer, component?: Component): Owner | null {
	if (isComponent(target)) {
		return target === component
			? resolveOwnPlacementOwner(component)
			: target;
	}

	return resolvePlacementOwner(target, component);
}

function toPlaceSource (state: State<boolean>, place: Place): State<Place | null> {
	const placeState = State<Place | null>(place.owner, state.value ? place : null);

	state.subscribe(place.marker, (value) => {
		placeState.set(value ? place : null);
	});

	return placeState;
}

function placeComponent (component: Component, parent: MoveParent, beforeNode: Node | null): void {
	component["onBeforeMove"]?.();
	clearPlacement(component);
	const moved = moveNode(parent, component.element, beforeNode);
	if (!moved) {
		return;
	}

	component["refreshOrphanCheck"]();
	component["dispatchMount"]();
}

function placeMarker (marker: Marker, parent: MoveParent, beforeNode: Node | null): void {
	const moved = moveNode(parent, marker.node, beforeNode);
	if (!moved) {
		return;
	}

	marker["refreshOrphanCheck"]();
	marker["dispatchMount"]();
}

/**
 * Registers Component placement extensions (appendTo, insertTo, place, etc.).
 * Safe to call multiple times; extension is registered only once.
 * Patches Component.prototype with placement control methods.
 */
export default function placeExtension (): void {
	if (patched) {
		return;
	}

	patched = true;
	registerComponentOwnerResolver((component) => {
		return placementOwners.get(component) ?? null;
	});

	const ComponentClass = getComponentClass();
	const MarkerClass = Marker.extend();
	type ComponentPrototype = Component & {
		insert (where: InsertWhere, ...nodes: Array<ComponentChild | Iterable<ComponentChild>>): Component;
	};
	const prototype = ComponentClass.prototype as ComponentPrototype;
	const markerPrototype = MarkerClass.prototype as Marker;

	markerPrototype.appendTo = function appendTo (target) {
		this.setOwner(resolvePlacementContainerOwner(target));
		const container = resolvePlacementContainer(target);
		placeMarker(this, container, null);
		return this;
	};

	markerPrototype.prependTo = function prependTo (target) {
		this.setOwner(resolvePlacementContainerOwner(target));
		const container = resolvePlacementContainer(target);
		placeMarker(this, container, container.firstChild);
		return this;
	};

	markerPrototype.insertTo = function insertTo (where, target) {
		this.setOwner(resolvePlacementOwner(target));

		const referenceNode = resolvePlacementReferenceNode(target);

		if (!referenceNode) {
			return this;
		}

		const parentNode = referenceNode.parentNode;

		if (!isMoveParent(parentNode)) {
			throw new Error("Insert target was not found.");
		}

		placeMarker(this, parentNode, where === "before" ? referenceNode : referenceNode.nextSibling);
		return this;
	};

	prototype.appendTo = function appendTo (target) {
		ensureActive(this);
		this.setOwner(resolvePlacementContainerOwner(target, this));
		const container = resolvePlacementContainer(target);
		placeComponent(this, container, null);
		return this;
	};

	prototype.appendToWhen = function appendToWhen (state, target) {
		const targetOwner = resolvePlacementContainerOwner(target, this) ?? getPlacementLifecycleOwner(this);

		return this.place(targetOwner, (Place) => {
			const place = Place().appendTo(target);
			return toPlaceSource(state, place);
		});
	};

	prototype.prependTo = function prependTo (target) {
		ensureActive(this);
		this.setOwner(resolvePlacementContainerOwner(target, this));
		const container = resolvePlacementContainer(target);
		placeComponent(this, container, container.firstChild);
		return this;
	};

	prototype.prependToWhen = function prependToWhen (state, target) {
		const targetOwner = resolvePlacementContainerOwner(target, this) ?? getPlacementLifecycleOwner(this);

		return this.place(targetOwner, (Place) => {
			const place = Place().prependTo(target);
			return toPlaceSource(state, place);
		});
	};

	prototype.insertTo = function insertTo (where, target) {
		ensureActive(this);
		this.setOwner(resolvePlacementOwner(target, this));

		const referenceNode = resolvePlacementReferenceNode(target);

		if (!referenceNode) {
			return this;
		}

		const parentNode = referenceNode.parentNode;

		if (!isMoveParent(parentNode)) {
			throw new Error("Insert target was not found.");
		}

		placeComponent(this, parentNode, where === "before" ? referenceNode : referenceNode.nextSibling);
		return this;
	};

	prototype.insertToWhen = function insertToWhen (state, where, target) {
		const targetOwner = resolvePlacementOwner(target, this) ?? getPlacementLifecycleOwner(this);

		return this.place(targetOwner, (Place) => {
			const place = Place().insertTo(where, target);
			return toPlaceSource(state, place);
		});
	};

	prototype.place = function place (owner, placer) {
		ensureActive(this);
		const placementOwner = owner === this ? getPlacementLifecycleOwner(this) : owner;
		this.setOwner(null);
		placementOwners.set(this, placementOwner);

		const documentRef = this.element.ownerDocument;
		const storage = createStorageElement(documentRef);
		const places = new Set<Place>();
		const Place = function Place (): Place {
			const place = new PlaceClass(placementOwner, Marker("kitsui:place").setOwner(placementOwner));
			places.add(place);
			return place;
		} as PlaceConstructor;

		Place.prototype = PlaceClass.prototype;

		const placeState = placer(Place);
		let releaseOwnerCleanup: CleanupFunction = noop;
		let releaseStateCleanup: CleanupFunction = noop;
		let blockedByRecursivePlacement = false;

		const cleanup = setPlacementController(this, () => {
			releaseOwnerCleanup();
			releaseStateCleanup();
			this["onBeforeMove"] = null;

			if (isMoveParent(storage)) {
				moveNode(storage, this.element, null);
			}

			for (const place of places) {
				place.remove();
			}

			storage.remove();
		});

		this["onBeforeMove"] = () => clearPlacement(this);

		const syncPlace = (place: Place | null) => {
			if (!place) {
				if (blockedByRecursivePlacement) {
					return;
				}

				moveNode(storage, this.element, null);
				return;
			}

			const parentNode = place.marker.node.parentNode;

			if (!isMoveParent(parentNode)) {
				console.error("Placement marker was removed. Treating placement as null.");
				moveNode(storage, this.element, null);
				return;
			}

			if (wouldCreateRecursiveTree(parentNode, this.element)) {
				console.error(recursiveTreeErrorMessage);
				blockedByRecursivePlacement = true;
				return;
			}

			blockedByRecursivePlacement = false;
			const moved = moveNode(parentNode, this.element, place.marker.node);
			if (!moved) {
				return;
			}

			this["refreshOrphanCheck"]();
			this["dispatchMount"]();
		};

		releaseStateCleanup = placeState.subscribe(this, (place) => {
			syncPlace(place);
		});
		syncPlace(placeState.value);
		releaseOwnerCleanup = placementOwner.onCleanup(cleanup);

		return this;
	};
}