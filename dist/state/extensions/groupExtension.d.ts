import { Owner, State } from "../State";
type GroupedStateObject = Record<string, State<any>>;
type GroupedValue<T extends GroupedStateObject> = {
    [K in keyof T]: T[K] extends State<infer TValue> ? TValue : never;
};
/** @group Group */
type GroupConstructor = {
    <T extends GroupedStateObject>(owner: Owner, states: T): State<GroupedValue<T>>;
    new <T extends GroupedStateObject>(owner: Owner, states: T): State<GroupedValue<T>>;
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
/**
 * Extends State with the static `State.Group` constructor.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export default function groupExtension(): void;
export {};
