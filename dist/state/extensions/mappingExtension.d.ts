import { State } from "../State";
type Nullish = null | undefined;
export type Mapper<T, TMapped> = (value: T, oldValue?: T) => TMapped;
export interface RecomputableState<T> extends State<T> {
    /**
     * Recomputes the current value of the state by reapplying all mapping and transformation functions.
     * Useful when external conditions affecting the mapped values have changed and a manual update is needed.
     */
    recompute(): void;
}
declare module "../State" {
    interface StateExtensions<T> {
        /**
         * Creates a new ownerless state containing the mapped value of this state.
         * The mapped state subscribes to changes in the source and automatically updates.
         * The mapped state must gain an owner before the next tick.
         * @param mapValue Function that transforms each value from the source state.
         * @returns A new ownerless state with the transformed values.
         */
        map<TMapped>(mapValue: Mapper<T, TMapped>): RecomputableState<TMapped>;
        /**
         * Creates a new state containing the mapped value of this state.
         * The mapped state subscribes to changes in the source and automatically updates.
         * @param owner The owner responsible for managing the mapped state's lifecycle.
         * @param mapValue Function that transforms each value from the source state.
         * @returns A new state with the transformed values.
         */
        map<TMapped>(owner: Owner, mapValue: Mapper<T, TMapped>): RecomputableState<TMapped>;
        /**
         * A boolean state indicating whether the current value is truthy.
         * The value is memoized per state instance for efficiency.
         */
        readonly truthy: State<boolean>;
        /**
         * A boolean state indicating whether the current value is falsy.
         * The value is memoized per state instance for efficiency.
         */
        readonly falsy: State<boolean>;
        /**
         * Returns a state that falls back to a computed value when this state is null or undefined.
         * Otherwise, returns the original value.
         * @param getValue Function invoked to compute the fallback value when needed.
         * @returns A new state with the original or fallback value.
         */
        or<TFallback>(getValue: () => TFallback): RecomputableState<Exclude<T, Nullish> | TFallback>;
        /**
         * Returns a boolean state that is true when this state equals the provided value.
         * Uses strict equality (===) for comparison.
         * @param compareValue The value to compare against the current state value.
         * @returns A new state that is true when the values are strictly equal, false otherwise.
         */
        equals(compareValue: T): State<boolean>;
    }
}
/**
 * Extends the State class with mapping and transformation methods.
 * This extension adds the {@link StateExtensions.map}, {@link StateExtensions.truthy},
 * {@link StateExtensions.falsy}, and {@link StateExtensions.or} methods to all State instances.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export default function mappingExtension(): void;
export {};
