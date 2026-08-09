import { describe, expect, it, vi } from "vitest";
import { Component } from "../../src/component/Component";
import {
	beginDOMTreeTransaction,
	DOMTree,
	registerDOMTreeNode,
	unregisterDOMTreeNode,
} from "../../src/component/DOMTree";
import breakdownExtension from "../../src/component/extensions/breakdownExtension";
import placeExtension, { type Place } from "../../src/component/extensions/placeExtension";
import { Marker } from "../../src/component/Marker";
import { State } from "../../src/state/State";

breakdownExtension();
placeExtension();

function mountedComponent<NAME extends keyof HTMLElementTagNameMap = "div"> (tagName: NAME = "div" as NAME): Component<HTMLElementTagNameMap[NAME]> {
	return Component(tagName).appendTo(document.body);
}

function nodes (...values: Array<Component | Marker | Node>): Node[] {
	return values.map((value) => {
		if (value instanceof Component) {
			return value.element;
		}

		if (value instanceof Marker) {
			return value.node;
		}

		return value;
	});
}

function countPhysicalChildListSnapshots (parent: Node, action: () => void): number {
	const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, "childNodes");
	if (!descriptor?.configurable || !descriptor.get) throw new Error("Node.prototype.childNodes must be a configurable getter for this performance invariant.");
	let reads = 0;
	Object.defineProperty(Node.prototype, "childNodes", {
		...descriptor,
		get (this: Node) {
			if (this === parent) reads += 1;
			return descriptor.get!.call(this);
		},
	});

	try {
		action();
	} finally {
		Object.defineProperty(Node.prototype, "childNodes", descriptor);
	}

	return reads;
}

const coreMoveRoutes = [
	["append", (destination: Component, _anchor: Component, movable: Component | Node) => destination.append(movable)],
	["prepend", (destination: Component, _anchor: Component, movable: Component | Node) => destination.prepend(movable)],
	["sibling insert", (_destination: Component, anchor: Component, movable: Component | Node) => anchor.insert("before", movable)],
] as const;

describe("Component movement", () => {
	it("keeps Breakdown one-by-one keyed appends within a constant physical snapshot budget", () => {
		const partCount = 32;
		const host = mountedComponent("section");
		const source = State(host, partCount);

		try {
			const snapshots = countPhysicalChildListSnapshots(host.element, () => {
				Component.Breakdown(host, source, (Part, count) => {
					for (let index = 0; index < count; index += 1) {
						host.append(Part(index, () => Component("span")));
					}
				});
			});

			expect.soft(host.element.children).toHaveLength(partCount);
			expect(snapshots).toBeLessThanOrEqual(3);
		} finally {
			host.remove();
		}
	});

	it("keeps ordinary singleton appends within a constant physical snapshot budget", () => {
		const childCount = 32;
		const host = mountedComponent("section");

		try {
			const snapshots = countPhysicalChildListSnapshots(host.element, () => {
				for (let index = 0; index < childCount; index += 1) {
					host.append(Component("span"));
				}
			});

			expect.soft(host.element.children).toHaveLength(childCount);
			expect(snapshots).toBeLessThanOrEqual(3);
		} finally {
			host.remove();
		}
	});

	it("public fragment placement skips disposed registered descendants immediately and transactionally", () => {
		const placeFragment = (transactional: boolean): string[] => {
			const host = mountedComponent();
			const fragment = document.createDocumentFragment();
			const deadComponent = Component("span").text.set("dead-component");
			const deadMarker = Marker("dead-marker");
			const live = ["a", "b", "c"].map((text) => Object.assign(document.createElement("i"), { textContent: text }));
			deadComponent.remove();
			deadMarker.remove();
			fragment.append(live[0], deadComponent.element, live[1], deadMarker.node, live[2]);
			const transaction = transactional ? beginDOMTreeTransaction() : null;

			host.append(fragment);
			transaction?.commit();

			const result = Array.from(host.element.childNodes, node => node instanceof Comment ? `<!--${node.data}-->` : node.textContent ?? "");
			host.remove();
			return result;
		};

		expect({
			immediate: placeFragment(false),
			transactional: placeFragment(true),
		}).toEqual({
			immediate: ["a", "b", "c"],
			transactional: ["a", "b", "c"],
		});
	});

	it("normalizes Fragment children into synchronous virtual intent before transactional materialization", () => {
		const parent = document.createElement("div");
		const fragment = document.createDocumentFragment();
		const first = document.createElement("span");
		const second = document.createTextNode("second");
		fragment.append(first, second);
		const transaction = beginDOMTreeTransaction();

		DOMTree.place([fragment], { type: "append", parent });

		expect.soft(Array.from(parent.childNodes)).toEqual([]);
		expect.soft(DOMTree.childrenOf(parent)).toEqual([first, second]);
		expect.soft(DOMTree.childrenOf(fragment)).toEqual([]);
		expect.soft(DOMTree.parentOf(first)).toBe(parent);
		expect.soft(DOMTree.parentOf(second)).toBe(parent);

		transaction.commit();
		expect(Array.from(parent.childNodes)).toEqual([first, second]);
	});

	it.each([
		["immediate", false],
		["transactional", true],
	] as const)("replaces prior placement authority for native Fragment children during %s placement", async (_mode, transactional) => {
		vi.useFakeTimers();
		const queuedMicrotasks: VoidFunction[] = [];
		const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => queuedMicrotasks.push(callback));
		const sourceHost = mountedComponent("section");
		const finalHost = mountedComponent("aside");
		const visible = State(sourceHost, false);
		const child = Component("span");
		const marker = Marker("fragment-child");
		const childMount = vi.fn();
		const markerMount = vi.fn();
		child.event.owned.on.Mount(childMount);
		marker.event.owned.on.Mount(markerMount);
		sourceHost.appendWhen(visible, child);
		const fragment = document.createDocumentFragment();
		fragment.append(child.element, marker.node);
		const transaction = transactional ? beginDOMTreeTransaction() : null;

		try {
			finalHost.append(fragment);
			expect.soft([DOMTree.parentOf(child.element), DOMTree.parentOf(marker.node)]).toEqual([finalHost.element, finalHost.element]);
			expect.soft([child.element.parentNode, marker.node.parentNode]).toEqual(transactional ? [fragment, fragment] : [finalHost.element, finalHost.element]);
			expect.soft(marker.owner.get(), "Marker ownership should follow virtual placement synchronously").toBe(finalHost);
			expect.soft([childMount, markerMount].map(mount => mount.mock.calls.length)).toEqual(transactional ? [0, 0] : [1, 1]);

			transaction?.commit();
			expect.soft([child.element.parentNode, marker.node.parentNode]).toEqual([finalHost.element, finalHost.element]);
			expect.soft([childMount, markerMount].map(mount => mount.mock.calls.length)).toEqual([1, 1]);

			visible.set(true);
			for (const flush of queuedMicrotasks.splice(0)) flush();
			expect.soft([DOMTree.parentOf(child.element), child.element.parentNode], "showing through the old controller must not reacquire the child").toEqual([finalHost.element, finalHost.element]);
			visible.set(false);
			for (const flush of queuedMicrotasks.splice(0)) flush();
			expect.soft([DOMTree.parentOf(child.element), child.element.parentNode], "hiding through the old controller must not reacquire the child").toEqual([finalHost.element, finalHost.element]);
			expect.soft(() => finalHost.remove()).not.toThrow();
			expect.soft([child.disposed, marker.disposed]).toEqual([true, true]);
			await vi.runAllTimersAsync();
			await Promise.resolve();
			const deferredErrors = queuedMicrotasks.flatMap((callback) => {
				try {
					callback();
					return [];
				} catch (error) {
					return [error];
				}
			});
			expect(deferredErrors).toEqual([]);
		} finally {
			queueMicrotaskSpy.mockRestore();
			vi.useRealTimers();
			if (!sourceHost.disposed) sourceHost.remove();
			if (!finalHost.disposed) finalHost.remove();
			if (!child.disposed) child.remove();
			if (!marker.disposed) marker.remove();
		}
	});

	it("preserves Component, raw-node, and string order through the shared tree boundary", () => {
		const host = mountedComponent();
		const first = Component("span").text.set("first");
		const raw = document.createElement("hr");
		const last = Component("span").text.set("last");

		host.append(first, "middle", raw, last);

		expect(Array.from(host.element.childNodes)).toEqual([
			first.element,
			host.element.childNodes[1],
			raw,
			last.element,
		]);
		expect(host.element.childNodes[1]).toBeInstanceOf(Text);
		expect(host.element.childNodes[1].textContent).toBe("middle");
		host.remove();
	});

	it("append moves already-placed siblings to the tail in argument order", () => {
		const host = mountedComponent();
		const alpha = Component("span");
		const beta = Component("span");
		const gamma = Component("span");
		const delta = Component("span");

		host.append(alpha, beta, gamma, delta);
		host.append(beta, alpha);

		expect(Array.from(host.element.childNodes)).toEqual(nodes(gamma, delta, beta, alpha));
		host.remove();
	});

	it("prepend moves already-placed siblings to the head in argument order", () => {
		const host = mountedComponent();
		const alpha = Component("span");
		const beta = Component("span");
		const gamma = Component("span");
		const delta = Component("span");

		host.append(alpha, beta, gamma, delta);
		host.prepend(gamma, delta);

		expect(Array.from(host.element.childNodes)).toEqual(nodes(gamma, delta, alpha, beta));
		host.remove();
	});

	it("insert before moves an ordered group of existing siblings before its anchor", () => {
		const host = mountedComponent();
		const alpha = Component("span");
		const beta = Component("span");
		const gamma = Component("span");
		const anchor = Component("b");
		const trailing = Component("span");

		host.append(alpha, beta, gamma, anchor, trailing);
		anchor.insert("before", gamma, alpha);

		expect(Array.from(host.element.childNodes)).toEqual(nodes(beta, gamma, alpha, anchor, trailing));
		host.remove();
	});

	it("insert after moves an ordered group of existing siblings after its anchor", () => {
		const host = mountedComponent();
		const anchor = Component("b");
		const alpha = Component("span");
		const beta = Component("span");
		const gamma = Component("span");

		host.append(anchor, alpha, beta, gamma);
		anchor.insert("after", gamma, alpha);

		expect(Array.from(host.element.childNodes)).toEqual(nodes(anchor, gamma, alpha, beta));
		host.remove();
	});

	it("sequential appendTo and prependTo calls preserve imperative same-parent order", () => {
		const host = mountedComponent();
		const alpha = Component("span");
		const beta = Component("span");
		const gamma = Component("span");

		host.append(alpha, beta, gamma);
		beta.appendTo(host);
		gamma.prependTo(host);
		alpha.appendTo(host);

		expect(Array.from(host.element.childNodes)).toEqual(nodes(gamma, beta, alpha));
		host.remove();
	});

	it("insertTo before and after repositions one live component without cloning it", () => {
		const host = mountedComponent();
		const alpha = Component("span");
		const moving = Component("strong");
		const omega = Component("span");
		const element = moving.element;

		host.append(alpha, moving, omega);
		moving.insertTo("after", omega);
		expect(Array.from(host.element.childNodes)).toEqual(nodes(alpha, omega, moving));

		moving.insertTo("before", alpha);
		expect(Array.from(host.element.childNodes)).toEqual(nodes(moving, alpha, omega));
		expect(moving.element).toBe(element);
		expect(moving.disposed).toBe(false);
		host.remove();
	});

	it("insertTo resolves Component, raw Node, Marker, and Place references", () => {
		const owner = mountedComponent("section");
		const host = mountedComponent();
		const componentAnchor = Component("span").appendTo(host);
		const rawAnchor = document.createElement("hr");
		host.element.append(rawAnchor);
		const markerAnchor = Marker("anchor").appendTo(host);
		const placed = Component("i");
		const placeState = State<Place | null>(owner, null);
		let place!: Place;

		placed.place(owner, (PlaceConstructor) => {
			place = PlaceConstructor().appendTo(host);
			return placeState;
		});

		const beforeComponent = Component("span").insertTo("before", componentAnchor);
		const afterRaw = Component("span").insertTo("after", rawAnchor);
		const beforeMarker = Component("span").insertTo("before", markerAnchor);
		const beforePlace = Component("span").insertTo("before", place);

		expect(Array.from(host.element.childNodes)).toEqual(nodes(
			beforeComponent,
			componentAnchor,
			rawAnchor,
			afterRaw,
			beforeMarker,
			markerAnchor,
			beforePlace,
			place.marker,
		));

		owner.remove();
		host.remove();
	});

	it("cross-parent append, prepend, and insert detach each component from its old parent", () => {
		const source = mountedComponent("section");
		const destination = mountedComponent();
		const alpha = Component("span");
		const beta = Component("span");
		const gamma = Component("span");
		const anchor = Component("b").appendTo(destination);

		source.append(alpha, beta, gamma);
		alpha.appendTo(destination);
		beta.prependTo(destination);
		gamma.insertTo("after", anchor);

		expect(source.element.childNodes).toHaveLength(0);
		expect(Array.from(destination.element.childNodes)).toEqual(nodes(beta, anchor, gamma, alpha));
		expect(new Set(destination.element.childNodes).size).toBe(4);

		destination.remove();
		source.remove();
	});

	it("Marker append, prepend, and before/after insertion preserve identity and exact order", () => {
		const host = mountedComponent();
		const anchor = Marker("anchor").appendTo(host);
		const appended = Marker("appended").appendTo(host);
		const prepended = Marker("prepended").prependTo(host);
		const before = Marker("before").insertTo("before", anchor);
		const after = Marker("after").insertTo("after", anchor);

		expect(Array.from(host.element.childNodes)).toEqual(nodes(prepended, before, anchor, after, appended));
		expect(anchor.node.marker).toBe(anchor);
		expect(after.node.marker).toBe(after);

		host.remove();
	});

	it("Marker movement between parents preserves one marker and fires Mount once", () => {
		const first = mountedComponent();
		const second = mountedComponent("section");
		const marker = Marker("moving");
		const mount = vi.fn();

		marker.event.owned.on.Mount(mount);
		marker.appendTo(first);
		marker.prependTo(second);
		marker.appendTo(first);

		expect(mount).toHaveBeenCalledTimes(1);
		expect(first.element.childNodes).toHaveLength(1);
		expect(first.element.firstChild).toBe(marker.node);
		expect(second.element.childNodes).toHaveLength(0);

		first.remove();
		second.remove();
	});

	it.each(["append", "prepend", "insert"] as const)("failed Marker %s against a disposed Component leaves the Marker live and unowned", (mode) => {
		const target = mountedComponent();
		const marker = Marker(`failed-${mode}`);
		target.remove();

		try {
			expect(() => {
				if (mode === "append") marker.appendTo(target);
				else if (mode === "prepend") marker.prependTo(target);
				else marker.insertTo("before", target);
			}).toThrow();
			expect(marker.disposed).toBe(false);
			expect(marker.owner.get()).toBeNull();
		} finally {
			if (!marker.disposed) marker.remove();
		}
	});

	it.each(["before", "after"] as const)("failed Marker insertTo %s a detached node preserves its placement owner and position", (where) => {
		const host = mountedComponent();
		const marker = Marker(`failed-detached-${where}`).appendTo(host);
		const detachedTarget = document.createElement("hr");

		try {
			expect(() => marker.insertTo(where, detachedTarget)).toThrow("Insert target was not found.");
			expect(marker.owner.get()).toBe(host);
			expect(marker.node.parentNode).toBe(host.element);
			expect(marker.disposed).toBe(false);
		} finally {
			if (!marker.disposed) marker.remove();
			host.remove();
		}
	});

	it.each(["Component", "Marker"] as const)("relative Marker insertion follows all explicit owners of a %s target", (targetType) => {
		const firstOwner = mountedComponent("section");
		const secondOwner = mountedComponent("aside");
		const host = mountedComponent("div");
		const target = targetType === "Component" ? Component("span") : Marker("multi-owner-target");
		target.owner.add(firstOwner);
		target.owner.add(secondOwner);
		const targetNode = target instanceof Component ? target.element : target.node;
		host.element.append(targetNode);
		const inserted = Marker(`before-${targetType}`).insertTo("before", target);

		try {
			firstOwner.remove();
			expect.soft(target.disposed).toBe(false);
			expect.soft(inserted.disposed).toBe(false);
			expect.soft(inserted.node.parentNode).toBe(host.element);

			secondOwner.remove();
			expect.soft(target.disposed).toBe(true);
			expect(inserted.disposed).toBe(true);
		} finally {
			if (!inserted.disposed) inserted.remove();
			if (!target.disposed) target.remove();
			if (!firstOwner.disposed) firstOwner.remove();
			if (!secondOwner.disposed) secondOwner.remove();
			host.remove();
		}
	});

	it("already-satisfied append, prepend, before, and after requests preserve exact node order", () => {
		const host = mountedComponent();
		const first = Component("span");
		const middle = Component("span");
		const last = Component("span");

		host.append(first, middle, last);
		first.prependTo(host);
		last.appendTo(host);
		middle.insertTo("after", first);
		middle.insertTo("before", last);

		expect(Array.from(host.element.childNodes)).toEqual(nodes(first, middle, last));
		host.remove();
	});

	it("repeated movement keeps explicit ownership and dispatches Mount only once", () => {
		const owner = mountedComponent("section");
		const first = mountedComponent();
		const second = mountedComponent("aside");
		const moving = Component("span").owner.add(owner);
		const mount = vi.fn();

		moving.event.owned.on.Mount(mount);
		moving.appendTo(first);
		moving.prependTo(second);
		moving.insertTo("after", Component("b").appendTo(first));

		expect(moving.owner.get()).toBe(owner);
		expect(moving.disposed).toBe(false);
		expect(mount).toHaveBeenCalledTimes(1);

		first.remove();
		second.remove();
		expect(moving.disposed).toBe(false);

		owner.remove();
		expect(moving.disposed).toBe(true);
	});

	it("keeps nested transactions recoverable after an out-of-order commit attempt", () => {
		const parent = document.createElement("div");
		const child = document.createElement("span");
		const outer = beginDOMTreeTransaction();
		const inner = beginDOMTreeTransaction();

		expect(() => outer.commit()).toThrow("DOM tree transactions must close in stack order.");
		DOMTree.place([child], { type: "append", parent });
		inner.commit();
		outer.commit();

		expect(Array.from(parent.childNodes)).toEqual([child]);
		expect(DOMTree.active).toBe(false);
	});

	it("rebuilds excluded relative placements when their reference returns", () => {
		const parent = document.createElement("div");
		const source = document.createElement("section");
		const moving = document.createElement("span");
		const reference = document.createElement("hr");
		parent.append(reference);
		source.append(moving);
		const transaction = beginDOMTreeTransaction();

		DOMTree.place([moving], { type: "before", reference });
		DOMTree.remove(reference);
		expect(DOMTree.parentOf(reference)).toBeNull();
		DOMTree.place([reference], { type: "append", parent });
		transaction.commit();

		expect(Array.from(parent.childNodes)).toEqual([moving, reference]);
		expect(source.childNodes).toHaveLength(0);
	});

	it("resolves a relative placement whose detached reference is placed later in the transaction", () => {
		const parent = document.createElement("div");
		const moving = document.createElement("span");
		const reference = document.createElement("hr");
		const transaction = beginDOMTreeTransaction();
		DOMTree.childrenOf(parent);

		DOMTree.place([moving], { type: "before", reference });
		DOMTree.place([reference], { type: "append", parent });
		expect.soft(DOMTree.parentOf(moving)).toBe(parent);
		expect.soft(DOMTree.childrenOf(parent)).toEqual([moving, reference]);
		transaction.commit();

		expect(Array.from(parent.childNodes)).toEqual([moving, reference]);
	});

	it("keeps a later removal authoritative over a deferred relative placement", () => {
		const source = document.createElement("section");
		const destination = document.createElement("div");
		const moving = document.createElement("span");
		const reference = document.createElement("hr");
		source.append(moving);
		const transaction = beginDOMTreeTransaction();

		DOMTree.place([moving], { type: "before", reference });
		DOMTree.remove(moving);
		DOMTree.place([reference], { type: "append", parent: destination });
		transaction.commit();

		expect.soft(Array.from(destination.childNodes)).toEqual([reference]);
		expect(moving.parentNode).toBeNull();
	});

	it("preserves a deferred relative placement after its reference is prepended", () => {
		const parent = document.createElement("div");
		const moving = document.createElement("span");
		const reference = document.createElement("hr");
		const transaction = beginDOMTreeTransaction();

		DOMTree.place([moving], { type: "append", parent });
		DOMTree.place([moving], { type: "before", reference });
		DOMTree.place([reference], { type: "prepend", parent });
		transaction.commit();

		expect(Array.from(parent.childNodes)).toEqual([moving, reference]);
	});

	it("converges chained relative placements whose final reference is placed later", () => {
		const parent = document.createElement("div");
		const moving = document.createElement("span");
		const middle = document.createElement("hr");
		const final = document.createElement("br");
		const transaction = beginDOMTreeTransaction();

		DOMTree.place([moving], { type: "before", reference: middle });
		DOMTree.place([middle], { type: "before", reference: final });
		DOMTree.place([final], { type: "append", parent });
		transaction.commit();

		expect(Array.from(parent.childNodes)).toEqual([moving, middle, final]);
	});

	it("keeps a later placement authoritative after resolving an earlier future reference", () => {
		const relativeParent = document.createElement("div");
		const finalParent = document.createElement("section");
		const moving = document.createElement("span");
		const reference = document.createElement("hr");
		const transaction = beginDOMTreeTransaction();

		DOMTree.place([moving], { type: "before", reference });
		DOMTree.place([moving], { type: "append", parent: finalParent });
		DOMTree.place([reference], { type: "append", parent: relativeParent });
		transaction.commit();

		expect(Array.from(relativeParent.childNodes)).toEqual([reference]);
		expect(Array.from(finalParent.childNodes)).toEqual([moving]);
	});

	it("resolves queued Marker ownership from a raw target's final light-DOM parent", () => {
		const ownerA = mountedComponent("section");
		const ownerB = mountedComponent("aside");
		const rawTarget = document.createElement("div");
		const marker = Marker("queued-light-owner");
		ownerA.element.append(rawTarget);
		const transaction = beginDOMTreeTransaction();
		marker.appendTo(rawTarget);
		DOMTree.place([rawTarget], { type: "append", parent: ownerB.element });

		try {
			transaction.commit();
			expect.soft(rawTarget.parentNode).toBe(ownerB.element);
			expect.soft(marker.owner.get()).toBe(ownerB);

			ownerA.remove();
			expect.soft(marker.disposed).toBe(false);
			ownerB.remove();
			expect(marker.disposed).toBe(true);
		} finally {
			if (!ownerA.disposed) ownerA.remove();
			if (!ownerB.disposed) ownerB.remove();
			if (!marker.disposed) marker.remove();
		}
	});

	it("resolves queued Component ownership from a raw target's final ShadowRoot host", () => {
		const hostA = mountedComponent("section");
		const hostB = mountedComponent("aside");
		const shadowA = hostA.element.attachShadow({ mode: "open" });
		const shadowB = hostB.element.attachShadow({ mode: "closed" });
		const rawTarget = document.createElement("div");
		const child = Component("span");
		shadowA.append(rawTarget);
		const transaction = beginDOMTreeTransaction();
		child.appendTo(rawTarget);
		DOMTree.place([rawTarget], { type: "append", parent: shadowB });

		try {
			transaction.commit();
			expect.soft(rawTarget.parentNode).toBe(shadowB);
			expect.soft(child.element.parentNode).toBe(rawTarget);
			expect.soft(child.owner.get()).toBe(hostB);

			hostA.remove();
			expect.soft(child.disposed).toBe(false);
			hostB.remove();
			expect(child.disposed).toBe(true);
		} finally {
			if (!hostA.disposed) hostA.remove();
			if (!hostB.disposed) hostB.remove();
			if (!child.disposed) child.remove();
		}
	});

	it("owns Component and Marker placements across a ShadowRoot host boundary", () => {
		const host = mountedComponent();
		const shadowRoot = host.element.attachShadow({ mode: "open" });
		const child = Component("span").appendTo(shadowRoot);
		const marker = Marker("shadow-child").appendTo(shadowRoot);

		try {
			expect(Array.from(shadowRoot.childNodes)).toEqual(nodes(child, marker));
			expect.soft(marker.owner.get()).toBe(host);

			host.remove();

			expect.soft(child.disposed).toBe(true);
			expect.soft(marker.disposed).toBe(true);
		} finally {
			if (!host.disposed) host.remove();
			if (!child.disposed) child.remove();
			if (!marker.disposed) marker.remove();
		}
	});

	it.each(coreMoveRoutes.flatMap(([route, move]) => ([
		[route, "Component", move],
		[route, "Marker node", move],
	] as const)))("core %s clears stale ShadowRoot ownership when moving a %s", (_route, kind, move) => {
		const oldHost = mountedComponent("section");
		const shadowRoot = oldHost.element.attachShadow({ mode: "open" });
		const destination = mountedComponent("aside");
		const anchor = Component("i").appendTo(destination);
		const subject = kind === "Component"
			? Component("span").appendTo(shadowRoot)
			: Marker("shadow-move").appendTo(shadowRoot);
		const movable = subject instanceof Component ? subject : subject.node;
		const subjectNode = subject instanceof Component ? subject.element : subject.node;

		try {
			move(destination, anchor, movable);
			expect.soft(subjectNode.parentNode).toBe(destination.element);

			oldHost.remove();
			expect.soft(subject.disposed).toBe(false);
			expect.soft(subjectNode.parentNode).toBe(destination.element);

			destination.remove();
			expect(subject.disposed).toBe(true);
		} finally {
			if (!oldHost.disposed) oldHost.remove();
			if (!destination.disposed) destination.remove();
			if (!subject.disposed) subject.remove();
			if (!anchor.disposed) anchor.remove();
		}
	});

	it("manages a wrapped Component natively appended inside a host ShadowRoot", async () => {
		const queuedErrors: VoidFunction[] = [];
		const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => queuedErrors.push(callback));
		const host = mountedComponent();
		const shadowRoot = host.element.attachShadow({ mode: "open" });
		const child = Component("span");
		shadowRoot.append(child.element);

		try {
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			await Promise.resolve();
			expect.soft(queuedErrors).toEqual([]);
			expect.soft(child.disposed).toBe(false);
			expect.soft(child.element.parentNode).toBe(shadowRoot);

			host.remove();
			expect(child.disposed).toBe(true);
		} finally {
			queueMicrotaskSpy.mockRestore();
			if (!host.disposed) host.remove();
			if (!child.disposed) child.remove();
		}
	});

	it("rejects an immediate host move into a descendant inside its open ShadowRoot", () => {
		const host = document.createElement("div");
		const shadowRoot = host.attachShadow({ mode: "open" });
		const descendant = document.createElement("span");
		shadowRoot.append(descendant);
		document.body.append(host);
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		try {
			expect.soft(() => DOMTree.place([host], { type: "append", parent: descendant })).not.toThrow();
			expect.soft(host.parentNode).toBe(document.body);
			expect.soft(shadowRoot.host).toBe(host);
			expect.soft(descendant.parentNode).toBe(shadowRoot);
			expect(consoleErrorSpy.mock.calls).toEqual([["Cannot move a node into itself or one of its descendants."]]);
		} finally {
			consoleErrorSpy.mockRestore();
			host.remove();
		}
	});

	it("rejects a transactional host move into a descendant inside its closed ShadowRoot", () => {
		const host = document.createElement("div");
		const shadowRoot = host.attachShadow({ mode: "closed" });
		const descendant = document.createElement("span");
		shadowRoot.append(descendant);
		document.body.append(host);
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
		const transaction = beginDOMTreeTransaction();
		DOMTree.place([host], { type: "append", parent: descendant });

		try {
			expect.soft(() => transaction.commit()).not.toThrow();
			expect.soft(host.parentNode).toBe(document.body);
			expect.soft(shadowRoot.host).toBe(host);
			expect.soft(descendant.parentNode).toBe(shadowRoot);
			expect(consoleErrorSpy.mock.calls).toEqual([["Cannot move a node into itself or one of its descendants."]]);
		} finally {
			consoleErrorSpy.mockRestore();
			host.remove();
		}
	});

	it("skips a transactional ShadowRoot placement after its host is disposed", () => {
		const host = mountedComponent();
		const shadowRoot = host.element.attachShadow({ mode: "open" });
		const child = Component("span");
		const mount = vi.fn();
		child.event.owned.on.Mount(mount);
		const transaction = beginDOMTreeTransaction();

		try {
			child.appendTo(shadowRoot);
			host.remove();
			expect.soft(() => transaction.commit()).not.toThrow();
			expect(mount).not.toHaveBeenCalled();
			expect(child.element.parentNode).toBeNull();
			expect(child.owner.get()).toBeNull();
		} finally {
			if (!host.disposed) host.remove();
			if (!child.disposed) child.remove();
		}
	});

	it.each(["open", "closed"] as const)("rejects immediate Component and Marker placement into a stale %s ShadowRoot", (mode) => {
		const host = mountedComponent();
		const shadowRoot = host.element.attachShadow({ mode });
		const child = Component("span");
		const marker = Marker(`stale-${mode}`);
		const childMount = vi.fn();
		const markerMount = vi.fn();
		child.event.owned.on.Mount(childMount);
		marker.event.owned.on.Mount(markerMount);
		host.remove();

		try {
			child.appendTo(shadowRoot);
			marker.appendTo(shadowRoot);
			expect.soft(shadowRoot.childNodes).toHaveLength(0);
			expect.soft([childMount, markerMount].map(mount => mount.mock.calls.length)).toEqual([0, 0]);
			expect([child.owner.get(), marker.owner.get()]).toEqual([null, null]);
		} finally {
			if (!child.disposed) child.remove();
			if (!marker.disposed) marker.remove();
		}
	});

	it("keeps ShadowRoot descendant connectivity stable after caching the root parent", () => {
		const host = mountedComponent();
		const shadowRoot = host.element.attachShadow({ mode: "open" });
		const child = document.createElement("span");
		shadowRoot.append(child);
		const transaction = beginDOMTreeTransaction();

		try {
			expect(DOMTree.isConnected(child)).toBe(true);
			DOMTree.parentOf(shadowRoot);
			expect(DOMTree.isConnected(child)).toBe(true);
		} finally {
			transaction.commit();
			host.remove();
		}
	});

	it("disposes an implicit child removed virtually before its parent is disposed", () => {
		const parent = mountedComponent("section");
		const child = Component("span");
		parent.append(child);
		const transaction = beginDOMTreeTransaction();

		DOMTree.remove(child.element);
		parent.remove();
		transaction.commit();

		try {
			expect.soft(child.disposed).toBe(true);
			expect(child.element.parentNode).toBeNull();
		} finally {
			if (!child.disposed) child.remove();
		}
	});

	it.each(["append", "prepend", "before", "after"] as const)("skips a satisfied immediate %s physical move and still calls back", (type) => {
		const parent = document.createElement("div");
		const moving = document.createElement("span");
		const reference = document.createElement("hr");
		const movingFirst = type === "prepend" || type === "before";
		parent.append(...(movingFirst ? [moving, reference] : [reference, moving]));
		const insertBefore = vi.spyOn(parent, "insertBefore");
		const onPlaced = vi.fn();
		const placement = type === "append" || type === "prepend"
			? { type, parent }
			: { type, reference };

		DOMTree.place([moving], placement, onPlaced);

		expect(onPlaced.mock.calls).toEqual([[moving]]);
		expect(insertBefore).not.toHaveBeenCalled();
	});

	it("skips a satisfied connected physical moveBefore and still calls back", () => {
		const parent = document.createElement("div");
		const moving = document.createElement("span");
		const moveBefore = vi.fn();
		const onPlaced = vi.fn();
		Object.assign(parent, { moveBefore });
		parent.append(moving);
		document.body.append(parent);

		try {
			DOMTree.place([moving], { type: "append", parent }, onPlaced);

			expect(onPlaced.mock.calls).toEqual([[moving]]);
			expect(moveBefore).not.toHaveBeenCalled();
		} finally {
			parent.remove();
		}
	});

	it("does not use a failed rightmost transaction insertion as the next physical anchor", () => {
		const parent = document.createElement("div");
		const left = document.createElement("span");
		const right = document.createElement("span");
		const originalInsertBefore = parent.insertBefore.bind(parent);
		const insertBeforeSpy = vi.spyOn(parent, "insertBefore").mockImplementation((node, child) => {
			if (node === right) {
				throw new DOMException("recursive insertion", "HierarchyRequestError");
			}

			return originalInsertBefore(node, child);
		});
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
		const transaction = beginDOMTreeTransaction();

		DOMTree.place([left, right], { type: "append", parent });

		try {
			expect(() => transaction.commit()).not.toThrow();
			expect(right.parentNode).toBeNull();
			expect(Array.from(parent.childNodes)).toEqual([left]);
			expect(consoleErrorSpy).toHaveBeenCalledWith("Cannot move a node into itself or one of its descendants.");
		} finally {
			insertBeforeSpy.mockRestore();
			consoleErrorSpy.mockRestore();
		}
	});

	it("does not call onPlaced when a transactional physical reorder fails", () => {
		const parent = document.createElement("div");
		const alpha = document.createElement("span");
		const beta = document.createElement("span");
		parent.append(alpha, beta);
		const originalInsertBefore = parent.insertBefore.bind(parent);
		const insertBeforeSpy = vi.spyOn(parent, "insertBefore").mockImplementation((node, child) => {
			if (node === alpha && child === null) {
				throw new DOMException("recursive insertion", "HierarchyRequestError");
			}

			return originalInsertBefore(node, child);
		});
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
		const onPlaced = vi.fn();
		const transaction = beginDOMTreeTransaction();

		DOMTree.place([alpha], { type: "after", reference: beta }, onPlaced);

		try {
			expect.soft(() => transaction.commit()).not.toThrow();
			expect.soft(Array.from(parent.childNodes)).toEqual([alpha, beta]);
			expect.soft(consoleErrorSpy).toHaveBeenCalledWith("Cannot move a node into itself or one of its descendants.");
			expect(onPlaced).not.toHaveBeenCalled();
		} finally {
			insertBeforeSpy.mockRestore();
			consoleErrorSpy.mockRestore();
		}
	});

	it("suppresses a per-operation callback captured for a stale registration generation", () => {
		const parent = document.createElement("div");
		const first = document.createElement("i");
		const stale = document.createElement("span");
		const oldOperation = vi.fn();
		const oldRegistration = registerDOMTreeNode(stale, { disposed: false });
		let newRegistration: ReturnType<typeof registerDOMTreeNode> | null = null;
		const transaction = beginDOMTreeTransaction();
		DOMTree.place([first], { type: "append", parent }, () => {
			unregisterDOMTreeNode(oldRegistration);
			newRegistration = registerDOMTreeNode(stale, { disposed: false });
		});
		DOMTree.place([stale], { type: "append", parent }, oldOperation);

		try {
			transaction.commit();

			expect.soft(Array.from(parent.childNodes)).toEqual([first, stale]);
			expect(oldOperation).not.toHaveBeenCalled();
		} finally {
			if (newRegistration) unregisterDOMTreeNode(newRegistration);
		}
	});

	it("does not replay a stale Component placement callback after a Mount rewraps its element", () => {
		const host = mountedComponent();
		const first = Component("i");
		const old = Component("span");
		const replacementMount = vi.fn();
		const replacements: Component[] = [];
		first.event.owned.on.Mount(() => {
			old.remove();
			const replacement = Component(old.element);
			replacements.push(replacement);
			replacement.event.owned.on.Mount(replacementMount);
			replacement.appendTo(host);
		});
		const transaction = beginDOMTreeTransaction();
		host.append(first, old);

		try {
			transaction.commit();
			const [replacement] = replacements;

			expect.soft(old.disposed).toBe(true);
			expect.soft(replacement?.element).toBe(old.element);
			expect.soft(replacement?.element.parentNode).toBe(host.element);
			expect(replacementMount).toHaveBeenCalledOnce();
		} finally {
			if (!host.disposed) host.remove();
			for (const replacement of replacements) if (!replacement.disposed) replacement.remove();
			if (!first.disposed) first.remove();
			if (!old.disposed) old.remove();
		}
	});

	it.each([
		["immediate Fragment", true, false],
		["transactional Fragment", true, true],
		["immediate batch", false, false],
	] as const)("settles every materialized node callback after the first callback throws during %s placement", (_route, useFragment, transactional) => {
		const parent = document.createElement("div");
		const fragment = document.createDocumentFragment();
		const first = document.createElement("span");
		const later = document.createElement("b");
		const firstError = new Error("first placement callback failed");
		const callbacks: string[] = [];
		fragment.append(first, later);
		const inputs = useFragment ? [fragment] : [first, later];
		const transaction = transactional ? beginDOMTreeTransaction() : null;
		const place = () => DOMTree.place(inputs, { type: "append", parent }, (node) => {
			callbacks.push(`operation:${node === first ? "first" : "later"}`);
			if (node === first) throw firstError;
		});

		if (transaction) {
			place();
			expect.soft(() => transaction.commit()).toThrow(firstError);
		} else {
			expect.soft(place).toThrow(firstError);
		}

		expect.soft(Array.from(parent.childNodes)).toEqual([first, later]);
		if (useFragment) expect.soft(fragment.childNodes).toHaveLength(0);
		expect(callbacks).toEqual(["operation:first", "operation:later"]);
	});

	it("orders callbacks by each node's latest effective transaction placement", () => {
		const parent = document.createElement("div");
		const alpha = document.createElement("span");
		const beta = document.createElement("b");
		const oldAlpha = vi.fn();
		const callbacks: string[] = [];
		const transaction = beginDOMTreeTransaction();
		DOMTree.place([alpha], { type: "append", parent }, oldAlpha);
		DOMTree.place([beta], { type: "append", parent }, () => callbacks.push("beta"));
		DOMTree.place([alpha], { type: "append", parent }, () => callbacks.push("alpha:latest"));

		transaction.commit();

		expect.soft(Array.from(parent.childNodes)).toEqual([beta, alpha]);
		expect.soft(oldAlpha).not.toHaveBeenCalled();
		expect(callbacks).toEqual(["beta", "alpha:latest"]);
	});

	describe("multi-node placement", () => {
		function place (
			type: "append" | "prepend" | "before" | "after",
			batch: readonly ("a" | "b" | "c")[],
			transactional: boolean,
			onPlaced: (node: Node) => void = () => { },
		): string {
			const parent = document.createElement("div");
			const alpha = document.createElement("span");
			const beta = document.createElement("span");
			const gamma = document.createElement("span");
			alpha.textContent = "a";
			beta.textContent = "b";
			gamma.textContent = "c";
			parent.append(alpha, beta, gamma);
			const transaction = transactional ? beginDOMTreeTransaction() : null;
			const children = { a: alpha, b: beta, c: gamma };
			const placement = type === "append" || type === "prepend"
				? { type, parent }
				: { type, reference: beta };

			DOMTree.place(batch.map(node => children[node]), placement, onPlaced);
			transaction?.commit();

			return parent.textContent;
		}

		it.each([
			["append", ["c", "a"], "bca"],
			["prepend", ["a", "c"], "acb"],
			["before", ["c", "a"], "cab"],
			["after", ["c", "a"], "bca"],
		] as const)("treats %s nodes as one canonical ordered group", (type, batch, expected) => {
			expect(place(type, batch, false)).toBe(expected);
			expect(place(type, batch, true)).toBe(expected);
		});

		it("collapses duplicate nodes by first occurrence and calls back once per materialized node", () => {
			const immediateCallbacks: string[] = [];
			const transactionalCallbacks: string[] = [];
			const immediateOrder = place("append", ["a", "b", "a"], false, node => immediateCallbacks.push(node.textContent ?? ""));
			const transactionalOrder = place("append", ["a", "b", "a"], true, node => transactionalCallbacks.push(node.textContent ?? ""));

			expect({
				immediate: { callbacks: immediateCallbacks, order: immediateOrder },
				transactional: { callbacks: transactionalCallbacks, order: transactionalOrder },
			}).toEqual({
				immediate: { callbacks: ["a", "b"], order: "cab" },
				transactional: { callbacks: ["a", "b"], order: "cab" },
			});
		});
	});
});
