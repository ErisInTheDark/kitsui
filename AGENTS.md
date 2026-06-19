# 🚨 CRITICAL RULES

- Bug fixes should add or update tests before the fix attempt so the failure is proven first.
- New feature tests should be added after the feature exists, and they should be exhaustive enough to cover core behavior and meaningful edge cases.

## 📐 REQUIRED PATTERNS

- New *suites* of `Component` or `State` methods (not one-off core features) belong in their own extension files rather than growing the base classes.
- New manipulators should be created just-in-time and memoized on the component instance like the existing `.class` and `.attribute` accessors.
  - Extension getters should follow the same pattern when a manipulator is introduced outside`Component.ts`.
- Component-specific custom events must use the event extension system instead of augmenting the base component event map.
  - `ComponentHTMLElementEventMap` is only for events available on every component.
  - Feature-specific events belong in their own event map and component interface using `Component.WithEvents<Events>`.
  - Custom kitsui component event names must be `PascalCase`, such as `DragStart` or `WidgetCommit`, so they stay distinct from native DOM events like `click` and `pointerdown`.
  - Do not module-augment `ComponentHTMLElementEventMap` from feature modules such as Draggable, DropTarget, or Sortable.
  - Raw `element.addEventListener(...)` is fine for internal DOM coordination, but the public typed `component.event.*` API should expose feature-specific events only through the owning component interface.

## ✅ VALIDATION

- If you're in VSCode, run `agent: verify`. Confirm the latest `agent: typecheck` result and `agent: test` result. If you're not in VSCode, run these as defined in the vscode tasks.json.
