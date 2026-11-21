import { attachLink, CleanupLink, linkCleanup, State, StateLink, type Owner } from "../state/State";
import type { Emitter } from "./Emitter";

/** The erased shape every event handler is stored as: an emitter's host or a DOM event first. Typed handlers are cast to this at the public boundary. */
export type StoredHandler = (subject: unknown, ...args: never[]) => unknown;

/** What a subscription is made with: a handler, or a state holding one, which `null` turns off. */
export type HandlerInput = StoredHandler | State.Readonly<StoredHandler | null | undefined>;

type EventWarning = Emitter.Warning;

/** How many subscriptions an event can have before the `possible-leak` warning, unless a `limit` says otherwise. */
const DEFAULT_LIMIT = 200;

const warned = new Set<string>();

function defaultWarn (warning: EventWarning): void {
	const key = `${warning.kind} ${warning.event}`;
	if (!warned.has(key)) {
		warned.add(key);
		console.warn(`kitsui event ${warning.kind}: ${warning.event}`, warning.host);
	}
}

let warnHandler: (warning: EventWarning) => void = defaultWarn;

/** Process-wide, like `traceOrphans`. `null` restores the default, which logs each kind of warning for each event once. */
export function setWarningHandler (handler: ((warning: EventWarning) => void) | null): void {
	warnHandler = handler ?? defaultWarn;
}

export function warn (warning: EventWarning): void {
	warnHandler(warning);
}

let nextCellIndex = 0;
const cells = new Map<string, EventCell>();

/**
 * One event name, interned for the whole process. Its index addresses per-class tables without a map lookup,
 * and its version invalidates every table for this event, and only this event, when class-level subscriptions change.
 */
export class EventCell {
	readonly index = nextCellIndex++;
	version = 0;

	constructor (readonly name: string) { }
}

export function cellFor (name: string): EventCell {
	let cell = cells.get(name);
	if (cell === undefined) {
		cell = new EventCell(name);
		cells.set(name, cell);
	}

	return cell;
}

export const NO_SUBSCRIPTIONS: readonly never[] = [];

function handlerOf (value: unknown): StoredHandler | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value === "function") {
		return value as StoredHandler;
	}

	throw new TypeError("Unsupported listener source value.");
}

/** Follows a handler state for one subscription. */
class HandlerSource extends StateLink<unknown> {
	constructor (private readonly subscription: Subscription) {
		super(true);
	}

	notify (value: unknown): void {
		this.subscription.handler = handlerOf(value);
	}
}

let nextSequence = 0;

/** One subscription, and its own owner cleanup link. Installing a plain handler allocates this record and no closures. */
export class Subscription extends CleanupLink {
	readonly sequence = nextSequence++;
	/** What fires now; `null` while a handler state holds none. */
	handler: StoredHandler | null;
	private consumed = false;
	private source: HandlerSource | null = null;

	constructor (
		private readonly list: SubscriptionList,
		readonly key: HandlerInput,
		readonly priority: number,
		public once: boolean,
	) {
		super();
		this.handler = typeof key === "function" ? key : null;
	}

	/**
	 * The handler to fire now, or `null` if this mustn't fire. A once subscription is consumed before its handler runs, so a reentrant
	 * emit, or an outer emit still walking its snapshot, cannot fire it again and a throwing handler cannot keep it.
	 * One whose handler state holds nothing is skipped, and a once one stays for when it holds a handler again.
	 */
	take (): StoredHandler | null {
		const handler = this.handler;
		if (handler === null || !this.once) {
			return handler;
		}

		if (this.consumed) {
			return null;
		}

		this.consumed = true;
		this.remove();
		return handler;
	}

	/** Links this to `owner`, and to its handler state, replacing earlier links. */
	bind (owner: Owner | null, once: boolean): void {
		this.once = once;
		this.releaseCleanup();
		this.source?.unsubscribe();
		this.source = null;
		if (owner !== null) {
			linkCleanup(owner, this);
		}

		const key = this.key;
		if (typeof key !== "function") {
			const state = key as State<unknown>;
			const source = this.source = new HandlerSource(this);
			// An owner gives an ownerless handler state its implicit owner, as any subscription would.
			if (owner === null) {
				attachLink(state, source);
			} else {
				state._link(owner, source);
			}
			this.handler = handlerOf(state.value);
		}
	}

	remove (): void {
		this.releaseCleanup();
		this.detach();
	}

	runCleanup (): void {
		this.detach();
	}

	private detach (): void {
		this.source?.unsubscribe();
		this.source = null;
		this.list.delete(this);
	}
}

/** The subscriptions of one event at one scope. Records stay in insertion order; dispatch reads the sorted lists built from them. */
export abstract class SubscriptionList {
	records: readonly Subscription[] = NO_SUBSCRIPTIONS;

	constructor (readonly cell: EventCell) { }

	protected abstract changed (): void;

	/** @returns the new record count, so the caller can apply its subscription limit. */
	add (owner: Owner | null, key: HandlerInput, priority: number, once: boolean): number {
		const existing = this.find(key, priority);
		if (existing !== undefined) {
			existing.bind(owner, once);
			return this.records.length;
		}

		const record = new Subscription(this, key, priority, once);
		this.records = [...this.records, record];
		record.bind(owner, once);
		this.changed();
		return this.records.length;
	}

	find (key: HandlerInput, priority: number): Subscription | undefined {
		for (const record of this.records) {
			if (record.key === key && record.priority === priority) {
				return record;
			}
		}

		return undefined;
	}

	delete (record: Subscription): void {
		const index = this.records.indexOf(record);
		if (index !== -1) {
			this.records = this.records.length === 1 ? NO_SUBSCRIPTIONS : this.records.filter(existing => existing !== record);
			this.changed();
		}
	}

	/** Releases every subscription, as their owners disposing would. */
	clear (): void {
		for (const record of this.records) {
			record.remove();
		}
	}
}

/**
 * Adds a subscription, warning once the list passes its limit.
 * @param limit The event's own limit, if it set one.
 */
export function subscribe (list: SubscriptionList, limit: number | undefined, owner: Owner | null, key: HandlerInput, priority = 0, once: boolean, host: unknown): void {
	if (typeof priority !== "number") {
		throw new TypeError(`Invalid event priority ${String(priority)}`);
	}

	const count = list.add(owner, key, priority, once);
	const max = limit ?? DEFAULT_LIMIT;
	if (count > max) {
		warn({ count, event: list.cell.name, host, kind: "possible-leak", max });
	}
}

/** Whether any of `subscriptions` would fire. */
export function anyHandler (subscriptions: readonly Subscription[]): boolean {
	for (let index = 0; index < subscriptions.length; index++) {
		if (subscriptions[index].handler !== null) {
			return true;
		}
	}

	return false;
}

class ClassSubscriptionList extends SubscriptionList {
	protected changed (): void {
		this.cell.version++;
	}
}

/** One scope's lists, one per event it has had subscriptions for. An array because that is few. */
export type InstanceLists = InstanceSubscriptionList[];

export function findInstanceList<LIST extends InstanceSubscriptionList> (lists: readonly LIST[] | null, cell: EventCell): LIST | undefined {
	if (lists !== null) {
		for (let index = 0; index < lists.length; index++) {
			if (lists[index].cell === cell) {
				return lists[index];
			}
		}
	}

	return undefined;
}

export class InstanceSubscriptionList extends SubscriptionList {
	merged: readonly Subscription[] | null = null;
	mergedVersion = -1;

	protected changed (): void {
		this.merged = null;
	}
}

function byPriorityDescending (left: Subscription, right: Subscription): number {
	return left.priority > right.priority ? -1 : left.priority < right.priority ? 1 : 0;
}

/** Stable merge of two priority-sorted lists; at equal priority every entry of `first` precedes `second`. */
function mergeByPriority (first: readonly Subscription[], second: readonly Subscription[]): readonly Subscription[] {
	if (first.length === 0 || second.length === 0) {
		return first.length === 0 ? second : first;
	}

	// Sized up front: thousands of instances each keep one of these, and an array grown by push over-allocates.
	const result = new Array<Subscription>(first.length + second.length);
	let firstIndex = 0;
	let secondIndex = 0;
	for (let index = 0; index < result.length; index++) {
		const takeFirst = secondIndex === second.length || (firstIndex < first.length && first[firstIndex].priority >= second[secondIndex].priority);
		result[index] = takeFirst ? first[firstIndex++] : second[secondIndex++];
	}

	return result;
}

function sortedRecords (list: SubscriptionList): readonly Subscription[] {
	return list.records.slice().sort(byPriorityDescending);
}

/** The resolved class-level handlers of one event for one concrete class. Immutable once built, so a running emit can hold it. */
interface ClassTable {
	readonly version: number;
	/** The class chain's subscriptions, by descending priority. */
	readonly handlers: readonly Subscription[];
}

const classInfos = new WeakMap<object, ClassInfo>();

/** Per-class subscriptions and the handler tables resolved from them, shared by every instance of the class. */
export class ClassInfo {
	/** This class first, then each superclass. Sibling classes never share an entry. */
	readonly chain: readonly ClassInfo[];
	/** Outside observers of every instance, through `Emitter.of(C).on`. */
	private readonly classLists = new Map<EventCell, ClassSubscriptionList>();
	/** The class's own behaviour, through `Emitter.of(C).self`. */
	private readonly selfLists = new Map<EventCell, ClassSubscriptionList>();
	private readonly tables: Array<ClassTable | undefined> = [];

	constructor (parent: ClassInfo | null) {
		this.chain = parent === null ? [this] : [this, ...parent.chain];
	}

	classList (cell: EventCell): SubscriptionList {
		return listIn(this.classLists, cell);
	}

	selfList (cell: EventCell): SubscriptionList {
		return listIn(this.selfLists, cell);
	}

	handlers (cell: EventCell): readonly Subscription[] {
		const table = this.tables[cell.index];
		if (table !== undefined && table.version === cell.version) {
			return table.handlers;
		}

		return this.buildTable(cell).handlers;
	}

	private buildTable (cell: EventCell): ClassTable {
		// Observers run concrete class first, behaviour parent first, as an override extends what it overrides.
		const observers: Subscription[] = [];
		const behaviour: Subscription[] = [];
		for (let index = 0; index < this.chain.length; index++) {
			observers.push(...this.chain[index].classLists.get(cell)?.records ?? NO_SUBSCRIPTIONS);
			behaviour.push(...this.chain[this.chain.length - 1 - index].selfLists.get(cell)?.records ?? NO_SUBSCRIPTIONS);
		}

		// Array.prototype.sort is stable, so equal priorities keep chain order, and registration order within a class.
		observers.sort(byPriorityDescending);
		behaviour.sort(byPriorityDescending);
		const table: ClassTable = { handlers: mergeByPriority(observers, behaviour), version: cell.version };
		this.tables[cell.index] = table;
		return table;
	}
}

function listIn (lists: Map<EventCell, ClassSubscriptionList>, cell: EventCell): SubscriptionList {
	let list = lists.get(cell);
	if (list === undefined) {
		list = new ClassSubscriptionList(cell);
		lists.set(cell, list);
	}

	return list;
}

/** The class info of scopes without a host class: it has no subscriptions, so only instance subscriptions fire. */
export const NO_CLASS = new ClassInfo(null);

export function classInfoFor (cls: object): ClassInfo {
	let info = classInfos.get(cls);
	if (info === undefined) {
		const parent = Object.getPrototypeOf(cls) as object | null;
		info = new ClassInfo(typeof parent === "function" && parent !== Function.prototype ? classInfoFor(parent) : null);
		classInfos.set(cls, info);
	}

	return info;
}

export function classInfoForHost (host: object | null): ClassInfo {
	const constructor = host?.constructor as object | undefined;
	return typeof constructor === "function" ? classInfoFor(constructor) : NO_CLASS;
}

/** The snapshot an emit walks: resolved class handlers merged with one scope's subscriptions. */
export function resolveHandlers (info: ClassInfo, lists: readonly InstanceSubscriptionList[] | null, cell: EventCell): readonly Subscription[] {
	return resolveListHandlers(info, findInstanceList(lists, cell), cell);
}

/** Like {@link resolveHandlers}, for a list already found. */
export function resolveListHandlers (info: ClassInfo, list: InstanceSubscriptionList | undefined, cell: EventCell): readonly Subscription[] {
	if (list === undefined) {
		return info.handlers(cell);
	}

	if (list.merged !== null && list.mergedVersion === cell.version) {
		return list.merged;
	}

	const merged = mergeByPriority(info.handlers(cell), sortedRecords(list));
	list.merged = merged;
	list.mergedVersion = cell.version;
	return merged;
}
