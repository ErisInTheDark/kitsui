import { State, type CleanupFunction } from "../state/State";
import type { Component } from "./Component";
import type { StyleValue } from "./Style";
import { expandVariableAccessShorthand, toCssPropertyName } from "./styleValue";

/** Inline style values accepted by {@link StyleManipulator}. */
export type StyleAttributeValue = StyleValue | null | undefined;

type ReactiveStyleAttributeValue = StyleValue | null;

/** A direct or subscribable inline style value. */
export type StyleAttributeValueInput = StyleAttributeValue | State.Readonly<ReactiveStyleAttributeValue>;

/**
 * Inline style declarations accepted by {@link StyleManipulator}.
 * Supports string-valued CSSStyleDeclaration properties except `animation`
 * and `animationName`, plus custom properties prefixed with `$`.
 * String values also support the same variable shorthand used by `StyleDefinition`,
 * such as `$gap` and `${gap: 12px}`.
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
	properties: Map<string, LayerPropertyRecord>;
	releaseDefinition: CleanupFunction;
	releaseSource: CleanupFunction;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

function isStateSource<TValue> (value: unknown): value is State.Readonly<TValue> {
	return value instanceof State;
}

function toStyleAttributeSource (value: StyleAttributeInput): State.Readonly<StyleAttributeDefinition | null> {
	if (isStateSource<StyleAttributeDefinition | null>(value)) {
		return value;
	}

	return State.Readonly(value === undefined ? null : value);
}

function toStyleValueSource (value: StyleAttributeValueInput): State.Readonly<ReactiveStyleAttributeValue> {
	if (isStateSource<ReactiveStyleAttributeValue>(value)) {
		return value;
	}

	return State.Readonly(value === undefined ? null : value);
}

function serializeStyleValue (value: StyleAttributeValue): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	return expandVariableAccessShorthand(value);
}

/**
 * Manages inline styles on an element from direct values and reactive sources.
 *
 * Each `set` call adds a style concern that composes with other concerns by property.
 * If multiple concerns control the same property, the latest `set` call wins while it
 * still defines that property. When a state-driven definition stops defining a
 * property, the previous active concern for that property is restored if one exists.
 */
export class StyleManipulator<OWNER extends Component> {
	private readonly layers: LayerRecord[] = [];

	/**
	 * @param owner The component owner managing this manipulator's lifecycle.
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
	 * @returns The owning component for fluent chaining.
	 */
	set (value: StyleAttributeInput): OWNER {
		this.ensureActive();
		const definitionSource = toStyleAttributeSource(value);
		const layer: LayerRecord = {
			active: true,
			properties: new Map(),
			releaseDefinition: noop,
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
		this.owner.onCleanup(() => {
			this.releaseLayer(layer);
		});

		return this.owner;
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
			const valueSource = toStyleValueSource(input);
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
			throw new Error("Disposed components cannot be modified.");
		}
	}
}
