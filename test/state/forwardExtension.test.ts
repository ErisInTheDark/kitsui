import { describe, expect, it } from "vitest";
import forwardExtension from "../../src/state/extensions/forwardExtension";
import { Owner, State } from "../../src/state/State";
import { captureOrphanCheck } from "../utility/captureOrphanCheck";

forwardExtension();

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const linksOf = (state: State.Readonly<unknown>) => (state as unknown as { immediateLinks: unknown[] | null }).immediateLinks;

function setup () {
	const owner = Owner();
	const key = State<"a" | "b">(owner, "a");
	const a = State(owner, 1);
	const b = State(owner, 2);
	let selects = 0;
	const forward = key.forward(owner, value => {
		selects++;
		return value === "a" ? a : b;
	});
	return { a, b, forward, key, owner, selects: () => selects };
}

describe("State.forward", () => {
	it("reads and writes through the current pick", () => {
		const { a, b, forward } = setup();
		expect(forward.value).toBe(1);

		forward.set(5);
		expect(a.value).toBe(5);
		expect(b.value).toBe(2);
		expect(forward.value).toBe(5);

		forward.update(value => value + 1);
		expect(a.value).toBe(6);
	});

	it("follows a source change, hearing only the new pick", () => {
		const { a, b, forward, key, owner } = setup();
		const heard: Array<[number, number]> = [];
		forward.subscribeImmediate(owner, (value, previous) => heard.push([value, previous]));

		key.set("b");
		expect(forward.value).toBe(2);
		expect(heard).toEqual([[2, 1]]);

		a.set(9);
		expect(heard).toEqual([[2, 1]]);
		b.set(3);
		expect(heard).toEqual([[2, 1], [3, 2]]);

		forward.set(4);
		expect(b.value).toBe(4);
		expect(a.value).toBe(9);
	});

	it("doesn't notify a re-point to an equal value, by the new pick's equality", () => {
		const owner = Owner();
		const key = State<"a" | "b">(owner, "a");
		const a = State(owner, { n: 1 });
		const b = State(owner, { n: 1 }, { equals: (x, y) => x.n === y.n });
		const forward = key.forward(owner, value => value === "a" ? a : b);
		let heard = 0;
		forward.subscribeImmediate(owner, () => heard++);

		key.set("b");
		expect(forward.value).toBe(b.value);
		expect(heard).toBe(0);

		b.set({ n: 2 });
		expect(heard).toBe(1);
		expect(forward.value).toEqual({ n: 2 });
	});

	it("selects only when the source changes, not per read or pick write", () => {
		const { a, forward, key, selects } = setup();
		expect(selects()).toBe(1);

		void forward.value;
		void forward.value;
		a.set(7);
		forward.set(8);
		expect(selects()).toBe(1);

		key.set("b");
		void forward.value;
		expect(selects()).toBe(2);
	});

	it("batches eager listeners like map, coalescing to the final value", async () => {
		const { a, forward, key, owner } = setup();
		const heard: Array<[number, number]> = [];
		forward.subscribe(owner, (value, previous) => heard.push([value, previous]));

		a.set(3);
		key.set("b");
		key.set("a");
		expect(heard).toEqual([]);
		await tick();
		expect(heard).toEqual([[3, 1]]);
	});

	it("refuses to write a readonly pick", () => {
		const owner = Owner();
		const key = State(owner, 0);
		const fixed = State.Readonly(4);
		const forward = key.forward(owner, () => fixed);

		expect(forward.isMutable()).toBe(false);
		expect(() => (forward as unknown as State<number>).set(1)).toThrow(TypeError);
		expect(forward.value).toBe(4);
	});

	it("requires an owner and a state from select", () => {
		const owner = Owner();
		const key = State(owner, 0);
		expect(() => key.forward(null as never, () => key)).toThrow(TypeError);
		expect(() => key.forward(owner, () => 1 as never)).toThrow(TypeError);
	});

	it("leaves nothing linked on the source or picks once its owner disposes", () => {
		const sources = Owner();
		const key = State(sources, "a");
		const a = State(sources, 1);
		const b = State(sources, 2);
		let selects = 0;
		const scope = Owner();
		const forward = key.forward(scope, value => (selects++, value === "a" ? a : b));
		forward.subscribe(scope, () => { });
		expect(linksOf(a)).toHaveLength(1);
		expect(linksOf(key)).toHaveLength(1);

		scope.dispose();
		expect(forward.disposed).toBe(true);
		expect(linksOf(a)).toBeNull();
		expect(linksOf(key)).toBeNull();
		key.set("b");
		expect(selects).toBe(1);
		expect(linksOf(b)).toBeNull();
	});

	it("unlinks the old pick on a re-point", () => {
		const { a, b, forward, key, owner } = setup();
		forward.subscribe(owner, () => { });
		key.set("b");
		expect(linksOf(a)).toBeNull();
		expect(linksOf(b)).toHaveLength(1);
	});

	it("is disposed with its source", () => {
		const { forward, key } = setup();
		key.dispose();
		expect(forward.disposed).toBe(true);
	});

	it("links nothing while nobody listens, selecting only when read", () => {
		const { a, b, forward, key, selects } = setup();
		expect(linksOf(key)).toBeNull();
		expect(linksOf(a)).toBeNull();

		key.set("b");
		key.set("a");
		key.set("b");
		expect(selects()).toBe(1);
		expect(forward.value).toBe(2);
		expect(selects()).toBe(2);
		expect(linksOf(b)).toBeNull();
	});

	it("links while subscribed and unlinks after the last listener leaves, without a stale delivery on return", () => {
		const { a, b, forward, key, owner, selects } = setup();
		const heard: Array<[number, number]> = [];
		const stop = forward.subscribeImmediate(owner, (value, previous) => heard.push([value, previous]));
		const other = forward.subscribeImmediate(owner, () => { });
		a.set(5);
		expect(heard).toEqual([[5, 1]]);

		stop();
		expect(linksOf(a)).toHaveLength(1);
		other();
		expect(linksOf(key)).toBeNull();
		expect(linksOf(a)).toBeNull();

		key.set("b");
		b.set(3);
		expect(selects()).toBe(1);

		forward.subscribeImmediate(owner, (value, previous) => heard.push([value, previous]));
		b.set(4);
		expect(heard).toEqual([[5, 1], [4, 3]]);
		key.set("a");
		expect(heard).toEqual([[5, 1], [4, 3], [5, 4]]);
	});

	it("a forward of a forward links its source only while the outer one is subscribed", () => {
		const owner = Owner();
		const outerKey = State(owner, 0);
		const { a, forward, key } = setup();
		const outer = outerKey.forward(owner, () => forward);
		expect(linksOf(key)).toBeNull();

		const heard: number[] = [];
		const stop = outer.subscribeImmediate(owner, value => heard.push(value));
		a.set(6);
		key.set("b");
		expect(heard).toEqual([6, 2]);

		stop();
		expect(linksOf(forward)).toBeNull();
		expect(linksOf(key)).toBeNull();
	});

	describe("without an owner", () => {
		it("takes its first subscriber as owner, and an ownerless source along with it, but never the picks", () => {
			const capture = captureOrphanCheck();
			try {
				const pickOwner = Owner();
				const pick = State(pickOwner, 1);
				const key = State(0);
				const forward = key.forward(() => pick);
				expect(forward.getOwner()).toBeNull();

				const subscriber = Owner();
				forward.subscribe(subscriber, () => undefined);
				expect(forward.getOwner()).toBe(subscriber);
				expect(key.getOwner()).toBe(subscriber);
				expect(pick.getOwner()).toBe(pickOwner);
				expect(() => capture.orphanCheck?.()).not.toThrow();
				expect(capture.queuedError).toBeNull();

				subscriber.dispose();
				expect(forward.disposed).toBe(true);
				expect(pick.disposed).toBe(false);
				pickOwner.dispose();
			} finally {
				capture.restore();
			}
		});

		it("is an orphan if nothing owns it by the next tick", () => {
			const capture = captureOrphanCheck();
			try {
				const owner = Owner();
				const forward = State(owner, 0).forward(() => State(owner, 1));
				expect((capture.orphanError() as { orphan?: unknown }).orphan).toBe(forward);
				owner.dispose();
			} finally {
				capture.restore();
			}
		});
	});
});

describe("State.forward to a list", () => {
	function setupList () {
		const owner = Owner();
		const a = State(owner, 1);
		const b = State(owner, 2);
		const c = State(owner, 3);
		const picked = State<readonly State<number>[]>(owner, [a, b]);
		let selects = 0;
		const forward = picked.forward(owner, states => (selects++, states));
		return { a, b, c, forward, owner, picked, selects: () => selects };
	}

	it("reads every pick's value, exact after each write, and keeps one array while nothing changed", () => {
		const { a, b, forward } = setupList();
		const first = forward.value;
		expect(first).toEqual([1, 2]);
		expect(forward.value).toBe(first);

		b.set(5);
		expect(forward.value).toEqual([1, 5]);
		a.set(4);
		expect(forward.value).toEqual([4, 5]);
	});

	it("notifies once per change, comparing each value by its own state's equality", () => {
		const owner = Owner();
		const plain = State(owner, 1);
		const loose = State(owner, { n: 1 }, { equals: (x, y) => x.n === y.n });
		const key = State(owner, 0);
		const forward = key.forward(owner, () => [plain, loose] as const);
		const heard: Array<readonly [number, { n: number }]> = [];
		forward.subscribeImmediate(owner, value => heard.push(value));

		loose.set({ n: 1 });
		expect(heard).toEqual([]);
		plain.set(2);
		expect(heard).toEqual([[2, { n: 1 }]]);
	});

	it("follows a new list, keeping links of states still picked and dropping the rest", () => {
		const { a, b, c, forward, owner, picked } = setupList();
		const heard: number[][] = [];
		forward.subscribeImmediate(owner, value => heard.push([...value]));
		const kept = linksOf(b)![0];

		picked.set([b, c]);
		expect(forward.value).toEqual([2, 3]);
		expect(heard).toEqual([[2, 3]]);
		expect(linksOf(a)).toBeNull();
		expect(linksOf(b)![0]).toBe(kept);
		expect(linksOf(c)).toHaveLength(1);

		a.set(9);
		expect(heard).toEqual([[2, 3]]);
		c.set(4);
		expect(heard).toEqual([[2, 3], [2, 4]]);
	});

	it("re-selects only when the source changes", () => {
		const { a, forward, picked, selects } = setupList();
		void forward.value;
		a.set(7);
		void forward.value;
		expect(selects()).toBe(1);
		picked.set([a]);
		void forward.value;
		expect(selects()).toBe(2);
	});

	it("links a state picked twice once, and an empty list reads empty", () => {
		const { a, forward, owner, picked } = setupList();
		forward.subscribe(owner, () => { });
		picked.set([a, a]);
		expect(forward.value).toEqual([1, 1]);
		expect(linksOf(a)).toHaveLength(1);
		picked.set([]);
		expect(forward.value).toEqual([]);
		expect(linksOf(a)).toBeNull();
	});

	it("is readonly, and select must keep its form", () => {
		const { a, forward, owner } = setupList();
		expect(forward.isMutable()).toBe(false);
		expect(() => (forward as unknown as State<number[]>).set([1])).toThrow(TypeError);

		const key = State(owner, 0);
		const mixed = key.forward(owner, value => (value === 0 ? [a] : a) as never);
		key.set(1);
		expect(() => mixed.value).toThrow(TypeError);
		expect(() => key.forward(owner, () => [1] as never)).toThrow(TypeError);
	});

	it("leaves nothing linked once its owner disposes", () => {
		const sources = Owner();
		const a = State(sources, 1);
		const picked = State<readonly State<number>[]>(sources, [a]);
		const scope = Owner();
		picked.forward(scope, states => states).subscribe(scope, () => { });
		expect(linksOf(a)).toHaveLength(1);
		scope.dispose();
		expect(linksOf(a)).toBeNull();
		expect(linksOf(picked)).toBeNull();
	});
});
