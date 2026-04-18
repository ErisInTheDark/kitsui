import { Owner, State, type CleanupFunction } from "../state/State";
import type { Component } from "./Component";
import { Style } from "./Style";

/**
 * Falsy values that are ignored when used as style inputs.
 * Used to allow convenient conditional style application.
 */
export type Falsy = false | 0 | 0n | "" | null | undefined;

/**
 * A single style, falsy value, or iterable collection of styles and falsy values.
 * Falsy values in iterables are filtered out during resolution.
 */
export type StyleSelection = Style.Class | Falsy | Iterable<Style.Class | Falsy>;

/**
 * A style input: a static style, falsy value, reactive style source, or any combination.
 */
export type StyleInput = Style.Class | Falsy | State<StyleSelection>;

interface DeterminerRecord {
	cleanup: CleanupFunction;
	token: symbol;
}

interface ReplaceDeterminerOptions {
	logStateReplacement?: boolean;
	onCleanup?: CleanupFunction;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

function isStyleInputState (value: StyleInput): value is State<StyleSelection> {
	return value instanceof State;
}

function isIterableStyleSelection (value: StyleSelection): value is Iterable<Style.Class | Falsy> {
	return value !== null
		&& value !== undefined
		&& typeof value === "object"
		&& Symbol.iterator in value
		&& !(value instanceof Style.Class);
}

function resolveStyleSelection (selection: StyleSelection): Map<string, Style.Class> {
	const styles = new Map<string, Style.Class>();

	if (!selection) {
		return styles;
	}

	if (selection instanceof Style.Class) {
		styles.set(selection.className, selection);
		return styles;
	}

	if (!isIterableStyleSelection(selection)) {
		throw new TypeError("Unsupported style selection.");
	}

	for (const item of selection) {
		if (!item) {
			continue;
		}

		if (!(item instanceof Style.Class)) {
			throw new TypeError("Unsupported style selection item.");
		}

		styles.set(item.className, item);
	}

	return styles;
}

/**
 * Manages CSS class application to an HTML element with support for static values,
 * reactive state, and multiple overlapping style determiners.
 *
 * Each class has a single "determiner" — the most recent operation (add/remove/bind)
 * takes precedence. When a determiner is replaced, it is properly cleaned up.
 *
 * @example
 * const component = Component("div");
 * const primaryStyle = Style.Class("primary", { color: "blue" });
 * const accentStyle = Style.Class("accent", { fontWeight: "bold" });
 *
 * // Static invocations
 * component.class.add(primaryStyle);
 * component.class.remove(accentStyle);
 *
 * // Reactive binding
 * const isActive = State(component, false);
 * component.class.bind(isActive, accentStyle);
 *
 * // Multiple styles or iterables
 * component.class.add([primaryStyle, accentStyle]);
 */
export class ClassManipulator {
	private readonly styleDeterminers = new Map<string, DeterminerRecord>();

	/**
	 * @param owner The owner managing this manipulator's lifecycle.
	 * @param element The HTML element to manipulate.
	 */
	constructor (
		private readonly owner: Component,
		private readonly element: HTMLElement,
	) { }

	/**
	 * Adds one or more styles to the element. Each style replaces any prior determiner
	 * for that class. Falsy values and values in iterables are ignored.
	 *
	 * @param classes Static or reactive styles to add. Accepts individual styles,
	 * falsy values for conditional logic, or reactive style sources (States).
	 * @returns The owning component for fluent chaining.
	 * @throws If the owner is disposed.
	 *
	 * @example
	 * // Static
	 * component.class.add(primaryStyle);
	 *
	 * // Conditional
	 * component.class.add(isPrimary ? primaryStyle : null);
	 *
	 * // Reactive
	 * const selection = State(component, null);
	 * component.class.add(selection);
	 */
	add (...classes: StyleInput[]): Component {
		this.ensureActive();

		for (const style of classes) {
			this.installAddInput(style);
		}

		return this.owner;
	}

	/**
	 * Removes one or more styles from the element. Each style replaces any prior determiner
	 * for that class. Falsy values and values in iterables are ignored.
	 *
	 * @param classes Static or reactive styles to remove. Accepts individual styles,
	 * falsy values for conditional logic, or reactive style sources (States).
	 * @returns The owning component for fluent chaining.
	 * @throws If the owner is disposed.
	 */
	remove (...classes: StyleInput[]): Component {
		this.ensureActive();

		for (const style of classes) {
			this.installRemoveInput(style);
		}

		return this.owner;
	}

	/**
	 * Binds one or more styles to a boolean State. The classes are added when the
	 * state value is true, and removed when false. Each style replaces any prior
	 * determiner for that class. Falsy values are ignored.
	 *
	 * @param state A boolean State controlling the visibility of the classes.
	 * @param classes Styles to bind to the state. Accepts individual styles, falsy
	 * values, or reactive style sources.
	 * @returns The owning component for fluent chaining.
	 * @throws If the owner is disposed.
	 *
	 * @example
	 * const isActive = State(component, false);
	 * component.class.bind(isActive, activeStyle);
	 * // activeStyle is present iff isActive.value is true
	 */
	bind (state: State<boolean>, ...classes: StyleInput[]): Component {
		this.ensureActive();

		for (const style of classes.filter((value): value is Exclude<StyleInput, Falsy> => Boolean(value))) {
			if (isStyleInputState(style)) {
				this.installStateDrivenStyles(style, () => state.value, {
					logStateReplacement: true,
					subscribePresenceChanges: (listener) => state.subscribe(this.owner, () => {
						listener();
					}),
				});
				continue;
			}

			this.replaceDeterminer(style, (applyIfCurrent) => {
				applyIfCurrent(state.value);

				const cleanup = state.subscribe(this.owner, (value) => {
					applyIfCurrent(value);
				});

				return () => {
					cleanup();
					this.element.classList.remove(style.className);
				};
			});
		}

		return this.owner;
	}

	/**
	 * Adds one or more styles under the ownership of another Owner. The styles are
	 * automatically removed when that owner is cleaned up. Falsy values and values
	 * in iterables are ignored.
	 *
	 * @param owner The external owner managing the lifetime of these class additions.
	 * @param classes Static or reactive styles to add.
	 * @returns The owning component for fluent chaining.
	 * @throws If this manipulator's owner is disposed.
	 *
	 * @example
	 * const externalOwner = ComponentOwner(); // some lifecycle manager
	 * component.class.addFrom(externalOwner, externalStyle);
	 * // externalStyle is removed when externalOwner is cleaned up
	 */
	addFrom (owner: Owner, ...classes: StyleInput[]): Component {
		this.ensureActive();

		for (const style of classes.filter((value): value is Exclude<StyleInput, Falsy> => Boolean(value))) {
			if (isStyleInputState(style)) {
				const cleanup = this.installStateDrivenStyles(style, () => true, {
					logStateReplacement: true,
				});
				owner.onCleanup(cleanup);
				continue;
			}

			this.replaceDeterminer(style, (applyIfCurrent) => {
				applyIfCurrent(true);

				const releaseOwner = owner.onCleanup(() => {
					applyIfCurrent(false);
				});

				return () => {
					releaseOwner();
					this.element.classList.remove(style.className);
				};
			});
		}

		return this.owner;
	}

	private ensureActive (): void {
		if (this.owner.disposed) {
			throw new Error("Disposed components cannot be modified.");
		}
	}

	private installAddInput (style: StyleInput): void {
		if (!style) {
			return;
		}

		if (isStyleInputState(style)) {
			this.installStateDrivenStyles(style, () => true, {
				logStateReplacement: true,
			});
			return;
		}

		this.replaceDeterminer(style, () => {
			this.element.classList.add(style.className);
			return noop;
		});
	}

	private installRemoveInput (style: StyleInput): void {
		if (!style) {
			return;
		}

		if (isStyleInputState(style)) {
			this.installStateDrivenStyles(style, () => false, {
				logStateReplacement: true,
			});
			return;
		}

		this.replaceDeterminer(style, () => {
			this.element.classList.remove(style.className);
			return noop;
		});
	}

	private installStateDrivenStyles (
		selectionState: State<StyleSelection>,
		getPresent: () => boolean,
		options: {
			logStateReplacement?: boolean;
			subscribePresenceChanges?: (listener: CleanupFunction) => CleanupFunction;
		} = {},
	): CleanupFunction {
		let active = true;
		const entries = new Map<string, {
			apply: CleanupFunction;
			cleanup: CleanupFunction;
		}>();

		const removeEntry = (className: string): void => {
			const entry = entries.get(className);

			if (!entry) {
				return;
			}

			entries.delete(className);
			entry.cleanup();
		};

		const syncSelection = (selection: StyleSelection): void => {
			if (!active) {
				return;
			}

			const nextStyles = resolveStyleSelection(selection);

			for (const className of [...entries.keys()]) {
				if (!nextStyles.has(className)) {
					removeEntry(className);
				}
			}

			for (const [className, style] of nextStyles) {
				const existingEntry = entries.get(className);

				if (existingEntry) {
					existingEntry.apply();
					continue;
				}

				const entry = {
					apply: noop,
					cleanup: noop,
				};

				const determinerCleanup = this.replaceDeterminer(style, (applyIfCurrent) => {
					entry.apply = () => {
						applyIfCurrent(getPresent());
					};

					entry.apply();

					return () => {
						this.element.classList.remove(style.className);
					};
				}, {
					logStateReplacement: options.logStateReplacement,
					onCleanup: () => {
						entries.delete(className);
					},
				});

				entry.cleanup = () => {
					entries.delete(className);
					determinerCleanup();
				};

				entries.set(className, entry);
			}
		};

		const selectionCleanup = selectionState.subscribe(this.owner, (selection) => {
			syncSelection(selection);
		});
		const presenceCleanup = options.subscribePresenceChanges?.(() => {
			for (const entry of entries.values()) {
				entry.apply();
			}
		}) ?? noop;

		syncSelection(selectionState.value);

		return () => {
			if (!active) {
				return;
			}

			active = false;
			presenceCleanup();
			selectionCleanup();

			for (const entry of [...entries.values()]) {
				entry.cleanup();
			}
		};
	}

	private replaceDeterminer (
		style: Style.Class,
		install: (applyIfCurrent: (present: boolean) => void) => CleanupFunction,
		options: ReplaceDeterminerOptions = {},
	): CleanupFunction {
		const token = Symbol(style.className);
		let releaseCurrentDeterminer: CleanupFunction = () => {
			// Replaced below after installation.
		};
		const isCurrent = () => this.styleDeterminers.get(style.className)?.token === token;
		const applyIfCurrent = (present: boolean) => {
			if (!isCurrent()) {
				return;
			}

			this.element.classList.toggle(style.className, present);
		};

		const cleanup = () => {
			if (!isCurrent()) {
				return;
			}

			this.styleDeterminers.delete(style.className);
			releaseCurrentDeterminer();
			options.onCleanup?.();
		};

		const previousDeterminer = this.styleDeterminers.get(style.className);

		if (previousDeterminer && options.logStateReplacement) {
			console.error(`State-driven style '${style.className}' replaced an existing style determiner.`);
		}

		this.styleDeterminers.set(style.className, { cleanup, token });
		previousDeterminer?.cleanup();
		releaseCurrentDeterminer = install(applyIfCurrent);

		return cleanup;
	}
}