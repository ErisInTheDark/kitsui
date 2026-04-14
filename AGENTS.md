# AGENTS

## 🚨 CRITICAL RULES
- Bug fixes should add or update tests before the fix attempt so the failure is proven first.
- New feature tests should be added after the feature exists, and they should be exhaustive enough to cover core behavior and meaningful edge cases.
- NEVER disable custom input in the ask_questions tool. The user should always have the option to provide custom steering.

## 📐 REQUIRED PATTERNS
- New suites of `Component` or `State` methods belong in their own extension files rather than growing the base classes.
- New manipulators should be created just-in-time and memoized on the component instance like the existing `.class` and `.attribute` accessors.
	- Extension getters should follow the same pattern when a manipulator is introduced outside `Component.ts`.

## ✅ TURN CHECKLIST
- Run `agent: verify`. Confirm the latest `agent: typecheck` result and `agent: test` result. Do not use the get_errors tool, `agent: typecheck` fills the same purpose and is more reliable.
