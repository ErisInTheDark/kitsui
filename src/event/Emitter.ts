import { CleanupLink, isOwner, linkCleanup, type Owner, type State } from "../state/State";
import { cachedView, defineVerb, hasVerb, limitVerb, nextVerb, offVerb, onceVerb, onVerb, ownedOnceVerb, ownedOnVerb, targetOf, until, whenVerb, type View, type ViewConstructor } from "./SubscribeVerbs";
import { anyHandler, classInfoFor, classInfoForHost, findInstanceList, InstanceSubscriptionList, NO_SUBSCRIPTIONS, resolveHandlers, setWarningHandler, subscribe, warn, type ClassInfo, type EventCell, type HandlerInput, type InstanceLists, type Subscription } from "./Subscriptions";

type ArgsOf<F> = F extends (...args: infer A) => unknown ? A : never;
type ReturnOf<F> = F extends (...args: never[]) => infer R ? R : never;
type TailOf<A> = A extends [unknown?, ...infer T] ? T : never;
type UndefinedFromVoid<V> = V extends void ? undefined : V;

// Each verb below is a method-shorthand indexed type: its parameters stay bivariant, so an emitter redeclared down a class
// hierarchy with polymorphic `this` remains assignable to its base. `this: object` rejects calling a verb method detached from its view.
type OnMethod<H, F, R> = { on (this: object, owner: Owner | null, handler: Emitter.HandlerInput<H, F>, priority?: number): R }["on"];
type OwnedOnMethod<H, F, R> = { on (this: object, handler: Emitter.HandlerInput<H, F>, priority?: number): R }["on"];
type UntilOnMethod<H, F> = {
	on (this: object, handler: Emitter.HandlerInput<H, F>, priority?: number): H;
	on (this: object, owner: Owner | null, handler: Emitter.HandlerInput<H, F>, priority?: number): H;
}["on"];
type OffMethod<H, F, R> = { off (this: object, handler: Emitter.HandlerInput<H, F>, priority?: number): R }["off"];
type EmitMethod<H, F> = { emit (this: object, ...args: ArgsOf<F>): H }["emit"];
type FirstMethod<F> = { first (this: object, ...args: ArgsOf<F>): UndefinedFromVoid<ReturnOf<F>> | undefined }["first"];
type ReduceMethod<F> = { reduce<A extends ReturnOf<F> & ArgsOf<F>[0]> (this: object, value: A, ...args: TailOf<ArgsOf<F>>): undefined extends A ? ReturnOf<F> : A }["reduce"];
type CollectMethod<F> = { collect (this: object, ...args: ArgsOf<F>): Array<ReturnOf<F>> }["collect"];
type AsyncMethod<F> = { async (this: object, ...args: ArgsOf<F>): Promise<Array<Awaited<ReturnOf<F>>>> }["async"];
type NextMethod<F> = { next (this: object, signal?: AbortSignal | Owner | null, priority?: number): Promise<ArgsOf<F>> }["next"];
type HasMethod = { has (this: object): boolean }["has"];
type LimitMethod<R> = { limit (this: object, max: number): R }["limit"];

/**
 * Generic, non-DOM event emitter with priorities, class-level subscriptions and allocation-free dispatch.
 *
 * Events are declared as an interface of method signatures. Handlers receive the host first, then the event's arguments.
 * Subscribing reads exactly like a component's `event`: `emitter.on.creatureKilled(owner, handler)`, `emitter.owned.once.x(handler)`.
 *
 * Handlers run highest priority first. At equal priority the order is the concrete class, each superclass up the chain,
 * then instance subscriptions, each in subscription order.
 * A running emit keeps its snapshot; subscription changes apply from the next emit. A throwing handler stops the emit and propagates.
 *
 * Verb methods read their emitter from `this`: call them through the verb, as `emitter.emit.x()`, rather than holding `emitter.emit.x`.
 *
 * @example
 * ```
 * interface HumanEvents {
 *   creatureKilled (creature: Creature): void;
 *   getDefense (defense: number): number;
 * }
 *
 * class Human {
 *   declare readonly event: Emitter<this, HumanEvents>;
 * }
 *
 * Emitter.of(Human).on.creatureKilled(null, (human, creature) => grantExperience(human, creature));
 * human.event.on.getDefense(owner, (human, defense) => defense + 1, Priority.High);
 * const defense = human.event.reduce.getDefense(baseDefense);
 * ```
 */
export class Emitter<out H, out E> {
	private static classEmitters = new WeakMap<object, unknown>();

	/**
	 * Receives misuse reports from every emitter and element event, for the whole process, like `traceOrphans`.
	 * `null` restores the default, which logs each kind of warning for each event once through `console.warn`.
	 */
	static warnings (handler: ((warning: Emitter.Warning) => void) | null): void {
		setWarningHandler(handler);
	}

	/** Class-level subscriptions: they apply to every instance of the class and of its subclasses, including ones defined later. */
	static of<THost extends { readonly event: Emitter<unknown, unknown> }> (cls: { readonly prototype: THost }): Emitter.ClassLevel<THost, EventsOf<THost>> {
		let classEmitter = Emitter.classEmitters.get(cls);
		if (classEmitter === undefined) {
			classEmitter = new ClassEmitter(cls);
			Emitter.classEmitters.set(cls, classEmitter);
		}

		return classEmitter as Emitter.ClassLevel<THost, EventsOf<THost>>;
	}

	private readonly classInfo: ClassInfo;
	private instanceLists: InstanceLists | null = null;
	private cellLimits: Map<EventCell, number> | null = null;
	private closedValue = false;
	private emitView: object | null = null;
	private firstView: object | null = null;
	private reduceView: object | null = null;
	private verbViews: Map<object, object> | null = null;

	/** @param eventHost The value handlers receive first, and whose class selects class-level subscriptions. `null` fires instance subscriptions only. */
	constructor (private readonly eventHost: H) {
		this.classInfo = classInfoForHost(eventHost as object | null);
		if (isOwner(eventHost)) {
			linkCleanup(eventHost, new HostCloseLink(this as AnyEmitter));
		}
	}

	/** Whether this emitter is closed: it fires nothing and subscribing warns instead of subscribing. */
	get closed (): boolean {
		return this.closedValue;
	}

	/** `emitter.on.x(owner, handler, priority?)`: subscribes until `owner` disposes. A `null` owner lives as long as the emitter. */
	get on (): Emitter.On<H, E> {
		return this.verbView(onVerb) as Emitter.On<H, E>;
	}

	/** `emitter.once.x(owner, handler, priority?)`: like `on`, consumed by the first emit it fires in. */
	get once (): Emitter.On<H, E> {
		return this.verbView(onceVerb) as Emitter.On<H, E>;
	}

	/** `emitter.off.x(handler, priority?)`: removes the subscription with this handler and priority. Returns the host. */
	get off (): Emitter.Off<H, E> {
		return this.verbView(offVerb) as Emitter.Off<H, E>;
	}

	/** The same subscribing verbs with the host as the owner. */
	get owned (): Emitter.Owned<H, E> {
		return {
			off: this.off,
			on: this.verbView(ownedOnVerb) as Emitter.OwnedOn<H, E>,
			once: this.verbView(ownedOnceVerb) as Emitter.OwnedOn<H, E>,
		};
	}

	/** `emitter.emit.x(...args)`: fires every handler. Returns the host. */
	get emit (): Emitter.Emit<H, E> {
		return (this.emitView ??= new emitVerb(this as AnyEmitter)) as Emitter.Emit<H, E>;
	}

	/** `emitter.first.x(...args)`: fires every handler, returning the first non-nullish result in priority order. */
	get first (): Emitter.First<E> {
		return (this.firstView ??= new firstVerb(this as AnyEmitter)) as Emitter.First<E>;
	}

	/**
	 * `emitter.reduce.x(value, ...args)`: threads the first argument through every handler, returning the last result.
	 *
	 * For decisions made from one call's arguments, like the damage of one hit from one attacker. A value that is state, read by formulas,
	 * stats or UI, belongs in a model's derived, shaped by plugins through `compose`, so it stays cached and its `$x` hears changes.
	 * @example
	 * ```
	 * Emitter.of(Human).on.getDamageTaken(mod, (human, damage, attacker) => attacker.undead ? damage * 2 : damage);
	 * const taken = human.event.reduce.getDamageTaken(rawDamage, attacker);
	 * ```
	 */
	get reduce (): Emitter.Reduce<E> {
		return (this.reduceView ??= new reduceVerb(this as AnyEmitter)) as Emitter.Reduce<E>;
	}

	/** `emitter.collect.x(...args)`: fires every handler, returning their results. */
	get collect (): Emitter.Collect<E> {
		return this.verbView(collectVerb) as Emitter.Collect<E>;
	}

	/** `await emitter.async.x(...args)`: fires handlers one at a time in priority order, awaiting each. */
	get async (): Emitter.Async<E> {
		return this.verbView(asyncVerb) as Emitter.Async<E>;
	}

	/** `await emitter.parallel.x(...args)`: fires every handler, awaiting all of them together. */
	get parallel (): Emitter.Async<E> {
		return this.verbView(parallelVerb) as Emitter.Async<E>;
	}

	/** `await emitter.next.x(signal?, priority?)`: the arguments of the next emit. An aborted signal or disposed owner rejects with the abort reason. */
	get next (): Emitter.Next<E> {
		return this.verbView(nextVerb) as Emitter.Next<E>;
	}

	/** `emitter.has.x()`: whether emitting would fire anything, for skipping expensive argument construction. */
	get has (): Emitter.Has<E> {
		return this.verbView(hasVerb) as Emitter.Has<E>;
	}

	/** `emitter.when.x`: a trigger for {@link Emitter.until} that fires on this event. */
	get when (): Emitter.When<E> {
		return this.verbView(whenVerb) as Emitter.When<E>;
	}

	/** `emitter.limit.x(max)`: how many subscriptions this event can have before the `possible-leak` warning. Returns the host. */
	get limit (): Emitter.Limit<H, E> {
		return this.verbView(limitVerb) as Emitter.Limit<H, E>;
	}

	/** Starts a subscription that ends at the first of `triggers`: an event from `when`, an owner disposing, a state changing, or a promise settling. */
	until (...triggers: Emitter.Trigger[]): Emitter.Until<H, E> {
		return until(this, triggers) as unknown as Emitter.Until<H, E>;
	}

	/** Prevents further subscriptions and emits and releases every instance subscription. Class-level subscriptions are unaffected. */
	close (): void {
		this.closedValue = true;
		const lists = this.instanceLists;
		this.instanceLists = null;
		for (const list of lists ?? NO_SUBSCRIPTIONS) {
			list.clear();
		}
	}

	/** Reopens a closed emitter, with no instance subscriptions. An emitter whose host owner has disposed stays closed. */
	open (): void {
		if (!isOwner(this.eventHost) || !this.eventHost.disposed) {
			this.closedValue = false;
		}
	}

	private verbView (verb: ViewConstructor<AnyEmitter>): object {
		return cachedView(this.verbViews ??= new Map(), verb, this as AnyEmitter);
	}

	private snapshotCell (cell: EventCell): readonly Subscription[] {
		if (this.closedValue) {
			warn({ event: cell.name, host: this.eventHost, kind: "closed-emit" });
			return NO_SUBSCRIPTIONS;
		}

		return resolveHandlers(this.classInfo, this.instanceLists, cell);
	}

	private eventsClosed (): boolean {
		return this.closedValue;
	}

	private eventOwner (): unknown {
		return this.eventHost;
	}

	private subscribeCell (cell: EventCell, ownerInput: unknown, handler: HandlerInput, priority: number | undefined, once: boolean): void {
		if (this.closedValue) {
			warn({ event: cell.name, host: this.eventHost, kind: "closed-subscribe" });
			return;
		}

		const owner = checkedOwner(ownerInput);
		let list = findInstanceList(this.instanceLists, cell);
		if (list === undefined) {
			list = new InstanceSubscriptionList(cell);
			if (this.instanceLists === null) {
				this.instanceLists = [list];
			} else {
				this.instanceLists.push(list);
			}
		}

		subscribe(list, this.cellLimits?.get(cell), owner, handler, priority, once, this.eventHost);
	}

	private unsubscribeCell (cell: EventCell, handler: HandlerInput, priority = 0): void {
		findInstanceList(this.instanceLists, cell)?.find(handler, priority)?.remove();
	}

	private setCellLimit (cell: EventCell, max: number): void {
		(this.cellLimits ??= new Map()).set(cell, max);
	}

	private hasHandlers (cell: EventCell): boolean {
		return !this.closedValue && anyHandler(resolveHandlers(this.classInfo, this.instanceLists, cell));
	}

	private nextValue (received: readonly unknown[]): unknown {
		return received.slice(1);
	}
}

export namespace Emitter {
	/** A handler for event signature `F` on host `H`. */
	export type Handler<H, F> = (host: H, ...args: ArgsOf<F>) => ReturnOf<F>;

	/** A handler, or a state holding one, which follows it and fires nothing while it holds `null`. */
	export type HandlerInput<H, F> = Handler<H, F> | State.Readonly<Handler<H, F> | null | undefined>;

	export type On<H, E> = { [K in keyof E]-?: OnMethod<H, E[K], H> };
	export type Off<H, E> = { [K in keyof E]-?: OffMethod<H, E[K], H> };
	export type OwnedOn<H, E> = { [K in keyof E]-?: OwnedOnMethod<H, E[K], H> };
	export type UntilOn<H, E> = { [K in keyof E]-?: UntilOnMethod<H, E[K]> };
	export type Emit<H, E> = { [K in keyof E]-?: EmitMethod<H, E[K]> };
	export type First<E> = { [K in keyof E]-?: FirstMethod<E[K]> };
	export type Reduce<E> = { [K in keyof E]-?: ReduceMethod<E[K]> };
	export type Collect<E> = { [K in keyof E]-?: CollectMethod<E[K]> };
	export type Async<E> = { [K in keyof E]-?: AsyncMethod<E[K]> };
	export type Next<E> = { [K in keyof E]-?: NextMethod<E[K]> };
	export type Has<E> = { [K in keyof E]-?: HasMethod };
	export type When<E> = { readonly [K in keyof E]-?: EventTrigger };
	export type Limit<H, E> = { [K in keyof E]-?: LimitMethod<H> };

	/** The subscribing verbs with the host as the owner. */
	export interface Owned<out H, out E> {
		readonly on: OwnedOn<H, E>;
		readonly once: OwnedOn<H, E>;
		readonly off: Off<H, E>;
	}

	/** Class-level subscribing verbs, returned by {@link Emitter.of}. */
	export interface ClassLevel<out H, out E> {
		/** `on.x(owner, handler, priority?)`: subscribes for every instance of this class and its subclasses. `null` lives as long as the class. */
		readonly on: { [K in keyof E]-?: OnMethod<H, E[K], void> };
		/** Like `on`, consumed by the first emit it fires in, from any instance. */
		readonly once: { [K in keyof E]-?: OnMethod<H, E[K], void> };
		readonly off: { [K in keyof E]-?: OffMethod<H, E[K], void> };
		/** `when.x`: a trigger for {@link Emitter.until} that fires when any instance emits this event. */
		readonly when: When<E>;
		readonly limit: { [K in keyof E]-?: LimitMethod<void> };
	}

	/** A trigger firing on one event, from `emitter.when.x` or a component's `event.when.x`. */
	export interface EventTrigger {
		readonly emitter: object;
		readonly event: string;
	}

	/** What can end an {@link Emitter.until} subscription. A state ends it on any change, whatever the value. */
	export type Trigger = EventTrigger | Owner | State.Readonly<unknown> | PromiseLike<unknown>;

	/** A subscription being limited by triggers. */
	export interface Until<out H, out E> {
		until (...triggers: Trigger[]): Until<H, E>;
		/** `on.x(handler, priority?)` ends at the triggers. `on.x(owner, handler, priority?)` also ends at `owner`, without ending other subscriptions made through this `until`. */
		readonly on: UntilOn<H, E>;
		/** Like `on`, consumed by the first emit it fires in. */
		readonly once: UntilOn<H, E>;
	}

	export type Warning =
		| { readonly kind: "closed-subscribe" | "closed-emit" | "until-released"; readonly event: string; readonly host: unknown }
		| { readonly kind: "possible-leak"; readonly event: string; readonly host: unknown; readonly count: number; readonly max: number };
}

type EventsOf<THost extends { readonly event: Emitter<unknown, unknown> }> = THost["event"] extends Emitter<unknown, infer E> ? E : never;

type AnyEmitter = Emitter<unknown, unknown>;

function checkedOwner (input: unknown): Owner | null {
	if (input === null || isOwner(input)) {
		return input;
	}

	throw new TypeError("An emitter subscription owner must be an Owner or an explicit null.");
}

/**
 * Closes the emitter of an owner host when the host disposes, releasing subscriptions other owners hold on it.
 * A release is not the end of the host, so it only re-registers for the disposal still to come.
 */
class HostCloseLink extends CleanupLink {
	constructor (private readonly emitter: AnyEmitter) {
		super();
	}

	runCleanup (): void {
		const host = this.emitter["eventHost"] as Owner;
		if (host.disposed) {
			this.emitter.close();
		} else {
			linkCleanup(host, this);
		}
	}
}

/** Subscribing verbs for every instance of one class. */
class ClassEmitter {
	private readonly eventHost = undefined;
	private readonly classInfo: ClassInfo;
	private cellLimits: Map<EventCell, number> | null = null;
	private readonly verbViews = new Map<object, object>();

	constructor (private readonly cls: object) {
		this.classInfo = classInfoFor(cls);
	}

	private verbView (verb: ViewConstructor<object>): object {
		return cachedView(this.verbViews, verb, this);
	}

	get on (): object {
		return this.verbView(onVerb);
	}

	get once (): object {
		return this.verbView(onceVerb);
	}

	get off (): object {
		return this.verbView(offVerb);
	}

	get when (): object {
		return this.verbView(whenVerb);
	}

	get limit (): object {
		return this.verbView(limitVerb);
	}

	private eventsClosed (): boolean {
		return false;
	}

	private eventOwner (): unknown {
		return null;
	}

	private subscribeCell (cell: EventCell, ownerInput: unknown, handler: HandlerInput, priority: number | undefined, once: boolean): void {
		subscribe(this.classInfo.classList(cell), this.cellLimits?.get(cell), checkedOwner(ownerInput), handler, priority, once, this.cls);
	}

	private unsubscribeCell (cell: EventCell, handler: HandlerInput, priority = 0): void {
		this.classInfo.classList(cell).find(handler, priority)?.remove();
	}

	private setCellLimit (cell: EventCell, max: number): void {
		(this.cellLimits ??= new Map()).set(cell, max);
	}

	private hasHandlers (cell: EventCell): boolean {
		return anyHandler(this.classInfo.handlers(cell));
	}

	private nextValue (received: readonly unknown[]): unknown {
		return received.slice(1);
	}
}

function snapshotOf (view: View<AnyEmitter>, cell: EventCell): readonly Subscription[] {
	return targetOf(view)["snapshotCell"](cell);
}

const emitVerb = defineVerb<AnyEmitter>(cell => ({
	value (this: View<AnyEmitter>, ...args: never[]) {
		const emitter = targetOf(this);
		const host = emitter["eventHost"];
		const handlers = emitter["snapshotCell"](cell);
		for (let index = 0; index < handlers.length; index++) {
			const record = handlers[index];
			const handler = record.take();
			if (handler !== null) {
				handler(host, ...args);
			}
		}

		return host;
	},
}));

const firstVerb = defineVerb<AnyEmitter>(cell => ({
	value (this: View<AnyEmitter>, ...args: never[]) {
		const emitter = targetOf(this);
		const host = emitter["eventHost"];
		const handlers = emitter["snapshotCell"](cell);
		let result: unknown;
		for (let index = 0; index < handlers.length; index++) {
			const record = handlers[index];
			const handler = record.take();
			if (handler !== null) {
				const value = handler(host, ...args);
				result ??= value;
			}
		}

		return result ?? undefined;
	},
}));

const reduceVerb = defineVerb<AnyEmitter>(cell => ({
	value (this: View<AnyEmitter>, value: never, ...args: never[]) {
		const emitter = targetOf(this);
		const host = emitter["eventHost"];
		const handlers = emitter["snapshotCell"](cell);
		let current = value;
		for (let index = 0; index < handlers.length; index++) {
			const record = handlers[index];
			const handler = record.take();
			if (handler !== null) {
				current = handler(host, current, ...args) as never;
			}
		}

		return current;
	},
}));

const collectVerb = defineVerb<AnyEmitter>(cell => ({
	value (this: View<AnyEmitter>, ...args: never[]) {
		const host = targetOf(this)["eventHost"];
		const results: unknown[] = [];
		for (const record of snapshotOf(this, cell)) {
			const handler = record.take();
			if (handler !== null) {
				results.push(handler(host, ...args));
			}
		}

		return results;
	},
}));

const asyncVerb = defineVerb<AnyEmitter>(cell => ({
	async value (this: View<AnyEmitter>, ...args: never[]) {
		const host = targetOf(this)["eventHost"];
		const results: unknown[] = [];
		for (const record of snapshotOf(this, cell)) {
			const handler = record.take();
			if (handler !== null) {
				results.push(await handler(host, ...args));
			}
		}

		return results;
	},
}));

const parallelVerb = defineVerb<AnyEmitter>(cell => ({
	async value (this: View<AnyEmitter>, ...args: never[]) {
		const host = targetOf(this)["eventHost"];
		const results: unknown[] = [];
		for (const record of snapshotOf(this, cell)) {
			const handler = record.take();
			if (handler !== null) {
				results.push(handler(host, ...args));
			}
		}

		return Promise.all(results);
	},
}));
