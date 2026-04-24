import { Owner, State, StateStaticExtensions, type CleanupFunction, type StateOptions } from "../State";

type GroupedStateObject = Record<string, State<any>>;

type GroupedValue<T extends GroupedStateObject> = {
	[K in keyof T]: T[K] extends State<infer TValue> ? TValue : never;
};

/** @group Group */
type GroupConstructor = {
	<T extends GroupedStateObject> (owner: Owner, states: T): State<GroupedValue<T>>;
	new <T extends GroupedStateObject> (owner: Owner, states: T): State<GroupedValue<T>>;
};

declare module "../State" {
	interface StateStaticExtensions {
		/**
		 * Creates a grouped state that mirrors the current values of multiple states.
		 *
		 * The grouped state subscribes to all input states and coalesces source updates
		 * into a single next-tick grouped update per tick.
		 *
		 * @param owner The owner that manages the grouped state's lifecycle.
		 * @param states A record of source states to group.
		 * @returns A state whose value is an object with the current value of each source state.
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

function readGroupSnapshot<T extends GroupedStateObject> (states: T): GroupedValue<T> {
	const entries = Object.entries(states).map(([key, state]) => {
		return [key, state.value] as const;
	});

	return Object.fromEntries(entries) as GroupedValue<T>;
}

function createGroupedState<T extends GroupedStateObject> (owner: Owner, states: T): State<GroupedValue<T>> {
	const grouped = createOwnedState(owner, readGroupSnapshot(states));
	const releaseSubscriptions: CleanupFunction[] = [];
	let active = true;
	let queued = false;

	const flush = () => {
		queued = false;

		if (!active || grouped.disposed) {
			return;
		}

		grouped.set(readGroupSnapshot(states));
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

	return grouped;
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
	const Group = function Group<T extends GroupedStateObject> (owner: Owner, states: T): State<GroupedValue<T>> {
		if (!(owner instanceof Owner)) {
			throw new TypeError("State.Group requires an Owner as the first argument.");
		}

		if (typeof states !== "object" || states === null) {
			throw new TypeError("State.Group requires a states object as the second argument.");
		}

		return createGroupedState(owner, states);
	} as GroupConstructor;

	StateWithGroup.Group = Group;
}
