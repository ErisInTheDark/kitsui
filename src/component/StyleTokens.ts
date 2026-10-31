import type { StyleValue } from "./Style";

/** A CSS custom property name in kitsui's `$` shorthand, such as `$blockHeight` for `--block-height`. */
type TokenName = `$${string}`;

type TokenOverrides<NAME extends TokenName> = { readonly [KEY in NAME]?: StyleValue };

/** Rejects keys that are not `$` names, or that `EXISTING` already defines. */
type NewTokenValues<VALUES, EXISTING extends TokenName = never> = {
	readonly [KEY in keyof VALUES]: KEY extends EXISTING ? never : KEY extends TokenName ? StyleValue : never
};

/** @hidden */
class StyleTokenBase {
	readonly values: Readonly<Record<TokenName, StyleValue>>;

	constructor (values: Readonly<Record<TokenName, StyleValue>>) {
		this.values = Object.freeze({ ...values });
	}
}

/**
 * Finds the base value that a spread token set carries for `name`. A definition entry like `$gap: "$gap"` is the
 * self-reference a token set's own `$gap` property spreads as; its value lives on a symbol property the spread copied
 * alongside it. When several sets were spread in, the last one wins, as with any spread.
 * @hidden
 */
export function resolveStyleTokenReference (definition: object, name: string): StyleValue | undefined {
	let resolved: StyleValue | undefined;
	for (const symbol of Object.getOwnPropertySymbols(definition)) {
		const base = (definition as Record<symbol, unknown>)[symbol];
		if (base instanceof StyleTokenBase && name in base.values) {
			resolved = base.values[name as TokenName];
		}
	}

	return resolved;
}

function baseOf (tokens: object): StyleTokenBase {
	for (const symbol of Object.getOwnPropertySymbols(tokens)) {
		const base = (tokens as Record<symbol, unknown>)[symbol];
		if (base instanceof StyleTokenBase) {
			return base;
		}
	}

	throw new Error("Not a StyleTokens set.");
}

/** @hidden */
class StyleTokenSet<NAME extends TokenName> {
	constructor (values: Readonly<Record<TokenName, StyleValue>>) {
		const self = this as unknown as Record<string | symbol, unknown>;
		for (const name of Object.keys(values)) {
			if (!name.startsWith("$")) {
				throw new Error(`Style token '${name}' must be a '$' name, such as '$${name}'.`);
			}

			self[name] = name;
		}

		self[Symbol("StyleTokens")] = new StyleTokenBase(values);
		Object.freeze(this);
	}

	/**
	 * Returns new values for some of this set's tokens, to spread into a `Style.Class`, `StyleSelector` or inline
	 * style so they apply within that scope. Unknown token names are rejected.
	 */
	override (values: TokenOverrides<NAME>): TokenOverrides<NAME> {
		return values;
	}

	/**
	 * Returns a new set with this set's tokens plus more, whose values can reference this set's tokens.
	 * Existing tokens cannot be redefined; override them in a scope instead.
	 */
	extend<const VALUES extends Readonly<Record<TokenName, StyleValue>>> (define: (tokens: StyleTokens<NAME>) => VALUES & NewTokenValues<VALUES, NAME>): StyleTokens<NAME | (keyof VALUES & TokenName)> {
		const values = define(this as unknown as StyleTokens<NAME>);
		const base = baseOf(this).values;
		for (const name of Object.keys(values)) {
			if (name in base) {
				throw new Error(`Style token '${name}' is already defined.`);
			}
		}

		return new StyleTokenSet({ ...base, ...values }) as unknown as StyleTokens<NAME | (keyof VALUES & TokenName)>;
	}
}

/**
 * A typed set of CSS custom properties. Each token property is its own `$` reference (`tokens.$gap` is `"$gap"`,
 * compiling to `var(--gap)`), so a misspelt token is a compile error. Spreading the set into a style definition
 * declares every token with its base value.
 */
export type StyleTokens<NAME extends TokenName = TokenName> = StyleTokenSet<NAME> & { readonly [KEY in NAME]: KEY };

/**
 * Declares typed design tokens: CSS custom properties with base values, overridable per scope.
 * Names follow kitsui's `$` shorthand, so `$blockHeight` is `--block-height` and `$buttonWidth2` is `--button-width-2`.
 *
 * @param values - Base values keyed by `$` name. Values may reference other tokens.
 * @returns A frozen token set whose `$` properties are typed references to its tokens.
 *
 * @example
 * const Density = StyleTokens({ $blockHeight: "26px", $gap: "6px" })
 *   .extend(tokens => ({ $blockPaddingX: tokens.$gap }));
 *
 * StyleRoot({ ...Density }).appendTo(document.head);
 * // :root { --block-height: 26px; --gap: 6px; --block-padding-x: var(--gap) }
 *
 * const menuDensity = Style.Class("menu-density", Density.override({ $blockHeight: "58px" }));
 * // .menu-density { --block-height: 58px }
 *
 * const row = Style.Class("row", { height: Density.$blockHeight, padding: `0 ${Density.$blockPaddingX}` });
 * // .row { height: var(--block-height); padding: 0 var(--block-padding-x) }
 */
export function StyleTokens<const VALUES extends Readonly<Record<TokenName, StyleValue>>> (values: VALUES & NewTokenValues<VALUES>): StyleTokens<keyof VALUES & TokenName> {
	return new StyleTokenSet(values) as unknown as StyleTokens<keyof VALUES & TokenName>;
}
