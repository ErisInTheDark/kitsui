import { Owner, State, type CleanupFunction } from "../../state/State";
import { Class } from "../../utility/types";
import type { Falsy } from "../ClassManipulator";
import {
    Component,
    ComponentChild,
    registerComponentOwnerResolver,
    type InsertWhere,
} from "../Component";

/** A placement target: a DOM node, Component, Place marker, or null/falsy. */
export type PlacementTarget = Node | Component | Place | Falsy;

/** A DOM parent node that can host appended or prepended placements. */
export type PlacementParent = ParentNode & Node;

/**
 * A reactive source for placement that emits Place or null.
 * @property value The current place or null.
 * @property subscribe Subscribes to placement changes.
 */
export interface PlaceSource {
	readonly value: Place | null;
	subscribe (owner: Owner, listener: (value: Place | null) => void): CleanupFunction;
}

/** @group Place */
type PlaceConstructor = {
	(): Place;
	new(): Place;
	prototype: Place;
};

/** A function that receives a Place constructor and returns a PlaceSource for reactive placement. */
export type PlacerFunction = (Place: PlaceConstructor) => PlaceSource;

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
		 * The placer receives a Place constructor and returns a PlaceSource that controls where the component is inserted.
		 * @param owner The owner who manages the placement lifecycle.
		 * @param placer A function that produces a PlaceSource determining the component's location.
		 * @returns This component for chaining.
		 * @throws If this component is disposed.
		 */
		place (owner: Owner, placer: PlacerFunction): this;
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

let componentClass: Class<Component> | null = null;
let patched = false;

function getComponentClass (): Class<Component> {
	componentClass ??= Component.extend();
	return componentClass;
}

function isMoveParent (value: ParentNode | null): value is MoveParent {
	return value !== null && typeof (value as Partial<MoveParent>).insertBefore === "function";
}

function moveNode (parent: MoveParent, node: Node, beforeNode: Node | null): void {
	if (typeof parent.moveBefore === "function" && parent.isConnected && node.isConnected) {
		parent.moveBefore(node, beforeNode);
		return;
	}

	parent.insertBefore(node, beforeNode);
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
	readonly marker: Comment;

	constructor (
		readonly owner: Owner,
		marker: Comment,
	) {
		this.marker = marker;
	}

	/**
	 * Moves this placement marker to the end of the target component or DOM parent.
	 * @param target The target component or DOM parent.
	 * @returns This place for chaining.
	 */
	appendTo (target: PlacementContainer): this {
		moveNode(resolvePlacementContainer(target), this.marker, null);
		return this;
	}

	/**
	 * Moves this placement marker to the start of the target component or DOM parent.
	 * @param target The target component or DOM parent.
	 * @returns This place for chaining.
	 */
	prependTo (target: PlacementContainer): this {
		const container = resolvePlacementContainer(target);
		moveNode(container, this.marker, container.firstChild);
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
		const referenceNode = resolvePlacementReferenceNode(target);

		if (!referenceNode) {
			return this;
		}

		const parentNode = referenceNode.parentNode;

		if (!isMoveParent(parentNode)) {
			throw new Error("Insert target was not found.");
		}

		moveNode(parentNode, this.marker, where === "before" ? referenceNode : referenceNode.nextSibling);
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

	if (target instanceof PlaceClass) {
		return target.marker;
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

function toPlaceSource (state: State<boolean>, place: Place): PlaceSource {
	return {
		get value () {
			return state.value ? place : null;
		},
		subscribe (owner: Owner, listener: (value: Place | null) => void): CleanupFunction {
			return state.subscribe(owner, (value) => {
				listener(value ? place : null);
			});
		},
	};
}

function placeComponent (component: Component, parent: MoveParent, beforeNode: Node | null): void {
	component["onBeforeMove"]?.();
	clearPlacement(component);
	moveNode(parent, component.element, beforeNode);
	component["refreshOrphanCheck"]();
	component["dispatchMount"]();
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
	type ComponentPrototype = Component & {
		insert (where: InsertWhere, ...nodes: Array<ComponentChild | Iterable<ComponentChild>>): Component;
	};
	const prototype = ComponentClass.prototype as ComponentPrototype;

	prototype.appendTo = function appendTo (target) {
		ensureActive(this);
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
			const place = new PlaceClass(placementOwner, documentRef.createComment("kitsui:place"));
			places.add(place);
			return place;
		} as PlaceConstructor;

		Place.prototype = PlaceClass.prototype;

		const placeState = placer(Place);
		let releaseOwnerCleanup: CleanupFunction = noop;
		let releaseStateCleanup: CleanupFunction = noop;

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
				moveNode(storage, this.element, null);
				return;
			}

			const parentNode = place.marker.parentNode;

			if (!isMoveParent(parentNode)) {
				console.error("Placement marker was removed. Treating placement as null.");
				moveNode(storage, this.element, null);
				return;
			}

			moveNode(parentNode, this.element, place.marker);
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