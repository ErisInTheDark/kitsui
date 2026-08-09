import { Owner, State, type CleanupFunction } from "../../state/State";
import { cleanupAndRethrow, runCleanupSteps } from "../../utility/cleanup";
import { Class } from "../../utility/types";
import type { Falsy } from "../ClassManipulator";
import {
    Component,
    ComponentChild,
    type InsertWhere,
} from "../Component";
import {
	DOMTree,
	isDOMParent,
	recursiveTreeErrorMessage,
	type DOMParent,
	type DOMPlacement,
} from "../DOMTree";
import { Marker } from "../Marker";
import { placementAuthorityOwner, replacePlacementAuthority, type PlacementAuthority } from "../PlacementAuthority";

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
export type PlacerFunction = (Place: PlaceConstructor) => State.Readonly<Place | null>;

declare module "../Component" {
	interface ComponentExtensions {
		/**
		 * Physically appends this component to the end of the target component or DOM parent.
		 * If placement crosses a ShadowRoot boundary, the nearest wrapped host owns this component's lifetime.
		 * Ordinary light-DOM placement does not add an explicit owner.
		 * This authoring call synchronously replaces any prior Kitsui placement authority for this component.
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
		appendToWhen (state: State.Readonly<boolean>, target: PlacementContainer): this;

		/**
		 * Physically prepends this component to the start of the target component or DOM parent.
		 * If placement crosses a ShadowRoot boundary, the nearest wrapped host owns this component's lifetime.
		 * Ordinary light-DOM placement does not add an explicit owner.
		 * This authoring call synchronously replaces any prior Kitsui placement authority for this component.
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
		prependToWhen (state: State.Readonly<boolean>, target: PlacementContainer): this;

		/**
		 * Physically inserts this component before or after the target node, component, or place.
		 * If placement crosses a ShadowRoot boundary, the nearest wrapped host owns this component's lifetime.
		 * Ordinary light-DOM placement does not add an explicit owner.
		 * This authoring call synchronously replaces any prior Kitsui placement authority for this component.
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
		insertToWhen (state: State.Readonly<boolean>, where: InsertWhere, target: PlacementTarget): this;

		/**
		 * Manually controls component placement with a reactive placer function.
		 * The placer receives a Place constructor and returns State<Place | null> that controls where the component is inserted.
		 * @param owner The owner who manages the placement lifecycle.
		 * @param placer A function that produces State<Place | null> determining the component's location.
		 * @returns This component for chaining.
		 * @throws If this component is disposed or the placer does not return a State<Place | null>.
		 */
		place (owner: Owner, placer: PlacerFunction): this;
	}
}

declare module "../Marker" {
	interface MarkerExtensions {
		/**
		 * Appends this marker to the end of the target component or DOM parent.
		 * @param target The target component or DOM parent.
		 * @returns This marker for chaining.
		 */
		appendTo (target: PlacementContainer): this;
		/**
		 * Prepends this marker to the start of the target component or DOM parent.
		 * @param target The target component or DOM parent.
		 * @returns This marker for chaining.
		 */
		prependTo (target: PlacementContainer): this;
		/**
		 * Inserts this marker relative to another target.
		 * @param where Whether to insert before or after the target.
		 * @param target The component, marker, place, or DOM node to insert around.
		 * @returns This marker for chaining.
		 */
		insertTo (where: InsertWhere, target: PlacementTarget): this;
	}
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

type PlacementContainer = Component | PlacementParent;

const placementLifecycleOwners = new WeakMap<Component, Owner>();

let componentClass: Class<Component> | null = null;
let patched = false;

function getComponentClass (): Class<Component> {
	componentClass ??= Component.extend();
	return componentClass;
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

function isPlaceState (value: unknown): value is State.Readonly<Place | null> {
	return typeof value === "object"
		&& value !== null
		&& "value" in value
		&& typeof (value as Partial<State.Readonly<Place | null>>).subscribe === "function";
}

function getPlacementLifecycleOwner (component: Component): Owner {
	const existingOwner = placementLifecycleOwners.get(component);

	if (existingOwner) {
		return existingOwner;
	}

	const owner = Owner();
	placementLifecycleOwners.set(component, owner);
	component.onCleanup(() => {
		placementLifecycleOwners.delete(component);
		owner.dispose();
	});
	return owner;
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

function resolvePlacementContainer (target: PlacementContainer): DOMParent {
	if (isComponent(target)) {
		ensureActive(target);
		return target.element;
	}

	if (isDOMParent(target)) {
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

		const parent = DOMTree.parentOf(current);
		if (parent) {
			current = parent;
			continue;
		}

		const composedParent = DOMTree.composedParentOf(current);
		if (composedParent) {
			current = composedParent;
			continue;
		}

		return null;
	}

	return null;
}

function resolveOwnPlacementOwner (component: Component | undefined): Owner | null {
	if (!component) {
		return null;
	}

	return component.owner.get() ?? placementAuthorityOwner(component.element);
}

function resolvePlacementOwner (target: PlacementTarget | PlacementParent, component?: Component): Owner | null {
	if (!target) {
		return null;
	}

	if (isComponent(target)) {
		return target === component
			? resolveOwnPlacementOwner(component)
			: target;
	}

	if (target instanceof Marker) {
		return target;
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

function resolveConditionalPlacementOwner (target: PlacementTarget | PlacementParent, component: Component): Owner | null {
	if (isComponent(target)) {
		return target === component ? component.owner.get() : target;
	}
	if (target instanceof Marker || target instanceof PlaceClass || !target) {
		return resolvePlacementOwner(target, component);
	}

	const owner = resolveNearestWrappedAncestor(target);
	return owner === component ? component.owner.get() : owner;
}

function toPlaceSource (state: State.Readonly<boolean>, place: Place): State<Place | null> {
	const placeState = State<Place | null>(place.owner, state.value ? place : null);

	state.subscribe(place.marker, (value) => {
		placeState.set(value ? place : null);
	});

	return placeState;
}

function movePlacedComponent (
	component: Component,
	placement: DOMPlacement,
	onMoved: (component: Component) => void,
): void {
	DOMTree.place([component.element], placement, () => onMoved(component));
}

function reconcileComponentPlacementOwner (component: Component): void {
	component["refreshPlacementOwner"]();
}

function reconcileMarkerPlacementOwner (marker: Marker, owner: Owner | null): void {
	if (owner) marker.owner.add(owner, "placement");
	else marker.owner.remove("placement");
}

function placeComponent (component: Component, placement: DOMPlacement): void {
	if (!DOMTree.canPlace([component.element], placement)) return;
	replacePlacementAuthority(component.element);
	movePlacedComponent(component, placement, (movedComponent) => {
		reconcileComponentPlacementOwner(movedComponent);
		movedComponent["refreshOrphanCheck"]();
		movedComponent["dispatchMount"]();
	});
	reconcileComponentPlacementOwner(component);
	component["refreshOrphanCheck"]();
}

function placeMarker (marker: Marker, placement: DOMPlacement, resolveOwner: () => Owner | null): void {
	const authority = replacePlacementAuthority(marker.node, resolveOwner());
	DOMTree.place([marker.node], placement, () => {
		if (!authority.isCurrent()) return;
		reconcileMarkerPlacementOwner(marker, resolveOwner());
		marker["refreshOrphanCheck"]();
		marker["dispatchMount"]();
	});
	if (marker.disposed) return;
	reconcileMarkerPlacementOwner(marker, resolveOwner());
	marker["refreshOrphanCheck"]();
}

function controlPlacement (
	component: Component,
	placementOwner: Owner,
	placeState: State.Readonly<Place | null>,
	places: ReadonlySet<Place>,
	authority: PlacementAuthority,
): Component {
	const storage = createStorageElement(component.element.ownerDocument);
	let releaseOwnerCleanup: CleanupFunction = noop;
	let releaseStateCleanup: CleanupFunction = noop;
	let controllerActive = true;

	const cleanup = (preservePosition = false) => {
		if (!controllerActive) return;
		controllerActive = false;
		runCleanupSteps([
			releaseOwnerCleanup,
			releaseStateCleanup,
			() => {
				if (!preservePosition && isDOMParent(storage)) {
					movePlacedComponent(component, { type: "append", parent: storage }, () => { });
				}
			},
			...[...places].map(place => () => place.remove()),
			() => DOMTree.remove(storage),
			() => component["disposeIfUnmanagedAfterPlacementCleanup"](),
		]);
	};
	authority.setCleanup(cleanup);

	const syncPlace = (place: Place | null) => {
		if (!authority.isCurrent()) return;
		if (!place) {
			movePlacedComponent(component, { type: "append", parent: storage }, () => { });
			component["refreshOrphanCheck"]();
			return;
		}

		const parentNode = DOMTree.parentOf(place.marker.node);

		if (!isDOMParent(parentNode)) {
			console.error("Placement marker was removed. Treating placement as null.");
			movePlacedComponent(component, { type: "append", parent: storage }, () => { });
			component["refreshOrphanCheck"]();
			return;
		}

		if (DOMTree.contains(component.element, parentNode)) {
			console.error(recursiveTreeErrorMessage);
			return;
		}

		movePlacedComponent(component, { type: "before", reference: place.marker.node }, (movedComponent) => {
			movedComponent["dispatchMount"]();
		});
		reconcileComponentPlacementOwner(component);
		component["refreshOrphanCheck"]();
	};

	try {
		releaseOwnerCleanup = placementOwner.onCleanup(() => authority.release(false));
	} catch (error) {
		cleanupAndRethrow(error, () => runCleanupSteps([
			cleanup,
			() => {
				if (component.element.parentNode === storage) {
					DOMTree.remove(component.element);
				}
			},
		]));
	}
	if (!controllerActive) {
		return component;
	}

	try {
		releaseStateCleanup = placeState.subscribe(component, syncPlace);
		if (!controllerActive) {
			releaseStateCleanup();
			return component;
		}

			syncPlace(placeState.value);
	} catch (error) {
		cleanupAndRethrow(error, cleanup);
	}

	return component;
}

function controlConditionalPlacement (
	component: Component,
	state: State.Readonly<boolean>,
	placement: DOMPlacement,
	resolveOwner: () => Owner | null,
): Component {
	ensureActive(component);
	const fallbackOwner = getPlacementLifecycleOwner(component);
	const marker = Marker("kitsui:place").owner.add(fallbackOwner, "conditional-place");
	const authority = replacePlacementAuthority(component.element, marker);
	placeMarker(marker, placement, () => {
		const owner = resolveOwner();
		if (owner) {
			marker.owner.remove("conditional-place");
		}
		return owner;
	});
	const place = new PlaceClass(marker, marker);
	return controlPlacement(component, marker, toPlaceSource(state, place), new Set([place]), authority);
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
	const ComponentClass = getComponentClass();
	const MarkerClass = Marker.extend();
	type ComponentPrototype = Component & {
		insert (where: InsertWhere, ...nodes: Array<ComponentChild | Iterable<ComponentChild>>): Component;
	};
	const prototype = ComponentClass.prototype as ComponentPrototype;
	const markerPrototype = MarkerClass.prototype as Marker;

	markerPrototype.appendTo = function appendTo (target) {
		const container = resolvePlacementContainer(target);
		placeMarker(this, { type: "append", parent: container }, () => resolvePlacementContainerOwner(target));
		return this;
	};

	markerPrototype.prependTo = function prependTo (target) {
		const container = resolvePlacementContainer(target);
		placeMarker(this, { type: "prepend", parent: container }, () => resolvePlacementContainerOwner(target));
		return this;
	};

	markerPrototype.insertTo = function insertTo (where, target) {
		const referenceNode = resolvePlacementReferenceNode(target);

		if (!referenceNode) {
			return this;
		}

		const parentNode = DOMTree.parentOf(referenceNode);

		if (!isDOMParent(parentNode)) {
			throw new Error("Insert target was not found.");
		}

		placeMarker(this, { type: where, reference: referenceNode }, () => resolvePlacementOwner(target));
		return this;
	};

	prototype.appendTo = function appendTo (target) {
		ensureActive(this);
		const container = resolvePlacementContainer(target);
		placeComponent(this, { type: "append", parent: container });
		return this;
	};

	prototype.appendToWhen = function appendToWhen (state, target) {
		const container = resolvePlacementContainer(target);
		return controlConditionalPlacement(
			this,
			state,
			{ type: "append", parent: container },
			() => resolveConditionalPlacementOwner(target, this),
		);
	};

	prototype.prependTo = function prependTo (target) {
		ensureActive(this);
		const container = resolvePlacementContainer(target);
		placeComponent(this, { type: "prepend", parent: container });
		return this;
	};

	prototype.prependToWhen = function prependToWhen (state, target) {
		const container = resolvePlacementContainer(target);
		return controlConditionalPlacement(
			this,
			state,
			{ type: "prepend", parent: container },
			() => resolveConditionalPlacementOwner(target, this),
		);
	};

	prototype.insertTo = function insertTo (where, target) {
		ensureActive(this);

		const referenceNode = resolvePlacementReferenceNode(target);

		if (!referenceNode) {
			return this;
		}

		const parentNode = DOMTree.parentOf(referenceNode);

		if (!isDOMParent(parentNode)) {
			throw new Error("Insert target was not found.");
		}

		placeComponent(this, { type: where, reference: referenceNode });
		return this;
	};

	prototype.insertToWhen = function insertToWhen (state, where, target) {
		const referenceNode = resolvePlacementReferenceNode(target);
		if (!referenceNode) {
			const fallbackOwner = getPlacementLifecycleOwner(this);
			return this.place(fallbackOwner, (Place) => toPlaceSource(state, Place()));
		}

		const parentNode = DOMTree.parentOf(referenceNode);
		if (!isDOMParent(parentNode)) {
			throw new Error("Insert target was not found.");
		}

		return controlConditionalPlacement(
			this,
			state,
			{ type: where, reference: referenceNode },
			() => resolveConditionalPlacementOwner(target, this),
		);
	};

	prototype.place = function place (owner, placer) {
		ensureActive(this);
		const placementOwner = owner === this ? getPlacementLifecycleOwner(this) : owner;
		const authority = replacePlacementAuthority(this.element, placementOwner);

		const places = new Set<Place>();
		const Place = function Place (): Place {
			const marker = Marker("kitsui:place");
			try {
				marker.owner.add(placementOwner, "place");
			} catch (error) {
				cleanupAndRethrow(error, () => marker.remove());
			}

			const place = new PlaceClass(placementOwner, marker);
			places.add(place);
			return place;
		} as PlaceConstructor;

		Place.prototype = PlaceClass.prototype;
		const cleanupPlaces = () => runCleanupSteps([...places].map(place => () => place.remove()));

		let placeState: State.Readonly<Place | null>;
		try {
			const placerResult = placer(Place);
			if (!isPlaceState(placerResult)) {
				throw new TypeError("Component.place placer must return a State<Place | null>.");
			}

			placeState = placerResult;
			ensureActive(this);
		}
		catch (error) {
			cleanupAndRethrow(error, () => runCleanupSteps([cleanupPlaces, () => authority.release(true)]));
		}

		try {
			return controlPlacement(this, placementOwner, placeState, places, authority);
		} catch (error) {
			cleanupAndRethrow(error, cleanupPlaces);
		}
	};
}
