import { State, type CleanupFunction } from "../state/State";
import type { Component } from "./Component";

interface DeterminerRecord {
	cleanup: CleanupFunction;
	token: symbol;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

/**
 * Manages a string-backed component property with support for direct values and reactive sources.
 * Extend this when a component property follows the same direct-or-reactive `set()` and visibility-aware `bind()` flow as text content.
 * Subclasses provide the property-specific source conversion and serialization rules.
 * @typeParam OWNER The owning component type returned for fluent chaining.
 * @typeParam INPUT The public input type accepted by `set()` and `bind()`.
 * @typeParam SELECTION The concrete values emitted by the reactive source before serialization.
 */
export abstract class GenericPropertyManipulator<OWNER extends Component, INPUT, SELECTION> {
	private determiner: DeterminerRecord | null = null;

	constructor (
		protected readonly owner: OWNER,
	) { }

	/**
	 * Sets the property from a direct value or subscribable source.
	 * @param value Direct or reactive property input.
	 * @returns The owning component for fluent chaining.
	 */
	set (value: INPUT): OWNER {
		this.ensureActive();
		const source = this.toSource(value);

		this.replaceDeterminer((applyIfCurrent) => {
			applyIfCurrent(source.value);

			return source.subscribe(this.owner, (nextValue) => {
				applyIfCurrent(nextValue);
			});
		});

		return this.owner;
	}

	/**
	 * Applies the property while visible and clears it while hidden.
	 * @param visible Boolean source controlling whether the property is shown.
	 * @param value Direct or reactive property input.
	 * @returns The owning component for fluent chaining.
	 */
	bind (visible: State<boolean>, value: INPUT): OWNER {
		this.ensureActive();
		const source = this.toSource(value);

		this.replaceDeterminer((applyIfCurrent) => {
			const sync = () => {
				applyIfCurrent(visible.value ? source.value : undefined);
			};

			const releaseVisibility = visible.subscribe(this.owner, sync);
			const releaseValue = source.subscribe(this.owner, sync);
			sync();

			return () => {
				releaseVisibility();
				releaseValue();
			};
		});

		return this.owner;
	}

	/**
	 * Converts a public input value into the reactive source used by the determiner lifecycle.
	 * @param value Direct or reactive property input.
	 * @returns A subscribable source that yields concrete property selections.
	 */
	protected abstract toSource (value: INPUT): State<SELECTION>;

	/**
	 * Writes the current selection to the underlying component property.
	 * Undefined is used internally to clear the property when a binding is hidden or replaced.
	 * @param value Concrete property selection or undefined to clear the property.
	 */
	protected abstract writeProperty (value: SELECTION | undefined): void;

	private replaceDeterminer (createCleanup: (applyIfCurrent: (value: SELECTION | undefined) => void) => CleanupFunction): CleanupFunction {
		this.determiner?.cleanup();

		const token = Symbol("property");
		let active = true;
		let cleanup = noop;

		const applyIfCurrent = (value: SELECTION | undefined): void => {
			if (this.determiner?.token !== token) {
				return;
			}

			this.writeProperty(value);
		};

		const trackedCleanup = () => {
			if (!active) {
				return;
			}

			active = false;

			if (this.determiner?.token === token) {
				this.determiner = null;
				this.writeProperty(undefined);
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