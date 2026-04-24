import { State, type CleanupFunction } from "../state/State";
import type { Component } from "./Component";
import type { StyleValue } from "./Style";
import { expandVariableAccessShorthand, toCssPropertyName } from "./styleValue";

/** Inline style values accepted by {@link StyleManipulator}. */
export type StyleAttributeValue = StyleValue | null | undefined;

type ReactiveStyleAttributeValue = StyleValue | null;

/** A direct or subscribable inline style value. */
export type StyleAttributeValueInput = StyleAttributeValue | State<ReactiveStyleAttributeValue>;

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
export type StyleAttributeInput = StyleAttributeDefinition | State<StyleAttributeDefinition | null>;

interface DeterminerRecord {
	cleanup: CleanupFunction;
	token: symbol;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

function isStateSource<TValue> (value: unknown): value is State<TValue> {
	return value instanceof State;
}

function toStyleAttributeSource (value: StyleAttributeInput): State<StyleAttributeDefinition | null> {
	if (isStateSource<StyleAttributeDefinition | null>(value)) {
		return value;
	}

	return State.Readonly(value === undefined ? null : value);
}

function toStyleValueSource (value: StyleAttributeValueInput): State<ReactiveStyleAttributeValue> {
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
 * The manipulator owns the set of properties provided to the most recent `set` call.
 * Calling `set` again replaces earlier subscriptions and removes any properties that
 * were previously controlled by this manipulator.
 */
export class StyleManipulator<OWNER extends Component> {
	private determiner: DeterminerRecord | null = null;

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

		this.replaceDeterminer((applyIfCurrent) => {
			let releaseDefinition = noop;

			const applyDefinition = (definition: StyleAttributeDefinition | null): void => {
				releaseDefinition();
				releaseDefinition = this.installDefinition(definition, applyIfCurrent);
			};

			applyDefinition(definitionSource.value);

			const releaseSource = definitionSource.subscribe(this.owner, (nextValue) => {
				applyDefinition(nextValue);
			});

			return () => {
				releaseSource();
				releaseDefinition();
			};
		});

		return this.owner;
	}

	private installDefinition (
		definition: StyleAttributeDefinition | null | undefined,
		applyIfCurrent: (propertyName: string, value: StyleAttributeValue) => void,
	): CleanupFunction {
		if (!definition) {
			return noop;
		}

		const cleanups: CleanupFunction[] = [];
		const activeProperties = new Set<string>();

		for (const [propertyName, input] of Object.entries(definition)) {
			activeProperties.add(propertyName);
			const valueSource = toStyleValueSource(input);
			applyIfCurrent(propertyName, valueSource.value);

			cleanups.push(valueSource.subscribe(this.owner, (nextValue) => {
				applyIfCurrent(propertyName, nextValue);
			}));
		}

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}

			for (const propertyName of activeProperties) {
				this.writeProperty(propertyName, null);
			}
		};
	}

	private replaceDeterminer (createCleanup: (applyIfCurrent: (propertyName: string, value: StyleAttributeValue) => void) => CleanupFunction): void {
		this.determiner?.cleanup();

		const token = Symbol("style");
		let active = true;
		let cleanup = noop;

		const applyIfCurrent = (propertyName: string, value: StyleAttributeValue): void => {
			if (this.determiner?.token !== token) {
				return;
			}

			this.writeProperty(propertyName, value);
		};

		const trackedCleanup = () => {
			if (!active) {
				return;
			}

			active = false;

			if (this.determiner?.token === token) {
				this.determiner = null;
			}

			cleanup();
		};

		this.determiner = { cleanup: trackedCleanup, token };
		cleanup = createCleanup(applyIfCurrent);
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