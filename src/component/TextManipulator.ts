import { State, type CleanupFunction } from "../state/State";
import type { Component } from "./Component";

/** Serializable values accepted by the text manipulator. */
export type TextValue = string | number | bigint | boolean;

/** Text content selections, including nullish values that clear the text content. */
export type TextSelection = TextValue | null | undefined;

/** A direct or subscribable text input. */
export type TextInput = TextSelection | State<TextSelection>;

interface DeterminerRecord {
	cleanup: CleanupFunction;
	token: symbol;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

function toTextSource (value: TextInput): State<TextSelection> {
	if (value instanceof State) {
		return value;
	}

	return State.Readonly(value);
}

function serializeTextSelection (value: TextSelection): string {
	if (value === null || value === undefined) {
		return "";
	}

	return String(value);
}

/**
 * Manages an element's text content with support for direct values and reactive sources.
 */
export class TextManipulator<OWNER extends Component> {
	private determiner: DeterminerRecord | null = null;

	constructor (
		private readonly owner: OWNER,
		private readonly writeText: (value: string) => void,
	) { }

	/**
	 * Sets the element's text content from a direct value or subscribable source.
	 * Nullish values clear the text content.
	 * @param value Direct or reactive text input.
	 * @returns The owning component for fluent chaining.
	 */
	set (value: TextInput): OWNER {
		this.ensureActive();
		const textSource = toTextSource(value);

		this.replaceDeterminer((applyIfCurrent) => {
			applyIfCurrent(textSource.value);

			return textSource.subscribe(this.owner, (nextValue) => {
				applyIfCurrent(nextValue);
			});
		});

		return this.owner;
	}

	/**
	 * Shows or clears text content based on a boolean source.
	 * When visible, the latest text value is applied; when hidden, the text content is cleared.
	 * @param visible Boolean source controlling whether text is shown.
	 * @param value Direct or reactive text input.
	 * @returns The owning component for fluent chaining.
	 */
	bind (visible: State<boolean>, value: TextInput): OWNER {
		this.ensureActive();
		const textSource = toTextSource(value);

		this.replaceDeterminer((applyIfCurrent) => {
			const sync = () => {
				applyIfCurrent(visible.value ? textSource.value : null);
			};

			const releaseVisibility = visible.subscribe(this.owner, sync);
			const releaseText = textSource.subscribe(this.owner, sync);
			sync();

			return () => {
				releaseVisibility();
				releaseText();
			};
		});

		return this.owner;
	}

	private replaceDeterminer (createCleanup: (applyIfCurrent: (value: TextSelection) => void) => CleanupFunction): CleanupFunction {
		this.determiner?.cleanup();

		const token = Symbol("text");
		let active = true;
		let cleanup = noop;

		const applyIfCurrent = (value: TextSelection): void => {
			if (this.determiner?.token !== token) {
				return;
			}

			this.writeText(serializeTextSelection(value));
		};

		const trackedCleanup = () => {
			if (!active) {
				return;
			}

			active = false;

			if (this.determiner?.token === token) {
				this.determiner = null;
				this.writeText("");
			}

			cleanup();
		};

		this.determiner = { cleanup: trackedCleanup, token };
		cleanup = createCleanup(applyIfCurrent);
		return trackedCleanup;
	}

	private ensureActive (): void {
		if (this.owner.disposed) {
			throw new Error("Disposed components cannot be modified.");
		}
	}
}