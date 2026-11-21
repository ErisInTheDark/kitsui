import { assertIdentifier, buildModel, type LayoutDerived } from "./field-accessors";
import { attachLink, CleanupLink, isOwner, linkCleanup, State, StateLink, type Owner } from "./State";

const BITS_PER_WORD = 22;
const ALL_DIRTY = (1 << BITS_PER_WORD) - 1;
const GENERATION_STEP = 1 << BITS_PER_WORD;
const GENERATION_MASK = 0xff << BITS_PER_WORD;

type FieldHost = Record<string, unknown>;
type AnyState = State.Readonly<unknown>;
type InputMapper = (host: unknown, value: unknown, input?: unknown) => unknown;
type InputSelector = (host: unknown) => AnyState | readonly AnyState[];
/** A watched input, or a `$x` of the host itself, which the host's own setters already dirty through a mask edge. */
type Bound = InputRecord | AnyState;
type Binding = Bound | readonly Bound[];

/** Pairs of dirty word slot and the mask an input change ORs into it: the derived and its own-class consumers. Refilled by rebuild. */
type DirtyTarget = (string | number)[];

/** Which host and key a `$x` state reads through. Registered by LazyState. */
const hostFields = new WeakMap<object, { readonly host: object; readonly key: string }>();

function stateOf (bound: Bound): AnyState {
	return bound instanceof InputRecord ? bound.hub.state : bound;
}

function boundValue (bound: Bound): unknown {
	return stateOf(bound).value;
}

function sameStates (binding: Binding, selected: AnyState | readonly AnyState[]): boolean {
	if (!Array.isArray(selected)) {
		return !Array.isArray(binding) && stateOf(binding as Bound) === selected;
	}
	if (!Array.isArray(binding) || binding.length !== selected.length) {
		return false;
	}
	for (let index = 0; index < selected.length; index++) {
		if (stateOf(binding[index]) !== selected[index]) {
			return false;
		}
	}
	return true;
}

/** One composed mapper, and the input states it watches for each host that has computed with it. */
class ComposeEntry {
	readonly bindings = new WeakMap<object, Binding>();
	// Weak both ways: an input state owned by a host, like its own inventory, must not be pinned by the mod that read it.
	private readonly hubs = new WeakMap<AnyState, InputHub>();
	private hubRefs: WeakRef<InputHub>[] = [];
	private compactAt = 64;

	/** Keys of the host itself that inputs have selected as `$x`. Discovered on bind; rebuild turns them into mask edges. */
	readonly ownReads = new Set<string>();

	constructor (readonly key: string, readonly mapper: InputMapper, readonly input: InputSelector | null, private readonly fields: ClassFields) { }

	/** Selects again on every compute, so an input reached through a replaced object follows it; unchanged states keep their links. */
	value (host: FieldHost): unknown {
		const selected = this.input!(host);
		const previous = this.bindings.get(host);
		const binding = previous !== undefined && sameStates(previous, selected) ? previous : this.bind(host, selected, previous);
		if (!Array.isArray(binding)) {
			return boundValue(binding as Bound);
		}

		const values = new Array<unknown>(binding.length);
		for (let index = 0; index < binding.length; index++) {
			values[index] = boundValue(binding[index]);
		}
		return values;
	}

	private bind (host: FieldHost, selected: AnyState | readonly AnyState[], previous: Binding | undefined): Binding {
		if (!isOwner(host)) {
			throw new TypeError(`compose.${this.key}: a host with inputs must be an Owner.`);
		}

		const target = dirtyTarget(host, this.key);
		const before = this.ownReads.size;
		const old: readonly Bound[] = previous === undefined ? [] : Array.isArray(previous) ? previous : [previous as Bound];
		const kept = new Set<Bound>();
		const pick = (state: AnyState): Bound => {
			const reused = old.find(bound => stateOf(bound) === state);
			if (reused !== undefined) {
				kept.add(reused);
				return reused;
			}
			return this.bound(host, state, target);
		};
		const binding: Binding = Array.isArray(selected) ? (selected as readonly AnyState[]).map(pick) : pick(selected as AnyState);
		for (const bound of old) {
			if (!kept.has(bound) && bound instanceof InputRecord) {
				bound.detach();
			}
		}
		this.bindings.set(host, binding);
		if (this.ownReads.size !== before) {
			rebuild(this.fields);
		}
		return binding;
	}

	private bound (host: FieldHost & Owner, state: AnyState, target: DirtyTarget): Bound {
		if (!isOwner(state) || !("value" in state)) {
			throw new TypeError(`compose.${this.key}: an input must select states.`);
		}

		const field = hostFields.get(state);
		if (field?.host === host) {
			this.ownReads.add(field.key);
			return state;
		}
		return this.record(host, state, target);
	}

	private record (host: FieldHost & Owner, state: AnyState, target: DirtyTarget): InputRecord {
		let hub = this.hubs.get(state);
		if (!hub || hub.source === null) {
			this.hubs.set(state, hub = new InputHub(state));
			this.hubRefs.push(new WeakRef(hub));
			if (this.hubRefs.length >= this.compactAt) {
				this.hubRefs = this.hubRefs.filter(ref => (ref.deref()?.source ?? null) !== null);
				this.compactAt = Math.max(64, this.hubRefs.length * 2);
			}
		}

		const record = new InputRecord(this, hub, host, target);
		linkCleanup(host, new HostRelease(record));
		return record;
	}

	dispose (): void {
		for (const ref of this.hubRefs) {
			ref.deref()?.unsubscribe();
		}
		this.hubRefs = [];
	}
}

/**
 * The one link an entry keeps on each input state, however many hosts read it. Hosts are held weakly, so ones nobody releases,
 * like previews, aren't pinned by long-lived inputs; their records leave on the next change or are swept as new ones arrive.
 */
class InputHub extends StateLink<unknown> {
	head: InputRecord | null = null;
	sweep: InputRecord | null = null;
	private running = false;

	constructor (readonly state: AnyState) {
		super(true);
		if (!state.disposed) {
			attachLink(state as State<unknown>, this);
		}
	}

	add (record: InputRecord): void {
		const next = this.head;
		record.next = next;
		if (next !== null) {
			next.previous = record;
		}
		this.head = record;

		// Two checks per add keeps dead records below the live count without a finalizer.
		for (let index = 0; index < 2; index++) {
			const candidate: InputRecord | null = this.sweep ?? this.head;
			if (candidate === null) {
				break;
			}
			this.sweep = candidate.next;
			if (candidate.host.deref() === undefined) {
				candidate.remove();
			}
		}
	}

	notify (): void {
		// A host whose consumers read back into this input would otherwise loop.
		if (this.running) {
			return;
		}

		this.running = true;
		try {
			let record = this.head;
			while (record !== null) {
				const next = record.next;
				const host = record.host.deref();
				if (host === undefined) {
					record.remove();
				} else {
					changed(host, record.target, record.entry.key);
				}
				record = next;
			}
		} finally {
			this.running = false;
		}
	}

	invalidate (): void {
		this.notify();
	}

	get lazy (): boolean {
		return true;
	}
}

/**
 * Makes a `state` field that reads through another state act as written whenever that state changes:
 * the host's consumers of the field dirty and its `$x` hears, as from the field's own setter.
 */
class FieldForward extends StateLink<unknown> {
	private running = false;

	constructor (private readonly host: FieldHost, private readonly key: string, private readonly target: DirtyTarget) {
		super(true);
	}

	notify (): void {
		this.invalidate();
	}

	get lazy (): boolean {
		return true;
	}

	invalidate (): void {
		// A forward selecting a state that leads back to this field would otherwise loop.
		if (this.running) {
			return;
		}

		this.running = true;
		try {
			changed(this.host, this.target, this.key);
		} finally {
			this.running = false;
		}
	}
}

class InputRecord {
	previous: InputRecord | null = null;
	next: InputRecord | null = null;
	attached = true;
	readonly host: WeakRef<FieldHost>;

	constructor (readonly entry: ComposeEntry, readonly hub: InputHub, host: FieldHost, readonly target: DirtyTarget) {
		this.host = new WeakRef(host);
		hub.add(this);
	}

	/** Leaves the hub, and the hub leaves its state once nobody is left. Its HostRelease stays on the host as a no-op until release. */
	detach (): void {
		this.remove();
		if (this.hub.head === null) {
			this.hub.unsubscribe();
		}
	}

	remove (): void {
		if (!this.attached) {
			return;
		}

		this.attached = false;
		const hub = this.hub;
		if (hub.sweep === this) {
			hub.sweep = this.next;
		}
		if (this.previous !== null) {
			this.previous.next = this.next;
		} else {
			hub.head = this.next;
		}
		if (this.next !== null) {
			this.next.previous = this.previous;
		}
		this.previous = this.next = null;
	}
}

/** Registered on the host, which holds it. Nothing points from the record back here, so the record's hold on the host stays weak. */
class HostRelease extends CleanupLink {
	constructor (private readonly record: InputRecord) {
		super();
	}

	runCleanup (): void {
		const record = this.record;
		if (!record.attached || record.hub.source === null) {
			return;
		}

		record.detach();
		const host = record.host.deref();
		// A released host can be reused: it must rebind and recompute, not keep a value nothing watches anymore.
		if (host !== undefined) {
			record.entry.bindings.delete(host);
			changed(host, record.target, record.entry.key);
		}
	}
}

/**
 * Something a host's field reads changed: dirty its consumers and tell its `$x` and their lazy readers. Always propagates, like a setter:
 * bits already dirty don't mean readers heard, since a volatile's bits stay set after it computes.
 */
function changed (host: FieldHost, target: DirtyTarget, key: string): void {
	dirty(host, target);
	propagate(host, key);
}

/** ORs the target into the host's words. A word of an old generation is all dirty already. */
function dirty (host: FieldHost, target: DirtyTarget): void {
	const generation = runtime.generation;
	for (let index = 0; index < target.length; index += 2) {
		const slot = target[index] as string;
		const word = host[slot] as number;
		if (((word ^ generation) & GENERATION_MASK) === 0) {
			host[slot] = word | (target[index + 1] as number);
		}
	}
}

/** The part of a LazyState propagation needs: its immediate links, where lazy readers like input hubs sit. */
interface LazyField {
	readonly immediateLinks: readonly StateLink<unknown>[] | null;
}

/**
 * A field of a host changed, or a derived of it was dirtied: every `$x` of it and of its own-class consumers hears now. Lazy readers,
 * like input hubs dirtying their hosts, are invalidated at once, which carries on through those hosts' `$x`, so lazy values stay exact
 * mid-tick across hosts. Cycles end at those readers, which ignore an invalidation arriving while they pass one on. Eager listeners are left to the next flush.
 */
function propagate (host: FieldHost, key: string): void {
	const lazy = host[LAZY_SLOT] as ReadonlyMap<string, LazyField> | null;
	if (lazy === null) {
		return;
	}

	const keys = (host[AFFECTED_SLOT] as ReadonlyMap<string, readonly string[]>).get(key) ?? [key];
	for (let index = 0; index < keys.length; index++) {
		const state = lazy.get(keys[index]);
		if (state === undefined) {
			continue;
		}

		runtime.touch(state);
		const links = state.immediateLinks;
		if (links !== null) {
			for (let at = 0; at < links.length; at++) {
				links[at].invalidate();
			}
		}
	}
}

/** Prototype default `null`; the first `$x` of a host makes it a non-enumerable own Map, so copies and serializer walks skip it. */
const LAZY_SLOT = "_$lazy";
/** Prototype map of each key to itself and the derived it dirties, for propagation. */
const AFFECTED_SLOT = "_$affected";
/** Prototype set of derived that can change with no write reaching them (pushless guards, reruns), so their `$x` is polled every flush. */
const POLLED_SLOT = "_$polled";

function dirtyTarget (host: FieldHost, key: string): DirtyTarget {
	const fields = fieldsOf(host.constructor)!;
	let target = fields.dirtyTargets.get(key);
	if (!target) {
		fields.dirtyTargets.set(key, target = []);
		fillDirtyTarget(fields, key, target);
	}
	return target;
}

function fillDirtyTarget (fields: ClassFields, key: string, target: DirtyTarget): void {
	target.length = 0;
	targetWords(fields.lineage(), fields.reach.get(key), null, target);
}

/** Appends the dirty word slots and masks covering `keys` in every class of the lineage but `except`. */
function targetWords (lineage: readonly ClassFields[], keys: ReadonlySet<string> | undefined, except: ClassFields | null, target: DirtyTarget): DirtyTarget {
	if (keys === undefined) {
		return target;
	}

	for (const each of lineage) {
		if (each === except) {
			continue;
		}
		maskWords(each, keys).forEach((mask, word) => {
			if (mask !== 0) {
				target.push(`_$${each.table.name}$d${word}`, mask);
			}
		});
	}
	return target;
}

/** What a model class registers: the keys it declares, the reads that become dirty bits, and its checks by path. */
export interface Table {
	/** Unique within an inheritance chain; prefixes the class's slots. */
	readonly name: string;
	readonly state: readonly string[];
	/** Each derived with the state and derived of the lineage it reads unguarded. Order gives each its dirty bit. */
	readonly derived: Readonly<Record<string, readonly string[]>>;
	/**
	 * Each derived that compares other reads on every access, with the path each reads as written, `?.` as `.`:
	 * `"this.type"`, `"this.description.attack"`. Paths rooted at a state or derived of the lineage are pushed.
	 */
	readonly guards: Readonly<Record<string, readonly string[]>>;
	/** Derived whose body runs on every read. */
	readonly volatile: readonly string[];
}

const EMPTY_TABLE: Table = { derived: {}, guards: {}, name: "", state: [], volatile: [] };

/**
 * One guard, by the path it reads. Rooted at a state or derived of the lineage, it is pushed like any read: a write reaching the root
 * dirties the reader. A path into a state's object isn't: the state holds a live object, which changes with no write here. A path into
 * a derived is, since derived values are snapshots that change only when the derived does.
 */
interface Guard {
	/** The `this.<root>` the path starts at, or null for any other root, like `super.x` or a module variable. */
	readonly root: string | null;
	readonly deep: boolean;
}

function parseGuard (path: string): Guard {
	const segments = path.split(".");
	return segments[0] === "this" && segments.length > 1
		? { root: segments[1], deep: segments.length > 2 }
		: { root: null, deep: false };
}

/** What one class declared, and what mods have composed at that class. Everything on its prototype is rebuilt from these. */
class ClassFields {
	readonly children: ClassFields[] = [];
	readonly entries = new Map<string, ComposeEntry[]>();
	readonly dirtyTargets = new Map<string, DirtyTarget>();
	readonly derivedKeys: readonly string[];
	readonly guards: ReadonlyMap<string, readonly Guard[]>;
	/** For each key of the lineage, the derived a change to it dirties, itself included when derived. Refilled by rebuild. */
	reach = new Map<string, ReadonlySet<string>>();
	compose: Record<string, unknown> | undefined;

	constructor (readonly cls: Function, readonly parent: ClassFields | null, readonly table: Table) {
		this.derivedKeys = Object.keys(table.derived);
		this.guards = new Map(Object.entries(table.guards).map(([key, paths]) => [key, paths.map(parseGuard)]));
		parent?.children.push(this);
	}

	get wordCount (): number {
		return Math.ceil(this.derivedKeys.length / BITS_PER_WORD);
	}

	lineage (): ClassFields[] {
		return this.parent ? [...this.parent.lineage(), this] : [this];
	}
}

const classFields = new WeakMap<Function, ClassFields>();

function fieldsOf (cls: Function): ClassFields | undefined {
	const known = classFields.get(cls);
	if (known) {
		return known;
	}

	const parent = typeof cls === "function" ? parentFields(cls) : undefined;
	if (!parent) {
		return undefined;
	}

	// A plain subclass declares nothing, but `Sub.compose.x` must stay scoped to Sub.
	const fields = new ClassFields(cls, parent, EMPTY_TABLE);
	classFields.set(cls, fields);
	rebuild(fields);
	return fields;
}

function parentFields (cls: Function): ClassFields | undefined {
	const parent: unknown = Object.getPrototypeOf(cls);
	return typeof parent === "function" && parent !== Function.prototype ? fieldsOf(parent) : undefined;
}

function rebuild (fields: ClassFields): void {
	const lineage = fields.lineage();
	const prototype = fields.cls.prototype as FieldHost;

	// The latest declaration of a key wins, as it does for the accessor every class's code reads through `this`.
	const declarers = new Map<string, ClassFields>();
	for (const each of lineage) {
		for (const key of [...each.table.state, ...each.derivedKeys]) {
			declarers.set(key, each);
		}
	}
	const isState = (key: string) => declarers.get(key)?.table.state.includes(key) ?? false;

	// Reads without a guard, which only the dirty bit keeps exact, and every read a write reaches, guard roots included.
	const plainReads = new Map<string, Set<string>>();
	const pushedReads = new Map<string, Set<string>>();
	const addRead = (graph: Map<string, Set<string>>, key: string, read: string) => {
		let reads = graph.get(key);
		if (!reads) graph.set(key, reads = new Set());
		reads.add(read);
	};
	const volatile = new Set<string>();
	const pushless = new Set<string>();
	for (const each of lineage) {
		for (const key of each.table.volatile) {
			volatile.add(key);
		}
		for (const key of each.derivedKeys) {
			for (const read of each.table.derived[key]) {
				if (!declarers.has(read)) {
					volatile.add(key);
					continue;
				}
				addRead(plainReads, key, read);
				addRead(pushedReads, key, read);
			}
			for (const guard of each.guards.get(key) ?? []) {
				if (guard.root === null || !declarers.has(guard.root) || guard.deep && isState(guard.root)) {
					pushless.add(key);
				} else {
					addRead(pushedReads, key, guard.root);
				}
			}
		}
	}

	const chains = new Map<string, ComposeEntry[]>();
	const composedReads: [string, string][] = [];
	for (const each of lineage) {
		for (const [key, entries] of each.entries) {
			const chain = chains.get(key) ?? [];
			chains.set(key, chain);
			for (const entry of entries) {
				chain.push(entry);
				for (const read of entry.ownReads) {
					composedReads.push([key, read]);
				}
			}
		}
	}

	for (const key of volatile) {
		pushless.add(key);
	}
	closeOver(pushless, pushedReads);
	// A mapper reads its `$x` inputs with no guard, so one that can change unpushed must rerun.
	for (const [key, read] of composedReads) {
		if (pushless.has(read) || !declarers.has(read)) {
			volatile.add(key);
		} else {
			addRead(plainReads, key, read);
			addRead(pushedReads, key, read);
		}
	}
	for (const key of volatile) {
		pushless.add(key);
	}
	closeOver(volatile, plainReads);
	closeOver(pushless, pushedReads);

	const affected = new Map<string, readonly string[]>();
	const reach = new Map<string, ReadonlySet<string>>();
	for (const key of declarers.keys()) {
		const consumers = consumersOf(key, pushedReads, isState(key) ? new Set() : new Set([key]));
		reach.set(key, consumers);
		affected.set(key, isState(key) ? [key, ...consumers] : [...consumers]);
	}
	fields.reach = reach;

	for (const each of lineage) {
		for (const key of [...each.table.state, ...each.derivedKeys]) {
			maskWords(each, reach.get(key)!).forEach((mask, word) => {
				prototype[`_$${each.table.name}$m${word}_${key}`] = mask;
			});
		}
		for (const key of each.table.state) {
			// The setter dirties its own class's words itself; this reaches the rest of the lineage.
			const others = targetWords(lineage, reach.get(key), each, []);
			prototype[`_$${each.table.name}$t_${key}`] = others.length === 0 ? null : others;
		}
		maskWords(each, volatile).forEach((mask, word) => {
			prototype[`_$${each.table.name}$x${word}`] = mask;
		});
		for (const key of each.derivedKeys) {
			// With an override calling `super.x`, the mappers must run once, on the outermost value.
			prototype[`_$${each.table.name}$c_${key}`] = declarers.get(key) === each ? chains.get(key) ?? null : null;
		}
	}

	prototype[AFFECTED_SLOT] = affected;
	prototype[POLLED_SLOT] = pushless;

	for (const [key, target] of fields.dirtyTargets) {
		fillDirtyTarget(fields, key, target);
	}

	for (const child of fields.children) {
		rebuild(child);
	}
}

/** Adds every consumer of the keys already in `keys`. */
function closeOver (keys: Set<string>, graph: ReadonlyMap<string, ReadonlySet<string>>): void {
	for (const key of [...keys]) {
		consumersOf(key, graph, keys);
	}
}

function consumersOf (key: string, graph: ReadonlyMap<string, ReadonlySet<string>>, into = new Set<string>()): Set<string> {
	for (const [derived, reads] of graph) {
		if (reads.has(key) && !into.has(derived)) {
			into.add(derived);
			consumersOf(derived, graph, into);
		}
	}
	return into;
}

function maskWords (fields: ClassFields, keys: ReadonlySet<string>): number[] {
	const words = new Array<number>(fields.wordCount).fill(0);
	fields.derivedKeys.forEach((key, index) => {
		if (keys.has(key)) {
			words[Math.floor(index / BITS_PER_WORD)] |= 1 << (index % BITS_PER_WORD);
		}
	});
	return words;
}

/** Set by every compute. Without one since the last bump, no instance can hold a clean bit, so a burst of composes costs one generation. */
let generationUsed = false;

function bumpGeneration (): void {
	if (!generationUsed) {
		return;
	}

	generationUsed = false;
	const next = (runtime.generation + GENERATION_STEP) & GENERATION_MASK;
	runtime.generation = next === 0 ? GENERATION_STEP : next;
	runtime.touchAll();
}

function composeOf (cls: Function): Record<string, unknown> {
	const fields = fieldsOf(cls)!;
	if (fields.compose) {
		return fields.compose;
	}

	const compose: Record<string, unknown> = {};
	for (const each of fields.lineage()) {
		for (const key of each.derivedKeys) {
			compose[key] = (owner: Owner, inputOrMapper: InputSelector | InputMapper, mapper?: InputMapper) => addComposed(fields, owner, mapper === undefined
				? new ComposeEntry(key, inputOrMapper as InputMapper, null, fields)
				: new ComposeEntry(key, mapper, inputOrMapper as InputSelector, fields));
		}
	}
	return fields.compose = Object.freeze(compose);
}

function addComposed (fields: ClassFields, owner: Owner, entry: ComposeEntry): void {
	if (!isOwner(owner)) {
		throw new TypeError(`compose.${entry.key}: owner must be an Owner.`);
	}

	let entries = fields.entries.get(entry.key);
	if (!entries) {
		fields.entries.set(entry.key, entries = []);
	}
	entries.push(entry);
	composeChanged(fields);

	owner.onCleanup(() => {
		const current = fields.entries.get(entry.key)!;
		current.splice(current.indexOf(entry), 1);
		if (current.length === 0) {
			fields.entries.delete(entry.key);
		}
		entry.dispose();
		composeChanged(fields);
	});
}

const locks = new Set<State.Readonly<boolean>>();
/** Classes whose composes changed while locked. Rebuilt on unlock, or by the next compute, which must see them. */
let pendingRebuild: Set<ClassFields> | null = null;

function isLocked (): boolean {
	for (const lock of locks) {
		if (lock.value && !lock.disposed) {
			return true;
		}
	}
	return false;
}

function composeChanged (fields: ClassFields): void {
	if (isLocked()) {
		(pendingRebuild ??= new Set()).add(fields);
	} else {
		rebuild(fields);
	}
	// Even while locked: cached values must take the slow path, whose enter applies the pending rebuild.
	bumpGeneration();
}

function rebuildPending (): void {
	const classes = pendingRebuild;
	if (classes === null) {
		return;
	}

	pendingRebuild = null;
	for (const fields of classes) {
		// A rebuild reaches every subclass, so one under another pending class is already covered.
		if (!fields.lineage().some(each => each !== fields && classes.has(each))) {
			rebuild(fields);
		}
	}
	runtime.touchAll();
}

function lock (owner: Owner, locked: State.Readonly<boolean>): void {
	if (!isOwner(owner)) {
		throw new TypeError("Fields.lock: owner must be an Owner.");
	}

	locks.add(locked);
	const release = () => {
		if (!isLocked()) {
			rebuildPending();
		}
	};
	locked.subscribeImmediate(owner, value => {
		if (!value) {
			release();
		}
	});
	owner.onCleanup(() => {
		locks.delete(locked);
		release();
	});
}

/** Registers a generated model class's table. The accessors it describes are already on the prototype. */
function register (cls: Function, table: Table): void {
	const prototype = cls.prototype as object;
	if (!(LAZY_SLOT in prototype)) {
		(prototype as FieldHost)[LAZY_SLOT] = null;
	}

	const parent = parentFields(cls) ?? null;
	const fields = new ClassFields(cls, parent, table);
	classFields.set(cls, fields);
	if (!parent) {
		Object.defineProperty(cls, "compose", {
			configurable: true,
			get (this: Function) {
				return composeOf(this);
			},
		});
	}
	rebuild(fields);
}

function verify (host: object, compare: (a: unknown, b: unknown) => boolean = equals): Fields.Mismatch[] {
	const fields = fieldsOf(host.constructor);
	if (!fields) {
		return [];
	}

	const target = host as FieldHost;
	const lineage = fields.lineage();
	const keys = [...new Set(lineage.flatMap(each => each.derivedKeys))];
	const cached = keys.map(key => target[key]);
	for (const each of lineage) {
		for (let word = 0; word < each.wordCount; word++) {
			target[`_$${each.table.name}$d${word}`] = ALL_DIRTY | runtime.generation;
		}
	}

	const mismatches: Fields.Mismatch[] = [];
	keys.forEach((key, index) => {
		const fresh = target[key];
		if (!compare(cached[index], fresh)) {
			mismatches.push({ cached: cached[index], fresh, key });
		}
	});
	return mismatches;
}

const valueEquality = new Map<Function, (a: never, b: never) => boolean>();

function equals (a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) {
		return true;
	}
	if (typeof a !== "object" || a === null || typeof b !== "object" || b === null || a.constructor !== b.constructor) {
		return false;
	}
	const classEquals = valueEquality.get(a.constructor);
	return classEquals !== undefined && classEquals(a as never, b as never);
}

/**
 * What generated model code and LazyState reach. Not public: models are made with {@link Fields.define}.
 * A plain object, because generated code reads `generation` on every derived access.
 * @internal
 */
export const runtime = {
	/** The compose generation, already shifted into the high bits of a dirty word. Never zero, so an unset word reads as stale. */
	generation: GENERATION_STEP,
	/** How many observed lazy states must be polled every flush. While above zero, every model write schedules a flush. Written by LazyState. */
	observing: 0,
	/** Above zero while a derived computes. Anything that must not run inside one, like a seeded random, can throw on this. */
	computing: 0,
	/** A lazy state's value may have changed: queues it for the next flush if anything eager listens. Set by LazyState. */
	touch: (_state: unknown): void => { },
	/** Every lazy state's value may have changed, after a compose loaded or unloaded. Set by LazyState. */
	touchAll: (): void => { },
	/** The `$x` state of a field, made on first use. Set by LazyState. */
	of: (_host: object, _key: string, _writable: boolean): unknown => {
		throw new Error("kitsui: LazyState isn't loaded.");
	},
	/** A model's state was written, on a host with a `$x` or while something is polled. Set by LazyState. */
	onWrite: (_host: object, _key: string): void => { },
	/** Carries a write to `host[key]` to everything lazy that reads it. */
	propagate (host: object, key: string): void {
		propagate(host as FieldHost, key);
	},
	/** Whether `host[key]` can change with no write reaching it, through a check or a rerun, so its `$x` must be polled. */
	polled (host: object, key: string): boolean {
		return ((host as FieldHost)[POLLED_SLOT] as ReadonlySet<string> | undefined)?.has(key) ?? false;
	},
	/** Marks a state as reading `host[key]`, so a compose input selecting it on that same host becomes a mask edge. */
	hostField (state: object, host: object, key: string): void {
		hostFields.set(state, { host, key });
	},
	/** Dirties the derived a state's write reaches in other classes of the lineage. */
	dirty (host: object, target: unknown): void {
		dirty(host as FieldHost, target as DirtyTarget);
	},
	/** Links a forward field's state to its host, for generated forward fields. */
	bindForward (host: object, key: string, state: unknown): State<unknown> {
		if (!(state instanceof State)) {
			throw new TypeError(`Fields.define: the forward field "${key}" must select a state.`);
		}
		forwardField(host, key, state);
		return state as State<unknown>;
	},
	enter (): void {
		if (pendingRebuild !== null) {
			rebuildPending();
		}
		generationUsed = true;
		runtime.computing++;
	},
	exit (): void {
		runtime.computing--;
	},
	/** Runs composed mappers over a computed value. */
	chain (chain: unknown, host: object, value: unknown): unknown {
		const entries = chain as readonly ComposeEntry[];
		for (let index = 0; index < entries.length; index++) {
			const entry = entries[index];
			value = entry.input === null ? entry.mapper(host, value) : entry.mapper(host, value, entry.value(host as FieldHost));
		}
		return value;
	},
};

function forwardField (host: object, key: string, state: State.Readonly<unknown>): void {
	if (!isOwner(host)) {
		throw new TypeError(`Fields.forward: the host of "${key}" must be an Owner.`);
	}
	if (!fieldsOf(host.constructor)?.lineage().some(each => each.table.state.includes(key))) {
		throw new Error(`Fields.forward: "${key}" isn't a state of ${host.constructor.name}.`);
	}

	const target = host as FieldHost & Owner;
	(state as State<unknown>)._link(target, new FieldForward(target, key, dirtyTarget(target, key)));
}

/** Forces the closure accessors, as under a Content-Security-Policy that refuses code generation. For tests. @internal */
export const accessorMode = { closures: false };

function define (Base: abstract new (...args: never[]) => object, name: string, declaration: Fields.Declaration): Function {
	if (typeof Base !== "function") {
		throw new TypeError(`Fields.define: ${name} needs a base class.`);
	}
	assertIdentifier("class name", name);
	if (fieldsOf(Base as Function)?.lineage().some(each => each.table.name === name)) {
		throw new Error(`Fields.define: "${name}" is already a class name in this inheritance chain.`);
	}

	const state = declaration.state ?? {};
	const derived = declaration.derived ?? {};
	const forward = declaration.forward ?? {};
	const seen = new Set<string>();
	for (const key of [...Object.keys(state), ...Object.keys(derived), ...Object.keys(forward)]) {
		assertIdentifier("field", key);
		if (seen.has(key)) {
			throw new Error(`Fields.define: ${name} declares "${key}" twice.`);
		}
		seen.add(key);
	}

	const guards: Record<string, readonly string[]> = {};
	const layoutDerived: Record<string, LayoutDerived> = {};
	for (const [key, entry] of Object.entries(derived)) {
		if (typeof entry.get !== "function") {
			throw new TypeError(`Fields.define: ${name}.${key} needs a get function.`);
		}
		const checks = Object.entries(entry.checks ?? {});
		if (checks.length !== 0) {
			guards[key] = checks.map(([path]) => path);
		}
		layoutDerived[key] = { checks: checks.map(([, check]) => check), get: entry.get };
	}
	for (const [key, select] of Object.entries(forward)) {
		if (typeof select !== "function") {
			throw new TypeError(`Fields.define: the forward field ${name}.${key} needs a select function.`);
		}
	}

	const cls = buildModel(Base, { derived: layoutDerived, forward, name, state }, runtime, accessorMode.closures || undefined);
	register(cls, {
		derived: Object.fromEntries(Object.entries(derived).map(([key, entry]) => [key, entry.reads ?? []])),
		guards,
		name,
		state: [...Object.keys(state), ...Object.keys(forward)],
		volatile: Object.keys(derived).filter(key => derived[key].volatile),
	});
	return cls;
}

/**
 * Reactive models: classes whose fields are plain slots, whose derived values are cached until something they read changes, and whose
 * fields become real states only when asked for. Thousands of instances cost nothing beyond their slots until something watches them.
 *
 * ```ts
 * interface ItemHost { quality: number; bonus: number; description: { attack: number }; readonly baseAttack: number }
 *
 * class Item extends Fields.define(Owner, "Item", {
 *   state: { quality: 1, bonus: 0 },
 *   derived: {
 *     baseAttack: {
 *       reads: ["bonus"],
 *       checks: { "this.description.attack": (item: ItemHost) => item.description.attack },
 *       get: (item: ItemHost) => item.description.attack + item.bonus,
 *     },
 *     attack: { reads: ["quality", "baseAttack"], get: (item: ItemHost) => Math.round(item.baseAttack * item.quality) },
 *   },
 * }) {
 *   description = { attack: 3 }
 * }
 *
 * const item = new Item()
 * item.attack                                            // computed once, then cached until quality, bonus or the description's attack changes
 * Component("span").text.set(item.$attack.map(String))   // a real State, made on first ask
 * ```
 *
 * Reads are exact on every read, mid-tick included. `$x` states follow the usual timing: `subscribeImmediate` listeners hear during the
 * write and `subscribe` listeners at the next flush. A derived with checks, or a volatile one, has no write to react to, so a watched
 * `$x` of it is compared once per flush and both kinds of listener hear then.
 *
 * Plugins wrap derived values through the class's `compose`, owned so they unload cleanly. Use compose for values that are state, read by
 * formulas, stats or UI; use an `Emitter`'s `reduce` or `first` for decisions made from one call's arguments, like the damage of one hit.
 *
 * Accessors are generated code, as fast as hand-written ones. Where code generation is refused, as under a Content-Security-Policy
 * without `unsafe-eval`, they're built from closures instead: the same behaviour, slower once many classes share them.
 * @group Fields
 */
export const Fields = {
	/**
	 * Returns a class extending `Base` with the declared fields. Extend it, adding your own members; derived bodies receive the instance.
	 * `name` prefixes the class's slots and must be unique within an inheritance chain. A model extending a model inherits its fields.
	 *
	 * - `state`: writable fields, with their initial values.
	 * - `derived`: cached values. `reads` lists the state and derived of the class or its ancestors the body reads: a write to one marks
	 *   the value stale. `checks` maps each other read, by its path from `this`, to a function reading it; it is compared on every read.
	 *   A check rooted at a state or derived, like `"this.description.attack"` under a derived `description`, is pushed by its writes too.
	 *   `volatile` runs the body on every read, for bodies that call methods or loop over other objects.
	 * - `forward`: fields that read and write whichever state `select` returns, usually a `forward` of one of the model's own states.
	 *   Made on first use per instance; their `$x` is that state.
	 *
	 * Every field `x` also gets `$x`, its State, made on first use; an `undefined` value reads as `null` there.
	 *
	 * Initial state values are shared by every instance, so give objects and arrays their own in the constructor, after `super()`.
	 * Don't redeclare a model field as a class field in the subclass: a class field replaces the accessor on the instance, so writes
	 * to it reach nothing. Use `declare` for a narrower type.
	 */
	define: define as <BASE extends abstract new (...args: never[]) => object, DECLARATION extends Fields.Declaration> (Base: BASE, name: string, declaration: DECLARATION) => Fields.Model<BASE, DECLARATION>,
	/**
	 * Declares that the `state` field `host[key]` reads through `state`, such as a forward: whenever that state changes, the host's
	 * consumers of the field dirty and its `$x` hears, exactly as from the field's setter. Lasts until the host releases or disposes.
	 * Forward fields declared in `define` do this themselves.
	 */
	forward: forwardField,
	/**
	 * While `locked` is true, adding or removing composes only marks their class, and going false rebuilds each marked class once.
	 * Wrap bursts of compose changes, like loading or unloading mods, in it. Reads stay exact: a derived computing while
	 * locked applies the pending rebuild first, so reads in the middle of a burst cost a rebuild each. Several locks hold while
	 * any is true. Lasts until the owner is disposed.
	 */
	lock,
	/** Recomputes every derived on a host and returns the ones whose cached value was wrong. Development sweep; catches checks or mappers that miss a read. */
	verify,
	/** Makes instances of a class compare by value wherever field values are compared, such as `$x` deciding whether to notify. */
	equality<T> (cls: abstract new (...args: never[]) => T, classEquals: (a: T, b: T) => boolean): void {
		valueEquality.set(cls, classEquals as (a: never, b: never) => boolean);
	},
	/** `Object.is`, then the equality registered for both values' class. */
	equals,
	/** Above zero while a derived computes. Anything that must not run inside one, like a seeded random, can throw on this. */
	get computing (): number {
		return runtime.computing;
	},
};

type StateFields<S> = { -readonly [KEY in keyof S]: S[KEY] } & { readonly [KEY in keyof S & string as `$${KEY}`]: State<Exclude<S[KEY], undefined> | (undefined extends S[KEY] ? null : never)> };
type DerivedFields<D> = { readonly [KEY in keyof D]: D[KEY] extends Fields.Derived<infer VALUE> ? VALUE : never } & { readonly [KEY in keyof D & string as `$${KEY}`]: State.Readonly<D[KEY] extends Fields.Derived<infer VALUE> ? Exclude<VALUE, undefined> | (undefined extends VALUE ? null : never) : never> };
type ForwardState<F> = F extends (host: never) => infer S ? S : never;
type ForwardValue<F> = ForwardState<F> extends State.Readonly<infer VALUE> ? VALUE : never;
type ForwardFields<F> = { -readonly [KEY in keyof F as ForwardState<F[KEY]> extends State<unknown> ? KEY : never]: ForwardValue<F[KEY]> }
	& { readonly [KEY in keyof F as ForwardState<F[KEY]> extends State<unknown> ? never : KEY]: ForwardValue<F[KEY]> }
	& { readonly [KEY in keyof F & string as `$${KEY}`]: ForwardState<F[KEY]> };
type Section<DECLARATION, KEY extends keyof Fields.Declaration> = DECLARATION extends { readonly [K in KEY]: infer SECTION } ? SECTION : Record<never, never>;

export namespace Fields {
	/** One derived value of a model. */
	export interface Derived<VALUE = unknown> {
		/** State and derived of the class or its ancestors the body reads; a write to one marks the value stale. */
		readonly reads?: readonly string[];
		/** Every other read, by its path from `this` (`"this.description.attack"`), to a function reading it. Compared on every read. */
		readonly checks?: Readonly<Record<string, (host: never) => unknown>>;
		readonly get: (host: never) => VALUE;
		/** Runs the body on every read. */
		readonly volatile?: boolean;
	}

	/** What {@link Fields.define} builds a model from. */
	export interface Declaration {
		readonly state?: Readonly<Record<string, unknown>>;
		readonly derived?: Readonly<Record<string, Derived>>;
		readonly forward?: Readonly<Record<string, (host: never) => State.Readonly<unknown>>>;
	}

	/** The fields a declaration gives each instance, with a `$x` State for each. */
	export type Instance<DECLARATION extends Declaration> = StateFields<Section<DECLARATION, "state">> & DerivedFields<Section<DECLARATION, "derived">> & ForwardFields<Section<DECLARATION, "forward">>;

	/** The class {@link Fields.define} returns: `Base`, plus the declared fields and a `compose` for the derived ones. */
	export type Model<BASE extends abstract new (...args: never[]) => object, DECLARATION extends Declaration> = Omit<BASE, "prototype"> & {
		new (...args: ConstructorParameters<BASE>): InstanceType<BASE> & Instance<DECLARATION>;
		readonly prototype: InstanceType<BASE> & Instance<DECLARATION>;
		readonly compose: Compose<Instance<DECLARATION>, keyof Section<DECLARATION, "derived"> & keyof Instance<DECLARATION>>;
	};

	export interface Mismatch {
		readonly key: string;
		readonly cached: unknown;
		readonly fresh: unknown;
	}

	/** What a compose input selects for a host: one state, or a tuple of them. */
	export type Input = State.Readonly<unknown> | readonly State.Readonly<unknown>[];

	/** The values a mapper receives for an input: the state's value, or a tuple of values. */
	export type InputValue<INPUT extends Input> = INPUT extends State.Readonly<infer VALUE>
		? VALUE
		: { readonly [INDEX in keyof INPUT]: INPUT[INDEX] extends State.Readonly<infer VALUE> ? VALUE : never };

	/**
	 * Maps a derived value until the owner is disposed. The value stays cached between reads.
	 *
	 * With an input, `input(host)` runs on each compute and its states are watched for that host: a change dirties the derived
	 * at once, so the next read is exact. Pass a tuple for several states; a `State.Group` or `map` of them also works.
	 * A host with inputs must be an Owner; its release or disposal stops the watching. A `$x` of the host itself is watched through its
	 * own setter, so it's exact too.
	 *
	 * Mappers read host data through inputs or the derived body, never `host.x` directly: nothing watches that read, so its value goes
	 * stale. `verify` catches it in development.
	 *
	 * Compose is for values that are state: read by formulas, stats or UI. For a decision made from one call's arguments, like whether
	 * a creature can move in one direction, use an `Emitter`'s `first` or `reduce`.
	 * @example
	 * ```
	 * Item.compose.attack(mod, (item, attack) => attack + 2);
	 * const multiplier = State(mod, 1.5);
	 * Item.compose.attack(mod, () => multiplier, (item, attack, scale) => Math.round(attack * scale));
	 * Human.compose.defense(mod, human => human.$tactics, (human, defense, tactics) => defense + tactics);
	 * ```
	 */
	export interface Composer<HOST, VALUE> {
		(owner: Owner, mapper: (host: HOST, value: VALUE) => VALUE): void;
		<const INPUT extends Input> (owner: Owner, input: (host: HOST) => INPUT, mapper: (host: HOST, value: VALUE, input: InputValue<INPUT>) => VALUE): void;
	}

	/** The static `compose` of a class, for the named derived members. */
	export type Compose<HOST, KEYS extends keyof HOST> = { readonly [KEY in KEYS]: Composer<HOST, HOST[KEY]> };
}
