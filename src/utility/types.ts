export type Class<T> = (abstract new (...args: never[]) => T) & { prototype: T };
