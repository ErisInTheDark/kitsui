import { Owner, State, type CleanupFunction } from "../state/State";
import { Style } from "./Style";

export type Falsy = false | 0 | 0n | "" | null | undefined;
export type StyleSelection = Style | Falsy | Iterable<Style | Falsy>;
export interface StyleSelectionSource {
	readonly value: StyleSelection;
	subscribe (owner: Owner, listener: (value: StyleSelection) => void): CleanupFunction;
}

export type StyleInput = Style | Falsy | StyleSelectionSource;

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

function isStyleInputState (value: StyleInput): value is StyleSelectionSource {
	return value instanceof State;
}

function isIterableStyleSelection (value: StyleSelection): value is Iterable<Style | Falsy> {
	return value !== null
		&& value !== undefined
		&& typeof value === "object"
		&& Symbol.iterator in value
		&& !(value instanceof Style);
}

function resolveStyleSelection (selection: StyleSelection): Map<string, Style> {
	const styles = new Map<string, Style>();

	if (!selection) {
		return styles;
	}

	if (selection instanceof Style) {
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

		if (!(item instanceof Style)) {
			throw new TypeError("Unsupported style selection item.");
		}

		styles.set(item.className, item);
	}

	return styles;
}

export class ClassManipulator {
	private readonly styleDeterminers = new Map<string, DeterminerRecord>();

	constructor (
		private readonly owner: Owner,
		private readonly element: HTMLElement,
	) { }

	add (...classes: StyleInput[]): this {
		this.ensureActive();

		for (const style of classes) {
			this.installAddInput(style);
		}

		return this;
	}

	remove (...classes: StyleInput[]): this {
		this.ensureActive();

		for (const style of classes) {
			this.installRemoveInput(style);
		}

		return this;
	}

	bind (state: State<boolean>, ...classes: StyleInput[]): CleanupFunction {
		this.ensureActive();

		const cleanups = classes
			.filter((style): style is Exclude<StyleInput, Falsy> => Boolean(style))
			.map((style) => {
				if (isStyleInputState(style)) {
					return this.installStateDrivenStyles(style, () => state.value, {
						logStateReplacement: true,
						subscribePresenceChanges: (listener) => state.subscribe(this.owner, () => {
							listener();
						}),
					});
				}

				return this.replaceDeterminer(style, (applyIfCurrent) => {
					applyIfCurrent(state.value);

					const cleanup = state.subscribe(this.owner, (value) => {
						applyIfCurrent(value);
					});

					return () => {
						cleanup();
						this.element.classList.remove(style.className);
					};
				});
			});

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	}

	addFrom (owner: Owner, ...classes: StyleInput[]): CleanupFunction {
		this.ensureActive();

		const cleanups = classes
			.filter((style): style is Exclude<StyleInput, Falsy> => Boolean(style))
			.map((style) => {
				if (isStyleInputState(style)) {
					const cleanup = this.installStateDrivenStyles(style, () => true, {
						logStateReplacement: true,
					});
					const releaseOwner = owner.onCleanup(cleanup);

					return () => {
						releaseOwner();
						cleanup();
					};
				}

				return this.replaceDeterminer(style, (applyIfCurrent) => {
					applyIfCurrent(true);

					const releaseOwner = owner.onCleanup(() => {
						applyIfCurrent(false);
					});

					return () => {
						releaseOwner();
						this.element.classList.remove(style.className);
					};
				});
			});

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
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
		selectionState: StyleSelectionSource,
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
		style: Style,
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