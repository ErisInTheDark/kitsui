import type * as KitsuiModule from "../../src/index";

export type Kitsui = typeof KitsuiModule;

/** One live scenario instance. `build` creates it, each step mutates it, `dispose` tears it down. */
export interface ScenarioInstance {
	build (): void;
	steps: Record<string, () => void>;
	dispose (): void;
}

export interface Scenario {
	name: string;
	description: string;
	create (kitsui: Kitsui): ScenarioInstance;
}

const DIALOG_ROWS = 200;
const LIST_ITEMS = 500;
const GRAPH_STATES = 2000;
const CHURN_DIALOGS = 40;
const CHURN_ROWS = 25;
const COMPOSES = 52;
const COMPOSE_HOSTS = 1000;
const ENTITY_DERIVED = 10;
const ITEM_DERIVED = 40;
const ITEM_SUBCLASSES = 4;
const MODEL_HOSTS = 10_000;
const MODEL_BOUND = 200;

type Slots = Record<string, unknown>;

/** A model: `state` keys plus derived over the first of them. */
function compiledClass (kitsui: Kitsui, parent: new () => object, name: string, state: string[], derived: string[]): new () => Slots {
	return kitsui.Fields.define(parent, name, {
		state: Object.fromEntries(state.map(key => [key, 1])),
		derived: Object.fromEntries(derived.map((key, index) => [key, { reads: [state[0]], get: (host: Slots) => (host[state[0]] as number) + index }])),
	}) as unknown as new () => Slots;
}

function buildDialog (kitsui: Kitsui, rows: number): { root: KitsuiModule.Component; selected: KitsuiModule.State<number>; counts: KitsuiModule.State<number>[] } {
	const { Component, State, Style } = kitsui;
	const rowStyle = Style.Class("bench-row", { display: "flex", gap: 4 });
	const activeStyle = Style.Class("bench-row-active", { fontWeight: "bold" });

	const root = Component("dialog").class.add(rowStyle);
	const selected = State(root, 0);
	const counts: KitsuiModule.State<number>[] = [];

	for (let index = 0; index < rows; index++) {
		const count = State(root, index);
		counts.push(count);
		const isSelected = selected.equals(index);

		const row = Component("div")
			.class.add(rowStyle)
			.class.bind(isSelected, activeStyle)
			.attribute.bind(isSelected, "data-selected")
			.event.owned.on.click(() => selected.set(index))
			.appendTo(root);

		Component("span")
			.text.set(count.map(value => `Item ${value}`))
			.appendTo(row);

		Component("button")
			.attribute.set("type", "button")
			.aria.pressed(isSelected)
			.text.set("Pick")
			.appendTo(row);
	}

	return { root, selected, counts };
}

function buildRawDialog (rows: number): { root: HTMLElement; labels: HTMLElement[] } {
	const root = document.createElement("dialog");
	root.className = "bench-row";
	const labels: HTMLElement[] = [];

	for (let index = 0; index < rows; index++) {
		const row = document.createElement("div");
		row.className = "bench-row";
		row.addEventListener("click", () => undefined);
		root.appendChild(row);

		const label = document.createElement("span");
		label.textContent = `Item ${index}`;
		row.appendChild(label);
		labels.push(label);

		const button = document.createElement("button");
		button.setAttribute("type", "button");
		button.setAttribute("aria-pressed", "false");
		button.textContent = "Pick";
		row.appendChild(button);
	}

	return { root, labels };
}

export const scenarios: Scenario[] = [
	{
		name: "state-graph",
		description: `${GRAPH_STATES} owned states, each with map + truthy + equals derivations and 2 subscriptions`,
		create ({ Owner, State }) {
			let owner: KitsuiModule.Owner | null = null;
			let states: KitsuiModule.State<number>[] = [];
			let sink = 0;

			return {
				build () {
					owner = Owner();
					states = [];
					for (let index = 0; index < GRAPH_STATES; index++) {
						const state = State(owner, index);
						const label = state.map(owner, value => `#${value}`);
						const isEven = state.map(owner, value => value % 2 === 0);
						state.truthy.subscribe(owner, value => { sink += value ? 1 : 0; });
						isEven.subscribeImmediate(owner, value => { sink += value ? 1 : 0; });
						label.subscribe(owner, value => { sink += value.length; });
						state.equals(index + 1);
						states.push(state);
					}
				},
				steps: {
					"set all": () => {
						for (const state of states) {
							state.set(state.value + 1);
						}
					},
				},
				dispose () {
					owner?.dispose();
					owner = null;
					states = [];
					if (sink < 0) console.log(sink);
				},
			};
		},
	},
	{
		name: "dialog",
		description: `dialog with ${DIALOG_ROWS} rows: class/attribute/aria/text bindings + owned click handler per row`,
		create (kitsui) {
			let dialog: ReturnType<typeof buildDialog> | null = null;

			return {
				build () {
					dialog = buildDialog(kitsui, DIALOG_ROWS);
					dialog.root.appendTo(document.body);
				},
				steps: {
					"select row": () => {
						dialog!.selected.set(DIALOG_ROWS - 1);
					},
					"update all labels": () => {
						for (const count of dialog!.counts) {
							count.set(count.value + 1);
						}
					},
				},
				dispose () {
					dialog?.root.remove();
					dialog = null;
				},
			};
		},
	},
	{
		name: "dialog (raw DOM control)",
		description: "same DOM shape as dialog built with raw DOM calls; separates happy-dom cost from kitsui cost",
		create () {
			let dialog: ReturnType<typeof buildRawDialog> | null = null;

			return {
				build () {
					dialog = buildRawDialog(DIALOG_ROWS);
					document.body.appendChild(dialog.root);
				},
				steps: {
					"update all labels": () => {
						for (const [index, label] of dialog!.labels.entries()) {
							label.textContent = `Item ${index + 1}`;
						}
					},
				},
				dispose () {
					dialog?.root.remove();
					dialog = null;
				},
			};
		},
	},
	{
		name: "keyed list",
		description: `${LIST_ITEMS}-item keyed breakdown, per-item text + class updated every pass`,
		create ({ Component, State, Style }) {
			const doneStyle = Style.Class("bench-done", { opacity: 0.5 });
			let root: KitsuiModule.Component | null = null;
			let items: KitsuiModule.State<Array<{ id: number; label: string; done: boolean }>> | null = null;

			return {
				build () {
					root = Component("ul").appendTo(document.body);
					items = State(root, Array.from({ length: LIST_ITEMS }, (_, id) => ({ id, label: `Task ${id}`, done: id % 3 === 0 })));
					root.breakdown(items, (list, Part, values) => {
						for (const item of values) {
							const part = Part(item.id, () => Component("li"))
								.text.set(item.label)
								.appendTo(list);
							if (item.done) part.class.add(doneStyle);
							else part.class.remove(doneStyle);
						}
					});
				},
				steps: {
					"reverse": () => {
						items!.set([...items!.value].reverse());
					},
					"relabel all": () => {
						items!.set(items!.value.map(item => ({ ...item, label: `${item.label}!` })));
					},
				},
				dispose () {
					root?.remove();
					root = null;
					items = null;
				},
			};
		},
	},
	{
		name: "open/close churn",
		description: `${CHURN_DIALOGS}x open then close a ${CHURN_ROWS}-row dialog`,
		create (kitsui) {
			return {
				build () {
					for (let index = 0; index < CHURN_DIALOGS; index++) {
						const dialog = buildDialog(kitsui, CHURN_ROWS);
						dialog.root.appendTo(document.body);
						dialog.selected.set(1);
						dialog.root.remove();
					}
				},
				steps: {},
				dispose () { },
			};
		},
	},
	composeRegistration(false),
	composeRegistration(true),
	{
		name: "model fields",
		description: `${MODEL_HOSTS} model instances: cached derived reads, writes then reads, and writes heard by a bound component`,
		create (kitsui) {
			const { Component, Fields, Owner } = kitsui;
			const Model = Fields.define(Owner, "BenchModel", {
				state: { quality: 1, bonus: 0 },
				derived: {
					attack: { reads: ["quality", "bonus"], get: (host: { quality: number; bonus: number }) => host.quality * 10 + host.bonus },
					label: { reads: ["attack"], get: (host: { attack: number }) => `attack ${host.attack}` },
				},
			});
			let hosts: InstanceType<typeof Model>[] = [];
			let root: KitsuiModule.Component | null = null;
			let sink = 0;
			return {
				build () {
					hosts = Array.from({ length: MODEL_HOSTS }, () => new Model());
					root = Component();
					for (let index = 0; index < MODEL_BOUND; index++) {
						Component("span").text.set(hosts[index].$label).appendTo(root);
					}
					root.appendTo(document.body);
				},
				steps: {
					"read all": () => {
						for (let pass = 0; pass < 10; pass++) {
							for (const host of hosts) sink += host.attack;
						}
					},
					"write then read all": () => {
						for (const host of hosts) {
							host.quality++;
							sink += host.attack;
						}
					},
					"write bound, flush": () => {
						for (let index = 0; index < MODEL_BOUND; index++) hosts[index].bonus++;
					},
				},
				dispose () {
					root?.remove();
					root = null;
					for (const host of hosts) host.dispose();
					hosts = [];
					if (sink < 0) console.log(sink);
				},
			};
		},
	},
];

function composeRegistration (useLock: boolean): Scenario {
	return {
		name: useLock ? "compose registration (locked)" : "compose registration",
		description: `${COMPOSES} composes added then removed on an entity/item/${ITEM_SUBCLASSES}-subclass chain with ${COMPOSE_HOSTS} live items${useLock ? ", inside Fields.lock" : ""}`,
		create (kitsui) {
			const { Fields, Owner, State } = kitsui;
			const keys = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index}`);
			const entityDerived = keys("e", ENTITY_DERIVED);
			const itemDerived = keys("i", ITEM_DERIVED);
			const Entity = compiledClass(kitsui, Owner as unknown as new () => object, "BenchEntity", ["type"], entityDerived);
			const Item = compiledClass(kitsui, Entity, "BenchItem", ["quality"], itemDerived);
			for (let index = 0; index < ITEM_SUBCLASSES; index++) {
				compiledClass(kitsui, Item, `BenchItem${index}`, ["extra"], ["sub"]);
			}
			const compose = (Item as unknown as { compose: Record<string, (owner: KitsuiModule.Owner, mapper: (host: unknown, value: number) => number) => void> }).compose;
			const lockable = useLock && typeof (Fields as { lock?: unknown }).lock === "function";

			let root: KitsuiModule.Owner | null = null;
			let mods: KitsuiModule.Owner[] = [];
			let locked: KitsuiModule.State<boolean> | null = null;
			let sink = 0;

			return {
				build () {
					root = Owner();
					locked = State(root, false);
					if (lockable) Fields.lock(root, locked);
					for (let index = 0; index < COMPOSE_HOSTS; index++) {
						sink += (new Item() as Slots).i0 as number;
					}
				},
				steps: {
					"add composes": () => {
						locked!.set(true);
						mods = Array.from({ length: COMPOSES }, (_, index) => {
							const mod = Owner();
							compose[[...entityDerived, ...itemDerived][index % (ENTITY_DERIVED + ITEM_DERIVED)]](mod, (_host, value) => value + 1);
							return mod;
						});
						locked!.set(false);
					},
					"remove composes": () => {
						locked!.set(true);
						for (const mod of mods) mod.dispose();
						mods = [];
						locked!.set(false);
					},
				},
				dispose () {
					root?.dispose();
					root = null;
					locked = null;
					if (sink < 0) console.log(sink);
				},
			};
		},
	};
}
