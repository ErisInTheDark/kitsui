# 🚨 CRITICAL RULES

- Bug fixes should add or update tests before the fix attempt so the failure is proven first.
- New feature tests should be added after the feature exists, and they should be exhaustive enough to cover core behavior and meaningful edge cases.

## 📐 REQUIRED PATTERNS

- New *suites* of `Component` or `State` methods (not one-off core features) belong in their own extension files rather than growing the base classes.
- New manipulators should be created just-in-time and memoized on the component instance like the existing `.class` and `.attribute` accessors.
  - Extension getters should follow the same pattern when a manipulator is introduced outside`Component.ts`.

## ✅ VALIDATION

- If you're in VSCode, run `agent: verify`. Confirm the latest `agent: typecheck` result and `agent: test` result. If you're not in VSCode, run these as defined in the vscode tasks.json.
