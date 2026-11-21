import type {
	AsyncSettled,
	AsyncState,
	CleanupFunction,
	ComponentBuilderFunction,
	ComponentChild,
	SortableExtensions,
	SortableOptions,
	SortableTransfer,
	QueryExpression,
	StyleValue,
} from "@inthedark/kitsui";
import { AsyncPending, Component, Draggable, DropTarget, Emitter, Fields, Owner, Sortable, State, Style, mediaQuery } from "@inthedark/kitsui";

// Models: the declaration's fields, their `$x` states and `compose` are all typed from the declaration.
const F = Fields;
// Bodies can't name the class they're declaring, so they read the instance through an interface.
interface FixtureHost extends Owner {
	quality: number;
	label?: string;
	readonly attack: number;
	readonly $quality: State<number>;
	readonly $held: State<FixtureHost | null>;
}
class FieldsFixture extends F.define(Owner, "FieldsFixture", {
	state: { quality: 1, label: undefined as string | undefined, held: null as FixtureHost | null },
	derived: {
		attack: { reads: ["quality"], get: (host: FixtureHost) => host.quality * 2 },
		described: { checks: { "this.label": (host: FixtureHost) => host.label }, get: (host: FixtureHost) => `${host.label}: ${host.attack}` },
	},
	forward: { heldQuality: (host: FixtureHost) => host.$held.forward(host, held => held?.$quality ?? host.$quality) },
}) {
	readonly extra = "own member";
}
const fixtureHost = new FieldsFixture();
fixtureHost.quality = 2;
fixtureHost.heldQuality = 3;
fixtureHost.attack satisfies number;
fixtureHost.described satisfies string;
fixtureHost.extra satisfies string;
fixtureHost.$quality satisfies State<number>;
fixtureHost.$label satisfies State<string | null>;
fixtureHost.$attack satisfies State.Readonly<number>;
// @ts-expect-error a derived value can't be written.
fixtureHost.attack = 1;
// @ts-expect-error a derived's state is readonly.
fixtureHost.$attack.set(1);
const fixtureMod = Owner();
const fixtureInput = State(fixtureMod, "x");
FieldsFixture.compose.attack(fixtureMod, (_host, value) => value + 1);
FieldsFixture.compose.attack(fixtureMod, host => [host.$quality, fixtureInput], (_host, value, [quality, label]) => value + quality + label.length);
FieldsFixture.compose.attack(fixtureMod, () => fixtureInput, (_host, value, label: string) => value + label.length);
// @ts-expect-error compose covers derived values only.
FieldsFixture.compose.quality;
F.verify(fixtureHost) satisfies readonly Fields.Mismatch[];
F.lock(fixtureMod, State(fixtureMod, false));
F.equality(FieldsFixture, (a, b) => a.quality === b.quality);
F.computing satisfies number;
// @ts-expect-error the runtime's internals aren't public.
void F.generation;

const forwardHost = new FieldsFixture();
const forwardHeld = State<FieldsFixture | null>(fixtureMod, null);
const forwardWritable: State<number> = forwardHeld.forward(fixtureMod, held => held?.$quality ?? forwardHost.$quality);
forwardWritable.set(2);
const forwardReadonly = forwardHeld.forward(fixtureMod, held => held?.$attack ?? State.Readonly(0));
const forwardReadonlyValue: number = forwardReadonly.value;
void forwardReadonlyValue;
// @ts-expect-error a forward to a readonly pick can't be set.
forwardReadonly.set(1);
F.forward(forwardHost, "quality", forwardWritable);
const forwardList = forwardHeld.forward(fixtureMod, held => [forwardHost.$quality, held?.$attack ?? State.Readonly("none")] as const);
const forwardListValue: readonly [number, number | string] = forwardList.value;
void forwardListValue;
const forwardMapped: readonly number[] = State<readonly FieldsFixture[]>(fixtureMod, []).forward(fixtureMod, hosts => hosts.map(host => host.$quality)).value;
void forwardMapped;
// @ts-expect-error a forward to a list is readonly.
forwardList.set([1, 2]);

interface EmitterEntityEvents {
	removed (): void;
	canMove (direction: number): boolean | undefined;
	getDefense (defense: number): number;
	optionalEvent? (value: string): void;
}

interface EmitterMovableEvents extends EmitterEntityEvents {
	moved (x: number, y: number): void;
}

interface EmitterWithStatsEvents extends EmitterMovableEvents {
	statChanged (stat: string, value: number): Promise<string>;
}

interface EmitterHumanEvents extends EmitterWithStatsEvents {
	creatureKilled (creature: EmitterEntity): void;
}

interface EmitterPlayerEvents extends EmitterHumanEvents {
	chat (message: string): void;
}

// Redeclaring `event` down a hierarchy with polymorphic `this` only compiles if each subclass emitter is assignable to its base.
abstract class EmitterEntity {
	declare readonly event: Emitter<this, EmitterEntityEvents>;
}

abstract class EmitterMovable extends EmitterEntity {
	declare readonly event: Emitter<this, EmitterMovableEvents>;
}

abstract class EmitterWithStats extends EmitterMovable {
	declare readonly event: Emitter<this, EmitterWithStatsEvents>;
}

class EmitterHuman extends EmitterWithStats {
	declare readonly event: Emitter<this, EmitterHumanEvents>;
}

class EmitterPlayer extends EmitterHuman {
	declare readonly event: Emitter<this, EmitterPlayerEvents>;
	readonly name = "player";

	subscribeToSelf (): this {
		return this.event.on.chat(null, player => player.name);
	}
}

const emitterPlayer = new EmitterPlayer();
const emitterOwner = Owner();
const emitterBase: Emitter<EmitterEntity, EmitterEntityEvents> = emitterPlayer.event;
void emitterBase;
const emitterEntities: EmitterEntity[] = [emitterPlayer, new EmitterHuman()];
void emitterEntities;
// Generic decorators and registries hold emitters this way, so it must stay assignable without an any guard in the types.
const emitterAny: Emitter<any, any> = emitterPlayer.event;
void emitterAny;

interface EmitterDropdownEvents<T> {
	select (value: T): void;
}

class EmitterDropdown<T> {
	declare readonly event: Emitter<this, EmitterDropdownEvents<T>>;
	value?: T;
}

const emitterWideDropdown: EmitterDropdown<string | number> = new EmitterDropdown<string>();
void emitterWideDropdown;

emitterPlayer.event.on.creatureKilled(emitterOwner, (player, creature) => {
	player.name satisfies string;
	creature satisfies EmitterEntity;
});
emitterPlayer.event.on.moved(null, (_player, x, y) => x + y, 100);
emitterPlayer.event.once.removed(emitterOwner, () => undefined);
emitterPlayer.event.owned.on.removed(() => undefined);
emitterPlayer.event.emit.moved(1, 2) satisfies EmitterPlayer;
emitterPlayer.event.emit.optionalEvent("value");
emitterPlayer.event.off.removed(() => undefined, 5) satisfies EmitterPlayer;
emitterPlayer.event.on.chat(emitterOwner, State(emitterOwner, (player: EmitterPlayer, message: string) => void `${player.name}${message}`));
emitterPlayer.event.owned.once.chat(State(emitterOwner, null));
emitterPlayer.event.first.canMove(1) satisfies boolean | undefined;
emitterPlayer.event.first.removed() satisfies undefined;
emitterPlayer.event.reduce.getDefense(1) satisfies number;
emitterPlayer.event.collect.canMove(1) satisfies Array<boolean | undefined>;
emitterPlayer.event.async.statChanged("a", 1) satisfies Promise<string[]>;
emitterPlayer.event.parallel.statChanged("a", 1) satisfies Promise<string[]>;
emitterPlayer.event.next.moved(emitterOwner, 5) satisfies Promise<[x: number, y: number]>;
emitterPlayer.event.has.moved() satisfies boolean;
emitterPlayer.event.has.moved((_player, x, y) => x + y, 100) satisfies boolean;
Emitter.of(EmitterHuman).self.creatureKilled(null, (human, creature) => void [human satisfies EmitterHuman, creature satisfies EmitterEntity], 5);
Emitter.of(EmitterHuman).has.creatureKilled() satisfies boolean;
emitterPlayer.event.limit.moved(500) satisfies EmitterPlayer;
emitterPlayer.event.until(emitterOwner, Promise.resolve(), State(emitterOwner, 1), emitterPlayer.event.when.removed).until(emitterOwner).on.moved((player, x) => {
	player.name satisfies string;
	x satisfies number;
});
emitterPlayer.event.until(emitterOwner).on.moved(emitterOwner, (player, x) => {
	player.name satisfies string;
	x satisfies number;
}, 5) satisfies EmitterPlayer;
emitterPlayer.event.until(emitterOwner).once.removed(null, player => player.name satisfies string);
// @ts-expect-error until's owner must be an owner.
emitterPlayer.event.until(emitterOwner).on.moved({}, () => undefined);

new Emitter<null, EmitterEntityEvents>(null).on.removed(null, host => host satisfies null);

Emitter.of(EmitterPlayer).on.chat(emitterOwner, (player, message) => {
	player.name satisfies string;
	message satisfies string;
});
Emitter.of(EmitterHuman).on.creatureKilled(null, human => human satisfies EmitterHuman);
Emitter.of(EmitterEntity).on.removed(null, entity => entity satisfies EmitterEntity, 10);
Emitter.warnings(warning => warning.kind satisfies Emitter.Warning["kind"]);
Emitter.warnings(null);
Emitter.of(EmitterEntity).when.removed satisfies Emitter.EventTrigger;

// Subclasses are free to define their own API, so Emitter's internals must not claim common member names.
class EmitterWithOwnApi<H, E> extends Emitter<H, E> {
	host = 0;
	info = 0;
	lists = 0;
	limits = 0;
	view (): void { }
	snapshot (): void { }
	selfSnapshot (): void { }
	setLimit (): void { }
	subscribe (): void { }
	subscribeNext (): void { }
	unsubscribe (): void { }
	waitFor (): void { }
	race (): void { }
	hasHandlersForEvent (): void { }
	emitFirst (): void { }
	emitFirstDefault (): void { }
	emitReduce (): void { }
	emitCollect (): void { }
	emitSelf (): void { }
	emitAsync (): void { }
	emitAsyncParallel (): void { }
	raw (): void { }
}
void EmitterWithOwnApi;

// @ts-expect-error verb methods read their emitter from `this`, so they cannot be held detached.
const emitterDetached = emitterPlayer.event.emit.removed; emitterDetached();
// @ts-expect-error null is the explicit way to subscribe without an owner.
emitterPlayer.event.on.removed(() => undefined);
// @ts-expect-error events take their declared arguments.
emitterPlayer.event.emit.moved("not a number", 2);
// @ts-expect-error a base-level emitter cannot name subclass events.
emitterBase.emit.moved(1, 2);
// @ts-expect-error a base emitter is not assignable to a subclass emitter: it lacks the subclass's events.
const emitterNotSubclass: Emitter<EmitterPlayer, EmitterPlayerEvents> = new Emitter<EmitterPlayer, EmitterEntityEvents>(emitterPlayer);
void emitterNotSubclass;
// @ts-expect-error sibling and subclass events are not on a superclass.
Emitter.of(EmitterEntity).on.chat(null, () => undefined);

const standaloneOwner: Owner = Owner();
const standaloneState = State(standaloneOwner, "active");
standaloneOwner.onCleanup(() => undefined);
standaloneOwner.signal satisfies AbortSignal;

class RequestOwner extends Owner {
	protected override beforeDispose (): void {
		// Custom owner lifecycles retain access to the protected hooks.
	}
}

const requestOwner: Owner = new RequestOwner();
const releaseOwnedCleanup: CleanupFunction = standaloneOwner.onCleanup(requestOwner, () => undefined);

void standaloneState;
void requestOwner;
void releaseOwnedCleanup;
class ReusableOwner extends Owner {
	override release (): void {
		super.release();
	}
}
new ReusableOwner().release();
// @ts-expect-error release is protected: kitsui's own owners assume their cleanups run once.
standaloneOwner.release();
// @ts-expect-error components are owners, but cannot be released and reused.
Component("div").release();

// @ts-expect-error standalone Owner instances are created by calling Owner().
new Owner();
// @ts-expect-error Owner.create() was replaced by Owner().
Owner.create();

const host = Component("div");
const state = State(host, 0);
const mapped = state.map(value => value + 1);
const staticReadonly = State.Readonly({ count: 1 });
const readonlySource: State.Readonly<number> = state;
const debounced: State.Readonly<number> = readonlySource.debounce(100);
const throttled: State.Readonly<number> = readonlySource.throttle(100);
const ownedDebounced: State.Readonly<number> = readonlySource.debounce(standaloneOwner, 100);
const ownedThrottled: State.Readonly<number> = readonlySource.throttle(standaloneOwner, 100);
const asyncValue: AsyncState<string, unknown> = readonlySource.mapAsync(host, async value => String(value));
const typedError: AsyncState<string, TypeError> = readonlySource.mapAsync<string, TypeError>(host, async value => String(value));
const lastSettled: State.Readonly<AsyncSettled<string, unknown> | null> = asyncValue.lastSettled;
const publicTypes: {
	child: ComponentChild;
	cleanup: CleanupFunction;
	style: StyleValue;
} = {
	child: host,
	cleanup: () => undefined,
	style: "red",
};

void state;
AsyncPending satisfies { readonly type: "pending" };
void debounced;
void throttled;
void ownedDebounced;
void ownedThrottled;
void asyncValue;
void typedError;
void lastSettled;
// @ts-expect-error debounced derived state should not expose public set
debounced.set(1);
// @ts-expect-error throttled derived state should not expose public update
throttled.update(value => value + 1);
// @ts-expect-error async derived state should not expose public set
asyncValue.set({ type: "resolved", value: "next" });
// @ts-expect-error lastSettled should not expose public update
lastSettled.update(() => null);
mapped.value.toFixed();
mapped.recompute();
mapped.subscribe(host, value => value.toFixed());
// @ts-expect-error mapped state should not expose public set
mapped.set(2);
// @ts-expect-error mapped state should not expose public update
mapped.update(value => value + 1);
state.truthy.recompute();
state.falsy.recompute();
state.or(() => 1).recompute();
state.equals(0).recompute();
state.notEquals(0).recompute();
staticReadonly.value.count.toFixed();
staticReadonly.subscribe(host, value => value.count.toFixed());
// @ts-expect-error static readonly state should not expose recompute
staticReadonly.recompute();
// @ts-expect-error static readonly state should not expose public set
staticReadonly.set({ count: 2 });
// @ts-expect-error static readonly state should not expose public update
staticReadonly.update(value => ({ count: value.count + 1 }));
if (readonlySource instanceof State) {
	readonlySource.value.toFixed();
	readonlySource satisfies State.Readonly<number>;
	// @ts-expect-error instanceof State should narrow to readonly before mutable checks.
	readonlySource.set(1);

	if (readonlySource.isMutable()) {
		readonlySource.set(1);
		readonlySource.update(value => value + 1);
	}
}
void Style;
void publicTypes;

const mediaExpression: QueryExpression = "(width <= 60rem)";
mediaQuery(mediaExpression, { display: "block" });
// @ts-expect-error media query expressions must be enclosed in parentheses.
mediaQuery("width <= 60rem", { display: "none" });

// @ts-expect-error a container must select at least one capability before it can be named.
Style.Container.name("missing-capability");

const sizeContainer = Style.Container.inlineSize.name("size-container");
Style.Class("size-container-class", { ...sizeContainer });
sizeContainer.query("(inline-size > 30rem)", { display: "grid" });
// @ts-expect-error style queries require the style capability.
sizeContainer.style("(--density: compact)", { gap: "4px" });
// @ts-expect-error scroll-state queries require the scrollState capability.
sizeContainer.stuck("top", { top: 0 });

const styleContainer = Style.Container.style.name("style-container");
styleContainer.style("(--density: compact)", { gap: "4px" });
styleContainer.styleProperty("$density", "compact", { gap: "4px" });
// @ts-expect-error size queries require the size capability.
styleContainer.query("(inline-size > 30rem)", { display: "grid" });

const scrollContainer = Style.Container.scrollState.name("scroll-container");
scrollContainer.scrollState("(stuck: top)", { top: 0 });
scrollContainer.stuck({ top: 0 });
scrollContainer.stuck("top", { top: 0 });
scrollContainer.snapped("inline", { outlineWidth: "1px" });
scrollContainer.scrollable("block-end", { overflowY: "auto" });
scrollContainer.scrolled("block-start", { opacity: 0.8 });
// @ts-expect-error style-property shortcuts require the style capability.
scrollContainer.styleProperty("$density", "compact", { gap: "4px" });

const fullContainer = Style.Container.size.inlineSize.style.scrollState.name("full-container");
fullContainer.query("(width > 30rem)", {
	...fullContainer.style("(--density: compact)", {
		...fullContainer.stuck("top", { display: "grid" }),
	}),
});
// @ts-expect-error finalized containers do not expose the factory finalizer.
fullContainer.name("renamed-container");
// @ts-expect-error finalized containers do not expose size factory getters.
void fullContainer.size;
// @ts-expect-error finalized containers do not expose inline-size factory getters.
void fullContainer.inlineSize;
// @ts-expect-error size capabilities are selected through closed getters, not arbitrary string arguments.
Style.Container.size("block-size");

const hostAfterParameterizedSetup = host.use((component, label, count) => {
	component.text.set(`${label}:${count.toFixed(0)}`);
}, "ready", 2);

const hostAfterBreakdown = host.breakdown(state, (component, Part, value) => {
	component.attribute.set("data-count", value.toFixed(0));
	component.append(Part("count", value, partState => Component("span").text.set(partState)));
});

void hostAfterParameterizedSetup;
void hostAfterBreakdown;

interface ButtonExtensions {
	press (): this;
}

interface ButtonComponent extends Component, ButtonExtensions { }

const Button: ComponentBuilderFunction<[string], ButtonComponent> = function Button (this: Component | void, label: string): ButtonComponent {
	const component = Component(this ?? "button", Button);

	component.text.set(label);

	return component.extend<ButtonExtensions>(root => ({
		press () {
			root.element.click();
			return root;
		},
	}));
};

const standaloneButton = Button("Save");
const composedButton = Component("button").and(Button, "Save");
const maybeButton = Component("div").as(Button);

standaloneButton.press();
composedButton.press();

if (composedButton.is(Button)) {
	composedButton.press();
}

maybeButton?.press();

const directButton = Component("button").extend<ButtonExtensions>(root => ({
	press () {
		root.element.click();
		return root;
	},
}));

directButton.press().attribute.set("type", "button");

const draggableHost = Component("div").and(Draggable, {
	threshold: 4,
});
draggableHost.draggable.phase.subscribe(draggableHost, phase => {
	phase satisfies "idle" | "pending" | "dragging";
});
const plainDragEventHost = Component();
// @ts-expect-error Drag events should only be exposed by Draggable components.
plainDragEventHost.event.owned.on.DragStart(() => undefined);
draggableHost.event.owned.on.DragStart(event => {
	event.component.draggable.cancel();
	event.detail.component.draggable.cancel();
	event.detail.position.current.x.toFixed();
});
draggableHost.event.owned.once.DragStart(event => event.component.draggable.cancel(), 10) satisfies typeof draggableHost;
draggableHost.event.on.click(standaloneOwner, event => event.component satisfies typeof draggableHost, -1);
draggableHost.event.next.DragStart() satisfies Promise<{ readonly component: typeof draggableHost }>;
draggableHost.event.has.click() satisfies boolean;
draggableHost.event.has.click(event => event.clientX, 2) satisfies boolean;
draggableHost.event.until(draggableHost.event.when.DragEnd, emitterPlayer.event.when.removed).on.pointermove(event => event.clientX.toFixed());
draggableHost.event.limit.click(10) satisfies typeof draggableHost;

const dropTargetHost = Component("div").and(DropTarget, {
	accepts: ({ draggable }) => draggable.is(Draggable),
	drop: ({ position }) => {
		position.x satisfies number;
	},
});
dropTargetHost.dropTarget.hovering.subscribe(dropTargetHost, hovering => {
	hovering satisfies boolean;
});

if (false) {
	// @ts-expect-error DropTarget requires accepts.
	Component("div").and(DropTarget, {
		drop: () => {},
	});
	// @ts-expect-error DropTarget requires drop.
	Component("div").and(DropTarget, {
		accepts: () => true,
	});
}

const ItemTransfer = Sortable.Transfer<{ id: string; label: string }>("items");
const typedTransfer: SortableTransfer<{ id: string; label: string }> = ItemTransfer;
const incompatibleTransfer = Sortable.Transfer<{ id: number; label: string }>("other-items");
// @ts-expect-error transfer token item types should not be interchangeable.
const rejectedTransfer: SortableTransfer<{ id: string; label: string }> = incompatibleTransfer;
interface SortableItem {
	id: string;
	label: string;
}
const defaultKeySortableHost = Sortable<SortableItem>([
	{ id: "default", label: "Default" },
], {
	placeholder: (_component, key) => {
		key satisfies number;
		return Component("li");
	},
	render: (item, key, index) => {
		item.value.id.toUpperCase();
		key satisfies number;
		index.toFixed();
		return Component("li");
	},
});
const directAndSortableHost = Component("ul").and(Sortable, [
	{ id: "direct", label: "Direct" },
], {
	key: item => item.id,
	placeholder: (component, key) => {
		key satisfies string;
		component.draggable.cancel();
		return Component("li");
	},
	render: (item, key, index) => {
		item.value.label.toUpperCase();
		key satisfies string;
		index.toFixed();
		return Component("li");
	},
	transfer: ItemTransfer,
});
const typedSortable = Sortable as ComponentBuilderFunction<
	[readonly SortableItem[], SortableOptions<SortableItem, Component, string>],
	Component & SortableExtensions<SortableItem, Component, string>
>;
const sortableHost = Component("ul").and(typedSortable, [
	{ id: "a", label: "Alpha" },
], {
	key: item => item.id,
	placeholder: (component, key) => {
		key satisfies string;
		component.draggable.cancel();
		return Component("li");
	},
	render: (item, key, index) => {
		item.value.label.toUpperCase();
		key satisfies string;
		index.toFixed();
		// @ts-expect-error Sortable render receives readonly item state.
		item.set({ id: "b", label: "Beta" });
		return Component("li");
	},
	transfer: ItemTransfer,
});

void typedTransfer;
void rejectedTransfer;
void defaultKeySortableHost;
void directAndSortableHost;
void sortableHost;
