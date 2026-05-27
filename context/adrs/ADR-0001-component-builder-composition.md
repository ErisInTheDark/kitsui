# ADR-0001: Component Builder Composition

## Context

kitsui components need a way to compose reusable builder functions into existing Component instances. kitsui 1 supported builder objects and `.and(...)`, but the rewrite does not have the old builder registry, `supers` state, or closest-builder lookup machinery.

## Decision

Use plain builder functions with an explicit builder identity marker in the initial `Component(...)` call:

```ts
function Button(this: Component | void): ButtonComponent {
	const component = Component(this ?? "button", Button);

	return component as ButtonComponent;
}
```

Components support `.and(builder, ...params)`, `.is(builder)`, and `.as(builder)`. `.and(...)` injects the current component as `this`, requires the builder to return that same component instance, marks the builder identity, and skips duplicate applications.

## Consequences

Direct builder calls can be tracked without wrapping the builder function, as long as the builder passes its identity to `Component(source, builder)`.

Builder identity is based on function object identity. Reapplying the same builder is treated as a duplicate and does not rerun setup, so repeatable configuration should be exposed as component methods or state instead of repeated `.and(...)` calls.

This does not introduce async builders, `closest`, public `supers` state, DOM stamping, or decorator-based builders.

## Rejected Alternatives

- Recreate kitsui 1 builder wrappers and `supers`: more machinery than the rewrite needs for initial composition.
- Use decorators: TypeScript decorators do not provide a clean plain-function builder API.
- Allow replacement components from `.and(...)`: this complicates lifecycle and ownership in the rewrite.
