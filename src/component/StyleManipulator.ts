import { Owner, State, type CleanupFunction } from "../state/State";
import type { StyleValue } from "./Style";
import { staticPropertySource, type PropertySource } from "./GenericPropertyManipulator";
import { compileStyleValue, toCssPropertyName } from "./styleValue";
import { resolveStyleTokenReference } from "./StyleTokens";
import { reportUncaught } from "../utility/reportUncaught";

/** Inline style values accepted by {@link StyleManipulator}. */
export type StyleAttributeValue = StyleValue | null | undefined;

type ReactiveStyleAttributeValue = StyleValue | null;

/** A direct or subscribable inline style value. */
export type StyleAttributeValueInput = StyleAttributeValue | State.Readonly<ReactiveStyleAttributeValue>;

/**
 * Inline style declarations accepted by {@link StyleManipulator}.
 * Supports string-valued CSSStyleDeclaration properties except `animation`
 * and `animationName`, plus custom properties prefixed with `$`.
 * String values also support the same variable and calculation shorthand used by
 * `StyleDefinition`, such as `$gap`, `${gap: 12px}`, and `[100% - $gap]`.
 * Double square brackets escape a literal bracket group, such as `[[content]]`.
 *
 * Each property can be assigned directly or through a {@link State} source.
 */
export type StyleAttributeDefinition = (
	& {
		[KEY in keyof CSSStyleDeclaration as KEY extends string
			? CSSStyleDeclaration[KEY] extends string
				? KEY extends "animation" | "animationName" ? never : KEY
				: never
			: never]?: StyleAttributeValueInput;
	}
	& { [KEY in `$${string}`]?: StyleAttributeValueInput }
);

/** Inline style definitions accepted directly or through a subscribable source. */
export type StyleAttributeInput = StyleAttributeDefinition | State.Readonly<StyleAttributeDefinition | null>;

/** @hidden */
interface LayerPropertyRecord {
	cleanup: CleanupFunction;
	value: StyleAttributeValue;
}

/** @hidden */
interface LayerRecord {
	active: boolean;
	/** A static definition defines the same properties forever, so it permanently shadows earlier layers on them. */
	staticDefinition: boolean;
	properties: Map<string, LayerPropertyRecord>;
	releaseDefinition: CleanupFunction;
	releaseOwner: CleanupFunction;
	releaseSource: CleanupFunction;
}

/** Live reactive style definitions on one component past which the buildup is reported as a likely leak. */
const reactiveLayerLeakThreshold = 50;

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

function isStateSource<TValue> (value: unknown): value is State.Readonly<TValue> {
	return value instanceof State;
}

function toStyleAttributeSource (value: StyleAttributeInput): PropertySource<StyleAttributeDefinition | null> {
	if (isStateSource<StyleAttributeDefinition | null>(value)) {
		return value;
	}

	return staticPropertySource(value === undefined ? null : value);
}

function toStyleValueSource (value: StyleAttributeValueInput): PropertySource<ReactiveStyleAttributeValue> {
	if (isStateSource<ReactiveStyleAttributeValue>(value)) {
		return value;
	}

	return staticPropertySource(value === undefined ? null : value);
}

function serializeStyleValue (value: StyleAttributeValue): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	return compileStyleValue(value);
}

/**
 * Manages inline styles on an element from direct values and reactive sources.
 *
 * Each `set` call adds a style concern that composes with other concerns by property.
 * If multiple concerns control the same property, the latest `set` call wins while it
 * still defines that property. When a state-driven definition stops defining a
 * property, the previous active concern for that property is restored if one exists.
 */
export class StyleManipulator<OWNER extends Owner> {
	private readonly layers: LayerRecord[] = [];
	private reportedReactiveLayerBuildup = false;

	/**
	 * @param owner The owner managing this manipulator's lifecycle.
	 * @param element The element whose inline styles are controlled.
	 */
	constructor (
		private readonly owner: OWNER,
		private readonly element: HTMLElement,
	) { }

	/**
	 * Sets inline styles from a direct definition or a subscribable definition source.
	 * Each property can also be driven by its own subscribable value.
	 * Nullish property values remove that property from the inline style attribute.
	 * @param value Direct or reactive inline style definition.
	 * @returns The owner of this manipulator.
	 */
	set (value: StyleAttributeInput): OWNER {
		this.ensureActive();
		const definitionSource = toStyleAttributeSource(value);
		const layer: LayerRecord = {
			active: true,
			staticDefinition: !isStateSource(value),
			properties: new Map(),
			releaseDefinition: noop,
			releaseOwner: noop,
			releaseSource: noop,
		};

		this.layers.push(layer);

		const applyDefinition = (definition: StyleAttributeDefinition | null): void => {
			if (!layer.active) {
				return;
			}

			this.releaseLayerProperties(layer);
			layer.releaseDefinition = this.installDefinition(layer, definition);
		};

		applyDefinition(definitionSource.value);

		layer.releaseSource = definitionSource.subscribe(this.owner, (nextValue) => {
			applyDefinition(nextValue);
		});
		layer.releaseOwner = this.owner.onCleanup(() => {
			this.releaseLayer(layer);
		});

		if (layer.staticDefinition) {
			this.pruneShadowedLayers();
		}
		else {
			this.reportReactiveLayerBuildup();
		}

		return this.owner;
	}

	/**
	 * Reactive layers can't be pruned (their property sets can change), so they live until the owner disposes.
	 * Many on one component almost always means `style.set(state)` is being called repeatedly instead of once.
	 */
	private reportReactiveLayerBuildup (): void {
		if (this.reportedReactiveLayerBuildup) {
			return;
		}

		let reactiveLayers = 0;
		for (const layer of this.layers) {
			if (!layer.staticDefinition) reactiveLayers++;
		}

		if (reactiveLayers >= reactiveLayerLeakThreshold) {
			this.reportedReactiveLayerBuildup = true;
			reportUncaught(new Error(`A component holds ${reactiveLayers} reactive style definitions. Each style.set(state) call stays active until the component is removed, so call it once and update the State instead.`));
		}
	}

	/**
	 * Drops static layers that can never win a property again: every property they define is also defined by a later
	 * static layer. Reactive-definition layers are kept, since their property set can change. Without this, repeatedly
	 * restyling a component (e.g. once per Breakdown pass) would keep every past layer alive until disposal.
	 */
	private pruneShadowedLayers (): void {
		const shadowed = new Set<string>();
		for (let index = this.layers.length - 1; index >= 0; index--) {
			const layer = this.layers[index];
			if (!layer.staticDefinition) {
				continue;
			}

			let fullyShadowed = true;
			for (const propertyName of layer.properties.keys()) {
				if (!shadowed.has(propertyName)) {
					fullyShadowed = false;
					shadowed.add(propertyName);
				}
			}

			if (fullyShadowed) {
				this.layers.splice(index, 1);
				layer.releaseOwner();
				// Each property re-resolves to the later layer that shadows it, so the element ends up unchanged.
				this.releaseLayer(layer);
			}
		}
	}

	private installDefinition (
		layer: LayerRecord,
		definition: StyleAttributeDefinition | null | undefined,
	): CleanupFunction {
		if (!definition) {
			return noop;
		}

		const cleanups: CleanupFunction[] = [];

		for (const [propertyName, input] of Object.entries(definition)) {
			const valueSource = toStyleValueSource(input === propertyName ? resolveStyleTokenReference(definition, propertyName) ?? input : input);
			const property: LayerPropertyRecord = {
				cleanup: noop,
				value: valueSource.value,
			};

			layer.properties.set(propertyName, property);
			this.writeResolvedProperty(propertyName);

			property.cleanup = valueSource.subscribe(this.owner, (nextValue) => {
				if (!layer.active || layer.properties.get(propertyName) !== property) {
					return;
				}

				property.value = nextValue;
				this.writeResolvedProperty(propertyName);
			});
			cleanups.push(property.cleanup);
		}

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	}

	private releaseLayerProperties (layer: LayerRecord): void {
		layer.releaseDefinition();
		layer.releaseDefinition = noop;

		const propertyNames = new Set(layer.properties.keys());
		layer.properties.clear();

		for (const propertyName of propertyNames) {
			this.writeResolvedProperty(propertyName);
		}
	}

	private releaseLayer (layer: LayerRecord): void {
		if (!layer.active) {
			return;
		}

		layer.active = false;
		layer.releaseOwner = noop;
		layer.releaseSource();
		layer.releaseSource = noop;
		this.releaseLayerProperties(layer);
	}

	private writeResolvedProperty (propertyName: string): void {
		for (let index = this.layers.length - 1; index >= 0; index--) {
			const layer = this.layers[index];
			if (!layer.active) {
				continue;
			}

			const property = layer.properties.get(propertyName);
			if (!property) {
				continue;
			}

			this.writeProperty(propertyName, property.value);
			return;
		}

		this.writeProperty(propertyName, null);
	}

	private writeProperty (propertyName: string, value: StyleAttributeValue): void {
		const cssPropertyName = toCssPropertyName(propertyName);
		const serialized = serializeStyleValue(value);

		if (serialized === null) {
			this.element.style.removeProperty(cssPropertyName);
			return;
		}

		this.element.style.setProperty(cssPropertyName, serialized);
	}

	private ensureActive (): void {
		if (this.owner.disposed) {
			throw new Error("Modifications are not allowed after owner disposal.");
		}
	}
}
