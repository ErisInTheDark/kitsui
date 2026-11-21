import { State, StateLink, type Owner, type StateOptions } from "./State";

type AnyState = State<unknown>;

/**
 * What a derived state links to its inputs, decided by its own links. `none`: only direct reads, which pull.
 * `lazy`: only lazy readers, told at write time without observing, so nothing polls the inputs. `eager`: listeners hear every change.
 */
type Linking = "none" | "lazy" | "eager";

// Typed loosely so an accessor can replace `value`, which State declares as a property.
const StateBase = State.extend() as unknown as new (owner: Owner | null, value: unknown, options: StateOptions<unknown>) => any;

/** Hears one input, as an immediate link. */
class InputLink extends StateLink<unknown> {
	constructor (private readonly target: DerivedState, private readonly input: AnyState, private readonly isLazy: boolean) {
		super(true);
	}

	get lazy (): boolean {
		return this.isLazy;
	}

	notify (): void {
		if (this.isLazy) {
			this.target.inputInvalidated(this.input);
		} else {
			this.target.inputChanged(this.input);
		}
	}

	invalidate (): void {
		this.target.inputInvalidated(this.input);
	}
}

/**
 * A state derived from other states, linking to them only as much as its own links need: an unwatched one keeps nothing awake.
 * @internal
 */
export abstract class DerivedState extends StateBase {
	protected linking: Linking = "none";
	private inputLinks = new Map<AnyState, InputLink>();
	private passing = false;

	/** The states this reads now. */
	protected abstract inputs (): readonly AnyState[];

	/** An input notified while this has listeners. */
	abstract inputChanged (input: AnyState): void;

	/** An input changed with its listeners still to hear, or this has only lazy readers: tell them now. */
	inputInvalidated (_input: AnyState): void {
		this.passInvalidate();
	}

	protected passInvalidate (): void {
		if (this.passing) {
			return;
		}

		this.passing = true;
		try {
			const links = this.immediateLinks as readonly StateLink<unknown>[] | null;
			if (links !== null) {
				for (let index = 0; index < links.length; index++) {
					links[index].invalidate();
				}
			}
		} finally {
			this.passing = false;
		}
	}

	protected linksChanged (): void {
		if (this.disposed) {
			return;
		}

		const own = this.immediateLinks as readonly StateLink<unknown>[] | null;
		const linking: Linking = this.queuedLinks !== null || own?.some(link => !link.lazy) ? "eager" : own !== null ? "lazy" : "none";
		if (linking === this.linking) {
			return;
		}

		if (linking === "eager") {
			this.resync();
		}

		this.linking = linking;
		for (const link of this.inputLinks.values()) {
			link.unsubscribe();
		}
		this.inputLinks = new Map();
		this.relinkInputs();
	}

	/** Listeners are arriving: whatever changed while nobody listened isn't a change to deliver. */
	protected resync (): void {
		this.clear(this.value);
	}

	/** Moves the links along with the inputs: states still read keep theirs, the rest are dropped. */
	protected relinkInputs (): void {
		if (this.disposed || this.linking === "none") {
			return;
		}

		const old = this.inputLinks;
		const links = new Map<AnyState, InputLink>();
		for (const input of this.inputs()) {
			if (links.has(input)) {
				continue;
			}

			let link = old.get(input);
			if (link === undefined) {
				link = new InputLink(this, input, this.linking === "lazy");
				input._link(this as unknown as Owner, link);
			}
			links.set(input, link);
		}
		for (const [input, link] of old) {
			if (!links.has(input)) {
				link.unsubscribe();
			}
		}
		this.inputLinks = links;
	}
}

/**
 * A derived state caching what it computes from its inputs. `value` is exact on every read: it recomputes when any input's value
 * or change count moved since the last compute, so in-place `update()`s count, linked or not.
 * @internal
 */
export abstract class ComputedState extends DerivedState {
	private cached: unknown;
	private seenValues: unknown[] = [];
	private seenChanges: number[] = [];
	private forced = false;

	constructor (owner: Owner | null, initialValue: unknown, options: StateOptions<unknown>) {
		super(owner, initialValue, options);
		this.cached = this.currentValue;
	}

	/** Computes the value from the inputs' current values. */
	protected abstract compute (): unknown;

	get value (): unknown {
		if (!this.disposed && this.isStale()) {
			this.refresh();
		}
		return this.cached;
	}

	set (next: unknown): unknown {
		const value = super.set(next);
		this.cached = value;
		this.track();
		return value;
	}

	/** Recomputes on the next read, and delivers now to listeners. */
	recompute (): void {
		this.ensureActive();
		this.forced = true;
		if (this.linking === "eager") {
			this.publish();
		}
	}

	/** Delivers what reads see now to listeners. The value is already fixed, so this only compares and commits. */
	protected publish (): void {
		const value = this.value;
		if (!this.equalityFunction(this.currentValue, value)) {
			this.commit(value, false);
		}
	}

	/** Records the inputs as just read, so the next read recomputes only once they move. Call once the inputs are known. */
	protected track (): void {
		const inputs = this.inputs();
		const values = this.seenValues;
		const changes = this.seenChanges;
		values.length = inputs.length;
		changes.length = inputs.length;
		for (let index = 0; index < inputs.length; index++) {
			values[index] = inputs[index].value;
			changes[index] = inputs[index]._changes;
		}
	}

	private isStale (): boolean {
		if (this.forced) {
			return true;
		}

		const inputs = this.inputs();
		if (inputs.length !== this.seenValues.length) {
			return true;
		}
		for (let index = 0; index < inputs.length; index++) {
			// Read the value first: a derived input refreshes, and counts the change, on read.
			if (!Object.is(inputs[index].value, this.seenValues[index]) || inputs[index]._changes !== this.seenChanges[index]) {
				return true;
			}
		}
		return false;
	}

	private refresh (): void {
		this.forced = false;
		this.track();
		const next = this._prepare(this.compute());
		if (this.linking === "eager") {
			// Listeners hear the difference from what they last heard, compared once, in publish.
			this.cached = next;
			this.changes++;
			return;
		}

		if (!this.equalityFunction(this.cached, next)) {
			this.cached = next;
			this.changes++;
		}
		this.clear(this.cached);
	}
}
