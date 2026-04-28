import { Owner, State, StateStaticExtensions, type CleanupFunction, type StateOptions } from "../State";
import type { Mapper } from "./mappingExtension";

type GroupedStateObject = Record<string, State<any>>;

type GroupedValue<T extends GroupedStateObject> = {
	[K in keyof T]: T[K] extends State<infer TValue> ? TValue : never;
};

/** @group Group */
type GroupConstructor = {
	/**
	 * Creates a grouped state that mirrors the current values of multiple states.
	 *
	 * The grouped state subscribes to all input states and coalesces source updates
	 * into a single next-tick grouped update per tick.
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
	 * The grouped state subscribes to all input states and coalesces source updates
	 * into a single next-tick grouped update per tick.
	 *
	 * @param owner The owner that manages the grouped state's lifecycle.
	 * @param states A record of source states to group.
	 * @param options Optional state configuration for the grouped state.
	 * @returns A state whose value is an object with the current value of each source state.
	 */
	new <T extends GroupedStateObject> (owner: Owner, states: T, options?: StateOptions<GroupedValue<T>>): State<GroupedValue<T>>;
	/**
	 * Creates a grouped state that mirrors the current values of multiple states and maps them into a derived value.
	 *
	 * The grouped state subscribes to all input states and coalesces source updates
	 * into a single next-tick grouped update per tick.
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
	 * The grouped state subscribes to all input states and coalesces source updates
	 * into a single next-tick grouped update per tick.
	 *
	 * @param owner The owner that manages the grouped state's lifecycle.
	 * @param states A record of source states to group.
	 * @param mapper Maps each grouped snapshot and its previous grouped snapshot, or undefined during the initial call, into the derived value stored by the grouped state.
	 * @param options Optional state configuration for the grouped state.
	 * @returns A state whose value is the mapper result for the current grouped snapshot.
	 */
	new <T extends GroupedStateObject, U> (owner: Owner, states: T, mapper: Mapper<GroupedValue<T>, U>, options?: StateOptions<U>): State<U>;
};

declare module "../State" {
	interface StateStaticExtensions {
		/**
		 * Creates a grouped state that mirrors the current values of multiple states.
		 *
		 * The grouped state subscribes to all input states and coalesces source updates
		 * into a single next-tick grouped update per tick.
		 * @group Group
		 */
		Group: GroupConstructor;
	}
}

const noop: CleanupFunction = () => {
	// Intentionally empty.
};

const createOwnedState = State as unknown as <T>(owner: Owner, initialValue: T, options?: StateOptions<T>) => State<T>;

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

function readGroupedValue<T extends GroupedStateObject> (states: T): GroupedValue<T> {
	const entries = Object.entries(states).map(([key, state]) => {
		return [key, state.value] as const;
	});

	return Object.fromEntries(entries) as GroupedValue<T>;

}

function readGroupSnapshot<T extends GroupedStateObject, U> (states: T, mapper: Mapper<GroupedValue<T>, U> | undefined, oldValue?: GroupedValue<T>): {
	snapshot: GroupedValue<T>;
	value: GroupedValue<T> | U;
} {
	const snapshot = readGroupedValue(states);

	return {
		snapshot,
		value: mapper ? mapper(snapshot, oldValue) : snapshot,
	};
}

function createGroupedState<T extends GroupedStateObject, U> (
	owner: Owner,
	states: T,
	mapper: Mapper<GroupedValue<T>, U> | undefined,
	options?: StateOptions<GroupedValue<T> | U>,
): State<U> {
	const initialGroup = readGroupSnapshot(states, mapper, undefined);
	const grouped = createOwnedState(owner, initialGroup.value, options as StateOptions<typeof initialGroup.value> | undefined);
	const releaseSubscriptions: CleanupFunction[] = [];
	let active = true;
	let queued = false;
	let previousSnapshot = initialGroup.snapshot;

	const flush = () => {
		queued = false;

		if (!active || grouped.disposed) {
			return;
		}

		const nextGroup = readGroupSnapshot(states, mapper, previousSnapshot);
		grouped.set(nextGroup.value);
		previousSnapshot = nextGroup.snapshot;
	};

	const queueGroupedUpdate = () => {
		if (!active || queued || grouped.disposed) {
			return;
		}

		queued = true;
		scheduleNextTick(flush);
	};

	for (const state of Object.values(states)) {
		releaseSubscriptions.push(state.subscribeImmediate(grouped, queueGroupedUpdate));
	}

	grouped.onCleanup(() => {
		if (!active) {
			return;
		}

		active = false;
		queued = false;

		for (const releaseSubscription of releaseSubscriptions) {
			releaseSubscription();
		}

		releaseSubscriptions.length = 0;
	});

	return grouped as unknown as State<U>;
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
		owner: Owner,
		states: T,
		mapperOrOptions?: Mapper<GroupedValue<T>, U> | StateOptions<GroupedValue<T>>,
		maybeOptions?: StateOptions<U>,
	): State<U> {
		if (!(owner instanceof Owner)) {
			throw new TypeError("State.Group requires an Owner as the first argument.");
		}

		if (typeof states !== "object" || states === null) {
			throw new TypeError("State.Group requires a states object as the second argument.");
		}

		const mapper = typeof mapperOrOptions === "function"
			? mapperOrOptions as Mapper<GroupedValue<T>, U>
			: undefined;
		const options = (typeof mapperOrOptions === "function"
			? maybeOptions
			: mapperOrOptions) as StateOptions<GroupedValue<T> | U> | undefined;

		return createGroupedState(owner, states, mapper, options);
	} as GroupConstructor;

	StateWithGroup.Group = Group;
}
