/**
 * Writes the accessors of a model class: each state's setter and getter, each derived's cached getter and its compute, each forward
 * field's getter and setter, and every `$x`. Code generation gives every accessor its own source, with slot names and masks as
 * literals, so each stays as fast as hand-written code however many classes exist. Where code generation is refused, as under a
 * Content-Security-Policy without `unsafe-eval`, the same accessors are built from shared closures instead, which run slower once
 * many classes share them.
 */

type Host = Record<string, unknown>;
type Constructor = abstract new (...args: never[]) => object;

/** What generated code reaches at runtime. */
export interface AccessorRuntime {
	generation: number;
	observing: number;
	dirty (host: object, target: unknown): void;
	enter (): void;
	exit (): void;
	chain (chain: unknown, host: object, value: unknown): unknown;
	of (host: object, key: string, writable: boolean): unknown;
	onWrite (host: object, key: string): void;
	bindForward (host: object, key: string, state: unknown): ForwardSlot;
}

export interface ForwardSlot {
	readonly disposed: boolean;
	readonly value: unknown;
	set (value: unknown): unknown;
}

export interface LayoutDerived {
	readonly checks: readonly ((host: never) => unknown)[];
	readonly get: (host: never) => unknown;
}

export interface Layout {
	readonly name: string;
	readonly state: Readonly<Record<string, unknown>>;
	readonly derived: Readonly<Record<string, LayoutDerived>>;
	readonly forward: Readonly<Record<string, (host: never) => unknown>>;
}

const BITS = 22;
const ALL = 0x3FFFFF;
const GEN = 0x3FC00000;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

export function assertIdentifier (kind: string, name: string): void {
	if (!IDENTIFIER.test(name) || name === "constructor" || name === "prototype") {
		throw new TypeError(`Fields.define: ${kind} "${name}" isn't a usable identifier.`);
	}
}

let codegen: boolean | null = null;

function canGenerate (): boolean {
	if (codegen === null) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-implied-eval
			codegen = new Function("return true")() === true;
		} catch {
			codegen = false;
		}
	}
	return codegen;
}

/** Builds the model class over `Base`, generated where allowed. `closures` forces the fallback, for tests. */
export function buildModel (Base: Constructor, layout: Layout, runtime: AccessorRuntime, closures = !canGenerate()): Constructor {
	return closures ? assemble(Base, layout, runtime) : generate(Base, layout, runtime);
}

function wordsOf (layout: Layout): number {
	return Math.ceil(Object.keys(layout.derived).length / BITS);
}

// ---- code generation

function generate (Base: Constructor, layout: Layout, runtime: AccessorRuntime): Constructor {
	const { name } = layout;
	const p = `_$${name}$`;
	const words = wordsOf(layout);
	const stateKeys = Object.keys(layout.state);
	const derivedKeys = Object.keys(layout.derived);
	const forwardKeys = Object.keys(layout.forward);
	const init: string[] = [];
	const members: string[] = [];
	const prelude: string[] = [];

	for (let word = 0; word < words; word++) {
		init.push(`this.${p}d${word} = ${ALL} | F.generation;`);
	}
	for (const key of stateKeys) {
		init.push(`this.${p}${key} = state.${key};`);
	}
	for (const key of derivedKeys) {
		init.push(`this.${p}v_${key} = undefined;`);
		layout.derived[key].checks.forEach((_, at) => init.push(`this.${p}s_${key}_${at} = undefined;`));
	}
	for (const key of forwardKeys) {
		init.push(`this.${p}f_${key} = null;`);
	}

	for (const key of stateKeys) {
		const slot = `${p}${key}`;
		const marks = Array.from({ length: words }, (_, word) => `this.${p}d${word} |= this.${p}m${word}_${key};`).join(" ");
		members.push(`get ${key} () { return this.${slot}; }`);
		members.push(`set ${key} (v) { if (this.${slot} !== v) { this.${slot} = v; ${marks} const t = this.${p}t_${key}; if (t !== null) F.dirty(this, t); if (this._$lazy !== null || F.observing !== 0) F.onWrite(this, "${key}"); } }`);
		members.push(`get $${key} () { return F.of(this, "${key}", true); }`);
	}

	derivedKeys.forEach((key, index) => {
		const word = `${p}d${Math.floor(index / BITS)}`;
		const volatileWord = `${p}x${Math.floor(index / BITS)}`;
		const bit = 1 << (index % BITS);
		const checks = layout.derived[key].checks;
		const snapshots = checks.map((_, at) => `s${at}`);
		checks.forEach((_, at) => prelude.push(`const check_${key}_${at} = derived.${key}.checks[${at}];`));
		prelude.push(`const body_${key} = derived.${key}.get;`);
		const reads = snapshots.map((snapshot, at) => `const ${snapshot} = check_${key}_${at}(this);`).join(" ");
		const compare = snapshots.map((snapshot, at) => ` && ${snapshot} === this.${p}s_${key}_${at}`).join("");
		const store = snapshots.map((snapshot, at) => `this.${p}s_${key}_${at} = ${snapshot};`).join(" ");
		members.push(`get ${key} () { ${reads} return ((this.${word} ^ F.generation) & ${bit | GEN}) === 0${compare} ? this.${p}v_${key} : this.${p}r_${key}(${snapshots.join(", ")}); }`);
		members.push(`${p}r_${key} (${snapshots.join(", ")}) { if (((this.${word} ^ F.generation) & ${GEN}) !== 0) this.${word} = ${ALL} | F.generation; F.enter(); try { let v = body_${key}(this); const c = this.${p}c_${key}; if (c !== null) v = F.chain(c, this, v); ${store} this.${p}v_${key} = v; this.${word} = (this.${word} & ${~bit}) | (this.${volatileWord} & ${bit}); return v; } finally { F.exit(); } }`);
		members.push(`get $${key} () { return F.of(this, "${key}", false); }`);
	});

	for (const key of forwardKeys) {
		const slot = `${p}f_${key}`;
		prelude.push(`const select_${key} = forward.${key};`);
		members.push(`${p}g_${key} () { const f = this.${slot}; return f !== null && !f.disposed ? f : this.${slot} = F.bindForward(this, "${key}", select_${key}(this)); }`);
		// Fields hold undefined where states hold null, as through `$x`.
		members.push(`get ${key} () { const v = this.${p}g_${key}().value; return v === null ? undefined : v; }`);
		members.push(`set ${key} (v) { this.${p}g_${key}().set(v === undefined ? null : v); }`);
		members.push(`get $${key} () { return this.${p}g_${key}(); }`);
	}

	// The class stays anonymous in the source, so no class name can shadow the names it uses.
	const source = `"use strict";\n${prelude.join("\n")}\nreturn class extends Base {\n\tconstructor (...args) { super(...args); ${init.join(" ")} }\n\t${members.join("\n\t")}\n};`;
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	const factory = new Function("Base", "F", "state", "derived", "forward", source) as (...args: unknown[]) => Constructor;
	const cls = factory(Base, runtime, layout.state, layout.derived, layout.forward);
	Object.defineProperty(cls, "name", { value: name });
	return cls;
}

// ---- closures

function assemble (Base: Constructor, layout: Layout, F: AccessorRuntime): Constructor {
	const { name } = layout;
	const p = `_$${name}$`;
	const words = wordsOf(layout);
	const stateKeys = Object.keys(layout.state);
	const derivedKeys = Object.keys(layout.derived);
	const forwardKeys = Object.keys(layout.forward);
	const wordSlots = Array.from({ length: words }, (_, word) => `${p}d${word}`);
	const emptySlots: string[] = [];
	for (const key of derivedKeys) {
		emptySlots.push(`${p}v_${key}`);
		layout.derived[key].checks.forEach((_, at) => emptySlots.push(`${p}s_${key}_${at}`));
	}
	const stateSlots = stateKeys.map(key => [`${p}${key}`, layout.state[key]] as const);
	const forwardSlots = forwardKeys.map(key => `${p}f_${key}`);

	const cls = class extends (Base as unknown as new (...args: unknown[]) => object) {
		constructor (...args: unknown[]) {
			super(...args);
			const self = this as unknown as Host;
			for (const slot of wordSlots) {
				self[slot] = ALL | F.generation;
			}
			for (const [slot, value] of stateSlots) {
				self[slot] = value;
			}
			for (const slot of emptySlots) {
				self[slot] = undefined;
			}
			for (const slot of forwardSlots) {
				self[slot] = null;
			}
		}
	};
	Object.defineProperty(cls, "name", { value: name });
	const prototype = cls.prototype as Host;

	for (const key of stateKeys) {
		const slot = `${p}${key}`;
		const masks = wordSlots.map((wordSlot, word) => [wordSlot, `${p}m${word}_${key}`] as const);
		const targetSlot = `${p}t_${key}`;
		Object.defineProperty(prototype, key, {
			configurable: true,
			get (this: Host) {
				return this[slot];
			},
			set (this: Host, value: unknown) {
				if (this[slot] === value) {
					return;
				}
				this[slot] = value;
				for (const [wordSlot, maskSlot] of masks) {
					this[wordSlot] = (this[wordSlot] as number) | (this[maskSlot] as number);
				}
				const target = this[targetSlot];
				if (target !== null) {
					F.dirty(this, target);
				}
				if (this._$lazy !== null || F.observing !== 0) {
					F.onWrite(this, key);
				}
			},
		});
		Object.defineProperty(prototype, `$${key}`, { configurable: true, get (this: object) { return F.of(this, key, true); } });
	}

	derivedKeys.forEach((key, index) => {
		const word = `${p}d${Math.floor(index / BITS)}`;
		const volatileWord = `${p}x${Math.floor(index / BITS)}`;
		const bit = 1 << (index % BITS);
		const valueSlot = `${p}v_${key}`;
		const chainSlot = `${p}c_${key}`;
		const recompute = `${p}r_${key}`;
		const checks = layout.derived[key].checks as readonly ((host: Host) => unknown)[];
		const snapshotSlots = checks.map((_, at) => `${p}s_${key}_${at}`);
		const body = layout.derived[key].get as (host: Host) => unknown;

		prototype[recompute] = function (this: Host, ...snapshots: unknown[]): unknown {
			if ((((this[word] as number) ^ F.generation) & GEN) !== 0) {
				this[word] = ALL | F.generation;
			}
			F.enter();
			try {
				let value = body(this);
				const chain = this[chainSlot];
				if (chain !== null) {
					value = F.chain(chain, this, value);
				}
				for (let at = 0; at < snapshotSlots.length; at++) {
					this[snapshotSlots[at]] = snapshots[at];
				}
				this[valueSlot] = value;
				this[word] = ((this[word] as number) & ~bit) | ((this[volatileWord] as number) & bit);
				return value;
			} finally {
				F.exit();
			}
		};
		Object.defineProperty(prototype, key, {
			configurable: true,
			get (this: Host) {
				const snapshots = checks.map(check => check(this));
				return (((this[word] as number) ^ F.generation) & (bit | GEN)) === 0 && snapshots.every((snapshot, at) => snapshot === this[snapshotSlots[at]])
					? this[valueSlot]
					: (this[recompute] as (...snapshots: unknown[]) => unknown)(...snapshots);
			},
		});
		Object.defineProperty(prototype, `$${key}`, { configurable: true, get (this: object) { return F.of(this, key, false); } });
	});

	for (const key of forwardKeys) {
		const slot = `${p}f_${key}`;
		const select = layout.forward[key] as (host: Host) => unknown;
		const forwardOf = (host: Host): ForwardSlot => {
			const known = host[slot] as ForwardSlot | null;
			if (known !== null && !known.disposed) {
				return known;
			}
			const bound = F.bindForward(host, key, select(host));
			host[slot] = bound;
			return bound;
		};
		Object.defineProperty(prototype, key, {
			configurable: true,
			get (this: Host) {
				const value = forwardOf(this).value;
				return value === null ? undefined : value;
			},
			set (this: Host, value: unknown) {
				forwardOf(this).set(value === undefined ? null : value);
			},
		});
		Object.defineProperty(prototype, `$${key}`, { configurable: true, get (this: Host) { return forwardOf(this); } });
	}

	return cls as unknown as Constructor;
}
