import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Emitter, Owner, State } from "../../src/index";

interface BaseEvents {
	ping (log: string[]): void;
	check (value: number): boolean | null | undefined;
	add (total: number, extra: number): number;
	wait (): Promise<number> | number;
	moved (x: number, y: number): void;
}

interface RootEvents extends BaseEvents {
	rootOnly (): void;
}

abstract class Root {
	readonly event = new Emitter<this, RootEvents>(this);
}

function hierarchy () {
	class A extends Root { }
	class B extends A { }
	class C extends B { }
	class Sibling extends A { }
	return { A, B, C, Sibling };
}

function logging (log: string[], label: string): () => void {
	return () => {
		log.push(label);
	};
}

function pingLog (emitter: { emit: { ping (log: string[]): unknown } }): string[] {
	const log: string[] = [];
	emitter.emit.ping(log);
	return log;
}

function recording (label: string) {
	return (_host: unknown, log: string[]) => {
		log.push(label);
	};
}

describe("Emitter", () => {
	let warnings: Emitter.Warning[];

	beforeEach(() => {
		warnings = [];
		Emitter.warnings(warning => warnings.push(warning));
	});

	afterEach(() => {
		Emitter.warnings(null);
	});

	describe("class-level inheritance", () => {
		it("fires subscriptions on the concrete class and every superclass, never on siblings or subclasses", () => {
			const { A, B, C, Sibling } = hierarchy();
			Emitter.of(A).on.ping(null, recording("A"));
			Emitter.of(B).on.ping(null, recording("B"));
			Emitter.of(C).on.ping(null, recording("C"));
			Emitter.of(Sibling).on.ping(null, recording("Sibling"));

			expect(pingLog(new C().event)).toEqual(["C", "B", "A"]);
			expect(pingLog(new B().event)).toEqual(["B", "A"]);
			expect(pingLog(new A().event)).toEqual(["A"]);
			expect(pingLog(new Sibling().event)).toEqual(["Sibling", "A"]);
		});

		it("applies a superclass subscription made after a subclass table is resolved, including for instances that already emitted", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			expect(pingLog(instance.event)).toEqual([]);

			Emitter.of(A).on.ping(null, recording("A"));
			expect(pingLog(instance.event)).toEqual(["A"]);
			expect(pingLog(new C().event)).toEqual(["A"]);
		});

		it("applies a superclass subscription to instances that also have instance subscriptions", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			instance.event.on.ping(null, recording("instance"));
			expect(pingLog(instance.event)).toEqual(["instance"]);

			Emitter.of(A).on.ping(null, recording("A"));
			expect(pingLog(instance.event)).toEqual(["A", "instance"]);
		});

		it("removes a superclass unsubscription from resolved tables", () => {
			const { A, C } = hierarchy();
			const handler = recording("A");
			Emitter.of(A).on.ping(null, handler);
			const instance = new C();
			expect(pingLog(instance.event)).toEqual(["A"]);

			Emitter.of(C).off.ping(handler);
			expect(pingLog(instance.event)).toEqual(["A"]);

			Emitter.of(A).off.ping(handler);
			expect(pingLog(instance.event)).toEqual([]);
		});

		it("applies existing superclass subscriptions to subclasses defined later", () => {
			const { B } = hierarchy();
			Emitter.of(B).on.ping(null, recording("B"));
			expect(pingLog(new B().event)).toEqual(["B"]);

			class Later extends B { }
			Emitter.of(Later).on.ping(null, recording("Later"));
			expect(pingLog(new Later().event)).toEqual(["Later", "B"]);
		});

		it("fires a class-level once for one emit, from any instance of the class", () => {
			const { A, B, C } = hierarchy();
			Emitter.of(A).once.ping(null, recording("once"));

			expect(pingLog(new B().event)).toEqual(["once"]);
			expect(pingLog(new C().event)).toEqual([]);
			expect(pingLog(new A().event)).toEqual([]);
		});

		it("releases a class-level subscription when its owner disposes", () => {
			const { A, C } = hierarchy();
			const owner = Owner();
			Emitter.of(A).on.ping(owner, recording("A"));
			const instance = new C();
			expect(pingLog(instance.event)).toEqual(["A"]);

			owner.dispose();
			expect(pingLog(instance.event)).toEqual([]);
		});

		it("keeps other events' tables when one event's class subscriptions change", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			const added: number[] = [];
			Emitter.of(A).on.add(null, (_host, total) => {
				added.push(total);
				return total;
			});
			instance.event.reduce.add(1, 0);

			Emitter.of(A).on.ping(null, recording("A"));
			instance.event.reduce.add(2, 0);
			expect(added).toEqual([1, 2]);
			expect(pingLog(instance.event)).toEqual(["A"]);
		});
	});

	describe("ordering", () => {
		it("fires higher priority first across class levels and the instance", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			instance.event.on.ping(null, recording("instance low"), -10);
			instance.event.on.ping(null, recording("instance high"), 10);
			Emitter.of(A).on.ping(null, recording("A mid"), 5);
			Emitter.of(C).on.ping(null, recording("C low"), -20);
			Emitter.of(A).on.ping(null, recording("A infinite"), Infinity);

			expect(pingLog(instance.event)).toEqual(["A infinite", "instance high", "A mid", "instance low", "C low"]);
		});

		it("breaks ties by concrete class, up the chain, then instance, then insertion order within each", () => {
			const { A, B, C } = hierarchy();
			const instance = new C();
			instance.event.on.ping(null, recording("instance 1"));
			Emitter.of(A).on.ping(null, recording("A 1"));
			Emitter.of(B).on.ping(null, recording("B 1"));
			Emitter.of(C).on.ping(null, recording("C 1"));
			instance.event.on.ping(null, recording("instance 2"));
			Emitter.of(A).on.ping(null, recording("A 2"));
			Emitter.of(C).on.ping(null, recording("C 2"));

			expect(pingLog(instance.event)).toEqual(["C 1", "C 2", "B 1", "A 1", "A 2", "instance 1", "instance 2"]);
		});

		it("orders ties with Infinity priority rather than treating them as unordered", () => {
			const { A, B } = hierarchy();
			Emitter.of(B).on.ping(null, recording("B"), Infinity);
			Emitter.of(A).on.ping(null, recording("A"), Infinity);
			expect(pingLog(new B().event)).toEqual(["B", "A"]);
		});
	});

	describe("class-level handlers as built-in behaviour", () => {
		it("survive close then open, while instance subscriptions do not", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			Emitter.of(A).on.ping(null, recording("class"));
			instance.event.on.ping(null, recording("instance"));

			instance.event.close();
			expect(pingLog(instance.event)).toEqual([]);
			instance.event.open();
			expect(pingLog(instance.event)).toEqual(["class"]);
		});

		it("allocate nothing per instance", () => {
			const { A, C } = hierarchy();
			Emitter.of(A).on.ping(null, recording("class"));
			const instance = new C();
			pingLog(instance.event);
			expect(instance.event["instanceLists"]).toBeNull();
		});
	});

	describe("emit snapshots", () => {
		it("does not fire a subscription added during the emit until the next one", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			instance.event.on.ping(null, (_host, log) => {
				log.push("first");
				instance.event.on.ping(null, recording("added"));
			});
			Emitter.of(A).on.ping(null, (_host, log) => {
				log.push("class");
				Emitter.of(A).on.ping(null, recording("class added"));
			});

			expect(pingLog(instance.event)).toEqual(["class", "first"]);
			expect(pingLog(instance.event)).toEqual(["class", "class added", "first", "added"]);
		});

		it("still fires a subscription removed during the emit, and not on the next", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			const removedInstance = recording("instance");
			const removedClass = recording("class");
			instance.event.on.ping(null, (_host, log) => {
				log.push("remover");
				instance.event.off.ping(removedInstance);
				Emitter.of(A).off.ping(removedClass);
			}, 10);
			instance.event.on.ping(null, removedInstance);
			Emitter.of(A).on.ping(null, removedClass);

			expect(pingLog(instance.event)).toEqual(["remover", "class", "instance"]);
			expect(pingLog(instance.event)).toEqual(["remover"]);
		});

		it("still fires a subscription whose owner disposes during the emit", () => {
			const instance = new (hierarchy().C)();
			const owner = Owner();
			instance.event.on.ping(null, () => owner.dispose(), 10);
			instance.event.on.ping(owner, recording("owned"));

			expect(pingLog(instance.event)).toEqual(["owned"]);
			expect(pingLog(instance.event)).toEqual([]);
		});

		it("gives a reentrant emit the fresh handlers while the outer emit keeps its own", () => {
			const instance = new (hierarchy().C)();
			let nested = false;
			instance.event.on.ping(null, (_host, log) => {
				log.push("outer");
				if (!nested) {
					nested = true;
					instance.event.on.ping(null, recording("added"));
					instance.event.emit.ping(log);
				}
			});

			expect(pingLog(instance.event)).toEqual(["outer", "outer", "added"]);
		});
	});

	describe("subscribing", () => {
		it("treats the same handler and priority as one subscription, keeping its position", () => {
			const instance = new (hierarchy().C)();
			const handler = recording("same");
			instance.event.on.ping(null, handler);
			instance.event.on.ping(null, recording("other"));
			instance.event.on.ping(null, handler);

			expect(pingLog(instance.event)).toEqual(["same", "other"]);
			expect(instance.event.off.ping(handler)).toBe(instance);
			expect(pingLog(instance.event)).toEqual(["other"]);
		});

		it("treats the same handler at another priority as a separate subscription", () => {
			const instance = new (hierarchy().C)();
			const handler = recording("same");
			instance.event.on.ping(null, handler, 1);
			instance.event.on.ping(null, handler, 2);
			expect(pingLog(instance.event)).toEqual(["same", "same"]);

			instance.event.off.ping(handler);
			expect(pingLog(instance.event)).toEqual(["same", "same"]);
			instance.event.off.ping(handler, 1);
			expect(pingLog(instance.event)).toEqual(["same"]);
		});

		it("follows a handler state in its place, firing nothing while it holds null, until off", () => {
			const instance = new (hierarchy().C)();
			const owner = Owner();
			const handler = State<((host: unknown, log: string[]) => void) | null>(owner, null);
			instance.event.on.ping(null, handler);
			instance.event.on.ping(null, recording("after"));
			expect(pingLog(instance.event)).toEqual(["after"]);

			handler.set(recording("first"));
			expect(pingLog(instance.event)).toEqual(["first", "after"]);
			handler.set(recording("second"));
			expect(pingLog(instance.event)).toEqual(["second", "after"]);

			instance.event.off.ping(handler);
			handler.set(recording("third"));
			expect(pingLog(instance.event)).toEqual(["after"]);
			owner.dispose();
		});

		it("keeps a once handler state's subscription until it fires with a handler", () => {
			const instance = new (hierarchy().C)();
			const handler = State<((host: unknown, log: string[]) => void) | null>(Owner(), null);
			instance.event.once.ping(null, handler);
			expect(pingLog(instance.event)).toEqual([]);
			handler.set(recording("once"));
			expect(pingLog(instance.event)).toEqual(["once"]);
			expect(pingLog(instance.event)).toEqual([]);
		});

		it("gives an ownerless handler state its owner, like any subscription", () => {
			const instance = new (hierarchy().C)();
			const owner = Owner();
			const label = State(owner, "mapped");
			instance.event.on.ping(owner, label.map(value => recording(value)));
			expect(pingLog(instance.event)).toEqual(["mapped"]);
			owner.dispose();
			expect(pingLog(instance.event)).toEqual([]);
		});

		it("dedupes the same handler and priority on one class level", () => {
			const { A } = hierarchy();
			const handler = recording("same");
			Emitter.of(A).on.ping(null, handler);
			Emitter.of(A).on.ping(null, handler);
			expect(pingLog(new A().event)).toEqual(["same"]);
		});

		it("lets a resubscribe change once and rebind to the newest owner", () => {
			const instance = new (hierarchy().C)();
			const firstOwner = Owner();
			const secondOwner = Owner();
			const handler = recording("same");
			instance.event.on.ping(firstOwner, handler);
			instance.event.on.ping(secondOwner, handler);

			firstOwner.dispose();
			expect(pingLog(instance.event)).toEqual(["same"]);

			instance.event.once.ping(secondOwner, handler);
			expect(pingLog(instance.event)).toEqual(["same"]);
			expect(pingLog(instance.event)).toEqual([]);
			secondOwner.dispose();
		});

		it("releases an owner-bound subscription on dispose, and removes the cleanup link on off", () => {
			const instance = new (hierarchy().C)();
			const owner = Owner();
			const handler = recording("owned");
			instance.event.on.ping(owner, handler);
			instance.event.off.ping(handler);
			expect(owner["cleanupHead"]).toBeNull();

			instance.event.on.ping(owner, handler);
			owner.dispose();
			expect(pingLog(instance.event)).toEqual([]);
		});

		it("does not subscribe with an owner that has already disposed", () => {
			const instance = new (hierarchy().C)();
			const owner = Owner();
			owner.dispose();
			instance.event.on.ping(owner, recording("late"));
			expect(pingLog(instance.event)).toEqual([]);
		});

		it("rejects a missing owner and an invalid priority", () => {
			const instance = new (hierarchy().C)();
			const on = instance.event.on as unknown as { ping (owner: unknown, handler?: unknown, priority?: unknown): void };
			expect(() => on.ping(() => undefined)).toThrow(TypeError);
			expect(() => on.ping(undefined, () => undefined)).toThrow(TypeError);
			expect(() => on.ping(null, () => undefined, "high")).toThrow(TypeError);
			expect(pingLog(instance.event)).toEqual([]);
		});

		it("subscribes host-owned through owned, for hosts that are owners", () => {
			class OwnerHost extends Owner {
				readonly event = new Emitter<this, BaseEvents>(this);
			}

			const host = new OwnerHost();
			host.event.owned.on.ping(recording("on"));
			host.event.owned.once.ping(recording("once"));
			expect(pingLog(host.event)).toEqual(["on", "once"]);
			expect(pingLog(host.event)).toEqual(["on"]);

			expect(() => (new (hierarchy().C)()).event.owned.on.ping(recording("not an owner"))).toThrow(TypeError);
		});
	});

	describe("once", () => {
		it("fires exactly once, and drops the subscription before the handler runs", () => {
			const instance = new (hierarchy().C)();
			let hadHandlers: boolean | undefined;
			instance.event.once.ping(null, () => {
				hadHandlers = instance.event.has.ping();
			});

			expect(pingLog(instance.event)).toEqual([]);
			expect(hadHandlers).toBe(false);
			instance.event.emit.ping([]);
			expect(hadHandlers).toBe(false);
		});

		it("does not refire in a reentrant emit", () => {
			const instance = new (hierarchy().C)();
			let count = 0;
			instance.event.once.ping(null, () => {
				count++;
				instance.event.emit.ping([]);
			});
			instance.event.emit.ping([]);
			expect(count).toBe(1);
		});

		it("does not refire from an outer emit's snapshot after a nested emit consumed it", () => {
			const instance = new (hierarchy().C)();
			const log: string[] = [];
			instance.event.on.ping(null, () => {
				if (log.length === 0) {
					log.push("nesting");
					instance.event.emit.ping([]);
				}
			}, 10);
			instance.event.once.ping(null, recording("once"));

			instance.event.emit.ping(log);
			expect(log).toEqual(["nesting"]);
		});

		it("is consumed even when its handler throws", () => {
			const instance = new (hierarchy().C)();
			let count = 0;
			instance.event.once.ping(null, () => {
				count++;
				throw new Error("bad");
			});

			expect(() => instance.event.emit.ping([])).toThrow("bad");
			instance.event.emit.ping([]);
			expect(count).toBe(1);
		});
	});

	describe("verbs", () => {
		it("emit passes the host and exact arguments, and returns the host", () => {
			const instance = new (hierarchy().C)();
			const seen: unknown[][] = [];
			instance.event.on.moved(null, (...args) => {
				seen.push(args);
			});
			expect(instance.event.emit.moved(1, 2)).toBe(instance);
			expect(seen).toEqual([[instance, 1, 2]]);
		});

		it("calls handlers without a this", () => {
			const instance = new (hierarchy().C)();
			let receiver: unknown = "unset";
			instance.event.on.ping(null, function (this: unknown) {
				receiver = this;
			});
			instance.event.emit.ping([]);
			expect(receiver).toBeUndefined();
		});

		it("a throwing handler stops the emit and propagates", () => {
			const instance = new (hierarchy().C)();
			const log: string[] = [];
			instance.event.on.ping(null, () => {
				throw new Error("stop");
			}, 1);
			instance.event.on.ping(null, recording("after"));

			expect(() => instance.event.emit.ping(log)).toThrow("stop");
			expect(log).toEqual([]);
		});

		it("first returns the first non-nullish result in priority order, while running every handler", () => {
			const instance = new (hierarchy().C)();
			const log: string[] = [];
			instance.event.on.check(null, () => {
				log.push("null");
				return null;
			}, 3);
			instance.event.on.check(null, () => {
				log.push("false");
				return false;
			}, 2);
			instance.event.on.check(null, () => {
				log.push("true");
				return true;
			}, 1);

			expect(instance.event.first.check(1)).toBe(false);
			expect(log).toEqual(["null", "false", "true"]);
		});

		it("first returns undefined with no result, including when handlers return null", () => {
			const instance = new (hierarchy().C)();
			expect(instance.event.first.check(1)).toBeUndefined();
			instance.event.on.check(null, () => null);
			expect(instance.event.first.check(1)).toBeUndefined();
		});

		it("reduce threads the first argument in priority order, keeping the rest fixed", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			instance.event.on.add(null, (_host, total, extra) => total * 2 + extra, 5);
			Emitter.of(A).on.add(null, (_host, total, extra) => total + 1 + extra);

			expect(instance.event.reduce.add(3, 10)).toBe((3 * 2 + 10) + 1 + 10);
		});

		it("reduce returns its input with no handlers, and threads undefined returned by a handler", () => {
			const instance = new (hierarchy().C)();
			expect(instance.event.reduce.add(3, 0)).toBe(3);

			const seen: unknown[] = [];
			(instance.event.on.add as unknown as (owner: null, handler: () => undefined) => void)(null, () => undefined);
			instance.event.on.add(null, (_host, total) => {
				seen.push(total);
				return 9;
			}, -1);
			expect(instance.event.reduce.add(3, 0)).toBe(9);
			expect(seen).toEqual([undefined]);
		});

		it("collect returns every result in priority order", () => {
			const instance = new (hierarchy().C)();
			instance.event.on.check(null, () => null, -1);
			instance.event.on.check(null, () => true, 1);
			instance.event.on.check(null, () => undefined);
			expect(instance.event.collect.check(1)).toEqual([true, undefined, null]);
			expect(new (hierarchy().C)().event.collect.check(1)).toEqual([]);
		});

		it("async awaits each handler before starting the next, in priority order", async () => {
			const instance = new (hierarchy().C)();
			const log: string[] = [];
			let release!: () => void;
			const gate = new Promise<void>(resolve => {
				release = resolve;
			});
			instance.event.on.wait(null, async () => {
				log.push("first start");
				await gate;
				log.push("first end");
				return 1;
			}, 1);
			instance.event.on.wait(null, () => {
				log.push("second");
				return 2;
			});

			const results = instance.event.async.wait();
			expect(log).toEqual(["first start"]);
			release();
			expect(await results).toEqual([1, 2]);
			expect(log).toEqual(["first start", "first end", "second"]);
		});

		it("parallel starts every handler before any finishes, and a sync throw rejects", async () => {
			const instance = new (hierarchy().C)();
			const log: string[] = [];
			let release!: () => void;
			const gate = new Promise<void>(resolve => {
				release = resolve;
			});
			instance.event.on.wait(null, async () => {
				log.push("first");
				await gate;
				return 1;
			}, 1);
			instance.event.on.wait(null, () => {
				log.push("second");
				return 2;
			});

			const results = instance.event.parallel.wait();
			expect(log).toEqual(["first", "second"]);
			release();
			expect(await results).toEqual([1, 2]);

			const throwing = new (hierarchy().C)();
			throwing.event.on.wait(null, () => {
				throw new Error("sync");
			});
			await expect(throwing.event.parallel.wait()).rejects.toThrow("sync");
		});

		it("has reports class-level and instance subscriptions", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			expect(instance.event.has.ping()).toBe(false);

			const handler = recording("instance");
			instance.event.on.ping(null, handler);
			expect(instance.event.has.ping()).toBe(true);
			instance.event.off.ping(handler);
			expect(instance.event.has.ping()).toBe(false);

			Emitter.of(A).on.moved(null, () => undefined);
			expect(instance.event.has.moved()).toBe(true);
			Emitter.of(A).on.add(null, () => 0);
			expect(instance.event.has.add()).toBe(true);
		});

		it("verb views and methods work for any event name, including object prototype names", () => {
			interface OddEvents {
				constructor (): void;
				toString (): void;
				hasOwnProperty (): void;
			}

			class OddHost {
				readonly event = new Emitter<this, OddEvents>(this);
			}

			const host = new OddHost();
			const log: string[] = [];
			host.event.on.constructor(null, () => void log.push("constructor"));
			host.event.on.toString(null, () => void log.push("toString"));
			host.event.on.hasOwnProperty(null, () => void log.push("hasOwnProperty"));
			host.event.emit.constructor();
			host.event.emit.toString();
			host.event.emit.hasOwnProperty();
			expect(log).toEqual(["constructor", "toString", "hasOwnProperty"]);
		});

		it("keeps emitters isolated when they share materialised verb methods", () => {
			const { C } = hierarchy();
			const first = new C();
			const second = new C();
			first.event.on.ping(null, recording("first"));
			expect(pingLog(first.event)).toEqual(["first"]);
			expect(pingLog(second.event)).toEqual([]);
		});
	});

	describe("next", () => {
		it("resolves with the next emit's arguments, once", async () => {
			const instance = new (hierarchy().C)();
			const next = instance.event.next.moved();
			instance.event.emit.moved(1, 2);
			instance.event.emit.moved(3, 4);
			expect(await next).toEqual([1, 2]);
			expect(instance.event.has.moved()).toBe(false);
		});

		it("rejects and unsubscribes on abort, by signal or owner", async () => {
			const instance = new (hierarchy().C)();

			const controller = new AbortController();
			const bySignal = instance.event.next.moved(controller.signal);
			controller.abort(new Error("cancelled"));
			await expect(bySignal).rejects.toThrow("cancelled");
			expect(instance.event.has.moved()).toBe(false);

			const owner = Owner();
			const byOwner = instance.event.next.moved(owner);
			owner.dispose();
			await expect(byOwner).rejects.toThrow();
			expect(instance.event.has.moved()).toBe(false);

			await expect(instance.event.next.moved(owner)).rejects.toThrow();
			expect(instance.event.has.moved()).toBe(false);
		});

		it("respects priority", async () => {
			const instance = new (hierarchy().C)();
			const log: string[] = [];
			instance.event.on.moved(null, () => void log.push("handler"));
			const next = instance.event.next.moved(null, 10).then(() => log.push("next"));
			instance.event.on.moved(null, () => void log.push("high"), 20);
			instance.event.emit.moved(1, 2);
			await next;
			expect(log).toEqual(["high", "handler", "next"]);
		});
	});

	describe("until", () => {
		it("ends the subscription at the first of chained owners", () => {
			const instance = new (hierarchy().C)();
			const first = Owner();
			const second = Owner();
			instance.event.until(first).until(second).on.ping(recording("until"));
			expect(pingLog(instance.event)).toEqual(["until"]);

			second.dispose();
			expect(pingLog(instance.event)).toEqual([]);
			first.dispose();
		});

		it("ends on a state's next change, whatever the value", () => {
			const instance = new (hierarchy().C)();
			const owner = Owner();
			const state = State(owner, false);
			instance.event.until(state).on.ping(recording("until"));
			expect(pingLog(instance.event)).toEqual(["until"]);

			state.set(true);
			expect(pingLog(instance.event)).toEqual([]);
			owner.dispose();
		});

		it("ends when a promise settles either way", async () => {
			const instance = new (hierarchy().C)();
			instance.event.until(Promise.resolve()).on.ping(recording("resolved"));
			instance.event.until(Promise.reject(new Error("rejected"))).on.ping(recording("rejected"));
			expect(pingLog(instance.event)).toEqual(["resolved", "rejected"]);

			await Promise.resolve();
			await Promise.resolve();
			expect(pingLog(instance.event)).toEqual([]);
		});

		it("ends on another emitter's event through a when trigger, from any of several", () => {
			const instance = new (hierarchy().C)();
			const other = new (hierarchy().C)();
			instance.event.until(other.event.when.rootOnly, other.event.when.moved).on.ping(recording("until"));
			expect(pingLog(instance.event)).toEqual(["until"]);

			other.event.emit.moved(1, 2);
			expect(pingLog(instance.event)).toEqual([]);
			expect(other.event.has.rootOnly()).toBe(false);
			expect(other.event.has.moved()).toBe(false);
		});

		it("describes its emitter and event on a when trigger", () => {
			const instance = new (hierarchy().C)();
			expect(instance.event.when.moved.emitter).toBe(instance.event);
			expect(instance.event.when.moved.event).toBe("moved");
		});

		it("ends on a class-level when trigger, from any instance", () => {
			const { A, B, C } = hierarchy();
			const instance = new C();
			instance.event.until(Emitter.of(B).when.rootOnly).on.ping(recording("until"));

			new A().event.emit.rootOnly();
			expect(pingLog(instance.event)).toEqual(["until"]);
			new C().event.emit.rootOnly();
			expect(pingLog(instance.event)).toEqual([]);
		});

		it("supports once and priority, and removes the trigger subscriptions when consumed", () => {
			const instance = new (hierarchy().C)();
			instance.event.until(new Promise(() => undefined)).once.ping(recording("once"), 5);
			instance.event.on.ping(null, recording("high"), 10);
			expect(pingLog(instance.event)).toEqual(["high", "once"]);
			expect(pingLog(instance.event)).toEqual(["high"]);
		});

		it("warns and does not subscribe once its triggers have fired", () => {
			const instance = new (hierarchy().C)();
			const owner = Owner();
			owner.dispose();
			const until = instance.event.until(owner);
			until.on.ping(recording("late"));

			expect(pingLog(instance.event)).toEqual([]);
			expect(warnings.map(warning => warning.kind)).toEqual(["until-released"]);
		});

		it("rejects triggers it cannot end on", () => {
			const instance = new (hierarchy().C)();
			expect(() => instance.event.until(null as unknown as Owner)).toThrow(TypeError);
			expect(() => instance.event.until({} as Owner)).toThrow(TypeError);
		});

		describe("with an owner per subscription", () => {
			const never = () => new Promise<void>(() => undefined);

			it("ends only that subscription when its owner disposes", () => {
				const instance = new (hierarchy().C)();
				const owner = Owner();
				const until = instance.event.until(never());
				until.on.ping(owner, recording("owned"));
				until.on.ping(recording("sibling"));
				expect(pingLog(instance.event)).toEqual(["owned", "sibling"]);

				owner.dispose();
				expect(pingLog(instance.event)).toEqual(["sibling"]);
			});

			it("ends at the trigger, leaving the owner alive", () => {
				const instance = new (hierarchy().C)();
				const owner = Owner();
				const trigger = Owner();
				instance.event.until(trigger).on.ping(owner, recording("until"));
				expect(pingLog(instance.event)).toEqual(["until"]);

				trigger.dispose();
				expect(pingLog(instance.event)).toEqual([]);
				expect(owner.disposed).toBe(false);
			});

			it("keeps a later subscription of the same handler when an old owner disposes after the trigger", () => {
				const instance = new (hierarchy().C)();
				const owner = Owner();
				const trigger = Owner();
				const handler = recording("handler");
				instance.event.until(trigger).on.ping(owner, handler);
				trigger.dispose();

				instance.event.on.ping(null, handler);
				owner.dispose();
				expect(pingLog(instance.event)).toEqual(["handler"]);
			});

			it("moves to the newest owner when the same handler subscribes again", () => {
				const instance = new (hierarchy().C)();
				const first = Owner();
				const second = Owner();
				const handler = recording("handler");
				const until = instance.event.until(never());
				until.on.ping(first, handler);
				until.on.ping(second, handler);

				first.dispose();
				expect(pingLog(instance.event)).toEqual(["handler"]);
				second.dispose();
				expect(pingLog(instance.event)).toEqual([]);
			});

			it("ends when a reusable owner releases, and the until stays usable", () => {
				class ReusableOwner extends Owner {
					override release (): void {
						super.release();
					}
				}

				const instance = new (hierarchy().C)();
				const owner = new ReusableOwner();
				const until = instance.event.until(never());
				until.on.ping(owner, recording("first"));
				owner.release();
				expect(pingLog(instance.event)).toEqual([]);

				until.on.ping(owner, recording("second"));
				expect(pingLog(instance.event)).toEqual(["second"]);
			});

			it("supports once and priority, and treats a null owner as just the triggers", () => {
				const instance = new (hierarchy().C)();
				const owner = Owner();
				const trigger = Owner();
				const until = instance.event.until(trigger);
				until.once.ping(owner, recording("once"), 5);
				until.on.ping(null, recording("null"), 1);
				instance.event.on.ping(null, recording("high"), 10);
				expect(pingLog(instance.event)).toEqual(["high", "once", "null"]);
				expect(pingLog(instance.event)).toEqual(["high", "null"]);

				trigger.dispose();
				expect(pingLog(instance.event)).toEqual(["high"]);
			});

			it("does not fire for an owner that has already disposed", () => {
				const instance = new (hierarchy().C)();
				const owner = Owner();
				owner.dispose();
				instance.event.until(never()).on.ping(owner, recording("late"));
				expect(pingLog(instance.event)).toEqual([]);
			});

			it("warns and does not subscribe on a closed emitter or a used-up until", () => {
				const closed = new (hierarchy().C)();
				const owner = Owner();
				const trigger = Owner();
				const used = closed.event.until(trigger);
				trigger.dispose();
				used.on.ping(owner, recording("used up"));
				expect(warnings.map(warning => warning.kind)).toEqual(["until-released"]);

				closed.event.close();
				closed.event.until(never()).on.ping(owner, recording("closed"));
				expect(warnings.map(warning => warning.kind)).toEqual(["until-released", "closed-subscribe"]);
				closed.event.open();
				expect(pingLog(closed.event)).toEqual([]);
			});

			it("rejects a value that is not an owner", () => {
				const instance = new (hierarchy().C)();
				expect(() => instance.event.until(never()).on.ping({} as Owner, recording("bad"))).toThrow(TypeError);
			});
		});
	});

	describe("closing", () => {
		it("warns instead of throwing or subscribing, and fires nothing including class-level", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			Emitter.of(A).on.ping(null, recording("class"));
			instance.event.close();
			expect(instance.event.closed).toBe(true);

			expect(instance.event.on.ping(null, recording("late"))).toBe(instance);
			expect(pingLog(instance.event)).toEqual([]);
			expect(instance.event.first.check(1)).toBeUndefined();
			expect(instance.event.reduce.add(1, 0)).toBe(1);
			expect(instance.event.has.ping()).toBe(false);
			expect(warnings.map(warning => warning.kind)).toContain("closed-subscribe");
			expect(warnings.map(warning => warning.kind)).toContain("closed-emit");
		});

		it("releases instance subscriptions from their owners, and open starts empty", () => {
			const instance = new (hierarchy().C)();
			const owner = Owner();
			instance.event.on.ping(owner, recording("owned"));
			instance.event.close();
			expect(owner["cleanupHead"]).toBeNull();

			instance.event.open();
			expect(instance.event.closed).toBe(false);
			expect(pingLog(instance.event)).toEqual([]);
			instance.event.on.ping(null, recording("again"));
			expect(pingLog(instance.event)).toEqual(["again"]);
		});

		it("closes with an owner host, releasing subscriptions other owners hold, and cannot reopen", () => {
			class OwnerHost extends Owner {
				readonly event = new Emitter<this, BaseEvents>(this);
			}

			const host = new OwnerHost();
			const subscriber = Owner();
			host.event.on.ping(subscriber, recording("owned"));
			host.dispose();

			expect(subscriber["cleanupHead"]).toBeNull();
			expect(host.event.closed).toBe(true);
			host.event.open();
			expect(host.event.closed).toBe(true);
			host.event.on.ping(null, recording("late"));
			expect(warnings.map(warning => warning.kind)).toEqual(["closed-subscribe"]);
		});

		it("still emits from an owner host's beforeDispose", () => {
			const log: string[] = [];

			class OwnerHost extends Owner {
				readonly event = new Emitter<this, BaseEvents>(this);

				protected override beforeDispose (): void {
					this.event.emit.ping(log);
				}
			}

			const host = new OwnerHost();
			host.event.owned.on.ping(recording("in dispose"));
			host.dispose();
			expect(log).toEqual(["in dispose"]);
		});

		describe("with a reusable owner host", () => {
			class ReusableHost extends Owner {
				readonly event = new Emitter<this, RootEvents>(this);

				override release (): void {
					super.release();
				}
			}

			it("drops what the host owns, and keeps the emitter open with others' subscriptions on it", () => {
				const host = new ReusableHost();
				const subscriber = Owner();
				const otherEmitter = new ReusableHost();
				host.event.owned.on.ping(recording("owned by host"));
				host.event.on.ping(subscriber, recording("owned by subscriber"));
				host.event.on.ping(null, recording("no owner"));
				const handler = recording("on another emitter, owned by host");
				otherEmitter.event.on.ping(host, handler);

				host.release();

				expect(host.event.closed).toBe(false);
				expect(pingLog(host.event)).toEqual(["owned by subscriber", "no owner"]);
				expect(pingLog(otherEmitter.event)).toEqual([]);
				expect(warnings).toEqual([]);

				host.event.owned.on.ping(recording("owned again"));
				expect(pingLog(host.event)).toEqual(["owned by subscriber", "no owner", "owned again"]);
			});

			it("keeps class-level handlers through a release", () => {
				class Reused extends ReusableHost { }
				Emitter.of(Reused).on.ping(null, recording("class"));
				const host = new Reused();

				host.release();
				expect(pingLog(host.event)).toEqual(["class"]);
			});

			it("still closes at disposal after any number of releases, releasing others' subscriptions", () => {
				const host = new ReusableHost();
				const subscriber = Owner();
				host.event.on.ping(subscriber, recording("owned by subscriber"));

				host.release();
				host.release();
				host.dispose();

				expect(host.event.closed).toBe(true);
				expect(subscriber["cleanupHead"]).toBeNull();
				expect(pingLog(host.event)).toEqual([]);
			});

			it("ends until and next subscriptions bound to the host", async () => {
				const host = new ReusableHost();
				const other = new ReusableHost();
				other.event.until(host).on.ping(recording("until host"));
				const next = other.event.next.moved(host);

				host.release();
				expect(pingLog(other.event)).toEqual([]);
				await expect(next).rejects.toThrow();
				expect(other.event.has.moved()).toBe(false);
			});

			it("keeps a host-owned handler in the running emit's snapshot when the host releases mid-emit", () => {
				const host = new ReusableHost();
				host.event.on.ping(null, () => host.release(), 10);
				host.event.owned.on.ping(recording("owned"));

				expect(pingLog(host.event)).toEqual(["owned"]);
				expect(pingLog(host.event)).toEqual([]);
				expect(host.event.closed).toBe(false);
			});
		});

		it("does not warn when an until on a closed emitter subscribes, beyond the closed report", () => {
			const instance = new (hierarchy().C)();
			instance.event.close();
			instance.event.until(new Promise(() => undefined)).on.ping(recording("late"));
			expect(warnings.map(warning => warning.kind)).toEqual(["closed-subscribe"]);
		});
	});

	describe("leak warnings", () => {
		function subscribeMany (subscribe: (handler: () => void) => void, count: number): void {
			for (let index = 0; index < count; index++) {
				subscribe(() => undefined);
			}
		}

		it("warns past the default limit", () => {
			const instance = new (hierarchy().C)();
			subscribeMany(handler => instance.event.on.ping(null, handler), 200);
			expect(warnings).toEqual([]);
			instance.event.on.ping(null, () => undefined);
			expect(warnings).toEqual([{ count: 201, event: "ping", host: instance, kind: "possible-leak", max: 200 }]);
		});

		it("warns past the limit, per event, counting across priorities", () => {
			const instance = new (hierarchy().C)();
			instance.event.limit.ping(2);
			instance.event.on.ping(null, logging([], "a"), 1);
			instance.event.on.ping(null, logging([], "b"), 2);
			instance.event.on.moved(null, logging([], "other event"));
			expect(warnings).toEqual([]);

			instance.event.on.ping(null, logging([], "c"), 3);
			expect(warnings).toEqual([{ count: 3, event: "ping", host: instance, kind: "possible-leak", max: 2 }]);
		});

		it("honours per-event limits on instances and classes", () => {
			const { A, C } = hierarchy();
			const instance = new C();
			expect(instance.event.limit.ping(1)).toBe(instance);
			subscribeMany(handler => instance.event.on.ping(null, handler), 2);
			expect(warnings).toHaveLength(1);

			Emitter.of(A).limit.moved(1);
			subscribeMany(handler => Emitter.of(A).on.moved(null, handler), 2);
			expect(warnings).toHaveLength(2);
		});

		it("does not count a duplicate subscription", () => {
			const instance = new (hierarchy().C)();
			instance.event.limit.ping(1);
			const handler = recording("same");
			instance.event.on.ping(null, handler);
			instance.event.on.ping(null, handler);
			expect(warnings).toEqual([]);
		});
	});

	describe("hostless emitters", () => {
		it("passes a null host and fires instance subscriptions only", () => {
			const emitter = new Emitter<null, BaseEvents>(null);
			const seen: unknown[] = [];
			emitter.on.moved(null, (host, x) => {
				seen.push(host, x);
			});
			expect(emitter.emit.moved(1, 2)).toBeNull();
			expect(seen).toEqual([null, 1]);
		});

		it("keeps plain-object hosts on their own subscriptions", () => {
			const host = Object.create(null) as object;
			const emitter = new Emitter<object, BaseEvents>(host);
			const log: string[] = [];
			emitter.on.ping(null, () => void log.push("instance"));
			emitter.emit.ping([]);
			expect(log).toEqual(["instance"]);
		});
	});

	describe("migration seam", () => {
		it("lets a subclass make emit callable by overriding its verb getter", () => {
			class CallableEmitter<H, E> extends Emitter<H, E> {
				override get emit (): Emitter.Emit<H, E> & ((event: keyof E, ...args: unknown[]) => H) {
					const view = super.emit as unknown as Record<PropertyKey, (...args: unknown[]) => H>;
					return new Proxy(((event: string, ...args: unknown[]) => view[event](...args)) as object, {
						get: (_, name) => view[name],
					}) as never;
				}
			}

			class ShimHost {
				readonly event = new CallableEmitter<this, BaseEvents>(this);
			}

			const host = new ShimHost();
			const log: string[] = [];
			host.event.on.ping(null, (_host, into) => void into.push("fired"));
			host.event.emit("ping", log);
			host.event.emit.ping(log);
			expect(log).toEqual(["fired", "fired"]);
		});
	});

	describe("default warning", () => {
		it("logs each kind for each event once", () => {
			const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
			try {
				Emitter.warnings(null);
				const instance = new (hierarchy().C)();
				instance.event.close();
				instance.event.emit.rootOnly();
				instance.event.emit.rootOnly();
				expect(log).toHaveBeenCalledTimes(1);
			} finally {
				log.mockRestore();
			}
		});
	});
});
