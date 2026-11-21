import { afterEach, describe, expect, it } from "vitest";
import { Component } from "../../src/component/Component";
import placeExtension from "../../src/component/extensions/placeExtension";
import { accessorMode, Fields, runtime } from "../../src/state/Fields";
import { LazyState } from "../../src/state/LazyState";
import forwardExtension from "../../src/state/extensions/forwardExtension";
import groupExtension from "../../src/state/extensions/groupExtension";
import mappingExtension from "../../src/state/extensions/mappingExtension";
import { Owner, State } from "../../src/state/State";

forwardExtension();
mappingExtension();
placeExtension();

const F = Fields;
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
let computes = 0;
const countedComputes = (run: () => void) => {
	const before = computes;
	run();
	return computes - before;
};

afterEach(() => {
	LazyState.flush();
	LazyState.flush();
});

/* eslint-disable */
type Slots = Record<string, any>;

// ---- A model, declared as an author or a compiler would.

const ItemModel = F.define(Owner, "Item", {
	state: { quality: 1, bonus: undefined as number | undefined, power: 0 },
	derived: {
		baseAttack: {
			reads: ["bonus"],
			checks: { "this.description.attack": (item: Slots) => item.description?.attack },
			get: (item: Slots) => (computes++, (item.description.attack ?? 0) + (item.bonus ?? 0)),
		},
		attack: {
			reads: ["quality"],
			checks: { "this.baseAttack": (item: Slots) => item.baseAttack },
			get: (item: Slots) => (computes++, Math.round(item.baseAttack * item.quality)),
		},
		defense: { reads: ["power"], get: (item: Slots) => (computes++, item.power * 2) },
		preservation: { volatile: true, get: (item: Slots) => (computes++, item.description.preservation ?? 0) },
	},
});

class Item extends ItemModel {
	[key: string]: any;
	constructor (public description: { attack?: number; preservation?: number } = {}) {
		super();
	}
}

// ---- Permutations, built the same way

interface Spec {
	name: string;
	parent?: any;
	state?: Record<string, unknown>;
	derived?: Record<string, {
		body: (self: any) => unknown;
		edges?: string[];
		/** Each check by the path it reads. */
		guards?: Record<string, (self: any) => unknown>;
		volatile?: boolean;
	}>;
}

function emit (spec: Spec): any {
	const { name, parent = Owner, state = {}, derived = {} } = spec;
	return F.define(parent, name, {
		state,
		derived: Object.fromEntries(Object.entries(derived).map(([key, entry]) => [key, {
			checks: entry.guards,
			get: (self: any) => (computes++, entry.body(self)),
			reads: entry.edges,
			volatile: entry.volatile,
		}])),
	});
}


const Base = emit({
	derived: { doubled: { body: self => self.tactics * 2, edges: ["tactics"] } },
	name: "Base",
	state: { tactics: 0 },
});
Base.prototype.plainBonus = 0;

const Human = emit({
	derived: {
		attack: {
			body: self => self.tactics + self.doubled + self.plainBonus + (self.mainHand?.attack ?? 0),
			guards: {
				"this.tactics": self => self.tactics,
				"this.doubled": self => self.doubled,
				"this.plainBonus": self => self.plainBonus,
				"this.mainHand.attack": self => self.mainHand?.attack,
			},
		},
	},
	name: "Human",
	parent: Base,
	state: { mainHand: undefined },
});

describe("Fields: reads", () => {
	it("computes nothing until read, and once per change", () => {
		const item = new Item({ attack: 10 });
		expect(countedComputes(() => {
			for (let index = 0; index < 100; index++) {
				item.quality = index + 1;
			}
		})).toBe(0);
		item.quality = 2;
		expect(item.attack).toBe(20);
		expect(countedComputes(() => item.attack)).toBe(0);
		item.bonus = 5;
		expect(item.attack).toBe(30);
		expect(countedComputes(() => item.attack)).toBe(0);
	});

	it("only dirties what depends on the written field", () => {
		const item = new Item({ attack: 10 });
		void [item.attack, item.defense];
		item.power = 1;
		expect(countedComputes(() => item.attack)).toBe(0);
		expect(item.defense).toBe(2);
		expect(countedComputes(() => item.defense)).toBe(0);
		item.quality = 3;
		expect(countedComputes(() => item.defense)).toBe(0);
	});

	it("writing the same value dirties nothing", () => {
		const item = new Item({ attack: 10 });
		void item.attack;
		item.quality = 1;
		expect(countedComputes(() => item.attack)).toBe(0);
	});

	it("a throwing body stays dirty and leaves nothing computing", () => {
		const Failing = emit({
			derived: { value: { body: self => { if (self.bad) throw new Error("bad"); return 1; }, edges: ["bad"] } },
			name: "Failing",
			state: { bad: true },
		});
		const host = new Failing();
		expect(() => host.value).toThrow("bad");
		expect(F.computing).toBe(0);
		expect(() => host.value).toThrow("bad");
		host.bad = false;
		expect(host.value).toBe(1);
	});

	it("reads in a parent constructor before subclass fields exist compute rather than return undefined", () => {
		const Early = emit({ derived: { value: { body: () => 7 } }, name: "Early" });
		const seen: unknown[] = [];
		class Reads extends Owner {
			constructor () {
				super();
				seen.push((this as Slots).value);
			}
		}
		const Sub = emit({ derived: { value: { body: () => 7 } }, name: "EarlySub", parent: Reads });
		void new Sub();
		void new Early();
		expect(seen).toEqual([7]);
	});
});

describe("Fields: across entities and files", () => {
	it("follows a swapped source, with cut-off on equal values", () => {
		const human = new Human();
		const a = new Item({ attack: 10 });
		const b = new Item({ attack: 7 });
		expect(human.attack).toBe(0);
		human.mainHand = a;
		expect(human.attack).toBe(10);
		a.quality = 2;
		expect(human.attack).toBe(20);
		expect(countedComputes(() => human.attack)).toBe(0);
		human.mainHand = b;
		expect(human.attack).toBe(7);
		a.quality = 3;
		expect(countedComputes(() => expect(human.attack).toBe(7))).toBe(0);
		human.mainHand = undefined;
		expect(human.attack).toBe(0);
		human.mainHand = b;
		void human.attack;
		b.quality = 1.03; // rounds to the same attack: the item recomputes, the human doesn't
		expect(countedComputes(() => expect(human.attack).toBe(7))).toBe(1);
	});

	it("is exact whatever the path turns out to be", () => {
		const human = new Human();
		human.tactics = 2; // inherited state
		expect(human.attack).toBe(6); // plus inherited derived
		human.plainBonus = 10; // plain field from another class
		expect(human.attack).toBe(16);
		const duck = { attack: 5 };
		human.mainHand = duck;
		expect(human.attack).toBe(21);
		duck.attack = 6; // plain data behind the path
		expect(human.attack).toBe(22);
		human.mainHand = new Item({ attack: 100 });
		expect(human.attack).toBe(116);
		human.mainHand.quality = 2;
		expect(human.attack).toBe(216);
		expect(countedComputes(() => human.attack)).toBe(0);
	});

	it("reaches through several entities, mods' classes included", () => {
		const Aura = emit({
			derived: { power: { body: self => self.level * 2 + (self.target?.attack ?? 0), edges: ["level"], guards: { "this.target.attack": self => self.target?.attack } } },
			name: "Aura",
			state: { level: 1, target: undefined },
		});
		const aura = new Aura();
		const human = new Human();
		const weapon = new Item({ attack: 10 });
		human.mainHand = weapon;
		aura.target = human;
		expect(aura.power).toBe(12);
		weapon.quality = 3;
		expect(aura.power).toBe(32);
		aura.level = 2;
		expect(aura.power).toBe(34);
	});

	it("a volatile body runs on every read and consumers on its mask follow", () => {
		let outside = 1;
		const Walks = emit({
			derived: {
				walked: { body: () => outside, volatile: true },
				consumer: { body: self => self.walked + 1, edges: ["walked"] },
				other: { body: self => self.unrelated },
			},
			name: "Walks",
			state: { unrelated: 1 },
		});
		const host = new Walks();
		expect(host.consumer).toBe(2);
		outside = 5;
		expect(host.consumer).toBe(6);
		expect(host.walked).toBe(5);
		void host.other;
		expect(countedComputes(() => host.other)).toBe(0);
	});
});

describe("Fields: dirty words", () => {
	const manyKeys = Array.from({ length: 50 }, (_, index) => `d${index}`);
	const Many = emit({
		derived: Object.fromEntries(manyKeys.map((key, index) => [key, {
			body: (self: any) => (index % 2 ? self.odd : self.even) + index,
			edges: [index % 2 ? "odd" : "even"],
		}])),
		name: "Many",
		state: { even: 0, odd: 100 },
	});

	it("handles more than one word, with bits at every boundary", () => {
		const host = new Many();
		for (const key of manyKeys) void host[key];
		for (const key of manyKeys) expect(countedComputes(() => host[key])).toBe(0);
		host.even = 1;
		for (const key of manyKeys) {
			const index = Number(key.slice(1));
			expect(countedComputes(() => expect(host[key]).toBe((index % 2 ? 100 : 1) + index))).toBe(index % 2 ? 0 : 1);
		}
		host.odd = 200;
		for (const key of manyKeys) {
			const index = Number(key.slice(1));
			expect(countedComputes(() => expect(host[key]).toBe((index % 2 ? 200 : 1) + index))).toBe(index % 2 ? 1 : 0);
		}
	});

	it("reaches the second word with compose and generation", () => {
		const mod = Owner();
		const host = new Many();
		void [host.d0, host.d23, host.d45];
		Many.compose.d45(mod, (_: unknown, value: number) => value + 1000);
		expect(host.d45).toBe(1045 + 100);
		expect(host.d0).toBe(0);
		mod.dispose();
		expect(host.d45).toBe(145);
	});

	it("keeps words per class, so a chain of classes can't collide", () => {
		const Sub = emit({
			derived: { sub: { body: self => self.subField + 1, edges: ["subField"] } },
			name: "ManySub",
			parent: Many,
			state: { subField: 1 },
		});
		const host = new Sub();
		void [host.sub, host.d0];
		host.even = 5;
		expect(countedComputes(() => host.sub)).toBe(0);
		expect(host.d0).toBe(5);
		host.subField = 2;
		expect(countedComputes(() => host.d0)).toBe(0);
		expect(host.sub).toBe(3);
	});
});

describe("Fields: inheritance", () => {
	it("override: parent's consumers follow state only the subclass knows", () => {
		const Parent = emit({
			derived: {
				value: { body: () => 1 },
				consumer: { body: self => self.value + 10, edges: ["value"] },
			},
			name: "OverrideParent",
		});
		const Child = emit({
			derived: { value: { body: self => self.extra, edges: ["extra"] } },
			name: "OverrideChild",
			parent: Parent,
			state: { extra: 2 },
		});
		const parent = new Parent();
		const child = new Child();
		expect(parent.consumer).toBe(11);
		expect(child.consumer).toBe(12);
		child.extra = 3;
		expect(child.consumer).toBe(13);
		expect(countedComputes(() => child.consumer)).toBe(0);
		expect(countedComputes(() => parent.consumer)).toBe(0);
	});

	describe("guards rooted in the lineage", () => {
		const Parent = emit({
			derived: { doubled: { body: self => self.level * 2, edges: ["level"] } },
			name: "LineageParent",
			state: { level: 1 },
		});
		Parent.prototype.plain = 0;
		const Child = emit({
			derived: {
				fromState: { body: self => self.level + 100, guards: { "this.level": self => self.level } },
				fromDerived: { body: self => self.doubled + 100, guards: { "this.doubled": self => self.doubled } },
				fromPlain: { body: self => self.plain + 100, guards: { "this.plain": self => self.plain } },
				fromObject: { body: self => (self.held?.level ?? 0) + 100, guards: { "this.held.level": self => self.held?.level } },
			},
			name: "LineageChild",
			parent: Parent,
			state: { held: undefined },
		});
		const Reader = emit({ derived: { total: { body: () => 0 } }, name: "LineageReader" });

		/** A compose on a separate host, reading `child.$key`: it's only told by pushes, so it shows what a write reaches. */
		const readerOf = (child: Slots, key: string) => {
			const mod = Owner();
			Reader.compose.total(mod, () => child[`$${key}`], (_reader: unknown, _value: number, read: number) => read);
			return { reader: new Reader(), mod };
		};

		it("pushes an inherited state or derived like an own read: cached, and lazy readers exact the same tick", () => {
			const child = new Child();
			for (const key of ["fromState", "fromDerived"]) {
				const { reader, mod } = readerOf(child, key);
				const before = reader.total;
				child.level++;
				expect(reader.total).toBe(key === "fromState" ? before + 1 : before + 2);
				expect(countedComputes(() => child[key])).toBe(0);
				mod.dispose();
			}
			expect(countedComputes(() => LazyState.flush())).toBe(0);
		});

		it("keeps a plain-field root or a path into a state's object exact on read, and polls its $x", async () => {
			const child = new Child();
			const other = new Parent();
			child.held = other;
			const owner = Owner();
			const heard: number[] = [];
			child.$fromPlain.subscribe(owner, (value: number) => heard.push(value));
			child.$fromObject.subscribe(owner, (value: number) => heard.push(value));

			child.plain = 5;
			other.level = 7;
			expect(child.fromPlain).toBe(105);
			expect(child.fromObject).toBe(107);
			await tick();
			expect(heard.sort()).toEqual([105, 107]);
			owner.dispose();
		});
	});

	it("super.x reads the parent's own slot, and mappers run once", () => {
		const Parent = emit({ derived: { value: { body: () => 1 } }, name: "SuperParent" });
		const parentAccessor = Object.getOwnPropertyDescriptor(Parent.prototype, "value")!.get!;
		const Child = emit({
			derived: { value: { body: self => parentAccessor.call(self) + 1, guards: { "super.value": self => parentAccessor.call(self) } } },
			name: "SuperChild",
			parent: Parent,
		});
		const child = new Child();
		expect(child.value).toBe(2);
		const mod = Owner();
		Parent.compose.value(mod, (_: unknown, value: number) => value * 10);
		expect(child.value).toBe(20);
		expect(new Parent().value).toBe(10);
		mod.dispose();
		expect(child.value).toBe(2);
	});

	it("rejects a repeated class name, a repeated field, names that aren't identifiers, and a derived without get", () => {
		const Named = emit({ name: "Repeated" });
		expect(() => emit({ name: "Repeated", parent: Named })).toThrow("already a class name");
		expect(() => F.define(Owner, "Twice", { state: { x: 1 }, derived: { x: { get: () => 1 } } })).toThrow("twice");
		expect(() => F.define(Owner, "not a name", {})).toThrow(TypeError);
		expect(() => F.define(Owner, "BadField", { state: { "a-b": 1 } })).toThrow(TypeError);
		expect(() => F.define(Owner, "Constructor", { state: { constructor: 1 } })).toThrow(TypeError);
		expect(() => F.define(Owner, "NoGet", { derived: { x: {} as never } })).toThrow("get");
	});

	it("gives a model over 22 derived several dirty words, with bits at every boundary", () => {
		const derived: Record<string, { body: (self: any) => unknown; edges: string[] }> = {};
		for (let index = 0; index < 50; index++) {
			derived[`d${index}`] = { body: self => self.level + index, edges: ["level"] };
		}
		const Wide = emit({ derived, name: "Wide", state: { level: 0 } });
		const wide = new Wide();
		expect(wide.d0 + wide.d21 + wide.d22 + wide.d49).toBe(0 + 21 + 22 + 49);
		wide.level = 1;
		expect([wide.d0, wide.d21, wide.d22, wide.d49]).toEqual([1, 22, 23, 50]);
		expect(countedComputes(() => void [wide.d0, wide.d21, wide.d22, wide.d49])).toBe(0);
	});

	it("builds the same behaviour from closures where code generation is refused", () => {
		accessorMode.closures = true;
		try {
			const Closed = emit({
				derived: {
					doubled: { body: self => self.level * 2, edges: ["level"] },
					checked: { body: self => self.doubled + (self.extra ?? 0), edges: ["doubled"], guards: { "this.extra": self => self.extra } },
				},
				name: "Closed",
				state: { level: 1 },
			});
			const closed = new Closed();
			expect(closed.checked).toBe(2);
			closed.level = 3;
			expect(closed.checked).toBe(6);
			closed.extra = 4;
			expect(closed.checked).toBe(10);
			expect(countedComputes(() => closed.checked)).toBe(0);
			const mod = Owner();
			Closed.compose.doubled(mod, (_: unknown, value: number) => value + 1);
			expect(closed.checked).toBe(11);
			mod.dispose();
			expect(closed.$level.value).toBe(3);
		} finally {
			accessorMode.closures = false;
		}
	});

	it("reads a forward field's unset value as undefined, and writes undefined as the state's null", () => {
		const Holder = F.define(Owner, "UnsetHolder", {
			state: { own: undefined as number | undefined },
			forward: { quality: (self: Slots) => self.$own },
		}) as any;
		const holder = new Holder();
		expect(holder.quality).toBeUndefined();
		expect(holder.$quality.value).toBeNull();
		holder.quality = 3;
		expect(holder.own).toBe(3);
		holder.quality = undefined;
		expect(holder.own).toBeUndefined();
		expect(holder.quality).toBeUndefined();
	});

	it("declares forward fields that read and write the selected state, with that state as their $x", () => {
		const Doodad = emit({ name: "DeclDoodad", state: { quality: 1 } });
		const Holder = F.define(Owner, "DeclHolder", {
			state: { held: null as Slots | null, own: 0 },
			derived: { score: { reads: ["quality"], get: (self: Slots) => (computes++, self.quality * 10) } },
			forward: { quality: (self: Slots) => self.$held.forward(self, (held: Slots | null) => held?.$quality ?? self.$own) },
		}) as any;
		const holder = new Holder();
		const doodad = new Doodad();
		expect(holder.score).toBe(0);
		holder.held = doodad;
		expect(holder.score).toBe(10);
		doodad.quality = 4;
		expect(holder.score).toBe(40);
		holder.quality = 6;
		expect(doodad.quality).toBe(6);
		expect(holder.$quality.value).toBe(6);
		expect(holder.$quality).toBe(holder.$quality);
		holder.held = null;
		expect(holder.score).toBe(0);
	});
});

describe("Fields: compose", () => {
	const linksOn = (state: State<unknown>) => (state as Slots)["immediateLinks"]?.length ?? 0;

	it("a mapper without inputs caches, and unload lands the same tick", () => {
		const mod = Owner();
		const item = new Item({ attack: 10 });
		void item.attack;
		Item.compose.baseAttack(mod, (_, value) => value + 1);
		expect(item.attack).toBe(11);
		expect(countedComputes(() => item.attack)).toBe(0);
		mod.dispose();
		expect(item.attack).toBe(10);
		expect(countedComputes(() => item.attack)).toBe(0);
	});

	describe("under a lock", () => {
		const chainOf = () => (Item.prototype as Slots)._$Item$c_baseAttack as readonly unknown[] | null;

		it("leaves the class untouched while locked, then applies every compose at once on unlock", () => {
			const lock = Owner();
			const locked = State(lock, false);
			F.lock(lock, locked);
			const item = new Item({ attack: 10 });
			void item.attack;

			locked.set(true);
			const mods = [Owner(), Owner(), Owner()];
			mods.forEach((mod, index) => Item.compose.baseAttack(mod, (_, value) => value + index + 1));
			expect(chainOf()).toBeNull();

			locked.set(false);
			expect(chainOf()).toHaveLength(3);
			expect(item.attack).toBe(16);

			locked.set(true);
			mods.forEach(mod => mod.dispose());
			expect(chainOf()).toHaveLength(3);
			locked.set(false);
			expect(chainOf()).toBeNull();
			expect(item.attack).toBe(10);
			lock.dispose();
		});

		it("keeps reads exact while locked, for composes added and removed", () => {
			const lock = Owner();
			const locked = State(lock, true);
			F.lock(lock, locked);
			const item = new Item({ attack: 10 });
			expect(item.attack).toBe(10);

			const mod = Owner();
			Item.compose.baseAttack(mod, (_, value) => value * 2);
			expect(item.attack).toBe(20);
			expect(countedComputes(() => item.attack)).toBe(0);

			mod.dispose();
			expect(item.attack).toBe(10);
			lock.dispose();
		});

		it("stays locked while any lock is true, and a disposed lock's owner releases it", () => {
			const first = Owner();
			const second = Owner();
			const firstLocked = State(first, true);
			const secondLocked = State(second, true);
			F.lock(first, firstLocked);
			F.lock(second, secondLocked);

			const mod = Owner();
			Item.compose.baseAttack(mod, (_, value) => value + 1);
			firstLocked.set(false);
			expect(chainOf()).toBeNull();

			second.dispose();
			expect(chainOf()).toHaveLength(1);
			mod.dispose();
			expect(chainOf()).toBeNull();
			first.dispose();
		});
	});

	it("an input change dirties that derived and its consumers at once, and nothing else", () => {
		const mod = Owner();
		const shared = State(mod, 1);
		const item = new Item({ attack: 10 });
		Item.compose.baseAttack(mod, () => shared, (_, value, extra) => value + extra);
		expect(item.attack).toBe(11);
		expect(item.defense).toBe(0);
		expect(countedComputes(() => item.attack)).toBe(0);
		shared.set(5);
		expect(countedComputes(() => item.defense)).toBe(0);
		expect(item.attack).toBe(15);
		expect(countedComputes(() => item.attack)).toBe(0);
		mod.dispose();
		expect(item.attack).toBe(10);
		expect(linksOn(shared)).toBe(0);
	});

	it("a tuple and a group are both exact mid-tick", () => {
		groupExtension();
		const mod = Owner();
		const a = State(mod, 1);
		const b = State(mod, 2);
		const item = new Item({ attack: 0 });
		const tuple = Owner();
		Item.compose.defense(tuple, () => [a, b], (_, value, [x, y]) => value + x * 100 + y);
		expect(item.defense).toBe(102);
		a.set(3);
		expect(item.defense).toBe(302);
		tuple.dispose();

		const group = State.Group(mod, { a, b });
		const grouped = Owner();
		Item.compose.defense(grouped, () => group, (_, value, { a: x, b: y }) => value + x * 100 + y);
		expect(item.defense).toBe(302);
		a.set(4);
		expect(item.defense).toBe(402);
		grouped.dispose();
		mod.dispose();
	});

	it("release unlinks the host from its inputs, and a reused host rebinds", () => {
		class Reusable extends Item {
			release () {
				super.release();
			}
		}
		const mod = Owner();
		const shared = State(mod, 1);
		Item.compose.defense(mod, () => shared, (_, value, extra) => value + extra);
		const item = new Reusable();
		const other = new Item();
		expect(item.defense).toBe(1);
		expect(other.defense).toBe(1);
		item.release();
		shared.set(2);
		expect(other.defense).toBe(2);
		other.dispose();
		expect(linksOn(shared)).toBe(0);
		shared.set(3);
		expect(item.defense).toBe(3);
		shared.set(4);
		expect(item.defense).toBe(4);
		expect(shared.disposed).toBe(false);
		mod.dispose();
	});

	it("reads an input the host owns, per host", () => {
		const mod = Owner();
		Item.compose.defense(mod, (host: Slots): State<number> => host.charge ??= State(host as Item, 1), (_, value, charge) => value + charge);
		const first = new Item() as Slots;
		const second = new Item() as Slots;
		expect([first.defense, second.defense]).toEqual([1, 1]);
		first.charge.set(7);
		expect([first.defense, second.defense]).toEqual([7, 1]);
		expect(countedComputes(() => second.defense)).toBe(0);
		first.dispose();
		second.charge.set(3);
		expect(second.defense).toBe(3);
		mod.dispose();
	});

	it("$x notifies on an input change, and compares registered value classes by value", async () => {
		class Amount {
			constructor (readonly value: number) { }
		}
		F.equality(Amount, (a, b) => a.value === b.value);
		const mod = Owner();
		const shared = State(mod, 1);
		Item.compose.defense(mod, () => shared, (_, value, extra) => new Amount(value + extra) as never);
		const item = new Item();
		const seen: number[] = [];
		LazyState.of<Amount>(item, "defense", false).subscribe(item, amount => seen.push(amount.value));
		shared.set(2);
		await tick();
		expect(seen).toEqual([2]);
		item.power = 1;
		item.power = 0;
		await tick();
		expect(seen).toEqual([2]);
		item.power = 5;
		await tick();
		expect(seen).toEqual([2, 12]);
		item.dispose();
		mod.dispose();
	});

	it("a $x of the host itself is a mask edge: exact the same tick, nothing watched, other hosts untouched", () => {
		const mod = Owner();
		const shared = State(mod, 1);
		Item.compose.defense(mod, item => [item.$quality, shared], (_, value, [quality, extra]) => value + quality * 10 + extra);
		const item = new Item();
		const other = new Item();
		expect([item.defense, other.defense]).toEqual([11, 11]);
		item.quality = 3;
		expect(item.defense).toBe(31);
		expect(countedComputes(() => other.defense)).toBe(0);
		expect(runtime.observing).toBe(0);
		shared.set(2);
		expect([item.defense, other.defense]).toEqual([32, 12]);
		mod.dispose();
		expect(item.defense).toBe(0);
		item.quality = 4;
		expect(countedComputes(() => item.defense)).toBe(0);
	});

	it("a $x of the host declared by another class stays exact by rerunning", () => {
		const Sword = emit({ name: "EdgeSword", parent: Item, state: { edge: 1 } });
		const mod = Owner();
		Item.compose.defense(mod, (host: Slots) => host.$edge, (_, value, edge) => value + (edge as number));
		const sword = new Sword();
		expect(sword.defense).toBe(1);
		sword.edge = 5;
		expect(sword.defense).toBe(5);
		mod.dispose();
		expect(sword.defense).toBe(0);
	});

	it("an input change reaches lazy readers on other hosts while the bits it dirties stay set, as a volatile's do", () => {
		const Charm = emit({
			derived: {
				glow: { body: () => 1, volatile: true },
				magic: { body: self => self.glow * 10, edges: ["glow"] },
			},
			name: "FullCharm",
		});
		const Bearer = emit({
			derived: { total: { body: self => self.magic + 1, edges: ["magic"] } },
			name: "FullBearer",
			state: { held: undefined, magic: 0, own: 0 },
		});
		const forwards = new WeakMap<object, State.Readonly<number>>();
		Object.defineProperty(Bearer.prototype, "magic", {
			configurable: true,
			get (this: Slots) {
				let forward = forwards.get(this);
				if (forward === undefined) {
					forward = this.$held.forward(this, (held: Slots | null) => held?.$magic ?? this.$own) as State.Readonly<number>;
					F.forward(this, "magic", forward);
					forwards.set(this, forward);
				}
				return forward.value;
			},
		});

		const mod = Owner();
		const level = State(mod, 0);
		Charm.compose.glow(mod, () => level, (_: unknown, value: number, extra: number) => value + extra);
		const charm = new Charm();
		const bearer = new Bearer();
		bearer.held = charm;
		expect(bearer.total).toBe(11);

		level.set(2);
		expect(charm.magic).toBe(30);
		expect(bearer.total).toBe(31);
		level.set(3);
		expect(bearer.total).toBe(41);
		mod.dispose();
	});

	it("selects again on each compute: follows a replaced inner object, unlinks the old one", () => {
		const mod = Owner();
		const NONE = State(mod, 0);
		class Inner extends Owner {
			readonly input: State<number>;
			constructor (value: number) {
				super();
				this.input = State(this, value);
			}
		}
		const Holder = emit({ derived: { value: { body: () => 0 } }, name: "InnerHolder", state: { inner: undefined } });
		Holder.compose.value(mod, (host: Slots) => [host.$inner, host.inner?.input ?? NONE], (_: unknown, value: number, [, extra]: [unknown, number]) => value + extra);
		const holder = new Holder();
		expect(holder.value).toBe(0);
		const first = new Inner(1);
		holder.inner = first;
		expect(holder.value).toBe(1);
		first.input.set(5);
		expect(holder.value).toBe(5);
		const second = new Inner(7);
		holder.inner = second;
		expect(holder.value).toBe(7);
		expect(linksOn(first.input)).toBe(0);
		expect(linksOn(NONE)).toBe(0);
		first.input.set(100);
		expect(countedComputes(() => holder.value)).toBe(0);
		second.input.set(8);
		expect(holder.value).toBe(8);
		mod.dispose();
	});

	it("keeps the same link while the selected states stay the same", () => {
		const mod = Owner();
		const shared = State(mod, 1);
		Item.compose.defense(mod, () => shared, (_, value, extra) => value + extra);
		const item = new Item();
		void item.defense;
		const record = (shared as Slots)["immediateLinks"][0].head;
		for (let power = 1; power < 5; power++) {
			item.power = power;
			void item.defense;
		}
		shared.set(2);
		void item.defense;
		expect((shared as Slots)["immediateLinks"][0].head).toBe(record);
		expect(record.next).toBeNull();
		mod.dispose();
	});

	it("a host with inputs must be an Owner", () => {
		const mod = Owner();
		const shared = State(mod, 1);
		const Bare = emit({ derived: { value: { body: () => 1 } }, name: "BareHost", parent: class { } as never });
		Bare.compose.value(mod, () => shared, (_: unknown, value: number, extra: number) => value + extra);
		expect(() => new Bare().value).toThrow("must be an Owner");
		mod.dispose();

		const wrong = Owner();
		Item.compose.defense(wrong, () => undefined as never, (_, value) => value);
		expect(() => new Item().defense).toThrow("must select states");
		wrong.dispose();
	});

	it("reaches subclasses defined later, only down the chain, in load order", () => {
		const first = Owner();
		const second = Owner();
		const Sword = emit({
			derived: { enchanted: { body: self => self.attack + self.enchant, edges: ["enchant"], guards: { "this.attack": self => self.attack } } },
			name: "Sword",
			parent: Item,
			state: { enchant: 0 },
		});
		const sword = new Sword({ attack: 10 });
		const plain = new Item({ attack: 10 });
		Item.compose.defense(first, (_, value) => value + 1);
		Sword.compose.defense(second, (_: unknown, value: number) => value * 2);
		expect(sword.defense).toBe(2);
		expect(plain.defense).toBe(1);
		sword.enchant = 100;
		expect(sword.enchanted).toBe(110);
		sword.quality = 2;
		expect(sword.enchanted).toBe(120);
		second.dispose();
		expect(sword.defense).toBe(1);
		first.dispose();
		expect(sword.defense).toBe(0);
	});

	it("a plain subclass scopes its own compose", () => {
		class Plain extends Item { }
		const mod = Owner();
		(Plain as unknown as typeof Item).compose.defense(mod, (_, value) => value + 1);
		expect(new Plain().defense).toBe(1);
		expect(new Item().defense).toBe(0);
		mod.dispose();
	});

	it("reaches through to cross-entity consumers on both load and unload", () => {
		const mod = Owner();
		const human = new Human();
		human.mainHand = new Item({ attack: 10 });
		expect(human.attack).toBe(10);
		Item.compose.attack(mod, (_, value) => value + 1);
		expect(human.attack).toBe(11);
		mod.dispose();
		expect(human.attack).toBe(10);
	});

	it("has only derived keys, and maps immutable values for a tooltip to walk", () => {
		expect(Object.keys(Item.compose).sort()).toEqual(["attack", "baseAttack", "defense", "preservation"]);
		expect((Item.compose as Slots).quality).toBeUndefined();

		class Expression {
			constructor (readonly value: number, readonly terms: readonly string[]) { }
			add (term: string, amount: number) {
				return new Expression(this.value + amount, [...this.terms, term]);
			}
		}
		const Priced = emit({
			derived: {
				price: { body: self => new Expression(self.base, ["base"]), edges: ["base"] },
				total: { body: self => self.price.add("tax", 2), edges: ["price"] },
			},
			name: "Priced",
			state: { base: 10 },
		});
		const mod = Owner();
		const host = new Priced();
		const before = host.total;
		Priced.compose.price(mod, (_: unknown, value: Expression) => value.add("Power", 5));
		expect(host.total.value).toBe(17);
		expect(host.total.terms).toEqual(["base", "Power", "tax"]);
		expect(before.value).toBe(12);
		mod.dispose();
		expect(host.total.terms).toEqual(["base", "tax"]);
	});

	it("rejects a non-owner, and runs nothing for an already disposed owner", () => {
		expect(() => Item.compose.defense({} as Owner, (_, value) => value)).toThrow("must be an Owner");
		const gone = Owner();
		gone.dispose();
		Item.compose.defense(gone, () => 99);
		expect(new Item().defense).toBe(0);
	});

	it("a burst of composes spends one generation, and the generation is never zero", () => {
		void new Item().defense;
		const before = runtime.generation;
		const mod = Owner();
		for (let index = 0; index < 1000; index++) {
			Item.compose.defense(mod, (_, value) => value);
		}
		expect(runtime.generation).not.toBe(before);
		expect(runtime.generation).toBe((before + (1 << 22)) & 0x3FC00000 || 1 << 22);
		mod.dispose();

		const item = new Item();
		for (let index = 0; index < 600; index++) {
			void item.defense;
			const each = Owner();
			Item.compose.defense(each, (_, value) => value);
			expect(runtime.generation).not.toBe(0);
			each.dispose();
		}
	});
});

describe("LazyState", () => {
	it("is a real, memoized state, exact mid-tick, with listeners batched", async () => {
		const owner = Owner();
		const item = new Item({ attack: 10 });
		const attack = item.$attack;
		expect(attack).toBeInstanceOf(State);
		expect(item.$attack).toBe(attack);
		const observingBefore = runtime.observing;
		item.quality = 2;
		expect(attack.value).toBe(20);
		const heard: Array<[number, number]> = [];
		attack.subscribe(owner, (value, previous) => heard.push([value, previous]));
		expect(runtime.observing).toBe(observingBefore + 1);
		item.quality = 3;
		item.quality = 4;
		expect(attack.value).toBe(40);
		expect(heard).toEqual([]);
		await tick();
		expect(heard).toEqual([[40, 20]]);
		owner.dispose();
		item.dispose();
	});

	it("doesn't report what changed before anyone listened", async () => {
		const owner = Owner();
		const item = new Item({ attack: 10 });
		const attack = item.$attack;
		item.quality = 2;
		const heard: number[] = [];
		attack.subscribe(owner, value => heard.push(value));
		item.bonus = 0;
		LazyState.flush();
		await tick();
		expect(heard).toEqual([]);
		owner.dispose();
	});

	it("drives a real component across entities", async () => {
		const human = new Human();
		human.mainHand = new Item({ attack: 10 });
		const label = Component("span").appendTo(document.body).text.set(human.$attack.map(human, (value: number) => `atk ${value}`));
		expect(label.element.textContent).toBe("atk 10");
		human.mainHand.quality = 2;
		await tick();
		expect(label.element.textContent).toBe("atk 20");
		human.mainHand = new Item({ attack: 3 });
		await tick();
		expect(label.element.textContent).toBe("atk 3");
		label.dispose();
		human.dispose();
	});

	it("writes through for state, refuses for derived, maps undefined to null", () => {
		const human = new Human();
		const item = new Item({ attack: 10 });
		item.$quality.set(3);
		expect(item.quality).toBe(3);
		expect(item.attack).toBe(30);
		item.$quality.update(value => value + 1);
		expect(item.attack).toBe(40);
		expect(item.$quality.isMutable()).toBe(true);
		expect(item.$attack.isMutable()).toBe(false);
		expect(() => (item.$attack as State<number>).set(1)).toThrow("derived");
		expect(human.$mainHand.value).toBe(null);
		human.$mainHand.set(item);
		expect(human.mainHand === item).toBe(true);
		human.$mainHand.set(null);
		expect(human.mainHand).toBe(undefined);
	});

	it("tells immediate listeners during the write, nested writes included, as any state does", () => {
		const owner = Owner();
		const item = new Item({ attack: 10 });
		const seen: number[] = [];
		item.$attack.subscribeImmediate(owner, value => {
			seen.push(value);
			if (value === 20) {
				item.quality = 3;
				expect(item.attack).toBe(30);
			}
		});
		item.quality = 2;
		expect(seen).toEqual([20, 30]);
		owner.dispose();
	});

	it("tells subscribe listeners in one flush with other states' listeners, after their own state's immediate ones", async () => {
		const owner = Owner();
		const item = new Item({ attack: 10 });
		const plain = State(owner, 0);
		const order: string[] = [];
		item.$attack.subscribe(owner, () => order.push("model"));
		plain.subscribe(owner, () => order.push("plain"));
		item.$quality.subscribeImmediate(owner, () => order.push("immediate"));
		item.quality = 2;
		plain.set(1);
		expect(order).toEqual(["immediate"]);
		await tick();
		expect(order.slice(1).sort()).toEqual(["model", "plain"]);
		owner.dispose();
	});

	it("keeps delivering to the others when a listener throws, then rethrows", () => {
		const owner = Owner();
		const a = new Item({ attack: 1 });
		const b = new Item({ attack: 1 });
		let reached = false;
		a.$attack.subscribe(owner, () => { throw new Error("listener"); });
		b.$attack.subscribe(owner, () => { reached = true; });
		a.quality = 2;
		b.quality = 2;
		try {
			expect(() => LazyState.flush()).toThrow("listener");
			expect(reached).toBe(true);
		} finally {
			owner.dispose();
		}
	});

	it("is disposed with its host, leaves the poll, and a new one can be asked for", () => {
		const host = new Item({ attack: 1 });
		const owner = Owner();
		const before = runtime.observing;
		const state = host.$attack;
		state.subscribe(owner, () => { });
		expect(runtime.observing).toBe(before + 1);
		(state as unknown as State<number>).dispose();
		expect(runtime.observing).toBe(before);
		expect(host.$attack).not.toBe(state);
		host.dispose();
		expect(host.$attack.disposed).toBe(true);
		owner.dispose();
	});

	it("leaves the poll at the next flush after its last listener", () => {
		const owner = Owner();
		const item = new Item({ attack: 1 });
		const before = runtime.observing;
		item.$attack.subscribe(owner, () => { });
		owner.dispose();
		expect(runtime.observing).toBe(before + 1);
		LazyState.flush();
		expect(runtime.observing).toBe(before);
	});

	it("rejects a host that isn't an Owner", () => {
		expect(() => LazyState.of({}, "value", false)).toThrow("must be an Owner");
	});

	it("lazy to lazy is instant across compiled hosts, chained, and lazy to eager is one batched delivery", async () => {
		const Stats = emit({ name: "LazyStats", state: { level: 1 } });
		const Outer = emit({ derived: { value: { body: () => 0 } }, name: "LazyOuter" });
		const mod = Owner();
		Item.compose.defense(mod, (item: Slots): State<number> => item.stats.$level, (_, value, level) => value + level);
		Outer.compose.value(mod, (outer: Slots) => LazyState.of<number>(outer.item, "defense", false), (_: unknown, value: number, defense: number) => value + defense * 10);
		const stats = new Stats();
		const item = new Item() as Slots;
		item.stats = stats;
		const outer = new Outer();
		outer.item = item;
		expect(outer.value).toBe(10);
		stats.level = 5;
		expect(item.defense).toBe(5);
		expect(outer.value).toBe(50);
		expect(runtime.observing).toBe(0);

		const seen: number[] = [];
		outer.$value.subscribe(mod, (value: number) => seen.push(value));
		stats.level = 6;
		stats.level = 7;
		expect(outer.value).toBe(70);
		expect(seen).toEqual([]);
		await tick();
		expect(seen).toEqual([70]);
		mod.dispose();
	});

	it("keeps a host's states off its own enumerable properties, so copies don't share them", () => {
		const item = new Item({ attack: 1 });
		void item.$quality;
		expect(Object.keys(item)).not.toContain("_$lazy");
		const copy = Object.assign(Object.create(Item.prototype), item) as Slots;
		expect(copy._$lazy).toBeNull();
		expect(new Item()._$lazy).toBeNull();
	});
});

describe("Fields: forward", () => {
	const Doodad = emit({ name: "FwdDoodad", state: { quality: 1 } });
	const Holder = emit({
		derived: { score: { body: self => self.quality * 10, edges: ["quality"] } },
		name: "FwdHolder",
		state: { held: undefined, ownQuality: 0, quality: 0 },
	});
	// A `state quality forwards ...` field, the way a compiler would emit one: created on first access, then declared to Fields.
	const forwarded = (self: Slots): State<number> => self._fwd ??= (() => {
		const forward = self.$held.forward(self, (held: Slots | null) => held?.$quality ?? self.$ownQuality);
		F.forward(self, "quality", forward);
		return forward;
	})();
	Object.defineProperty(Holder.prototype, "quality", {
		configurable: true,
		get (this: Slots) { return forwarded(this).value; },
		set (this: Slots, v) { forwarded(this).set(v); },
	});
	const linksOf = (state: State.Readonly<unknown>) => (state as unknown as { immediateLinks: unknown[] | null }).immediateLinks;

	it("dirties the host's own readers mid-tick on a write to the pick, a re-point, and a write to the new pick", () => {
		const holder = new Holder();
		const doodad = new Doodad();
		expect(holder.score).toBe(0);

		holder.ownQuality = 2;
		expect(holder.score).toBe(20);

		holder.held = doodad;
		expect(holder.quality).toBe(1);
		expect(holder.score).toBe(10);

		doodad.quality = 3;
		expect(holder.score).toBe(30);

		holder.quality = 4;
		expect(doodad.quality).toBe(4);
		expect(holder.ownQuality).toBe(2);
		expect(holder.score).toBe(40);

		holder.held = undefined;
		expect(holder.score).toBe(20);
		doodad.quality = 9;
		expect(holder.score).toBe(20);
	});

	it("caches between writes, and the field's $x hears once per tick", async () => {
		const holder = new Holder();
		const doodad = new Doodad();
		holder.held = doodad;
		const owner = Owner();
		const heard: Array<[number, number]> = [];
		holder.$quality.subscribe(owner, (value: number, previous: number) => heard.push([value, previous]));

		const reads = countedComputes(() => {
			void holder.score;
			void holder.score;
		});
		expect(reads).toBe(1);

		doodad.quality = 5;
		doodad.quality = 6;
		expect(holder.score).toBe(60);
		await tick();
		expect(heard).toEqual([[6, 1]]);
		owner.dispose();
	});

	it("leaves the host's readers cached on writes to states that aren't the pick", () => {
		const holder = new Holder();
		const first = new Doodad();
		const second = new Doodad();
		void holder.score;
		holder.held = first;
		void holder.score;
		holder.held = second;
		expect(holder.score).toBe(10);

		expect(countedComputes(() => {
			holder.ownQuality = 5;
			first.quality = 6;
			new Doodad().quality = 7;
			void holder.score;
		})).toBe(0);

		second.quality = 8;
		expect(holder.score).toBe(80);
	});

	it("leaves the host's readers cached when the source changes but the pick doesn't", () => {
		const holder = new Holder();
		void holder.score;
		expect(countedComputes(() => {
			holder.held = null;
			void holder.score;
		})).toBe(0);
	});

	it("a $x subscribed before the field is read hears writes to the pick", async () => {
		const holder = new Holder();
		const doodad = new Doodad();
		const owner = Owner();
		const heard: number[] = [];
		holder.$quality.subscribe(owner, (value: number) => heard.push(value));
		holder.held = doodad;
		doodad.quality = 4;
		await tick();
		expect(heard).toEqual([4]);
		owner.dispose();
	});

	it("a field forwarding to a list of picks keeps the host's readers exact and cached over writes and swaps", () => {
		const Wearer = emit({
			derived: { total: { body: self => (self.qualities as readonly number[]).reduce((sum, value) => sum + value, 0), edges: ["qualities"] } },
			name: "FwdWearer",
			state: { equipped: [], qualities: [] },
		});
		const lists = new WeakMap<object, State.Readonly<readonly number[]>>();
		const qualities = (self: Slots) => {
			const known = lists.get(self);
			if (known !== undefined) {
				return known.value;
			}

			const forward: State.Readonly<readonly number[]> = self.$equipped.forward(self, (items: readonly Slots[] | null) => (items ?? []).map(item => item.$quality as State<number>));
			F.forward(self, "qualities", forward);
			lists.set(self, forward);
			return forward.value;
		};
		Object.defineProperty(Wearer.prototype, "qualities", { configurable: true, get (this: Slots) { return qualities(this); } });

		const wearer = new Wearer();
		const first = new Doodad();
		const second = new Doodad();
		const spare = new Doodad();
		wearer.equipped = [first, second];
		expect(wearer.total).toBe(2);

		first.quality = 5;
		expect(wearer.total).toBe(6);
		expect(countedComputes(() => {
			void wearer.total;
			spare.quality = 9;
			void wearer.total;
		})).toBe(0);

		wearer.equipped = [second, spare];
		expect(wearer.total).toBe(10);
		expect(countedComputes(() => {
			first.quality = 7;
			void wearer.total;
		})).toBe(0);
		spare.quality = 2;
		expect(wearer.total).toBe(3);
	});

	describe("over picks reading inherited state", () => {
		const descriptions: Record<string, { readonly attack: number }> = { club: { attack: 3 }, sword: { attack: 4 } };
		const Entity = emit({ name: "FwdEntity", state: { name: "", type: "club" } });
		// An inherited read is a guard, and so is a path under a guarded derived. Both roots are in the lineage, so both are pushed.
		const Weapon = emit({
			derived: {
				description: { body: self => descriptions[self.type], guards: { "this.type": self => self.type } },
				attack: { body: self => self.description.attack * self.quality, edges: ["quality"], guards: { "this.description.attack": self => self.description?.attack } },
			},
			name: "FwdWeapon",
			parent: Entity,
			state: { quality: 1 },
		});
		const Wearer = emit({
			derived: { total: { body: self => (self.attacks as readonly number[]).reduce((sum, value) => sum + value, 0), edges: ["attacks"] } },
			name: "FwdArmed",
			state: { attacks: [], equipped: [] },
		});
		const lists = new WeakMap<object, State.Readonly<readonly number[]>>();
		Object.defineProperty(Wearer.prototype, "attacks", {
			configurable: true,
			get (this: Slots) {
				let forward = lists.get(this);
				if (forward === undefined) {
					forward = this.$equipped.forward(this, (items: readonly Slots[] | null) => (items ?? []).map(item => item.$attack as State<number>)) as State.Readonly<readonly number[]>;
					F.forward(this, "attacks", forward);
					lists.set(this, forward);
				}
				return forward.value;
			},
		});

		it("keeps an unwatched holder's total exact the same tick after a pick's inherited state changes in place, without polling", () => {
			const wearer = new Wearer();
			const weapon = new Weapon();
			wearer.equipped = [weapon];
			expect(wearer.total).toBe(3);

			weapon.type = "sword";
			expect(weapon.attack).toBe(4);
			expect(wearer.total).toBe(4);
			expect(countedComputes(() => LazyState.flush())).toBe(0);
		});

		it("is exact even when nothing read the pick in between", () => {
			const wearer = new Wearer();
			const weapon = new Weapon();
			wearer.equipped = [weapon];
			expect(wearer.total).toBe(3);

			weapon.type = "sword";
			expect(wearer.total).toBe(4);
		});

		it("leaves the holder's total cached on writes that don't reach its picks' values", () => {
			const wearer = new Wearer();
			const weapon = new Weapon();
			const spare = new Weapon();
			wearer.equipped = [weapon];
			expect(wearer.total).toBe(3);

			expect(countedComputes(() => {
				spare.type = "sword";
				spare.quality = 5;
				weapon.name = "renamed";
				void wearer.total;
			})).toBe(0);
		});
	});

	it("a forward as a compose input dirties its consumers at write time", () => {
		const Reader = emit({ derived: { total: { body: () => 0 } }, name: "FwdReader" });
		const holder = new Holder();
		const doodad = new Doodad();
		holder.held = doodad;
		const mod = Owner();
		Reader.compose.total(mod, () => forwarded(holder), (_reader: unknown, value: number, quality: number) => value + quality);
		const reader = new Reader();
		expect(reader.total).toBe(1);

		doodad.quality = 7;
		expect(reader.total).toBe(7);
		mod.dispose();
	});

	it("leaves picks nobody subscribes to unpolled on flush, while still dirtying the host's readers", () => {
		const Polled = emit({ derived: { power: { body: self => self.base * 2, edges: ["base"], volatile: true } }, name: "FwdPolled", state: { base: 1 } });
		const Watcher = emit({ derived: { score: { body: self => self.power * 10, edges: ["power"] } }, name: "FwdWatcher", state: { held: undefined, own: 0, power: 0 } });
		const forwards = new WeakMap<object, State.Readonly<number>>();
		const power = (self: Slots) => {
			let forward = forwards.get(self);
			if (forward === undefined) {
				forward = self.$held.forward(self, (held: Slots | null) => held?.$power ?? self.$own) as State.Readonly<number>;
				F.forward(self, "power", forward);
				forwards.set(self, forward);
			}
			return forward;
		};
		Object.defineProperty(Watcher.prototype, "power", { configurable: true, get (this: Slots) { return power(this).value; } });

		const watcher = new Watcher();
		const source = new Polled();
		watcher.held = source;
		expect(watcher.score).toBe(20);
		LazyState.flush();
		expect(countedComputes(() => LazyState.flush())).toBe(0);

		source.base = 3;
		expect(watcher.score).toBe(60);
		expect(countedComputes(() => LazyState.flush())).toBe(0);

		const owner = Owner();
		const heard: number[] = [];
		power(watcher).subscribeImmediate(owner, value => heard.push(value));
		source.base = 4;
		LazyState.flush();
		expect(heard).toEqual([8]);

		owner.dispose();
		LazyState.flush();
		expect(countedComputes(() => LazyState.flush())).toBe(0);
		source.base = 5;
		expect(watcher.score).toBe(100);
	});

	it("a compose input over a Group map leaves its sources unobserved, yet dirties at write time and sees in-place updates", () => {
		groupExtension();
		const Polled = emit({ derived: { power: { body: self => self.base * 2, edges: ["base"], volatile: true } }, name: "MapPolled", state: { base: 1 } });
		const Reader = emit({ derived: { total: { body: () => 0 } }, name: "MapReader" });
		const source = new Polled();
		const mod = Owner();
		const bonuses = State(mod, new Map<string, number>());
		let maps = 0;
		const skill = State.Group(mod, { bonuses, power: source.$power as State<number> }).map(mod, ({ bonuses, power }) => (maps++, power + (bonuses.get("archery") ?? 0)));
		Reader.compose.total(mod, () => skill, (_reader: unknown, value: number, level: number) => value + level);
		const reader = new Reader();
		expect(reader.total).toBe(2);
		LazyState.flush();
		const before = maps;
		expect(countedComputes(() => LazyState.flush())).toBe(0);
		expect(maps).toBe(before);

		source.base = 3;
		expect(reader.total).toBe(6);
		bonuses.update(map => void map.set("archery", 4));
		expect(reader.total).toBe(10);
		expect(countedComputes(() => LazyState.flush())).toBe(0);
		mod.dispose();
	});

	it("unlinks with the host's release", () => {
		const holder = new Holder();
		const doodad = new Doodad();
		holder.held = doodad;
		void holder.score;
		expect(linksOf(doodad.$quality)).toHaveLength(1);

		holder.release();
		expect(linksOf(doodad.$quality)).toBeNull();
	});

	it("rejects a key that isn't a state, and a host that isn't an Owner", () => {
		const holder = new Holder();
		const state = State(Owner(), 0);
		expect(() => F.forward(holder, "score", state)).toThrow();
		expect(() => F.forward({}, "quality", state)).toThrow(TypeError);
	});
});

describe("Fields: determinism and development guards", () => {
	function makeRandom (seed: number) {
		return {
			seed,
			next () {
				if (F.computing !== 0) {
					throw new Error("roll inside a derived");
				}
				this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
				return this.seed / 4294967296;
			},
		};
	}

	function run (peek: boolean, withInput: boolean) {
		const random = makeRandom(1234);
		const peeks = makeRandom(99);
		const mod = Owner();
		const items = Array.from({ length: 50 }, (_, index) => new Item({ attack: 5 + index }));
		const humans = Array.from({ length: 5 }, () => new Human());
		const input = State(mod, 1);
		if (withInput) {
			Item.compose.attack(mod, () => input, (_, value, extra) => value + extra);
		} else {
			Item.compose.defense(mod, (_, value) => value + 1);
		}
		const trace: number[] = [];
		for (let step = 0; step < 5000; step++) {
			const roll = random.next();
			const item = items[Math.floor(random.next() * items.length)];
			const human = humans[Math.floor(random.next() * humans.length)];
			if (roll < 0.3) {
				item.quality = Math.floor(random.next() * 5);
			} else if (roll < 0.5) {
				item.power = Math.floor(random.next() * 5);
			} else if (roll < 0.7) {
				human.mainHand = random.next() < 0.1 ? undefined : item;
			} else if (roll < 0.8) {
				input.set(Math.floor(random.next() * 9));
			} else {
				trace.push(human.attack + item.attack + item.defense);
			}
			if (peek && peeks.next() < 0.5) {
				void items[Math.floor(peeks.next() * items.length)].attack;
				void humans[Math.floor(peeks.next() * humans.length)].attack;
			}
		}
		mod.dispose();
		return { seed: random.seed, trace };
	}

	it("a peer reading more ends with the same trace and seed", () => {
		for (const withInput of [false, true]) {
			const a = run(false, withInput);
			const b = run(true, withInput);
			expect(a.trace.length).toBeGreaterThan(500);
			expect(b.seed).toBe(a.seed);
			expect(b.trace).toEqual(a.trace);
		}
	});

	it("verify catches a mapper lying about its reads, across parent classes too, and repairs it", () => {
		const mod = Owner();
		const item = new Item({ attack: 10 });
		let plain = 1;
		Item.compose.defense(mod, (_, value) => value + plain);
		void item.defense;
		expect(F.verify(item)).toEqual([]);
		plain = 2;
		expect(item.defense).toBe(1);
		expect(F.verify(item)).toEqual([{ cached: 1, fresh: 2, key: "defense" }]);
		expect(item.defense).toBe(2);
		mod.dispose();

		const human = new Human();
		human.tactics = 1;
		void human.doubled;
		expect(F.verify(human)).toEqual([]);
		expect(F.verify({})).toEqual([]);
	});

	it("computing is up during bodies and mappers, and a roll inside throws", () => {
		const mod = Owner();
		const random = makeRandom(1);
		const item = new Item({ attack: 10 });
		Item.compose.defense(mod, (_, value) => value + random.next());
		expect(() => item.defense).toThrow("roll inside a derived");
		expect(F.computing).toBe(0);
		mod.dispose();

		const Rolling = emit({ derived: { value: { body: () => random.next(), volatile: true } }, name: "Rolling" });
		expect(() => new Rolling().value).toThrow("roll inside a derived");
		expect(F.computing).toBe(0);
		expect(item.defense).toBe(0);
	});
});
