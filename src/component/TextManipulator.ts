import { State } from "../state/State";
import type { Component } from "./Component";
import { GenericPropertyManipulator } from "./GenericPropertyManipulator";

/** Serializable values accepted by the text manipulator. */
export type TextValue = string | number | bigint | boolean;

/** Text content selections, including nullish values that clear the text content. */
export type TextSelection = TextValue | null | undefined;

type ReactiveTextSelection = Exclude<TextSelection, undefined>;

/** A direct or subscribable text input. */
export type TextInput = TextSelection | State<ReactiveTextSelection>;

/**
 * Manages an element's text content with support for direct values and reactive sources.
 */
export class TextManipulator<OWNER extends Component> extends GenericPropertyManipulator<OWNER, TextInput, ReactiveTextSelection> {

	/**
	 * Sets the element's text content from a direct value or subscribable source.
	 * Nullish values clear the text content.
	 * @param value Direct or reactive text input.
	 * @returns The owning component for fluent chaining.
	 */
	override set (value: TextInput): OWNER {
		return super.set(value);
	}

	/**
	 * Shows or clears text content based on a boolean source.
	 * When visible, the latest text value is applied; when hidden, the text content is cleared.
	 * @param visible Boolean source controlling whether text is shown.
	 * @param value Direct or reactive text input.
	 * @returns The owning component for fluent chaining.
	 */
	override bind (visible: State<boolean>, value: TextInput): OWNER {
		return super.bind(visible, value);
	}

	protected override toSource (value: TextInput): State<ReactiveTextSelection> {
		if (value instanceof State) {
			return value;
		}

		return State.Readonly(value ?? null);
	}

	protected override writeProperty (value: ReactiveTextSelection | undefined): void {
		const text = String(value ?? "");
		
		this.owner.clear();
		this.owner.element.textContent = text;
	}
}