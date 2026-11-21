import { DerivedState } from "../DerivedState";
import { DisposeLink, isOwner, linkCleanup, Owner, State, type StateEqualityFunction, type StateOptions } from "../State";

declare module "../State" {
	interface StateExtensions<T> {
		/**
		 * Creates a state that forwards to whichever state `select` picks for this state's value: it reads that state's value, and
		 * `set` writes into it. When this state changes, `select` runs again and the forward follows the new pick, notifying once if
		 * the value it reads changed. Equality is the picked state's own.
		 *
		 * `value` is exact on every read, even mid-tick over lazy states whose listeners hear on the next flush.
		 * The forward links its source and pick only while something listens to it, so an unwatched forward keeps neither awake.
		 * @param owner The owner responsible for the forward's lifecycle. Disposing this state disposes it too.
		 * @param select Picks the state to forward to. Runs only when this state's value changes, so it should return existing states.
		 * @returns A state reading and writing through the current pick.
		 * @example
		 * ```
		 * const quality = item.$heldDoodad.forward(item, doodad => doodad?.$quality ?? item.$ownQuality);
		 * quality.set(3); // writes the held doodad's quality, or the item's own when it holds none
		 * ```
		 */
		forward<U> (owner: Owner, select: (value: T) => State<U>): State<U>;

		/**
		 * Like {@link StateExtensions.forward} with an owner, for a forward consumed at once: it must gain an owner before the next tick,
		 * which the first owner to subscribe to it becomes, as with `map`. That owner never owns the picked states.
		 */
		forward<U> (select: (value: T) => State<U>): State<U>;

		/**
		 * Creates a readonly state that forwards to whichever state `select` picks for this state's value.
		 * When this state changes, `select` runs again and the forward follows the new pick, notifying once if its value changed.
		 * @param owner The owner responsible for the forward's lifecycle. Disposing this state disposes it too.
		 * @param select Picks the state to forward to. Runs only when this state's value changes, so it should return existing states.
		 * @returns A readonly state reading through the current pick.
		 */
		forward<U> (owner: Owner, select: (value: T) => State.Readonly<U>): State.Readonly<U>;

		/** The readonly {@link StateExtensions.forward}, without an owner: it must gain one before the next tick, as with `map`. */
		forward<U> (select: (value: T) => State.Readonly<U>): State.Readonly<U>;

		/**
		 * Creates a readonly state that forwards to the list of states `select` picks for this state's value, reading their values
		 * as one array. When this state changes, `select` runs again: states still picked keep their link, the rest are dropped.
		 * It notifies once when any value changed, comparing each with its own state's equality.
		 *
		 * `value` is exact on every read, and stays the same array while no picked value changed.
		 * @param owner The owner responsible for the forward's lifecycle. Disposing this state disposes it too.
		 * @param select Picks the states to forward to. Runs only when this state's value changes, so it should return existing states.
		 * @returns A readonly state of the picked states' values.
		 * @example
		 * ```
		 * const defenses = human.$equipped.forward(human, items => items.map(item => item.$defense));
		 * defenses.value; // each equipped item's defense, exact mid-tick
		 * ```
		 */
		forward<const U extends readonly State.Readonly<unknown>[]> (owner: Owner, select: (value: T) => U): State.Readonly<ForwardValues<U>>;

		/** The list {@link StateExtensions.forward}, without an owner: it must gain one before the next tick, as with `map`. */
		forward<const U extends readonly State.Readonly<unknown>[]> (select: (value: T) => U): State.Readonly<ForwardValues<U>>;
	}
}

/** The values of a list of states, position for position. */
export type ForwardValues<U extends readonly State.Readonly<unknown>[]> = { readonly [K in keyof U]: U[K] extends State.Readonly<infer V> ? V : never };

type Select = (value: unknown) => unknown;
type AnyState = State<unknown>;

let patched = false;

function equalityOf (state: AnyState): StateEqualityFunction<unknown> {
	return state["equalityFunction"];
}

class ForwardState extends DerivedState {
	private selectedFor: unknown;
	private picks: readonly AnyState[];
	private inputList: readonly AnyState[];
	/** Counts changes of pick. */
	private version = 0;
	/** The pick version readers were last told about; a read can move the pick before the source's invalidation arrives. */
	private announced = 0;
	/** The list form's last read, kept while every picked value is the same. */
	private values: unknown[] | null = null;
	// Unset while super() runs; a disposed owner disposes the state before construction finishes.
	private readonly sourceDisposal: DisposeLink | undefined;

	constructor (private readonly source: State<unknown>, owner: Owner | null, private readonly select: Select, private readonly list: boolean, picks: readonly AnyState[]) {
		super(owner, list ? picks.map(pick => pick.value) : picks[0].value, { graph: source.getGraph() } as StateOptions<unknown>);
		this.selectedFor = source.value;
		this.picks = picks;
		this.inputList = [source, ...picks];
		this.equalityFunction = list ? this.listEquals.bind(this) : equalityOf(picks[0]);
		if (this.disposed) {
			return;
		}

		// Only the source follows this into an implicit owner; the picks belong to whoever made them.
		this._registerImplicitOwnerDependent(source);
		this.sourceDisposal = new DisposeLink(this as unknown as Owner);
		linkCleanup(source, this.sourceDisposal);
	}

	get value (): unknown {
		const picks = this.pick();
		return this.list ? this.read(picks) : picks[0].value;
	}

	isMutable (): boolean {
		return !this.list && this.pick()[0].isMutable();
	}

	set (next: unknown): unknown {
		this.ensureActive();
		const selected = this.list ? null : this.pick()[0];
		if (selected === null || !selected.isMutable()) {
			throw new TypeError("forward: the selected state is readonly.");
		}

		selected.set(next);
		return this.value;
	}

	update (updater: (value: unknown) => unknown): unknown {
		const next = updater(this.value);
		return this.set(next === undefined ? this.value : next);
	}

	/** Changes when the pick or anything picked changes, in place included, for derived states reading this. */
	get _changes (): number {
		let changes = super._changes + this.version;
		for (const pick of this.pick()) {
			changes += pick._changes;
		}
		return changes;
	}

	protected inputs (): readonly AnyState[] {
		return this.inputList;
	}

	/** The source or a pick notified: follow the pick, then deliver what this reads now. */
	inputChanged (): void {
		const value = this.value;
		this.announced = this.version;
		super.set(value);
	}

	/**
	 * A lazy source or pick was written: follow the pick now, so writes to a new pick reach this before the flush, and pass it on.
	 * A source write that keeps the pick changes nothing this reads.
	 */
	inputInvalidated (input: AnyState): void {
		this.pick();
		if (input === this.source && !this.picks.includes(input) && this.version === this.announced) {
			return;
		}

		this.announced = this.version;
		this.passInvalidate();
	}

	protected resync (): void {
		super.resync();
		this.announced = this.version;
	}

	private pick (): readonly AnyState[] {
		const value = this.source.value;
		if (!Object.is(value, this.selectedFor)) {
			this.selectedFor = value;
			const picks = picked(this.select, value, this.list);
			if (!samePicks(picks, this.picks)) {
				this.picks = picks;
				this.inputList = [this.source, ...picks];
				this.version++;
				if (!this.list) {
					this.equalityFunction = equalityOf(picks[0]);
				}
				this.relinkInputs();
			}
		}
		return this.picks;
	}

	/** Reuses the last array while every picked value is the same, so readers comparing by identity see no change. */
	private read (picks: readonly AnyState[]): unknown[] {
		const values = this.values;
		if (values !== null && values.length === picks.length) {
			let index = 0;
			while (index < picks.length && Object.is(values[index], picks[index].value)) {
				index++;
			}
			if (index === picks.length) {
				return values;
			}
		}

		const next = picks.map(pick => pick.value);
		this.values = next;
		return next;
	}

	private listEquals (a: unknown, b: unknown): boolean {
		const left = a as readonly unknown[];
		const right = b as readonly unknown[];
		if (left.length !== right.length) {
			return false;
		}

		const picks = this.picks;
		for (let index = 0; index < left.length; index++) {
			const equals = index < picks.length ? equalityOf(picks[index]) : Object.is;
			if (!equals(left[index], right[index])) {
				return false;
			}
		}
		return true;
	}

	/** Links follow the pick, so settle it before they're made. */
	protected linksChanged (): void {
		if (!this.disposed) {
			this.pick();
		}
		super.linksChanged();
	}

	protected beforeDispose (): void {
		super.beforeDispose();
		this.sourceDisposal?.releaseCleanup();
	}
}

function picked (select: Select, value: unknown, list: boolean): readonly AnyState[] {
	const result = select(value);
	if (Array.isArray(result) !== list) {
		throw new TypeError(list ? "forward: select must keep returning a list of states." : "forward: select must keep returning one state.");
	}

	const picks = (list ? result : [result]) as readonly unknown[];
	for (const pick of picks) {
		if (!(pick instanceof State)) {
			throw new TypeError("forward: select must return a state or a list of states.");
		}
	}
	return picks as readonly AnyState[];
}

function samePicks (a: readonly AnyState[], b: readonly AnyState[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let index = 0; index < a.length; index++) {
		if (a[index] !== b[index]) {
			return false;
		}
	}
	return true;
}

/**
 * Extends the State class with {@link StateExtensions.forward}.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export default function forwardExtension (): void {
	if (patched) {
		return;
	}

	patched = true;
	State.extend<unknown>().prototype.forward = function forward (this: State<unknown>, ownerOrSelect: Owner | Select, maybeSelect?: Select): State<unknown> {
		const owner = typeof ownerOrSelect === "function" ? null : ownerOrSelect;
		const select = typeof ownerOrSelect === "function" ? ownerOrSelect : maybeSelect;
		if (typeof ownerOrSelect !== "function" && !isOwner(owner)) {
			throw new TypeError("forward: owner must be an Owner.");
		}
		if (typeof select !== "function") {
			throw new TypeError("forward: select must be a function.");
		}

		const first = select(this.value);
		const list = Array.isArray(first);
		return new ForwardState(this, owner, select, list, picked(() => first, undefined, list)) as unknown as State<unknown>;
	} as never;
}
