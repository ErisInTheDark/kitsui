import { Owner, State, type CleanupFunction } from "../../state/State";
import type { Falsy } from "../ClassManipulator";
import {
    Component,
    registerComponentMoveHandler,
    registerComponentOwnerResolver,
    type ExtendableComponentClass,
    type InsertWhere,
    type InsertableNode,
} from "../Component";

/** A placement target: a DOM node, Component, Place marker, or null/falsy. */
export type PlacementTarget = Node | Component | Place | Falsy;

/**
 * A reactive source for placement that emits Place or null.
 * @property value The current place or null.
 * @property subscribe Subscribes to placement changes.
 */
export interface PlaceSource {
	readonly value: Place | null;
	subscribe (owner: Owner, listener: (value: Place | null) => void): CleanupFunction;
}

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
		 * Appends this component to the end of the target component's element.
		 * Sets this component's owner to the target component.
		 * @param component The target component.
		 * @returns This component for chaining.
		 * @throws If this or target component is disposed.
		 */
		appendTo (component: Component): this;

		/**
		 * Conditionally appends this component based on a boolean state.
		 * Automatically removes the component when the state becomes false.
		 * @param state The boolean state that controls visibility.
		 * @param component The target component.
		 * @returns A cleanup function to stop listening to state changes.
		 */
		appendToWhen (state: State<boolean>, component: Component): CleanupFunction;

		/**
		 * Prepends this component to the start of the target component's element.
		 * Sets this component's owner to the target component.
		 * @param component The target component.
		 * @returns This component for chaining.
		 * @throws If this or target component is disposed.
		 */
		prependTo (component: Component): this;

		/**
		 * Conditionally prepends this component based on a boolean state.
		 * Automatically removes the component when the state becomes false.
		 * @param state The boolean state that controls visibility.
		 * @param component The target component.
		 * @returns A cleanup function to stop listening to state changes.
		 */
		prependToWhen (state: State<boolean>, component: Component): CleanupFunction;

		/**
		 * Inserts this component before or after a reference node, component, or place.
		 * Sets the owner based on the target's owner if applicable.
		 * @param where \"before\" or \"after\" the target.
		 * @param target The reference node, component, place, or null.
		 * @returns This component for chaining, or unchanged if target does not exist.
		 * @throws If this component is disposed or target's parent is not a valid insert location.
		 */
		insertTo (where: InsertWhere, target: PlacementTarget): this;

		/**
		 * Conditionally inserts this component based on a boolean state.
		 * Automatically removes the component when the state becomes false.
		 * @param state The boolean state that controls visibility.
		 * @param where \"before\" or \"after\" the target.
		 * @param target The reference node, component, place, or null.
		 * @returns A cleanup function to stop listening to state changes.
		 */
		insertToWhen (state: State<boolean>, where: InsertWhere, target: PlacementTarget): CleanupFunction;

		/**
		 * Manually controls component placement with a reactive placer function.
		 * The placer receives a Place constructor and returns a PlaceSource that controls where the component is inserted.
		 * @param owner The owner who manages the placement lifecycle.
		 * @param placer A function that produces a PlaceSource determining the component's location.
		 * @returns A cleanup function to stop placement and remove the component.
		 * @throws If this component is disposed.
		 */
		place (owner: Owner, placer: PlacerFunction): CleanupFunction;
	}
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

type MoveParent = ParentNode & Node & {
	insertBefore (node: Node, child: Node | null): Node;
	moveBefore?: (node: Node, child: Node | null) => unknown;
};

const placementControllers = new WeakMap<Component, CleanupFunction>();
const placementOwners = new WeakMap<Component, Owner>();

let componentClass: ExtendableComponentClass | null = null;
let patched = false;

function getComponentClass (): ExtendableComponentClass {
	componentClass ??= Component.extend();
	return componentClass;
}

function isMoveParent (value: ParentNode | null): value is MoveParent {
	return value !== null && typeof (value as Partial<MoveParent>).insertBefore === "function";
}

function moveNode (parent: MoveParent, node: Node, beforeNode: Node | null): void {
	if (typeof parent.moveBefore === "function") {
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

function resolveInsertableNode (component: Component, node: InsertableNode, owner: Owner | null): Node {
	if (!node) {
		throw new Error("Insert target was not found.");
	}

	if (isComponent(node)) {
		if (node === component) {
			return component.element;
		}

		ensureActive(node);
		clearPlacement(node);
		node.setOwner(owner);
		return node.element;
	}

	return node;
}

/**
 * A placement marker representing a location in the DOM that components can be moved to.
 * @property marker The comment node used as a DOM anchor for this placement.
 * @property owner The owner responsible for managing this placement.
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
	 * Moves this placement marker to the end of the target component's element.
	 * @param component The target component.
	 * @returns This place for chaining.
	 */
	appendTo (component: Component): this {
		ensureActive(component);
		moveNode(component.element, this.marker, null);
		return this;
	}

	/**
	 * Moves this placement marker to the start of the target component's element.
	 * @param component The target component.
	 * @returns This place for chaining.
	 */
	prependTo (component: Component): this {
		ensureActive(component);
		moveNode(component.element, this.marker, component.element.firstChild);
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

/** A placement marker that anchors component positioning in the DOM. */
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

function resolvePlacementOwner (target: PlacementTarget): Owner | null {
	if (!target) {
		return null;
	}

	if (isComponent(target)) {
		return target.getOwner() ?? placementOwners.get(target) ?? null;
	}

	if (target instanceof PlaceClass) {
		return target.owner;
	}

	return null;
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
	registerComponentMoveHandler((component) => {
		clearPlacement(component);
	});

	const ComponentClass = getComponentClass();
	type ComponentPrototype = Component & {
		insert (where: InsertWhere, ...nodes: Array<InsertableNode | Iterable<InsertableNode>>): Component;
	};
	const prototype = ComponentClass.prototype as ComponentPrototype;

	prototype.appendTo = function appendTo (component) {
		ensureActive(this);
		ensureActive(component);
		clearPlacement(this);
		this.setOwner(component);
		moveNode(component.element, this.element, null);
		return this;
	};

	prototype.appendToWhen = function appendToWhen (state, component) {
		ensureActive(component);
		return this.place(component, (Place) => {
			const place = Place().appendTo(component);
			return toPlaceSource(state, place);
		});
	};

	prototype.prependTo = function prependTo (component) {
		ensureActive(this);
		ensureActive(component);
		clearPlacement(this);
		this.setOwner(component);
		moveNode(component.element, this.element, component.element.firstChild);
		return this;
	};

	prototype.prependToWhen = function prependToWhen (state, component) {
		ensureActive(component);
		return this.place(component, (Place) => {
			const place = Place().prependTo(component);
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

		clearPlacement(this);
		this.setOwner(resolvePlacementOwner(target));
		moveNode(parentNode, this.element, where === "before" ? referenceNode : referenceNode.nextSibling);
		return this;
	};

	prototype.insertToWhen = function insertToWhen (state, where, target) {
		const targetOwner = resolvePlacementOwner(target) ?? this;

		return this.place(targetOwner, (Place) => {
			const place = Place().insertTo(where, target);
			return toPlaceSource(state, place);
		});
	};

	prototype.place = function place (owner, placer) {
		ensureActive(this);
		this.setOwner(null);
		placementOwners.set(this, owner);

		const documentRef = this.element.ownerDocument;
		const storage = createStorageElement(documentRef);
		const places = new Set<Place>();
		const Place = function Place (): Place {
			const place = new PlaceClass(owner, documentRef.createComment("kitsui:place"));
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

			if (isMoveParent(storage)) {
				moveNode(storage, this.element, null);
			}

			for (const place of places) {
				place.remove();
			}

			storage.remove();
		});

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
		};

		releaseStateCleanup = placeState.subscribe(this, (place) => {
			syncPlace(place);
		});
		syncPlace(placeState.value);
		releaseOwnerCleanup = owner.onCleanup(cleanup);

		return cleanup;
	};
}