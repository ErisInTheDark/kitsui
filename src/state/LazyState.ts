import { Fields, runtime } from "./Fields";
import { createStateGraph, flushGraph, isOwner, scheduleGraphFlush, State, type CleanupFunction, type Owner, type StateLink, type StateOptions } from "./State";

type Host = Owner & Record<string, unknown>;

/**
 * Every model field's `$x` shares this graph. A model's write doesn't commit to its `$x`; the graph's flush pulls the changed ones
 * first, so their listeners, and states derived from them, hear in the same flush as any other state's.
 */
const graph = createStateGraph();
/** Lazy states with eager listeners. */
const observed = new Set<LazyStateClass>();
/** Observed states over a derived that can change with no write reaching it: every flush polls them. */
const polled = new Set<LazyStateClass>();
/** Observed states whose value may have changed since the last flush. */
let pending = new Set<LazyStateClass>();

graph.prepare = () => {
	const states = pending;
	pending = new Set();
	for (const state of polled) {
		states.add(state);
	}

	let failed = false;
	let failure: unknown;
	for (const state of states) {
		try {
			state.poll();
		} catch (error) {
			if (!failed) {
				failed = true;
				failure = error;
			}
		}
	}

	if (failed) {
		throw failure;
	}
};

runtime.touch = state => {
	const lazy = state as LazyStateClass;
	if (!lazy.isObserved) {
		return;
	}

	// Immediate listeners hear during the write, as they do for any state; everything else waits for the flush.
	if (lazy.hasImmediateListener()) {
		lazy.poll();
		return;
	}

	pending.add(lazy);
	scheduleGraphFlush(graph);
};

runtime.touchAll = () => {
	if (observed.size === 0) {
		return;
	}
	// A compose can make a derived rerun, or stop it rerunning.
	for (const state of observed) {
		pending.add(state);
		state.classify();
	}
	scheduleGraphFlush(graph);
};

runtime.of = (host, key, writable) => of(host, key, writable);

runtime.onWrite = (host, key) => {
	runtime.propagate(host, key);
	if (polled.size !== 0) {
		scheduleGraphFlush(graph);
	}
};

function toStateValue (value: unknown): unknown {
	return value === undefined ? null : value;
}

// Typed loosely so an accessor can replace `value`, which State declares as a property.
const StateBase = State.extend() as unknown as new (owner: Owner, value: unknown, options: StateOptions<unknown>) => any;

/** A real state over one field of a model. The field stays the source of truth, so `value` is exact mid-tick. */
class LazyStateClass extends StateBase {
	isObserved = false;

	constructor (private readonly host: Host, private readonly key: string, private readonly writable: boolean) {
		super(host, toStateValue(host[key]), { equals: Fields.equals, graph } as StateOptions<unknown>);
		runtime.hostField(this, host, key);
	}

	get value (): unknown {
		return toStateValue(this.host[this.key]);
	}

	isMutable (): boolean {
		return this.writable;
	}

	set (next: unknown): unknown {
		if (!this.writable) {
			throw new Error(`"${this.key}" is derived and can't be set.`);
		}

		this.ensureActive();
		this.host[this.key] = next === null ? undefined : next;
		return this.value;
	}

	update (updater: (value: unknown) => unknown): unknown {
		const next = updater(this.value);
		return this.set(next === undefined ? this.value : next);
	}

	_link (owner: Owner, link: StateLink<unknown>): void {
		if (!link.lazy) {
			this.observe();
		}
		super._link(owner, link);
	}

	subscribeUnbound (listener: unknown): CleanupFunction {
		this.observe();
		return super.subscribeUnbound(listener);
	}

	subscribeImmediateUnbound (listener: unknown): CleanupFunction {
		this.observe();
		return super.subscribeImmediateUnbound(listener);
	}

	hasImmediateListener (): boolean {
		return this.immediateLinks?.some((link: StateLink<unknown>) => link.isListener) ?? false;
	}

	private observe (): void {
		if (this.isObserved || this.disposed) {
			return;
		}

		this.isObserved = true;
		// What changed while nobody listened isn't a change to deliver.
		this.clear(this.value);
		observed.add(this);
		this.classify();
	}

	classify (): void {
		if (this.isObserved && runtime.polled(this.host, this.key)) {
			polled.add(this);
		} else {
			polled.delete(this);
		}
		runtime.observing = polled.size;
	}

	/** Commits the field's current value, so listeners hear if it changed. */
	poll (): void {
		// Lazy readers are already told at write time; only eager links keep this observed.
		if (this.queuedLinks === null && !this.immediateLinks?.some((link: StateLink<unknown>) => !link.lazy)) {
			this.unobserve();
			return;
		}

		super.set(this.value);
	}

	private unobserve (): void {
		this.isObserved = false;
		observed.delete(this);
		this.classify();
	}

	protected beforeDispose (): void {
		super.beforeDispose();
		this.unobserve();
		pending.delete(this);
		// Undefined when the host was disposed before this was asked for: State disposes inside its constructor.
		(this.host?._$lazy as Map<string, LazyStateClass> | null | undefined)?.delete(this.key);
	}
}

function of<T> (host: object, key: string, writable: boolean): State<T> {
	const target = host as Host;
	let states = target._$lazy as Map<string, LazyStateClass> | null | undefined;
	const known = states?.get(key);
	if (known) {
		return known as unknown as State<T>;
	}

	if (!isOwner(host)) {
		throw new TypeError(`$${key}: the host must be an Owner.`);
	}

	if (!states) {
		states = new Map();
		// Non-enumerable, so copies and serializer walks of the host don't carry its states along.
		Object.defineProperty(host, "_$lazy", { configurable: true, enumerable: false, value: states, writable: true });
	}

	const state = new LazyStateClass(target, key, writable);
	states.set(key, state);
	return state as unknown as State<T>;
}

/** The states over model fields. Internal: models expose them as `$x`. */
export const LazyState = {
	of,
	/** Delivers everything pending now, for tests and anything that can't wait for the scheduled flush. */
	flush (): void {
		flushGraph(graph);
	},
};
