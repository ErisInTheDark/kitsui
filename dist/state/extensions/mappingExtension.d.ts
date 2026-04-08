type Nullish = null | undefined;
declare module "../State" {
    interface StateExtensions<TValue> {
        map<TMapped>(owner: Owner, mapValue: (value: TValue) => TMapped): State<TMapped>;
        readonly truthy: State<boolean>;
        readonly falsy: State<boolean>;
        or<TFallback>(getValue: () => TFallback): State<Exclude<TValue, Nullish> | TFallback>;
    }
}
export default function mappingExtension(): void;
export {};
