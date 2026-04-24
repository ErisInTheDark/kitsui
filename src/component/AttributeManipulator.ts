import { Owner, State, type CleanupFunction } from "../state/State";
import type { Falsy } from "./ClassManipulator";
import type { Component } from "./Component";

/**
 * Types accepted as attribute names: a single string, or any iterable of strings.
 * Falsy values are ignored.
 */
export type AttributeNameSelection = string | Falsy | Iterable<string | Falsy>;

type ReactiveAttributeNameSelection = Exclude<AttributeNameSelection, undefined>;


/**
 * Valid types for HTML attribute values. All are serializable to strings.
 */
export type AttributeValue = string | number | bigint | boolean;

/**
 * Attribute values including nullish options for attribute removal.
 */
export type AttributeValueSelection = AttributeValue | null | undefined;

type ReactiveAttributeValueSelection = Exclude<AttributeValueSelection, undefined>;


/**
 * Attribute name input: either a direct name selection or a subscribable source.
 */
export type AttributeNameInput = AttributeNameSelection | State<ReactiveAttributeNameSelection>;

/**
 * Attribute value input: either a direct value or a subscribable source.
 */
export type AttributeValueInput = AttributeValueSelection | State<ReactiveAttributeValueSelection>;

/**
 * Maps an attribute name to a value.
 */
export interface AttributeEntry {
	name: AttributeNameInput;
	value: AttributeValueInput;
}

interface AttributeDeterminerRecord {
	cleanup: CleanupFunction;
	token: symbol;
}

interface ReplaceAttributeOptions {
	logStateReplacement?: boolean;
	onCleanup?: CleanupFunction;
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

function isStateSource<TValue> (value: unknown): value is {
	readonly value: TValue;
	subscribe (owner: Owner, listener: (value: TValue) => void): CleanupFunction;
} {
	return value instanceof State;
}

function isAttributeEntry (value: unknown): value is AttributeEntry {
	return typeof value === "object"
		&& value !== null
		&& "name" in value
		&& "value" in value
		&& !("subscribe" in value);
}

function isIterableAttributeNames (value: AttributeNameSelection): value is Iterable<string | Falsy> {
	return value !== null
		&& value !== undefined
		&& typeof value === "object"
		&& Symbol.iterator in value
		&& typeof value !== "string";
}

function resolveAttributeNames (selection: AttributeNameSelection): Set<string> {
	const names = new Set<string>();

	if (!selection) {
		return names;
	}

	if (typeof selection === "string") {
		names.add(selection);
		return names;
	}

	if (!isIterableAttributeNames(selection)) {
		throw new TypeError("Unsupported attribute name selection.");
	}

	for (const entry of selection) {
		if (!entry) {
			continue;
		}

		if (typeof entry !== "string") {
			throw new TypeError("Unsupported attribute name selection item.");
		}

		names.add(entry);
	}

	return names;
}

function serializeAttributeValue (value: AttributeValueSelection): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	return String(value);
}

function toAttributeNameSource (value: AttributeNameInput): State<ReactiveAttributeNameSelection> {
	if (isStateSource<ReactiveAttributeNameSelection>(value)) {
		return value as unknown as State<ReactiveAttributeNameSelection>;
	}

	return State.Readonly(value === undefined ? null : value);
}

function toAttributeValueSource (value: AttributeValueInput): State<ReactiveAttributeValueSelection> {
	if (isStateSource<ReactiveAttributeValueSelection>(value)) {
		return value as unknown as State<ReactiveAttributeValueSelection>;
	}

	return State.Readonly(value === undefined ? null : value);
}

/**
 * Manages HTML element attributes on a DOM element, supporting both static and state-driven values.
 * Attributes can be added, set, removed, and bound to reactive state.
 * Values are kept in sync with their sources and invalid configurations are rejected.
 */
export class AttributeManipulator<OWNER extends Component> {
	private readonly attributeDeterminers = new Map<string, AttributeDeterminerRecord>();

	/**
	 * @param owner The component owner managing this manipulator's cleanup.
	 * @param element The DOM element whose attributes are managed.
	 */
	constructor (
		private readonly owner: OWNER,
		private readonly element: HTMLElement,
	) { }

	/**
	 * Adds valueless attributes to the element. Multiple names can be passed as separate arguments or as an iterable.
	 * @param attributes Attribute names to add.
	 * @returns The owning component for fluent chaining.
	 */
	add (...attributes: AttributeNameInput[]): OWNER {
		this.ensureActive();

		for (const attribute of attributes) {
			this.installAttributePresence(attribute, () => "", isStateSource(attribute));
		}

		return this.owner;
	}

	/**
	 * Sets attribute values using either a (name, value) pair or entries with name and value.
	 * Values or names can be subscribable sources that update automatically.
	 * @param name - Attribute name or source.
	 * @param value - Attribute value or source.
	 * @returns The owning component for fluent chaining.
	 */
	set (name: AttributeNameInput, value: AttributeValueInput): OWNER;
	/**
	 * Sets attribute values using entries with name and value pairs.
	 * Values or names can be subscribable sources that update automatically.
	 * @param entries - Objects with `name` and `value` properties.
	 * @returns The owning component for fluent chaining.
	 */
	set (...entries: AttributeEntry[]): OWNER;
	set (...argumentsList: [AttributeNameInput, AttributeValueInput] | AttributeEntry[]): OWNER {
		this.ensureActive();

		const entries = this.resolveSetEntries(argumentsList);

		for (const entry of entries) {
			this.installAttributeValue(entry);
		}

		return this.owner;
	}

	/**
	 * Removes attributes from the element. Multiple names can be passed as separate arguments or as an iterable.
	 * @param attributes Attribute names to remove.
	 * @returns The owning component for fluent chaining.
	 */
	remove (...attributes: AttributeNameInput[]): OWNER {
		this.ensureActive();

		for (const attribute of attributes) {
			this.installAttributePresence(attribute, () => null, isStateSource(attribute));
		}

		return this.owner;
	}

	/**
	 * Binds valueless attributes to a boolean state, adding/removing them based on state value.
	 * @param state A subscribable boolean state.
	 * @param attributes Attribute names to bind.
	 * @returns The owning component for fluent chaining.
	 */
	bind (state: State<boolean>, ...attributes: AttributeNameInput[]): OWNER;
	/**
	 * Binds attribute entries to a boolean state, setting/removing them based on state value.
	 * When state is true, attributes are set; when false, they are removed.
	 * @param state A subscribable boolean state.
	 * @param entries Objects with `name` and `value` properties.
	 * @returns The owning component for fluent chaining.
	 */
	bind (state: State<boolean>, ...entries: AttributeEntry[]): OWNER;
	bind (
		state: State<boolean>,
		...inputs: Array<AttributeNameInput | AttributeEntry>
	): OWNER {
		this.ensureActive();

		if (inputs.some(isAttributeEntry)) {
			for (const entry of inputs as AttributeEntry[]) {
				this.installAttributeValue(entry, {
					getPresence: () => state.value,
					logDynamicReplacement: true,
					subscribePresenceChanges: (listener) => state.subscribe(this.owner, () => {
						listener();
					}),
				});
			}

			return this.owner;
		}

		for (const attribute of inputs as AttributeNameInput[]) {
			this.installAttributePresence(attribute, () => state.value ? "" : null, true, {
				subscribePresenceChanges: (listener) => state.subscribe(this.owner, () => {
					listener();
				}),
			});
		}

		return this.owner;
	}

	private ensureActive (): void {
		if (this.owner.disposed) {
			throw new Error("Disposed components cannot be modified.");
		}
	}

	private resolveSetEntries (argumentsList: [AttributeNameInput, AttributeValueInput] | AttributeEntry[]): AttributeEntry[] {
		if (argumentsList.length === 2 && !isAttributeEntry(argumentsList[0])) {
			const pair = argumentsList as [AttributeNameInput, AttributeValueInput];

			return [{
				name: pair[0],
				value: pair[1],
			}];
		}

		return argumentsList as AttributeEntry[];
	}

	private installAttributePresence (
		attribute: AttributeNameInput,
		getValue: () => string | null,
		logDynamicReplacement: boolean,
		options: {
			subscribePresenceChanges?: (listener: CleanupFunction) => CleanupFunction;
		} = {},
	): CleanupFunction {
		const nameSource = toAttributeNameSource(attribute);

		return this.installAttributeSelection(nameSource, getValue, {
			logDynamicReplacement,
			subscribeValueChanges: options.subscribePresenceChanges,
		});
	}

	private installAttributeValue (
		entry: AttributeEntry,
		options: {
			getPresence?: () => boolean;
			logDynamicReplacement?: boolean;
			subscribePresenceChanges?: (listener: CleanupFunction) => CleanupFunction;
		} = {},
	): CleanupFunction {
		const nameSource = toAttributeNameSource(entry.name);
		const valueSource = toAttributeValueSource(entry.value);
		const getPresence = options.getPresence ?? (() => true);
		const logDynamicReplacement = options.logDynamicReplacement
			|| isStateSource(entry.name)
			|| isStateSource(entry.value);

		return this.installAttributeSelection(nameSource, () => {
			if (!getPresence()) {
				return null;
			}

			return serializeAttributeValue(valueSource.value);
		}, {
			logDynamicReplacement,
			subscribeValueChanges: (listener) => {
				const cleanups = [
					valueSource.subscribe(this.owner, () => {
						listener();
					}),
					options.subscribePresenceChanges?.(listener) ?? noop,
				];

				return () => {
					for (const cleanup of cleanups) {
						cleanup();
					}
				};
			},
		});
	}

	private installAttributeSelection (
		nameSource: State<AttributeNameSelection>,
		getValue: () => string | null,
		options: {
			logDynamicReplacement?: boolean;
			subscribeValueChanges?: (listener: CleanupFunction) => CleanupFunction;
		} = {},
	): CleanupFunction {
		let active = true;
		let releaseOwner: CleanupFunction = noop;
		const entries = new Map<string, {
			apply: CleanupFunction;
			cleanup: CleanupFunction;
		}>();

		const removeEntry = (attributeName: string) => {
			const entry = entries.get(attributeName);

			if (!entry) {
				return;
			}

			entries.delete(attributeName);
			entry.cleanup();
		};

		const syncSelection = (selection: AttributeNameSelection) => {
			if (!active) {
				return;
			}

			const nextNames = resolveAttributeNames(selection);

			for (const attributeName of [...entries.keys()]) {
				if (!nextNames.has(attributeName)) {
					removeEntry(attributeName);
				}
			}

			for (const attributeName of nextNames) {
				const existingEntry = entries.get(attributeName);

				if (existingEntry) {
					existingEntry.apply();
					continue;
				}

				const entry = {
					apply: noop,
					cleanup: noop,
				};

				const determinerCleanup = this.replaceAttributeDeterminer(attributeName, (applyIfCurrent) => {
					entry.apply = () => {
						applyIfCurrent(getValue());
					};

					entry.apply();

					return () => {
						this.element.removeAttribute(attributeName);
					};
				}, {
					logStateReplacement: options.logDynamicReplacement,
					onCleanup: () => {
						entries.delete(attributeName);
					},
				});

				entry.cleanup = () => {
					entries.delete(attributeName);
					determinerCleanup();
				};

				entries.set(attributeName, entry);
			}
		};

		const selectionCleanup = nameSource.subscribe(this.owner, (selection) => {
			syncSelection(selection);
		});
		const valueCleanup = options.subscribeValueChanges?.(() => {
			for (const entry of entries.values()) {
				entry.apply();
			}
		}) ?? noop;

		syncSelection(nameSource.value);
		releaseOwner = this.owner.onCleanup(() => {
			cleanup();
		});

		const cleanup = () => {
			if (!active) {
				return;
			}

			active = false;
			releaseOwner();
			valueCleanup();
			selectionCleanup();

			for (const entry of [...entries.values()]) {
				entry.cleanup();
			}
		};

		return cleanup;
	}

	private replaceAttributeDeterminer (
		attributeName: string,
		install: (applyIfCurrent: (value: string | null) => void) => CleanupFunction,
		options: ReplaceAttributeOptions = {},
	): CleanupFunction {
		const token = Symbol(attributeName);
		let releaseCurrentDeterminer: CleanupFunction = noop;
		const isCurrent = () => this.attributeDeterminers.get(attributeName)?.token === token;
		const applyIfCurrent = (value: string | null) => {
			if (!isCurrent()) {
				return;
			}

			if (value === null) {
				this.element.removeAttribute(attributeName);
				return;
			}

			this.element.setAttribute(attributeName, value);
		};

		const cleanup = () => {
			if (!isCurrent()) {
				return;
			}

			this.attributeDeterminers.delete(attributeName);
			releaseCurrentDeterminer();
			options.onCleanup?.();
		};

		const previousDeterminer = this.attributeDeterminers.get(attributeName);

		if (previousDeterminer && options.logStateReplacement) {
			console.error(`State-driven attribute '${attributeName}' replaced an existing attribute determiner.`);
		}

		this.attributeDeterminers.set(attributeName, { cleanup, token });
		previousDeterminer?.cleanup();
		releaseCurrentDeterminer = install(applyIfCurrent);

		return cleanup;
	}
}