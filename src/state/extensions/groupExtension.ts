import { ComputedState } from "../DerivedState";
import { isOwner, Owner, State, StateStaticExtensions, type StateOptions } from "../State";
import type { Mapper } from "./mappingExtension";

type GroupedStateObject = Record<string, State.Readonly<any>>;

type GroupedValue<T extends GroupedStateObject> = {
	[K in keyof T]: T[K] extends State.Readonly<infer TValue> ? TValue : never;
};

/** @group Group */
type GroupConstructor = {
	/**
	 * Creates a grouped state that mirrors the current values of multiple states.
	 *
	 * Reads are always exact. Listeners hear once per tick, and only while something listens does it link the input states.
	 *
	 * @param owner The owner that manages the grouped state's lifecycle.
	 * @param states A record of source states to group.
	 * @param options Optional state configuration for the grouped state.
	 * @returns A state whose value is an object with the current value of each source state.
	 */
	<T extends GroupedStateObject> (owner: Owner, states: T, options?: StateOptions<GroupedValue<T>>): State<GroupedValue<T>>;
	/**
	 * Creates a grouped state that mirrors the current values of multiple states.
	 *
	 * Reads are always exact. Listeners hear once per tick, and only while something listens does it link the input states.
	 *
	 * When called without an owner, the grouped state must gain an implicit or explicit
	 * owner before the next tick.
	 *
	 * @param states A record of source states to group.
	 * @param options Optional state configuration for the grouped state.
	 * @returns A state whose value is an object with the current value of each source state.
	 */
	<T extends GroupedStateObject> (states: T, options?: StateOptions<GroupedValue<T>>): State<GroupedValue<T>>;
	/**
	 * Creates a grouped state that mirrors the current values of multiple states.
	 *
	 * Reads are always exact. Listeners hear once per tick, and only while something listens does it link the input states.
	 *
	 * @param owner The owner that manages the grouped state's lifecycle.
	 * @param states A record of source states to group.
	 * @param options Optional state configuration for the grouped state.
	 * @returns A state whose value is an object with the current value of each source state.
	 */
	new <T extends GroupedStateObject> (owner: Owner, states: T, options?: StateOptions<GroupedValue<T>>): State<GroupedValue<T>>;
	/**
	 * Creates a grouped state that mirrors the current values of multiple states.
	 *
	 * Reads are always exact. Listeners hear once per tick, and only while something listens does it link the input states.
	 *
	 * When called without an owner, the grouped state must gain an implicit or explicit
	 * owner before the next tick.
	 *
	 * @param states A record of source states to group.
	 * @param options Optional state configuration for the grouped state.
	 * @returns A state whose value is an object with the current value of each source state.
	 */
	new <T extends GroupedStateObject> (states: T, options?: StateOptions<GroupedValue<T>>): State<GroupedValue<T>>;
	/**
	 * Creates a grouped state that mirrors the current values of multiple states and maps them into a derived value.
	 *
	 * Reads are always exact. Listeners hear once per tick, and only while something listens does it link the input states.
	 *
	 * @param owner The owner that manages the grouped state's lifecycle.
	 * @param states A record of source states to group.
	 * @param mapper Maps each grouped snapshot and its previous grouped snapshot, or undefined during the initial call, into the derived value stored by the grouped state.
	 * @param options Optional state configuration for the grouped state.
	 * @returns A state whose value is the mapper result for the current grouped snapshot.
	 */
	<T extends GroupedStateObject, U> (owner: Owner, states: T, mapper: Mapper<GroupedValue<T>, U>, options?: StateOptions<U>): State<U>;
	/**
	 * Creates a grouped state that mirrors the current values of multiple states and maps them into a derived value.
	 *
	 * Reads are always exact. Listeners hear once per tick, and only while something listens does it link the input states.
	 *
	 * When called without an owner, the grouped state must gain an implicit or explicit
	 * owner before the next tick.
	 *
	 * @param states A record of source states to group.
	 * @param mapper Maps each grouped snapshot and its previous grouped snapshot, or undefined during the initial call, into the derived value stored by the grouped state.
	 * @param options Optional state configuration for the grouped state.
	 * @returns A state whose value is the mapper result for the current grouped snapshot.
	 */
	<T extends GroupedStateObject, U> (states: T, mapper: Mapper<GroupedValue<T>, U>, options?: StateOptions<U>): State<U>;
	/**
	 * Creates a grouped state that mirrors the current values of multiple states and maps them into a derived value.
	 *
	 * Reads are always exact. Listeners hear once per tick, and only while something listens does it link the input states.
	 *
	 * @param owner The owner that manages the grouped state's lifecycle.
	 * @param states A record of source states to group.
	 * @param mapper Maps each grouped snapshot and its previous grouped snapshot, or undefined during the initial call, into the derived value stored by the grouped state.
	 * @param options Optional state configuration for the grouped state.
	 * @returns A state whose value is the mapper result for the current grouped snapshot.
	 */
	new <T extends GroupedStateObject, U> (owner: Owner, states: T, mapper: Mapper<GroupedValue<T>, U>, options?: StateOptions<U>): State<U>;
	/**
	 * Creates a grouped state that mirrors the current values of multiple states and maps them into a derived value.
	 *
	 * Reads are always exact. Listeners hear once per tick, and only while something listens does it link the input states.
	 *
	 * When called without an owner, the grouped state must gain an implicit or explicit
	 * owner before the next tick.
	 *
	 * @param states A record of source states to group.
	 * @param mapper Maps each grouped snapshot and its previous grouped snapshot, or undefined during the initial call, into the derived value stored by the grouped state.
	 * @param options Optional state configuration for the grouped state.
	 * @returns A state whose value is the mapper result for the current grouped snapshot.
	 */
	new <T extends GroupedStateObject, U> (states: T, mapper: Mapper<GroupedValue<T>, U>, options?: StateOptions<U>): State<U>;
};

declare module "../State" {
	interface StateStaticExtensions {
		/**
		 * Creates a grouped state that mirrors the current values of multiple states.
		 *
		 * Reads are always exact. Listeners hear once per tick, and only while something listens does it link the input states.
		 * @group Group
		 */
		Group: GroupConstructor;
	}
}

let patched = false;

function scheduleNextTick (callback: () => void): void {
	const schedulerRef = globalThis as typeof globalThis & {
		scheduler?: {
			yield?: () => Promise<unknown>;
		};
	};

	if (typeof schedulerRef.scheduler?.yield === "function") {
		void schedulerRef.scheduler.yield().then(callback);
		return;
	}

	queueMicrotask(callback);
}

function readGroupedValue (states: GroupedStateObject): Record<string, unknown> {
	const value: Record<string, unknown> = {};
	for (const key in states) {
		value[key] = states[key].value;
	}
	return value;
}

/**
 * The current values of several states, optionally mapped. Reads are exact in every tick; listeners hear once per tick.
 * Unwatched, it links nothing and reads on demand.
 */
class GroupedState extends ComputedState {
	private readonly inputList: readonly State<unknown>[];
	private snapshot: Record<string, unknown>;
	private queued = false;

	constructor (owner: Owner | null, private readonly states: GroupedStateObject, private readonly mapper: Mapper<Record<string, unknown>, unknown> | undefined, options: StateOptions<unknown> | undefined) {
		const snapshot = readGroupedValue(states);
		super(owner, mapper ? mapper(snapshot, undefined) : snapshot, { ...options } as StateOptions<unknown>);
		this.snapshot = snapshot;
		this.inputList = Object.values(states) as State<unknown>[];
		this.track();
	}

	protected inputs (): readonly State<unknown>[] {
		return this.inputList;
	}

	protected compute (): unknown {
		const snapshot = readGroupedValue(this.states);
		const previous = this.snapshot;
		this.snapshot = snapshot;
		return this.mapper ? this.mapper(snapshot, previous) : snapshot;
	}

	inputChanged (): void {
		if (this.queued) {
			return;
		}

		this.queued = true;
		scheduleNextTick(() => {
			this.queued = false;
			if (!this.disposed) {
				this.publish();
			}
		});
	}
}

function createGroupedState<T extends GroupedStateObject, U> (
	owner: Owner | null,
	states: T,
	mapper: Mapper<GroupedValue<T>, U> | undefined,
	options?: StateOptions<GroupedValue<T> | U>,
): State<U> {
	return new GroupedState(owner, states, mapper as Mapper<Record<string, unknown>, unknown> | undefined, options as StateOptions<unknown> | undefined) as unknown as State<U>;
}

/**
 * Extends State with the static `State.Group` constructor.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export default function groupExtension (): void {
	if (patched) {
		return;
	}

	patched = true;

	const StateWithGroup = State as typeof State & StateStaticExtensions;
	const Group = function Group<T extends GroupedStateObject, U> (
		ownerOrStates: Owner | T,
		statesOrMapperOrOptions?: T | Mapper<GroupedValue<T>, U> | StateOptions<GroupedValue<T>>,
		mapperOrOptions?: Mapper<GroupedValue<T>, U> | StateOptions<GroupedValue<T>>,
		maybeOptions?: StateOptions<U>,
	): State<U> {
		const owner = isOwner(ownerOrStates) && arguments.length >= 2 ? ownerOrStates : null;
		const states = owner === null
			? ownerOrStates as T
			: statesOrMapperOrOptions as T;
		const mapperOrStateOptions = owner === null
			? statesOrMapperOrOptions as Mapper<GroupedValue<T>, U> | StateOptions<GroupedValue<T>> | undefined
			: mapperOrOptions;
		const optionsCandidate = owner === null
			? maybeOptions ?? mapperOrOptions as StateOptions<U> | undefined
			: maybeOptions;

		if (typeof states !== "object" || states === null) {
			throw new TypeError("State.Group requires a states object.");
		}

		const mapper = typeof mapperOrStateOptions === "function"
			? mapperOrStateOptions as Mapper<GroupedValue<T>, U>
			: undefined;
		const options = (typeof mapperOrStateOptions === "function"
			? optionsCandidate
			: mapperOrStateOptions) as StateOptions<GroupedValue<T> | U> | undefined;

		return createGroupedState(owner, states, mapper, options);
	} as GroupConstructor;

	StateWithGroup.Group = Group;
}
