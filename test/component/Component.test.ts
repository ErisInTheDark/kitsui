import { describe, expect, it, vi } from "vitest";
import { AttributeManipulator } from "../../src/component/AttributeManipulator";
import { Component, registerComponentOwnerResolver, type ComponentSelectionState } from "../../src/component/Component";
import { DOMTree } from "../../src/component/DOMTree";
import type { Place } from "../../src/component/extensions/placeExtension";
import placeExtension from "../../src/component/extensions/placeExtension";
import { Style } from "../../src/component/Style";
import { Owner, State, type CleanupFunction } from "../../src/state/State";

declare module "../../src/component/Component" {
	interface ComponentExtensions {
		/** @hidden */
		testComponentExtension (): string;
	}
}

placeExtension();

function mountedComponent<NAME extends keyof HTMLElementTagNameMap = "div">(tagName: NAME = "div" as NAME, configure?: (component: Component<HTMLElementTagNameMap[NAME]>) => void): Component<HTMLElementTagNameMap[NAME]> {
	const component = Component(tagName);
	configure?.(component);
	return component.appendTo(document.body);
}

async function flushEffects (): Promise<void> {
	const schedulerRef = globalThis as typeof globalThis & {
		scheduler?: {
			yield?: () => Promise<unknown>;
		};
	};

	if (typeof schedulerRef.scheduler?.yield === "function") {
		await schedulerRef.scheduler.yield();
		return;
	}

	await Promise.resolve();
}

function captureTimeoutCallbacks (): {
	callbacks: Array<() => void>;
	restore: () => void;
} {
	const callbacks: Array<() => void> = [];
	const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((handler: TimerHandler) => {
		if (typeof handler === "function") {
			callbacks.push(handler as unknown as () => void);
		}

		return 0 as unknown as ReturnType<typeof setTimeout>;
	}) as unknown as typeof setTimeout);

	return {
		callbacks,
		restore (): void {
			setTimeoutSpy.mockRestore();
		},
	};
}

function captureOrphanCheck (): {
	timeoutHandler: (() => void) | null;
	orphanCheck: (() => void) | null;
	queuedError: (() => void) | null;
	restore: () => void;
} {
	let timeoutHandler: (() => void) | null = null;
	let orphanCheck: (() => void) | null = null;
	let queuedError: (() => void) | null = null;
	const originalThen = Promise.prototype.then;
	const patchedThen: typeof Promise.prototype.then = function patchedThen<TResult1 = any, TResult2 = never> (
		this: Promise<any>,
		onFulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		if (typeof onFulfilled === "function") {
			orphanCheck = onFulfilled as unknown as () => void;
		}

		return originalThen.call(this, onFulfilled, onRejected) as Promise<TResult1 | TResult2>;
	};
	Promise.prototype.then = patchedThen;
	const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback: VoidFunction) => {
		queuedError = callback as () => void;
	});
	const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((handler: TimerHandler) => {
		if (typeof handler === "function") {
			timeoutHandler = handler as unknown as () => void;
		}

		return 0 as unknown as ReturnType<typeof setTimeout>;
	}) as unknown as typeof setTimeout);

	return {
		get timeoutHandler (): (() => void) | null {
			return timeoutHandler;
		},
		get orphanCheck (): (() => void) | null {
			return orphanCheck;
		},
		get queuedError (): (() => void) | null {
			return queuedError;
		},
		restore (): void {
			Promise.prototype.then = originalThen;
			queueMicrotaskSpy.mockRestore();
			setTimeoutSpy.mockRestore();
		},
	};
}

function captureDeferredOrphanErrors (): {
	readonly queuedErrors: readonly VoidFunction[];
	flush: () => Promise<void>;
	restore: () => void;
} {
	vi.useFakeTimers();
	const queuedErrors: VoidFunction[] = [];
	const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => queuedErrors.push(callback));

	return {
		queuedErrors,
		async flush (): Promise<void> {
			await vi.runAllTimersAsync();
			await Promise.resolve();
		},
		restore (): void {
			queueMicrotaskSpy.mockRestore();
			vi.useRealTimers();
		},
	};
}

function customReadonlyBooleanState (value: boolean, subscribe: State.Readonly<boolean>["subscribe"]): State.Readonly<boolean> {
	return Object.assign(Object.create(State.Readonly(value)) as State.Readonly<boolean>, { subscribe });
}

function synchronousSelection (initialValue: Component | null): ComponentSelectionState & { set: (value: Component | null) => void } {
	let value = initialValue;
	let listener: ((value: Component | null) => void) | null = null;

	return {
		get value () {
			return value;
		},
		set (nextValue) {
			value = nextValue;
			listener?.(nextValue);
		},
		subscribe (_owner, nextListener) {
			listener = nextListener;
			return () => {
				if (listener === nextListener) listener = null;
			};
		},
	};
}

function nonCommentNodes (element: HTMLElement): Node[] {
	return Array.from(element.childNodes).filter((node) => !(node instanceof Comment));
}

function captureThrown (action: () => void): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}

	throw new Error("Expected action to throw.");
}

function findCommentNode (element: HTMLElement, data: string): Comment | undefined {
	return Array.from(element.childNodes).find((node) => node instanceof Comment && node.data === data) as Comment | undefined;
}

if (!Element.prototype.moveBefore) { 
	Object.defineProperty(Element.prototype, "moveBefore", {
		value (this: Element, movedNode: Element, referenceNode: Element | null): void {
			if (this.isConnected !== movedNode.isConnected) {
				throw new Error("State-preserving atomic move cannot be performed on nodes participating in an invalid hierarchy.");
			}

			this.insertBefore(movedNode, referenceNode);
		},
	})
}

describe("Component", () => {
	it("can be constructed with or without new and still supports instanceof", () => {
		const withNew = new Component("div").appendTo(document.body);
		const withoutNew = Component("span").appendTo(document.body);

		expect(withNew).toBeInstanceOf(Component);
		expect(withoutNew).toBeInstanceOf(Component);
	});

	it("supports prototype extension through Component.extend", () => {
		const ComponentClass = Component.extend();
		const previousExtension = ComponentClass.prototype.testComponentExtension;

		ComponentClass.prototype.testComponentExtension = function testComponentExtension () {
			return this.element.tagName;
		};

		expect(mountedComponent("div").testComponentExtension()).toBe("DIV");

		if (previousExtension) {
			ComponentClass.prototype.testComponentExtension = previousExtension;
			return;
		}

		delete (ComponentClass.prototype as Partial<typeof ComponentClass.prototype>).testComponentExtension;
	});

	it("supports fluent chaining across component manipulators", async () => {
		const emphasized = Style.Class("component-test-emphasized", {
			fontWeight: 700,
		});
		const component = Component("button")
			.class.add(emphasized)
			.text.set("Save")
			.attribute.set("type", "button")
			.aria.role("button")
			.appendTo(document.body);
		const active = State(component, false);

		component
			.class.bind(active, emphasized)
			.text.bind(active, "Active")
			.attribute.bind(active, "disabled");

		expect(component.element.getAttribute("type")).toBe("button");
		expect(component.element.getAttribute("role")).toBe("button");
		expect(component.element.classList.contains(emphasized.className)).toBe(false);
		expect(component.element.textContent).toBe("");
		expect(component.element.hasAttribute("disabled")).toBe(false);

		active.set(true);
		await flushEffects();

		expect(component.element.classList.contains(emphasized.className)).toBe(true);
		expect(component.element.textContent).toBe("Active");
		expect(component.element.hasAttribute("disabled")).toBe(true);
		component.remove();
	});

	it("exposes wrapped components through node.component and rejects duplicate wraps", () => {
		const element = document.createElement("div");
		document.body.append(element);
		const component = Component(element);

		expect(element.component).toBe(component);
		expect(() => Component(element)).toThrow("already has a component");
		component.remove();
		expect(element.component).toBeUndefined();
	});

	it("rejects rewrapping an element during its old Component cleanup", () => {
		const element = document.createElement("div");
		document.body.append(element);
		const component = Component(element);
		let replacement: Component | undefined;
		let rewrapError: unknown;
		component.onCleanup(() => {
			try {
				replacement = Component(element);
			} catch (error) {
				rewrapError = error;
			}
		});

		try {
			component.remove();
			expect.soft(rewrapError).toBeInstanceOf(Error);
			expect.soft((rewrapError as Error | undefined)?.message).toBe("This node already has a component. Use node.component to retrieve it.");
			expect.soft(replacement).toBeUndefined();
			expect(element.component).toBeUndefined();
		} finally {
			if (replacement && !replacement.disposed) replacement.remove();
			element.remove();
		}
	});

	it("wraps DOM elements and appends children", () => {
		const root = mountedComponent("div", (component) => {
			component.attribute.set("class", "shell");
		});
		const child = Component("span").text.set("world");

		root.append("hello ", child);

		expect(root.element.className).toBe("shell");
		expect(root.element.textContent).toBe("hello world");
		expect(root.element.children).toHaveLength(1);
		expect(root.element.firstElementChild?.tagName).toBe("SPAN");
		expect(child.element.parentElement).toBe(root.element);
	});

	it("ignores falsy append children", () => {
		const root = mountedComponent("div");
		const child = Component("span").text.set("child");

		try {
			root.append(null, undefined, false, child);

			expect(Array.from(root.element.childNodes), "append() should ignore falsy values instead of creating DOM nodes").toEqual([
				child.element,
			]);
			expect(child.element.parentElement, "append() should still append real children when falsy values are present").toBe(root.element);
		} finally {
			child.remove();
			root.remove();
		}
	});

	it("flattens append iterables", () => {
		const root = mountedComponent("div");
		const first = Component("span").text.set("first");
		const second = Component("span").text.set("second");

		try {
			root.append([first, second]);

			expect(Array.from(root.element.childNodes), "append() should flatten iterable children in order").toEqual([
				first.element,
				second.element,
			]);
			expect(root.element.textContent, "append() should preserve the text content of flattened children").toBe("firstsecond");
		} finally {
			first.remove();
			second.remove();
			root.remove();
		}
	});

	it("prepends children in-order", () => {
		const root = mountedComponent("div");
		const first = Component("span").text.set("first");
		const second = Component("span").text.set("second");

		root.append(Component("span").text.set("tail"));
		root.prepend(first, second);

		expect(root.element.textContent).toBe("firstsecondtail");
	});

	it("preserves prepend argument order when the first requested child already leads", () => {
		const root = mountedComponent("div");
		const alpha = Component("span").text.set("a");
		const beta = Component("span").text.set("b");
		const gamma = Component("span").text.set("c");

		root.append(alpha, beta, gamma);
		root.prepend(alpha, gamma);

		expect.soft(Array.from(root.element.childNodes)).toEqual([alpha.element, gamma.element, beta.element]);
		expect.soft(root.element.textContent).toBe("acb");
		expect(new Set(root.element.childNodes)).toEqual(new Set([alpha.element, beta.element, gamma.element]));
		root.remove();
	});

	it("ignores falsy prepend children", () => {
		const root = mountedComponent("div");
		const child = Component("span").text.set("child");
		const tail = Component("span").text.set("tail");

		try {
			root.append(tail);
			root.prepend(null, undefined, false, child);

			expect(Array.from(root.element.childNodes), "prepend() should ignore falsy values instead of creating DOM nodes").toEqual([
				child.element,
				tail.element,
			]);
			expect(child.element.parentElement, "prepend() should still prepend real children when falsy values are present").toBe(root.element);
		} finally {
			child.remove();
			root.remove();
		}
	});

	it("flattens prepend iterables", () => {
		const root = mountedComponent("div");
		const first = Component("span").text.set("first");
		const second = Component("span").text.set("second");
		const tail = Component("span").text.set("tail");

		try {
			root.append(tail);
			root.prepend([first, second]);

			expect(Array.from(root.element.childNodes), "prepend() should flatten iterable children in order").toEqual([
				first.element,
				second.element,
				tail.element,
			]);
			expect(root.element.textContent, "prepend() should preserve the text content of flattened children").toBe("firstsecondtail");
		} finally {
			first.remove();
			second.remove();
			root.remove();
		}
	});

	it("keeps a stable prepend anchor after a DocumentFragment is consumed", () => {
		const host = mountedComponent("section");
		const tail = Component("i").text.set("tail");
		const direct = Component("b").text.set("direct");
		const selected = Component("em").text.set("selected");
		const selection = synchronousSelection(selected);
		const fragment = document.createDocumentFragment();
		const fragmentChild = document.createElement("span");
		fragmentChild.textContent = "fragment";
		fragment.append(fragmentChild);
		host.append(tail);

		try {
			host.prepend(fragment, direct, selection);

			expect(fragment.childNodes).toHaveLength(0);
			expect(nonCommentNodes(host.element)).toEqual([
				fragmentChild,
				direct.element,
				selected.element,
				tail.element,
			]);
		} finally {
			if (!host.disposed) host.remove();
			if (!direct.disposed) direct.remove();
			if (!selected.disposed) selected.remove();
			if (!tail.disposed) tail.remove();
		}
	});

	it("keeps following prepend children anchored after a recursive first node is rejected", () => {
		const host = mountedComponent("section");
		const tail = Component("i").text.set("tail");
		const direct = Component("b").text.set("direct");
		const selected = Component("em").text.set("selected");
		const selection = synchronousSelection(selected);
		host.append(tail);

		try {
			expect(() => host.prepend(host, direct, selection)).not.toThrow();
			expect(nonCommentNodes(host.element)).toEqual([
				direct.element,
				selected.element,
				tail.element,
			]);
		} finally {
			if (!host.disposed) host.remove();
			if (!direct.disposed) direct.remove();
			if (!selected.disposed) selected.remove();
			if (!tail.disposed) tail.remove();
		}
	});

	it("keeps following prepend children anchored when the first child and original tail are reparented during Mount", () => {
		const host = mountedComponent("section");
		const reparentHost = mountedComponent("aside");
		const tail = Component("i").text.set("tail");
		const first = Component("span").text.set("first");
		const direct = Component("b").text.set("direct");
		const selected = Component("em").text.set("selected");
		const selection = synchronousSelection(selected);
		first.event.owned.on.Mount(() => {
			first.appendTo(reparentHost);
			tail.appendTo(reparentHost);
		});
		host.append(tail);

		try {
			host.prepend(first, direct, selection);

			expect.soft(Array.from(reparentHost.element.childNodes)).toEqual([first.element, tail.element]);
			expect(nonCommentNodes(host.element)).toEqual([
				direct.element,
				selected.element,
			]);
		} finally {
			if (!host.disposed) host.remove();
			if (!reparentHost.disposed) reparentHost.remove();
			if (!first.disposed) first.remove();
			if (!direct.disposed) direct.remove();
			if (!selected.disposed) selected.remove();
			if (!tail.disposed) tail.remove();
		}
	});

	it.each(["append", "prepend", "insert"] as const)("cleans unprocessed Components when %s loses its host during the first Mount", async (method) => {
		const orphanCapture = captureDeferredOrphanErrors();
		const host = mountedComponent("div");
		const anchor = method === "insert" ? Component("i").appendTo(host) : null;
		const externalManager = mountedComponent("aside");
		const first = Component("span");
		const unownedLater = Component("b");
		const ownedLater = Component("em").owner.add(externalManager);
		first.event.owned.on.Mount(() => method === "insert" ? anchor!.remove() : host.remove());

		try {
			expect.soft(() => {
				if (method === "append") host.append(first, unownedLater, ownedLater);
				else if (method === "prepend") host.prepend(first, unownedLater, ownedLater);
				else anchor!.insert("before", first, unownedLater, ownedLater);
			}).not.toThrow();
			await orphanCapture.flush();

			expect.soft(orphanCapture.queuedErrors).toEqual([]);
			expect.soft(unownedLater.disposed).toBe(true);
			expect.soft(ownedLater.disposed).toBe(false);
			expect.soft(ownedLater.element.parentNode).toBeNull();
			externalManager.remove();
			expect(ownedLater.disposed).toBe(true);
		} finally {
			orphanCapture.restore();
			if (!first.disposed) first.remove();
			if (!unownedLater.disposed) unownedLater.remove();
			if (!ownedLater.disposed) ownedLater.remove();
			if (anchor && !anchor.disposed) anchor.remove();
			if (!host.disposed) host.remove();
			if (!externalManager.disposed) externalManager.remove();
		}
	});

	it("renders append state children anchored by a comment and replaces old selections", async () => {
		const host = mountedComponent("div");
		const trailing = Component("span").text.set("trailing");
		const dynamic = State<Component | Array<Component | null> | null>(host, null);
		const alpha = Component("span").text.set("alpha");
		const beta = Component("span").text.set("beta");
		const gamma = Component("span").text.set("gamma");

		host.append(dynamic, trailing);
		expect(nonCommentNodes(host.element)).toEqual([trailing.element]);

		dynamic.set(alpha);
		await flushEffects();
		expect(nonCommentNodes(host.element)).toEqual([alpha.element, trailing.element]);

		dynamic.set([beta, null, gamma]);
		await flushEffects();
		expect(alpha.disposed).toBe(true);
		expect(nonCommentNodes(host.element)).toEqual([beta.element, gamma.element, trailing.element]);

		dynamic.set(null);
		await flushEffects();
		expect(beta.disposed).toBe(true);
		expect(gamma.disposed).toBe(true);
		expect(nonCommentNodes(host.element)).toEqual([trailing.element]);
	});

	it("renders prepend state children before existing content", async () => {
		const host = mountedComponent("div");
		const trailing = Component("span").text.set("trailing");
		const dynamic = State<Component | Array<Component | null> | null>(host, null);
		const alpha = Component("span").text.set("alpha");
		const beta = Component("span").text.set("beta");

		host.append(trailing);
		host.prepend(dynamic);

		dynamic.set([alpha, beta]);
		await flushEffects();
		expect(nonCommentNodes(host.element)).toEqual([alpha.element, beta.element, trailing.element]);

		dynamic.set(null);
		await flushEffects();
		expect(nonCommentNodes(host.element)).toEqual([trailing.element]);
	});

	it("renders insert state children relative to the component", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const dynamic = State<Component | Array<Component | null> | null>(host, null);
		const before = Component("span").text.set("before");
		const after = Component("span").text.set("after");

		host.append(anchor);
		anchor.insert("before", dynamic);

		dynamic.set([before, null, after]);
		await flushEffects();
		expect(nonCommentNodes(host.element)).toEqual([before.element, after.element, anchor.element]);

		dynamic.set(null);
		await flushEffects();
		expect(nonCommentNodes(host.element)).toEqual([anchor.element]);
	});

	it("replaces an ordinary selection controller when the same Component is authored again", async () => {
		const firstHost = mountedComponent("section");
		const secondHost = mountedComponent("aside");
		const child = Component("span");
		const firstSelection = State<Component | null>(firstHost, child);
		const secondSelection = State<Component | null>(secondHost, child);
		firstHost.append(firstSelection);

		expect.soft(() => secondHost.append(secondSelection)).not.toThrow();
		expect.soft(child.element.parentNode).toBe(secondHost.element);
		expect.soft(nonCommentNodes(firstHost.element)).toEqual([]);

		firstSelection.set(null);
		await flushEffects();
		expect.soft(child.disposed).toBe(false);
		expect.soft(child.element.parentNode).toBe(secondHost.element);
		firstSelection.set(child);
		await flushEffects();
		expect.soft(child.element.parentNode).toBe(secondHost.element);

		secondSelection.set(null);
		await flushEffects();
		expect(child.disposed).toBe(true);
		firstHost.remove();
		secondHost.remove();
	});

	it.each(["deselection", "host cleanup"] as const)("detaches an externally owned ordinary selection during %s", async (cleanup) => {
		const externalOwner = mountedComponent("article");
		const host = mountedComponent("section");
		const child = Component("span").owner.add(externalOwner);
		const selection = State<Component | null>(host, child);
		host.append(selection);

		if (cleanup === "deselection") {
			selection.set(null);
			await flushEffects();
		} else {
			host.remove();
		}

		expect.soft(child.disposed).toBe(false);
		expect.soft(child.element.parentNode).toBeNull();
		if (!host.disposed) host.remove();
		externalOwner.remove();
		expect(child.disposed).toBe(true);
	});

	it.each(["ordinary", "conditional"] as const)("disposes later %s selection children when the first Mount removes the host", async (api) => {
		const orphanCapture = captureDeferredOrphanErrors();
		const host = mountedComponent("section");
		const first = Component("span");
		const later = Component("b");
		const selection = State(host, [first, later]);
		const visible = State(host, true);
		first.event.owned.on.Mount(() => host.remove());

		try {
			expect.soft(() => api === "ordinary" ? host.append(selection) : host.appendWhen(visible, selection)).not.toThrow();
			await orphanCapture.flush();
			expect.soft(orphanCapture.queuedErrors).toEqual([]);
			expect.soft(host.disposed).toBe(true);
			expect.soft(first.disposed).toBe(true);
			expect(later.disposed).toBe(true);
		} finally {
			orphanCapture.restore();
			if (!first.disposed) first.remove();
			if (!later.disposed) later.remove();
			if (!host.disposed) host.remove();
		}
	});

	it.each(["ordinary", "conditional"] as const)("ignores a later %s selection child removed by the first child's Mount", async (api) => {
		const orphanCapture = captureDeferredOrphanErrors();
		const host = mountedComponent("section");
		const first = Component("span");
		const later = Component("b");
		const selection = State(host, [first, later]);
		const visible = State(host, true);
		first.event.owned.on.Mount(() => later.remove());

		try {
			expect.soft(() => api === "ordinary" ? host.append(selection) : host.appendWhen(visible, selection)).not.toThrow();
			await orphanCapture.flush();
			expect.soft(orphanCapture.queuedErrors).toEqual([]);
			expect.soft(later.disposed).toBe(true);
			expect.soft(nonCommentNodes(host.element)).toEqual([first.element]);
			expect.soft(() => host.remove()).not.toThrow();
			expect(first.disposed).toBe(true);
		} finally {
			orphanCapture.restore();
			if (!first.disposed) first.remove();
			if (!later.disposed) later.remove();
			if (!host.disposed) host.remove();
		}
	});

	it.each(["ordinary", "conditional"] as const)("handles synchronous owner disposal from a custom %s ComponentSelectionState subscription", async (api) => {
		const orphanCapture = captureDeferredOrphanErrors();
		const host = mountedComponent("section");
		const child = Component("span");
		const visible = State(host, true);
		const releaseSubscription = vi.fn();
		const selection: ComponentSelectionState = {
			value: child,
			subscribe: (owner, listener) => {
				try {
					owner.dispose();
				} finally {
					listener(child);
				}
				return releaseSubscription;
			},
		};

		try {
			expect.soft(() => api === "ordinary" ? host.append(selection) : host.appendWhen(visible, selection)).not.toThrow();
			await orphanCapture.flush();
			expect.soft(orphanCapture.queuedErrors).toEqual([]);
			expect.soft(host.disposed).toBe(true);
			expect.soft(releaseSubscription).toHaveBeenCalledTimes(1);
			expect(child.disposed).toBe(true);
		} finally {
			orphanCapture.restore();
			if (!child.disposed) child.remove();
			if (!host.disposed) host.remove();
		}
	});

	it.each(["ordinary", "conditional"] as const)("cleans the prepared and current %s selections when an earlier Mount replaces the selection and removes the host", async (api) => {
		const orphanCapture = captureDeferredOrphanErrors();
		const host = mountedComponent("section");
		const trigger = Component("button");
		const prepared = Component("span");
		const current = Component("b");
		const selection = State<Component | null>(host, prepared);
		const visible = State(host, true);
		trigger.event.owned.on.Mount(() => {
			selection.set(current);
			host.remove();
		});

		try {
			expect.soft(() => api === "ordinary" ? host.append(trigger, selection) : host.appendWhen(visible, trigger, selection)).not.toThrow();
			await orphanCapture.flush();
			expect.soft(orphanCapture.queuedErrors).toEqual([]);
			expect.soft(host.disposed).toBe(true);
			expect.soft(trigger.disposed).toBe(true);
			expect.soft(prepared.disposed).toBe(true);
			expect(current.disposed).toBe(true);
		} finally {
			orphanCapture.restore();
			if (!trigger.disposed) trigger.remove();
			if (!prepared.disposed) prepared.remove();
			if (!current.disposed) current.remove();
			if (!host.disposed) host.remove();
		}
	});

	it.each(["ordinary", "conditional"] as const)("preserves an externally reparented %s selection until its new destination is removed", async (api) => {
		const source = mountedComponent("section");
		const destination = mountedComponent("aside");
		const child = Component("span");
		const selection = State<Component | null>(source, child);
		const visible = State(source, true);
		if (api === "ordinary") source.append(selection);
		else source.appendWhen(visible, selection);

		destination.append(child);
		selection.set(null);
		await flushEffects();
		source.remove();

		expect.soft(child.disposed).toBe(false);
		expect.soft(child.element.parentNode).toBe(destination.element);
		destination.remove();
		expect(child.disposed).toBe(true);
	});

	it.each(["ordinary", "conditional"] as const)("does not mistake an unmoved %s sibling selection's controller container for an external destination", async (api) => {
		const host = mountedComponent("section");
		const anchor = Component("i").appendTo(host);
		const child = Component("span");
		const selection = State<Component | null>(anchor, child);
		const visible = State(anchor, true);
		if (api === "ordinary") anchor.insert("after", selection);
		else anchor.insertWhen(visible, "after", selection);

		selection.set(null);
		await flushEffects();

		expect(child.disposed).toBe(true);
		host.remove();
	});

	it("settles a direct conditional child when visibility subscription throws after a synchronous render", async () => {
		const orphanCapture = captureDeferredOrphanErrors();
		const externalOwner = mountedComponent("article");
		const host = mountedComponent("section");
		const reuseHost = mountedComponent("aside");
		const child = Component("span").owner.add(externalOwner);
		const sentinel = new Error("visibility subscription sentinel");
		const visible = customReadonlyBooleanState(false, (_owner, listener) => {
			listener(true, false);
			throw sentinel;
		});

		try {
			expect.soft(() => host.appendWhen(visible, child)).toThrow(sentinel);
			await orphanCapture.flush();
			expect.soft(orphanCapture.queuedErrors).toEqual([]);
			expect.soft(Array.from(host.element.childNodes)).toEqual([]);
			expect.soft(child.element.parentNode).toBeNull();
			expect.soft(child.disposed).toBe(false);
			expect.soft(() => reuseHost.appendWhen(State.Readonly(true), child)).not.toThrow();
			expect(child.element.parentNode).toBe(reuseHost.element);
		} finally {
			orphanCapture.restore();
			if (!host.disposed) host.remove();
			if (!reuseHost.disposed) reuseHost.remove();
			if (!externalOwner.disposed) externalOwner.remove();
			if (!child.disposed) child.remove();
		}
	});

	it.each(["direct", "selection"] as const)("preserves the original %s conditional subscription error while cleanup settles", (attacher) => {
		const host = mountedComponent("section");
		const reuseHost = mountedComponent("aside");
		const child = Component("span");
		const originalError = new Error(`${attacher} conditional subscription error`);
		const cleanupError = new Error(`${attacher} child cleanup error`);
		let attach!: () => void;
		let markerData: string;
		let replacement: Component | undefined;
		child.onCleanup(() => {
			throw cleanupError;
		});

		if (attacher === "direct") {
			const visible = customReadonlyBooleanState(false, (_owner, listener) => {
				listener(true, false);
				throw originalError;
			});
			attach = () => host.appendWhen(visible, child);
			markerData = "kitsui:conditional";
		} else {
			const selection: ComponentSelectionState = {
				value: child,
				subscribe: (_owner, listener) => {
					listener(child);
					throw originalError;
				},
			};
			attach = () => host.appendWhen(State.Readonly(true), selection);
			markerData = "kitsui:conditional-stateful";
		}

		try {
			let thrown: unknown;
			try {
				attach();
			} catch (error) {
				thrown = error;
			}

			expect.soft(thrown).toBe(originalError);
			expect.soft(child.disposed).toBe(true);
			expect.soft(child.element.parentNode).toBeNull();
			expect.soft(child.element.component).toBeUndefined();
			expect.soft(findCommentNode(host.element, markerData)).toBeUndefined();
			expect.soft(() => {
				replacement = Component(child.element);
			}).not.toThrow();
			if (replacement) {
				expect.soft(() => reuseHost.appendWhen(State.Readonly(true), replacement!)).not.toThrow();
				expect(replacement.element.parentNode).toBe(reuseHost.element);
			}
		} finally {
			if (!host.disposed) host.remove();
			if (!reuseHost.disposed) reuseHost.remove();
			if (replacement && !replacement.disposed) replacement.remove();
			if (!child.disposed) child.remove();
		}
	});

	it("settles a late direct conditional subscription cleanup after synchronous host disposal", async () => {
		const orphanCapture = captureDeferredOrphanErrors();
		const host = mountedComponent("section");
		const child = Component("span");
		const releaseSubscription = vi.fn();
		const visible = customReadonlyBooleanState(false, (owner) => {
			owner.dispose();
			return releaseSubscription;
		});

		try {
			expect.soft(() => host.appendWhen(visible, child)).not.toThrow();
			await orphanCapture.flush();
			expect.soft(orphanCapture.queuedErrors).toEqual([]);
			expect.soft(releaseSubscription).toHaveBeenCalledTimes(1);
			expect.soft(host.disposed).toBe(true);
			expect.soft(child.element.parentNode).toBeNull();
			expect(child.disposed).toBe(true);
		} finally {
			orphanCapture.restore();
			if (!child.disposed) child.remove();
			if (!host.disposed) host.remove();
		}
	});

	it("releases later claims in one prepared selection after the first controlled child disposal throws", () => {
		const host = mountedComponent("section");
		const reuseHost = mountedComponent("aside");
		const trigger = Component("button");
		const first = Component("span");
		const later = Component("b");
		const cleanupError = new Error("first controlled child cleanup failed");
		const selection = State.Readonly([first, later]);
		first.onCleanup(() => {
			throw cleanupError;
		});
		trigger.event.owned.on.Mount(() => host.remove());

		try {
			expect.soft(() => host.append(trigger, selection)).toThrow(cleanupError);
			expect.soft(first.disposed).toBe(true);
			expect.soft(later.disposed).toBe(false);
			expect.soft(later.element.parentNode).toBeNull();
			expect.soft(() => reuseHost.append(State.Readonly<Component | null>(later))).not.toThrow();
			expect(later.element.parentNode).toBe(reuseHost.element);
		} finally {
			if (!host.disposed) host.remove();
			if (!reuseHost.disposed) reuseHost.remove();
			if (!first.disposed) first.remove();
			if (!later.disposed) later.remove();
		}
	});

	it.each(["ordinary", "conditional"] as const)("releases the newly claimed %s selection when old-child cleanup throws", (api) => {
		const host = mountedComponent("section");
		const reuseHost = mountedComponent("aside");
		const oldChild = Component("span");
		const newChild = Component("b");
		const cleanupError = new Error(`${api} old-child cleanup failed`);
		const selection = synchronousSelection(oldChild);
		oldChild.onCleanup(() => {
			throw cleanupError;
		});

		try {
			if (api === "ordinary") host.append(selection);
			else host.appendWhen(State.Readonly(true), selection);

			expect.soft(() => selection.set(newChild)).toThrow(cleanupError);
			expect.soft(oldChild.disposed).toBe(true);
			expect.soft(newChild.disposed).toBe(false);
			expect.soft(newChild.element.parentNode).toBeNull();
			expect.soft(() => api === "ordinary"
				? reuseHost.append(State.Readonly<Component | null>(newChild))
				: reuseHost.appendWhen(State.Readonly(true), State.Readonly<Component | null>(newChild))).not.toThrow();
			expect(newChild.element.parentNode).toBe(reuseHost.element);
		} finally {
			if (!host.disposed) host.remove();
			if (!reuseHost.disposed) reuseHost.remove();
			if (!oldChild.disposed) oldChild.remove();
			if (!newChild.disposed) newChild.remove();
		}
	});

	it.each(["ordinary", "conditional"] as const)("settles a synchronously nested %s render superseded during old-child disposal", (api) => {
		const externalOwner = mountedComponent("article");
		const host = mountedComponent("section");
		const reuseHost = mountedComponent("aside");
		const oldChild = Component("span");
		const replacement = Component("b");
		const nested = Component("em").owner.add(externalOwner);
		const selection = synchronousSelection(oldChild);
		oldChild.onCleanup(() => selection.set(nested));

		try {
			if (api === "ordinary") host.append(selection);
			else host.appendWhen(State.Readonly(true), selection);

			selection.set(replacement);

			expect.soft(nonCommentNodes(host.element)).toEqual([replacement.element]);
			expect.soft(nested.element.parentNode).toBeNull();
			expect.soft(nested.disposed).toBe(false);
			expect.soft(() => api === "ordinary"
				? reuseHost.append(State.Readonly<Component | null>(nested))
				: reuseHost.appendWhen(State.Readonly(true), State.Readonly<Component | null>(nested))).not.toThrow();
			expect(nested.element.parentNode).toBe(reuseHost.element);
		} finally {
			if (!host.disposed) host.remove();
			if (!reuseHost.disposed) reuseHost.remove();
			if (!externalOwner.disposed) externalOwner.remove();
			if (!oldChild.disposed) oldChild.remove();
			if (!replacement.disposed) replacement.remove();
			if (!nested.disposed) nested.remove();
		}
	});

	it.each(["ordinary", "conditional"] as const)("keeps the outer %s replacement authoritative when placement cleanup renders a nested selection", (api) => {
		const placementOwner = Owner();
		const nestedOwner = mountedComponent("article");
		const placementHost = mountedComponent("nav");
		const host = mountedComponent("section");
		const reuseHost = mountedComponent("aside");
		const outer = Component("span");
		const nested = Component("b").owner.add(nestedOwner);
		const selection = synchronousSelection(null);
		let place!: Place;
		const releasePlacement = vi.fn(() => selection.set(nested));
		outer.place(placementOwner, (PlaceConstructor) => {
			place = PlaceConstructor().appendTo(placementHost);
			return {
				value: place,
				subscribe: () => releasePlacement,
			} as unknown as State.Readonly<Place | null>;
		});

		try {
			if (api === "ordinary") host.append(selection);
			else host.appendWhen(State.Readonly(true), selection);

			selection.set(outer);

			expect.soft(releasePlacement).toHaveBeenCalledOnce();
			expect.soft(nonCommentNodes(host.element)).toEqual([outer.element]);
			expect.soft(outer.disposed).toBe(false);
			expect.soft(outer.element.parentNode).toBe(host.element);
			expect.soft(nested.disposed).toBe(false);
			expect.soft(nested.element.parentNode).toBeNull();
			expect.soft(place.marker.disposed).toBe(true);
			expect.soft(Array.from(placementHost.element.childNodes).filter(node => node instanceof Comment)).toEqual([]);
			expect.soft(() => api === "ordinary"
				? reuseHost.append(State.Readonly<Component | null>(nested))
				: reuseHost.appendWhen(State.Readonly(true), State.Readonly<Component | null>(nested))).not.toThrow();
			expect(nested.element.parentNode).toBe(reuseHost.element);
		} finally {
			if (!placementOwner.disposed) placementOwner.dispose();
			if (!host.disposed) host.remove();
			if (!reuseHost.disposed) reuseHost.remove();
			if (!nestedOwner.disposed) nestedOwner.remove();
			if (!placementHost.disposed) placementHost.remove();
			if (!outer.disposed) outer.remove();
			if (!nested.disposed) nested.remove();
			if (place && !place.marker.disposed) place.remove();
		}
	});

	it("reacts to state changes through use with a state", async () => {
		const component = mountedComponent("div");
		const counter = State(component, 0);
		component.use(counter, (value, target) => {
			target.text.set(`count:${value}`);
		});

		expect(component.element.textContent).toBe("count:0");

		counter.set(2);
		await flushEffects();
		expect(component.element.textContent).toBe("count:2");

		counter.set(3);
		await flushEffects();
		expect(component.element.textContent).toBe("count:3");
	});

	it("supports fluent setup blocks through use without a state", () => {
		const component = mountedComponent("div").use((target) => {
			target.text.set("ready").attribute.set("role", "status");
		});

		expect(component.element.textContent).toBe("ready");
		expect(component.element.getAttribute("role")).toBe("status");
	});

	it("passes setup parameters through use without a state", () => {
		const component = mountedComponent("div");
		const returned = component.use((target, label: string, count: number) => {
			target.text.set(`${label}:${count}`);
		}, "ready", 2);

		expect(returned).toBe(component);
		expect(component.element.textContent).toBe("ready:2");
	});

	it("releases use state bindings when the component is removed", () => {
		const component = mountedComponent("div");
		const counter = State(component, 0);
		const calls: number[] = [];

		component.use(counter, (value) => {
			calls.push(value);
		});

		component.remove();

		expect(() => {
			counter.set(1);
		}).toThrow("Disposed states cannot be modified.");
		expect(calls).toEqual([0]);
	});

	it("removes owned components when the owner is disposed", () => {
		const owner = mountedComponent("section");
		const child = Component("div");

		owner.append(child);
		expect(child.element.parentElement).toBe(owner.element);

		owner.remove();

		expect(child.disposed).toBe(true);
		expect(child.element.isConnected).toBe(false);
	});

	it("owner can set and release explicit ownership", () => {
		const explicitOwner = mountedComponent("section");
		const child = Component("div");

		child.owner.add(explicitOwner);
		expect(child.owner.get(), "explicit owner should be set").toBe(explicitOwner);

		child.owner.remove(explicitOwner);
		expect(child.owner.get(), "explicit owner should be cleared").toBeNull();

		explicitOwner.remove();
		expect(child.disposed, "child should not be disposed when a released explicit owner is removed").toBe(false);

		child.remove();
	});

	it("removing a parent disposes implicitly owned children appended via append", () => {
		const parent = mountedComponent("section");
		const child = Component("div");

		parent.append(child);
		parent.remove();

		expect(child.disposed, "child should be disposed when parent is removed").toBe(true);
	});

	it("clear disposes managed component children", () => {
		const host = mountedComponent("div");
		const child = Component("span");

		host.append(child);
		host.clear();

		expect(child.disposed).toBe(true);
		expect(host.element.childNodes).toHaveLength(0);
	});

	it("clear settles later structural owners after the first cleanup error", () => {
		const host = mountedComponent("div");
		const first = Component("span");
		const later = Component("b");
		const cleanupError = new Error("first structural cleanup failed");
		const firstRelease = vi.fn(() => {
			throw cleanupError;
		});
		const laterRelease = vi.fn();
		const firstVisible = customReadonlyBooleanState(true, () => firstRelease);
		const laterVisible = customReadonlyBooleanState(true, () => laterRelease);

		host.appendWhen(firstVisible, first);
		host.appendWhen(laterVisible, later);

		expect.soft(() => host.clear()).toThrow(cleanupError);
		expect.soft(firstRelease).toHaveBeenCalledOnce();
		expect.soft(laterRelease).toHaveBeenCalledOnce();
		expect.soft(first.disposed).toBe(true);
		expect.soft(later.disposed).toBe(true);
		expect(host.element.childNodes).toHaveLength(0);
		host.remove();
	});

	it("parent removal settles later implicit children after the first child cleanup error", () => {
		const parent = mountedComponent("section");
		const first = Component("span");
		const later = Component("b");
		const cleanupError = new Error("first implicit child cleanup failed");
		first.onCleanup(() => {
			throw cleanupError;
		});
		parent.append(first, later);

		try {
			expect.soft(() => parent.remove()).toThrow(cleanupError);
			expect.soft(parent.disposed).toBe(true);
			expect.soft(parent.disposing).toBe(false);
			expect.soft(first.disposed).toBe(true);
			expect.soft(later.disposed).toBe(true);
			expect.soft(first.element.isConnected).toBe(false);
			expect(later.element.isConnected).toBe(false);
		} finally {
			if (!first.disposed) first.remove();
			if (!later.disposed) later.remove();
		}
	});

	it.each([
		["host.clear", (host: Component) => host.clear()],
		["parent.remove", (host: Component) => host.remove()],
	] as const)("%s revisits a settled intermediate after later cleanup raw-moves a managed Component beneath it", (operation, disposeHost) => {
		const host = mountedComponent("section");
		const reuseHost = mountedComponent("aside");
		const intermediate = document.createElement("div");
		const trigger = Component("span");
		const reentrant = mountedComponent("b");
		let replacement: Component | undefined;
		trigger.onCleanup(() => intermediate.append(reentrant.element));
		host.append(intermediate, trigger);

		try {
			expect.soft(() => disposeHost(host)).not.toThrow();
			expect.soft(trigger.disposed).toBe(true);
			expect.soft(reentrant.disposed).toBe(true);
			expect.soft(reentrant.element.parentNode).toBeNull();
			expect.soft(reentrant.element.component).toBeUndefined();
			if (operation === "host.clear") expect.soft(host.element.childNodes).toHaveLength(0);
			expect.soft(() => {
				replacement = Component(reentrant.element).appendTo(reuseHost);
			}).not.toThrow();
			expect(replacement?.element.parentNode).toBe(reuseHost.element);
		} finally {
			if (!host.disposed) host.remove();
			if (replacement && !replacement.disposed) replacement.remove();
			if (!trigger.disposed) trigger.remove();
			if (!reentrant.disposed) reentrant.remove();
			reuseHost.remove();
		}
	});

	it.each(["during parent cleanup", "after parent cleanup"] as const)("parent removal reconsiders a retained resolver-managed child whose manager is disposed %s", (timing) => {
		const parent = mountedComponent("section");
		const externalOwner = mountedComponent("article");
		const retained = Component("span");
		const later = Component("b");
		const unregisterResolver = registerComponentOwnerResolver(component => component === retained ? externalOwner : null);
		if (timing === "during parent cleanup") later.onCleanup(() => externalOwner.remove());
		parent.append(retained, later);

		try {
			parent.remove();
			if (timing === "after parent cleanup") {
				expect.soft(retained.disposed).toBe(false);
				expect.soft(retained.element.parentNode).toBe(parent.element);
				externalOwner.remove();
			}

			expect.soft(later.disposed).toBe(true);
			expect.soft(externalOwner.disposed).toBe(true);
			expect.soft(retained.disposed).toBe(true);
			expect(retained.element.parentNode).toBeNull();
		} finally {
			unregisterResolver();
			if (!parent.disposed) parent.remove();
			if (!externalOwner.disposed) externalOwner.remove();
			if (!retained.disposed) retained.remove();
			if (!later.disposed) later.remove();
		}
	});

	it.each([
		["host.clear", (host: Component) => host.clear()],
		["parent.remove", (host: Component) => host.remove()],
	] as const)("%s enumerates a wide managed child set within a linear structural budget", (_operation, disposeHost) => {
		const childCount = 32;
		const host = mountedComponent("section");
		const children = Array.from({ length: childCount }, () => Component("span"));
		host.append(children);
		const originalChildrenOf = DOMTree.childrenOf.bind(DOMTree);
		let calls = 0;
		let entries = 0;
		const childrenOfSpy = vi.spyOn(DOMTree, "childrenOf").mockImplementation((parent) => {
			const childNodes = originalChildrenOf(parent);
			if (parent === host.element) {
				calls += 1;
				entries += childNodes.length;
			}
			return childNodes;
		});

		try {
			disposeHost(host);

			expect.soft(calls).toBeLessThanOrEqual(childCount + 2);
			expect.soft(entries).toBeLessThanOrEqual(childCount * 3);
			expect.soft(children.every(child => child.disposed)).toBe(true);
			expect(host.element.childNodes).toHaveLength(0);
		} finally {
			childrenOfSpy.mockRestore();
			if (!host.disposed) host.remove();
			for (const child of children) {
				if (!child.disposed) child.remove();
			}
		}
	});

	it("text.set disposes managed component children", () => {
		const host = mountedComponent("div");
		const child = Component("span");

		host.append(child);
		host.text.set("done");

		expect(child.disposed).toBe(true);
		expect(host.element.textContent).toBe("done");
	});

	it("does not auto-dispose when raw DOM removal bypasses the component system", () => {
		const host = document.createElement("div");
		const child = Component("span");

		host.append(child.element);
		child.element.remove();

		expect(child.disposed).toBe(false);
		child.remove();
	});

	it("parks conditional children behind a placeholder comment", async () => {
		const host = mountedComponent("div");
		const leading = Component("span").text.set("leading");
		const toggled = Component("span").text.set("toggled");
		const visible = State(host, false);

		host.append(leading);
		host.appendWhen(visible, toggled);

		expect(host.element.childNodes[1]).toBeInstanceOf(Comment);
		expect(toggled.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();

		expect(host.element.lastElementChild).toBe(toggled.element);
		expect(host.element.textContent).toBe("leadingtoggled");

		visible.set(false);
		await flushEffects();

		expect(host.element.childNodes[1]).toBeInstanceOf(Comment);
		expect(toggled.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
	});

	it("keeps hidden appendWhen children managed while parked without rewriting ownership", () => {
		const timeoutSpy = captureTimeoutCallbacks();

		try {
			const root = Component("div");
			const visible = State(root, false);
			const host = Component("section");
			const child = Component("p").text.set("child");

			host.appendWhen(visible, child);
			root.append(host);
			document.body.append(root.element);

			expect(child.owner.get(), "hidden conditional children should remain ownerless while parked").toBeNull();
			expect(() => {
				for (const callback of timeoutSpy.callbacks) {
					callback();
				}
			}, "mounting the host before the next tick should prevent orphan errors for hidden conditional children").not.toThrow();

			root.remove();
		}
		finally {
			timeoutSpy.restore();
		}
	});

	it("preserves explicit owners for hidden appendWhen children", () => {
		const host = mountedComponent("div");
		const retentionOwner = mountedComponent("section");
		const visible = State(host, false);
		const child = Component("span").text.set("child").owner.add(retentionOwner);

		host.appendWhen(visible, child);

		expect(child.owner.get(), "conditionally parking a child should not override an existing explicit owner").toBe(retentionOwner);

		host.remove();
		retentionOwner.remove();
	});

	it("keeps a hidden conditional child managed after its explicit owner is manually deregistered", async () => {
		const host = mountedComponent("div");
		const explicitOwner = mountedComponent("section");
		const visible = State(host, false);
		const child = Component("span").owner.add(explicitOwner);
		host.appendWhen(visible, child);
		const queuedErrors: VoidFunction[] = [];
		const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => queuedErrors.push(callback));

		try {
			child.owner.remove(explicitOwner);
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			await Promise.resolve();

			expect.soft(queuedErrors).toEqual([]);
			expect.soft(child.disposed).toBe(false);
			expect.soft(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
			queueMicrotaskSpy.mockRestore();

			host.remove();
			expect(child.disposed).toBe(true);
		} finally {
			queueMicrotaskSpy.mockRestore();
			if (!host.disposed) host.remove();
			if (!explicitOwner.disposed) explicitOwner.remove();
			if (!child.disposed) child.remove();
		}
	});

	it("preserves explicit owners for hidden conditional children across visibility toggles", async () => {
		const host = mountedComponent("div");
		const retentionOwner = mountedComponent("section");
		const visible = State(host, false);
		const anchor = Component("span").text.set("anchor");
		const trailing = Component("span").text.set("trailing");
		const appended = Component("span").text.set("appended").owner.add(retentionOwner);
		const prepended = Component("span").text.set("prepended").owner.add(retentionOwner);
		const inserted = Component("span").text.set("inserted").owner.add(retentionOwner);

		host.append(anchor, trailing);
		host.appendWhen(visible, appended);
		host.prependWhen(visible, prepended);
		anchor.insertWhen(visible, "after", inserted);

		expect(appended.owner.get()).toBe(retentionOwner);
		expect(prepended.owner.get()).toBe(retentionOwner);
		expect(inserted.owner.get()).toBe(retentionOwner);

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(host.element)).toEqual([
			prepended.element,
			anchor.element,
			inserted.element,
			trailing.element,
			appended.element,
		]);
		expect(appended.owner.get()).toBe(retentionOwner);
		expect(prepended.owner.get()).toBe(retentionOwner);
		expect(inserted.owner.get()).toBe(retentionOwner);

		visible.set(false);
		await flushEffects();

		expect(appended.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(prepended.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(inserted.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(appended.owner.get()).toBe(retentionOwner);
		expect(prepended.owner.get()).toBe(retentionOwner);
		expect(inserted.owner.get()).toBe(retentionOwner);

		host.remove();

		expect(appended.disposed).toBe(false);
		expect(prepended.disposed).toBe(false);
		expect(inserted.disposed).toBe(false);

		retentionOwner.remove();

		expect(appended.disposed).toBe(true);
		expect(prepended.disposed).toBe(true);
		expect(inserted.disposed).toBe(true);
	});

	it("returns this from appendWhen and disposes parked children when host is removed", async () => {
		const host = mountedComponent("div");
		const toggled = Component("span").text.set("toggled");
		const visible = State(host, false);
		const result = host.appendWhen(visible, toggled);

		expect(result).toBe(host);

		expect(toggled.disposed).toBe(false);

		visible.set(true);
		await flushEffects();
		expect(host.element.firstElementChild).toBe(toggled.element);

		visible.set(false);
		await flushEffects();
		expect(toggled.disposed).toBe(false);

		host.remove();
		expect(toggled.disposed).toBe(true);
	});

	it.each([
		["appendWhen", (host: Component, _anchor: Component, visible: State<boolean>, fragment: DocumentFragment) => host.appendWhen(visible, fragment)],
		["prependWhen", (host: Component, _anchor: Component, visible: State<boolean>, fragment: DocumentFragment) => host.prependWhen(visible, fragment)],
		["insertWhen", (_host: Component, anchor: Component, visible: State<boolean>, fragment: DocumentFragment) => anchor.insertWhen(visible, "after", fragment)],
	] as const)("%s preserves every raw DocumentFragment child across hide and show", async (_operation, place) => {
		const host = mountedComponent("div");

		try {
			const anchor = Component("span").appendTo(host);
			const visible = State(host, true);
			const fragment = document.createDocumentFragment();
			const first = document.createElement("i");
			const second = document.createElement("b");
			fragment.append(first, second);

			place(host, anchor, visible, fragment);
			expect(nonCommentNodes(host.element).filter(node => node !== anchor.element)).toEqual([first, second]);

			visible.set(false);
			await flushEffects();
			expect.soft(host.element.contains(first)).toBe(false);
			expect.soft(host.element.contains(second)).toBe(false);

			visible.set(true);
			await flushEffects();
			expect(nonCommentNodes(host.element).filter(node => node !== anchor.element)).toEqual([first, second]);
		} finally {
			host.remove();
		}
	});

	it("accepts multiple children in appendWhen", async () => {
		const host = mountedComponent("div");
		const first = Component("span").text.set("first");
		const second = Component("span").text.set("second");
		const visible = State(host, false);

		host.appendWhen(visible, first, [second]);
		expect(first.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(second.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(host.element)).toEqual([
			first.element,
			second.element,
		]);
	});

	it("disposes every appendWhen child when the first Mount synchronously removes the host", async () => {
		vi.useFakeTimers();
		const queuedErrors: VoidFunction[] = [];
		const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => queuedErrors.push(callback));
		const host = mountedComponent("div");
		const visible = State(host, true);
		const first = Component("span");
		const second = Component("span");
		first.event.owned.on.Mount(() => host.remove());

		try {
			expect.soft(() => host.appendWhen(visible, first, second)).not.toThrow();
			await vi.runAllTimersAsync();
			await Promise.resolve();
			expect.soft(queuedErrors).toEqual([]);
			expect.soft(host.disposed).toBe(true);
			expect.soft(first.disposed).toBe(true);
			expect(second.disposed).toBe(true);
		} finally {
			queueMicrotaskSpy.mockRestore();
			vi.useRealTimers();
			if (!first.disposed) first.remove();
			if (!second.disposed) second.remove();
			if (!host.disposed) host.remove();
		}
	});

	it("prepends conditional children at the front of the component", async () => {
		const host = mountedComponent("div");
		const trailing = Component("span").text.set("trailing");
		const toggled = Component("span").text.set("prepended");
		const visible = State(host, true);

		host.append(trailing);
		host.prependWhen(visible, toggled);

		expect(host.element.firstElementChild).toBe(toggled.element);

		visible.set(false);
		await flushEffects();

		expect(host.element.firstChild).toBeInstanceOf(Comment);
		expect(host.element.lastElementChild).toBe(trailing.element);
	});

	it("accepts multiple children in prependWhen", async () => {
		const host = mountedComponent("div");
		const trailing = Component("span").text.set("trailing");
		const first = Component("span").text.set("first");
		const second = Component("span").text.set("second");
		const third = Component("span").text.set("third");
		const visible = State(host, true);

		host.append(trailing);
		const result = host.prependWhen(visible, first, [second], third);

		expect(result).toBe(host);

		expect(nonCommentNodes(host.element)).toEqual([
			first.element,
			second.element,
			third.element,
			trailing.element,
		]);
	});

	it("handles prependWhen hide/show when the original reference node was removed", async () => {
		const host = mountedComponent("div");
		const trailing = Component("span").text.set("trailing");
		const prepended = Component("span").text.set("prepended");
		const visible = State(host, true);

		host.append(trailing);
		host.prependWhen(visible, prepended);

		trailing.remove();
		visible.set(false);
		await flushEffects();
		visible.set(true);
		await flushEffects();

		expect(Array.from(host.element.children)).toEqual([prepended.element]);
	});

	it("keeps appendWhen anchored to its placeholder instead of relocking to the end", async () => {
		const host = mountedComponent("div");
		const first = Component("span").text.set("first");
		const second = Component("span").text.set("second");
		const toggled = Component("span").text.set("toggled");
		const visible = State(host, true);

		host.append(first);
		host.appendWhen(visible, toggled);
		host.append(second);

		expect(nonCommentNodes(host.element)).toEqual([
			first.element,
			toggled.element,
			second.element,
		]);

		visible.set(false);
		await flushEffects();
		expect(host.element.contains(toggled.element)).toBe(false);

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(host.element)).toEqual([
			first.element,
			toggled.element,
			second.element,
		]);
	});

	it("keeps prependWhen anchored to its placeholder instead of relocking to the start", async () => {
		const host = mountedComponent("div");
		const first = Component("span").text.set("first");
		const second = Component("span").text.set("second");
		const toggled = Component("span").text.set("toggled");
		const visible = State(host, true);

		host.append(first, second);
		host.prependWhen(visible, toggled);
		first.insertTo("after", second);

		expect(nonCommentNodes(host.element)).toEqual([
			toggled.element,
			second.element,
			first.element,
		]);

		visible.set(false);
		await flushEffects();
		expect(host.element.contains(toggled.element)).toBe(false);

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(host.element)).toEqual([
			toggled.element,
			second.element,
			first.element,
		]);
	});

	it("supports ComponentSelectionState in conditional insertion methods", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const visible = State(host, true);
		const appendA = Component("span").text.set("append-a");
		const prependA = Component("span").text.set("prepend-a");
		const afterA = Component("span").text.set("after-a");
		const appendSelection = State(host, appendA);
		const prependSelection = State(host, prependA);
		const afterSelection = State(host, afterA);
		const elementChildren = () => Array.from(host.element.children);

		host.append(anchor);
		host.appendWhen(visible, appendSelection);
		host.prependWhen(visible, prependSelection);
		anchor.insertWhen(visible, "after", afterSelection);

		expect(elementChildren()).toEqual([
			prependA.element,
			anchor.element,
			afterA.element,
			appendA.element,
		]);

		const appendB = Component("span").text.set("append-b");
		const prependB = Component("span").text.set("prepend-b");
		const afterB = Component("span").text.set("after-b");
		appendSelection.set(appendB);
		prependSelection.set(prependB);
		afterSelection.set(afterB);
		await flushEffects();

		expect(elementChildren()).toEqual([
			prependB.element,
			anchor.element,
			afterB.element,
			appendB.element,
		]);

		visible.set(false);
		await flushEffects();

		expect(host.element.contains(prependB.element)).toBe(false);
		expect(host.element.contains(afterB.element)).toBe(false);
		expect(host.element.contains(appendB.element)).toBe(false);
		expect(host.element.contains(anchor.element)).toBe(true);

		visible.set(true);
		await flushEffects();

		expect(elementChildren()).toEqual([
			prependB.element,
			anchor.element,
			afterB.element,
			appendB.element,
		]);
	});

	it("keeps an initially hidden single selection ownerless until its host mounts", async () => {
		const timeoutSpy = captureTimeoutCallbacks();

		try {
			const root = Component("div");
			const visible = State(root, false);
			const host = Component("section");
			const selected = Component("span").text.set("selected");
			const selection = State<Component | null>(host, selected);

			host.appendWhen(visible, selection);
			root.append(host);
			document.body.append(root.element);

			expect(selected.owner.get(), "hidden conditional selections should remain ownerless while parked").toBeNull();
			expect(() => {
				for (const callback of timeoutSpy.callbacks) {
					callback();
				}
			}, "mounting the host before the next tick should prevent orphan errors for hidden conditional selections").not.toThrow();

			root.remove();
		}
		finally {
			timeoutSpy.restore();
		}
	});

	it("keeps an invisible appendWhen selection managed across the real orphan timer boundary and reuse", async () => {
		const queuedErrors: VoidFunction[] = [];
		const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => queuedErrors.push(callback));
		const host = mountedComponent("section");
		const visible = State(host, false);
		const selected = Component("span");
		const selection = State<Component | null>(host, selected);

		try {
			host.appendWhen(visible, selection);
			expect(selected.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

			await new Promise<void>(resolve => setTimeout(resolve, 0));
			await Promise.resolve();
			expect.soft(queuedErrors).toEqual([]);
			queueMicrotaskSpy.mockRestore();

			visible.set(true);
			await flushEffects();
			expect(host.element.contains(selected.element)).toBe(true);
			visible.set(false);
			await flushEffects();
			expect(selected.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
			expect(selected.disposed).toBe(false);

			host.remove();
			expect(selected.disposed).toBe(true);
		} finally {
			queueMicrotaskSpy.mockRestore();
			if (!host.disposed) host.remove();
			if (!selected.disposed) selected.remove();
		}
	});

	it("ignores a disposed ComponentSelectionState entry when a later visibility update renders", () => {
		const scheduled: VoidFunction[] = [];
		const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => scheduled.push(callback));
		const host = mountedComponent("section");
		const visible = State(host, false);
		const selection = State<Component[]>(host, []);
		const disposed = Component("span");
		disposed.remove();
		host.appendWhen(visible, selection);

		try {
			selection.set([disposed]);
			visible.set(true);
			expect.soft(() => {
				while (scheduled.length > 0) scheduled.shift()!();
			}).not.toThrow();

			expect.soft(nonCommentNodes(host.element)).toEqual([]);
			const live = Component("b");
			expect.soft(() => host.append(live)).not.toThrow();
			expect(live.element.parentNode).toBe(host.element);
		} finally {
			queueMicrotaskSpy.mockRestore();
			host.remove();
		}
	});

	it("preserves multi-component selection order across hidden conditional transitions", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const visible = State(host, true);
		const owned = (label: string) => Component("span").text.set(label).owner.add(host);
		const appendA = owned("append-a");
		const appendB = owned("append-b");
		const prependA = owned("prepend-a");
		const prependB = owned("prepend-b");
		const beforeA = owned("before-a");
		const beforeB = owned("before-b");
		const afterA = owned("after-a");
		const afterB = owned("after-b");
		const appendSelection = State(host, [appendA, appendB]);
		const prependSelection = State(host, [prependA, prependB]);
		const beforeSelection = State(host, [beforeA, beforeB]);
		const afterSelection = State(host, [afterA, afterB]);

		host.append(anchor);
		host.appendWhen(visible, appendSelection);
		host.prependWhen(visible, prependSelection);
		anchor.insertWhen(visible, "before", beforeSelection);
		anchor.insertWhen(visible, "after", afterSelection);

		expect(nonCommentNodes(host.element)).toEqual([
			prependA.element,
			prependB.element,
			beforeA.element,
			beforeB.element,
			anchor.element,
			afterA.element,
			afterB.element,
			appendA.element,
			appendB.element,
		]);

		visible.set(false);
		await flushEffects();

		const appendC = owned("append-c");
		const appendD = owned("append-d");
		const prependC = owned("prepend-c");
		const prependD = owned("prepend-d");
		const beforeC = owned("before-c");
		const beforeD = owned("before-d");
		const afterC = owned("after-c");
		const afterD = owned("after-d");

		appendSelection.set([appendC, appendD]);
		prependSelection.set([prependC, prependD]);
		beforeSelection.set([beforeC, beforeD]);
		afterSelection.set([afterC, afterD]);
		await flushEffects();

		expect(nonCommentNodes(host.element)).toEqual([anchor.element]);

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(host.element)).toEqual([
			prependC.element,
			prependD.element,
			beforeC.element,
			beforeD.element,
			anchor.element,
			afterC.element,
			afterD.element,
			appendC.element,
			appendD.element,
		]);
	});

	it("does not dispose explicitly owned deselected components while hidden in conditional selections", async () => {
		const host = mountedComponent("div");
		const retentionOwner = mountedComponent("section");
		const visible = State(host, true);
		const selectedA = Component("span").text.set("selected-a").owner.add(retentionOwner);
		const selectedB = Component("span").text.set("selected-b").owner.add(retentionOwner);
		const selection = State(host, selectedA as Component | Iterable<Component>);

		host.appendWhen(visible, selection);
		expect(host.element.contains(selectedA.element)).toBe(true);

		visible.set(false);
		await flushEffects();

		selection.set(selectedB);
		await flushEffects();

		expect(selectedA.disposed).toBe(false);
		expect(selectedB.disposed).toBe(false);
		expect(selectedA.owner.get()).toBe(retentionOwner);
		expect(selectedB.owner.get()).toBe(retentionOwner);

		visible.set(true);
		await flushEffects();

		expect(host.element.contains(selectedA.element)).toBe(false);
		expect(host.element.contains(selectedB.element)).toBe(true);
	});

	it("parks both selections when visibility and selection replacement coalesce while hiding", async () => {
		const host = mountedComponent("div");
		const visible = State(host, true);
		const oldSelection = Component("span").text.set("old");
		const newSelection = Component("span").text.set("new");
		const selection = State<Component | null>(host, oldSelection);
		host.appendWhen(visible, selection);

		visible.set(false);
		selection.set(newSelection);
		await flushEffects();

		expect.soft(nonCommentNodes(host.element)).toEqual([]);
		expect.soft(oldSelection.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect.soft(newSelection.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect.soft(oldSelection.disposed).toBe(false);
		expect.soft(newSelection.disposed).toBe(false);

		host.remove();
		expect.soft(oldSelection.disposed).toBe(true);
		expect(newSelection.disposed).toBe(true);
	});

	it("disposes retained hidden conditional selections when the host is removed", async () => {
		const host = mountedComponent("div");
		const visible = State(host, true);
		const selectedA = Component("span").text.set("selected-a").owner.add(host);
		const selectedB = Component("span").text.set("selected-b").owner.add(host);
		const selection = State(host, selectedA as Component | Iterable<Component>);

		host.appendWhen(visible, selection);
		visible.set(false);
		await flushEffects();

		selection.set(selectedB);
		await flushEffects();

		host.remove();

		expect(selectedA.disposed).toBe(true);
		expect(selectedB.disposed).toBe(true);
	});

	it("preserves externally owned selected and retained Components when their conditional host is removed", async () => {
		const host = mountedComponent("div");
		const externalOwner = mountedComponent("section");
		const visible = State(host, true);
		const selected = Component("span").text.set("selected").owner.add(externalOwner);
		const retained = Component("span").text.set("retained").owner.add(externalOwner);
		const selection = State<Component | null>(host, retained);
		host.appendWhen(visible, selection);
		visible.set(false);
		await flushEffects();
		selection.set(selected);
		await flushEffects();

		host.remove();

		expect.soft(retained.disposed).toBe(false);
		expect.soft(selected.disposed).toBe(false);
		expect.soft(retained.element.parentNode).toBeNull();
		expect.soft(selected.element.parentNode).toBeNull();

		externalOwner.remove();
		expect.soft(retained.disposed).toBe(true);
		expect(selected.disposed).toBe(true);
	});

	it("replaces a structural conditional controller when the same Component is authored again", async () => {
		const firstHost = mountedComponent("section");
		const secondHost = mountedComponent("aside");
		const firstVisible = State(firstHost, false);
		const secondVisible = State(secondHost, false);
		const child = Component("span");
		firstHost.appendWhen(firstVisible, child);
		const firstStorage = child.element.parentElement;

		expect.soft(() => secondHost.appendWhen(secondVisible, child)).not.toThrow();
		expect.soft(child.disposed).toBe(false);
		expect.soft(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect.soft(child.element.parentElement).not.toBe(firstStorage);

		firstVisible.set(true);
		await flushEffects();
		expect.soft(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		secondVisible.set(true);
		await flushEffects();
		expect.soft(child.element.parentNode).toBe(secondHost.element);

		firstHost.remove();
		expect.soft(child.disposed).toBe(false);
		secondHost.remove();
		expect(child.disposed).toBe(true);
	});

	it("replaces earlier authorities independently across a multi-node conditional call", async () => {
		const firstHost = mountedComponent("section");
		const secondHost = mountedComponent("aside");
		const firstVisible = State(firstHost, false);
		const secondVisible = State(secondHost, false);
		const controlled = Component("span");
		const safe = Component("b");
		firstHost.appendWhen(firstVisible, controlled);

		expect.soft(() => secondHost.appendWhen(secondVisible, safe, controlled)).not.toThrow();
		expect.soft(safe.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect.soft(controlled.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		const controlledStorage = controlled.element.parentElement;

		firstVisible.set(true);
		await flushEffects();
		expect.soft(controlled.element.parentNode).toBe(controlledStorage);
		secondVisible.set(true);
		await flushEffects();
		expect.soft(nonCommentNodes(secondHost.element)).toEqual([safe.element, controlled.element]);

		firstHost.remove();
		expect.soft(safe.disposed).toBe(false);
		expect.soft(controlled.disposed).toBe(false);
		secondHost.remove();
		expect.soft(safe.disposed).toBe(true);
		expect(controlled.disposed).toBe(true);
	});

	it("keeps the newest authority across selection, conditional placement, and imperative placement families", async () => {
		const selectionHost = mountedComponent("section");
		const conditionalHost = mountedComponent("aside");
		const finalHost = mountedComponent("article");
		const child = Component("span");
		const selection = State<Component | null>(selectionHost, child);
		const visible = State(conditionalHost, true);

		selectionHost.append(selection);
		child.appendToWhen(visible, conditionalHost);
		child.appendTo(finalHost);

		expect.soft(child.element.parentNode).toBe(finalHost.element);
		selection.set(null);
		visible.set(false);
		await flushEffects();
		expect.soft(child.disposed).toBe(false);
		expect.soft(child.element.parentNode).toBe(finalHost.element);
		selection.set(child);
		visible.set(true);
		await flushEffects();
		expect(child.element.parentNode).toBe(finalHost.element);

		selectionHost.remove();
		conditionalHost.remove();
		finalHost.remove();
	});

	it.each(["ordinary", "conditional"] as const)("keeps unaffected nodes live after replacing one %s selection authority", async (api) => {
		const oldHost = mountedComponent("section");
		const newerHost = mountedComponent("aside");
		const retentionOwner = mountedComponent("article");
		const alpha = Component("span").text.set("alpha").owner.add(retentionOwner);
		const beta = Component("b").text.set("beta").owner.add(retentionOwner);
		const selection = State<Component[]>(oldHost, [alpha, beta]);
		const newerSelection = State<Component[]>(newerHost, [alpha]);
		const visible = State(oldHost, true);
		if (api === "ordinary") oldHost.append(selection);
		else oldHost.appendWhen(visible, selection);
		newerHost.append(newerSelection);

		if (api === "ordinary") {
			selection.set([alpha]);
			await flushEffects();
			expect.soft(beta.element.parentNode, "the unaffected ordinary node should still deselect").toBeNull();
			selection.set([alpha, beta]);
			await flushEffects();
		} else {
			visible.set(false);
			await flushEffects();
			expect.soft(beta.element.parentElement?.tagName, "the unaffected conditional node should still hide").toBe("KITSUI-STORAGE");
			visible.set(true);
			await flushEffects();
		}
		expect.soft([alpha.element.parentNode, beta.element.parentNode]).toEqual([newerHost.element, oldHost.element]);

		newerSelection.set([]);
		await flushEffects();
		expect.soft([alpha.disposed, alpha.element.parentNode], "the newer selection should relinquish alpha without disposing it").toEqual([false, null]);
		selection.set([beta]);
		await flushEffects();
		selection.set([alpha, beta]);
		await flushEffects();
		expect.soft([alpha.element.parentNode, beta.element.parentNode], "the older selection must not reacquire alpha when it is re-added").toEqual([null, oldHost.element]);

		oldHost.remove();
		expect.soft([alpha.disposed, alpha.element.parentNode, beta.disposed, beta.element.parentNode]).toEqual([false, null, false, null]);
		newerHost.remove();
		expect.soft([alpha.disposed, beta.disposed]).toEqual([false, false]);
		retentionOwner.remove();
		expect([alpha.disposed, beta.disposed]).toEqual([true, true]);
	});

	it("replaces repeatable conditional authority for a raw Node identity", async () => {
		const firstHost = mountedComponent("section");
		const secondHost = mountedComponent("aside");
		const firstVisible = State(firstHost, false);
		const secondVisible = State(secondHost, false);
		const raw = document.createElement("em");

		firstHost.appendWhen(firstVisible, raw);
		secondHost.appendWhen(secondVisible, raw);
		const secondStorage = raw.parentNode;

		firstVisible.set(true);
		await flushEffects();
		expect.soft(raw.parentNode).toBe(secondStorage);
		secondVisible.set(true);
		await flushEffects();
		expect.soft(raw.parentNode).toBe(secondHost.element);
		firstVisible.set(false);
		await flushEffects();
		expect(raw.parentNode).toBe(secondHost.element);

		firstHost.remove();
		secondHost.remove();
	});

	it("keeps a conditional DocumentFragment's initial nodes stable across reuse and later replacement", async () => {
		const fragmentHost = mountedComponent("section");
		const replacementHost = mountedComponent("aside");
		const fragmentVisible = State(fragmentHost, true);
		const replacementVisible = State(replacementHost, false);
		const fragment = document.createDocumentFragment();
		const first = document.createElement("i");
		const second = document.createTextNode("text");
		fragment.append(first, second);

		fragmentHost.appendWhen(fragmentVisible, fragment);
		expect.soft(Array.from(fragmentHost.element.childNodes).filter(node => !(node instanceof Comment))).toEqual([first, second]);
		fragmentVisible.set(false);
		await flushEffects();
		fragmentVisible.set(true);
		await flushEffects();
		expect.soft(Array.from(fragmentHost.element.childNodes).filter(node => !(node instanceof Comment))).toEqual([first, second]);

		replacementHost.appendWhen(replacementVisible, first);
		fragmentVisible.set(false);
		fragmentVisible.set(true);
		await flushEffects();
		expect.soft(first.parentNode?.nodeName).toBe("KITSUI-STORAGE");
		expect.soft(second.parentNode).toBe(fragmentHost.element);
		replacementVisible.set(true);
		await flushEffects();
		expect(first.parentNode).toBe(replacementHost.element);

		fragmentHost.remove();
		replacementHost.remove();
	});

	it("preserves nested conditional children inside hidden selected components", async () => {
		const host = mountedComponent("div");
		const visible = State(host, true);
		const nestedVisible = State(host, true);
		const outerA = Component("section").owner.add(host);
		const outerB = Component("section").owner.add(host);
		const outerAText = Component("span").text.set("outer-a").owner.add(outerA);
		const nestedA = Component("span").text.set("nested-a").owner.add(outerA);
		const outerBText = Component("span").text.set("outer-b").owner.add(outerB);
		const nestedB = Component("span").text.set("nested-b").owner.add(outerB);
		const selection = State(host, outerA as Component | Iterable<Component>);

		outerA.append(outerAText).appendWhen(nestedVisible, nestedA);
		outerB.append(outerBText).appendWhen(nestedVisible, nestedB);
		host.appendWhen(visible, selection);

		expect(nonCommentNodes(outerA.element)).toEqual([outerAText.element, nestedA.element]);

		visible.set(false);
		await flushEffects();
		nestedVisible.set(false);
		selection.set(outerB);
		await flushEffects();

		expect(outerA.disposed).toBe(false);
		expect(outerB.disposed).toBe(false);

		visible.set(true);
		await flushEffects();

		expect(host.element.contains(outerA.element)).toBe(false);
		expect(host.element.contains(outerB.element)).toBe(true);
		expect(nonCommentNodes(outerB.element)).toEqual([outerBText.element]);

		nestedVisible.set(true);
		await flushEffects();

		expect(nonCommentNodes(outerB.element)).toEqual([outerBText.element, nestedB.element]);
	});

	it("throws when a conditional selection contains duplicate components", async () => {
		const host = mountedComponent("div");
		const visible = State(host, true);
		const component = Component("span").text.set("test").owner.add(host);
		const selection = State(host, [component, component]);

		expect(() => {
			host.appendWhen(visible, selection);
		}).toThrow("Component selections cannot contain the same component more than once");
	});



	it("inserts sibling nodes before and after itself and inherits the current owner", () => {
		const owner = mountedComponent("div");
		const target = Component("span").text.set("target");
		const before = Component("span").text.set("before");
		const after = document.createElement("hr");

		owner.append(target);
		target.insert("before", before);
		target.insert("after", after);

		expect(Array.from(owner.element.childNodes)).toEqual([before.element, target.element, after]);

		owner.remove();
		expect(before.disposed).toBe(true);
	});

	it("accepts arrays of insertables in insert", () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const leading = Component("span").text.set("leading");
		const middle = document.createElement("hr");
		const trailing = Component("span").text.set("trailing");

		host.append(anchor);
		anchor.insert("before", [leading, middle]);
		anchor.insert("after", [trailing]);

		expect(Array.from(host.element.childNodes)).toEqual([
			leading.element,
			middle,
			anchor.element,
			trailing.element,
		]);
	});

	it("accepts strings in insert", () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const leading = Component("span").text.set("leading");

		try {
			host.append(anchor);
			anchor.insert("before", "before" as any, [leading, "after"] as any);

			expect(host.element.childNodes[0], "insert() should convert string children to text nodes").toBeInstanceOf(Text);
			expect(host.element.childNodes[0].textContent, "insert() should preserve string child content").toBe("before");
			expect(host.element.childNodes[1], "insert() should preserve component children when mixed with strings").toBe(leading.element);
			expect(host.element.childNodes[2], "insert() should convert strings inside iterables to text nodes").toBeInstanceOf(Text);
			expect(host.element.childNodes[2].textContent, "insert() should preserve iterable string child content").toBe("after");
			expect(host.element.childNodes[3], "insert() should keep the anchor at the end of the inserted sequence").toBe(anchor.element);
		} finally {
			host.remove();
		}
	});

	it("toggles sibling insertion with insertWhen", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const before = Component("span").text.set("before");
		const after = Component("span").text.set("after");
		const visible = State(host, false);

		host.append(anchor);
		const result = anchor.insertWhen(visible, "before", before);
		anchor.insertWhen(visible, "after", after);

		expect(result).toBe(anchor);

		expect(Array.from(host.element.childNodes).filter((node) => node instanceof Comment)).toHaveLength(2);
		expect(before.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(after.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(host.element)).toEqual([before.element, anchor.element, after.element]);

		visible.set(false);
		await flushEffects();

		expect(Array.from(host.element.childNodes).filter((node) => node instanceof Comment)).toHaveLength(2);
		expect(before.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(after.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
	});

	it("accepts arrays of insertables in insertWhen", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const first = Component("span").text.set("first");
		const second = Component("span").text.set("second");
		const visible = State(host, false);

		host.append(anchor);
		anchor.insertWhen(visible, "after", [first, second]);

		expect(first.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(second.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(host.element)).toEqual([
			anchor.element,
			first.element,
			second.element,
		]);
	});

	it("keeps insertWhen anchored to its placeholder instead of relocking to the anchor", async () => {
		const host = mountedComponent("div");
		const leading = Component("span").text.set("leading");
		const anchor = Component("span").text.set("anchor");
		const trailing = Component("span").text.set("trailing");
		const toggled = Component("span").text.set("toggled");
		const visible = State(host, true);

		host.append(leading, anchor, trailing);
		anchor.insertWhen(visible, "after", toggled);
		anchor.insertTo("before", leading);

		expect(nonCommentNodes(host.element)).toEqual([
			anchor.element,
			leading.element,
			toggled.element,
			trailing.element,
		]);

		visible.set(false);
		await flushEffects();
		expect(host.element.contains(toggled.element)).toBe(false);

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(host.element)).toEqual([
			anchor.element,
			leading.element,
			toggled.element,
			trailing.element,
		]);
	});

	it("does not crash on recursive tree attempts in append, prepend, and insert", () => {
		const root = mountedComponent("div");
		const parent = Component("section");
		const child = Component("article");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		root.append(parent);
		parent.append(child);

		expect(() => {
			parent.append(parent);
		}).not.toThrow();
		expect(() => {
			child.append(parent);
		}).not.toThrow();
		expect(() => {
			parent.prepend(parent);
		}).not.toThrow();
		expect(() => {
			child.prepend(parent);
		}).not.toThrow();
		expect(() => {
			child.insert("before", parent);
		}).not.toThrow();

		expect(parent.element.parentElement).toBe(root.element);
		expect(child.element.parentElement).toBe(parent.element);
		expect(errorSpy).toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("does not dispatch Mount when a recursive append move is blocked", () => {
		const root = mountedComponent("div");
		const parent = Component("section");
		const child = Component("article");
		const mountSpy = vi.fn();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		parent.event.owned.on.Mount(mountSpy);
		root.append(parent);
		parent.append(child);

		expect(mountSpy).toHaveBeenCalledTimes(1);

		parent.append(parent);
		parent.prepend(parent);
		child.insert("before", parent);

		expect(mountSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("does not crash on recursive tree attempts in appendWhen, prependWhen, and insertWhen", async () => {
		const root = mountedComponent("div");
		const parent = Component("section");
		const child = Component("article");
		const visible = State(root, true);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		root.append(parent);
		parent.append(child);

		expect(() => {
			parent.appendWhen(visible, parent);
		}).not.toThrow();
		expect(() => {
			parent.prependWhen(visible, parent);
		}).not.toThrow();
		expect(() => {
			child.insertWhen(visible, "before", parent);
		}).not.toThrow();

		visible.set(false);
		await flushEffects();
		visible.set(true);
		await flushEffects();

		expect(parent.disposed).toBe(false);
		expect(child.disposed).toBe(false);
		expect(parent.element.parentElement).toBe(root.element);
		expect(child.element.parentElement).toBe(parent.element);
		expect(errorSpy).toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("does not crash on recursive tree attempts in appendTo/prependTo/insertTo and their conditional variants", async () => {
		const root = mountedComponent("div");
		const parent = Component("section");
		const child = Component("article");
		const visible = State(root, true);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		root.append(parent);
		parent.append(child);

		expect(() => {
			parent.appendTo(child);
		}).not.toThrow();
		expect(() => {
			parent.prependTo(child);
		}).not.toThrow();
		expect(() => {
			parent.insertTo("before", child);
		}).not.toThrow();
		expect(() => {
			parent.appendToWhen(visible, child);
		}).not.toThrow();
		expect(() => {
			parent.prependToWhen(visible, child);
		}).not.toThrow();
		expect(() => {
			parent.insertToWhen(visible, "before", child);
		}).not.toThrow();

		visible.set(false);
		await flushEffects();
		visible.set(true);
		await flushEffects();

		expect(parent.disposed).toBe(false);
		expect(parent.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(parent.element.isConnected).toBe(false);
		expect(child.element.parentElement).toBe(parent.element);
		expect(errorSpy).toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("does not crash on recursive tree attempts in place", () => {
		const root = mountedComponent("div");
		const placementOwner = mountedComponent("section");
		const parent = Component("article");
		const child = Component("aside");
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		root.append(parent);
		parent.append(child);

		expect(() => {
			parent.place(placementOwner, (Place) => {
				return State.Readonly<ReturnType<typeof Place> | null>(Place().appendTo(child));
			});
		}).not.toThrow();

		expect(parent.element.parentElement).toBe(root.element);
		expect(child.element.parentElement).toBe(parent.element);
		expect(errorSpy).toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("does not dispatch Mount when recursive place targets are blocked", () => {
		const root = mountedComponent("div");
		const placementOwner = mountedComponent("section");
		const parent = Component("article");
		const child = Component("aside");
		const mountSpy = vi.fn();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		parent.event.owned.on.Mount(mountSpy);
		root.append(parent);
		parent.append(child);

		expect(mountSpy).toHaveBeenCalledTimes(1);

		parent.place(placementOwner, (Place) => {
			return State.Readonly<ReturnType<typeof Place> | null>(Place().appendTo(child));
		});

		expect(mountSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("parks a recursively blocked reactive placement when its State later becomes null", async () => {
		const root = mountedComponent("div");
		const placementOwner = mountedComponent("section");
		const parent = Component("article");
		const child = Component("aside");
		const current = State<Place | null>(placementOwner, null);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		root.append(parent);
		parent.append(child);
		parent.place(placementOwner, (PlaceConstructor) => {
			current.set(PlaceConstructor().appendTo(child));
			return current;
		});
		expect.soft(parent.element.parentNode).toBe(root.element);

		current.set(null);
		await flushEffects();

		expect.soft(errorSpy).toHaveBeenCalledWith("Cannot move a node into itself or one of its descendants.");
		expect.soft(parent.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(child.element.parentNode).toBe(parent.element);
		errorSpy.mockRestore();
			placementOwner.remove();
		root.remove();
	});

	it.each(["recursive", "stale disposed raw target"] as const)("preserves an active reactive placement when a %s imperative move is rejected", async (rejection) => {
		const placementOwner = mountedComponent("section");
		const firstHost = mountedComponent("div");
		const secondHost = mountedComponent("article");
		const child = Component("span");
		const staleTarget = Component("aside");
		const current = State<Place | null>(placementOwner, null);
		let firstPlace!: Place;
		let secondPlace!: Place;

		child.place(placementOwner, (PlaceConstructor) => {
			firstPlace = PlaceConstructor().appendTo(firstHost);
			secondPlace = PlaceConstructor().appendTo(secondHost);
			current.set(firstPlace);
			return current;
		});
		staleTarget.remove();
		const rejectedTarget = rejection === "recursive" ? child.element : staleTarget.element;

		const orphanCallbacks = captureTimeoutCallbacks();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		try {
			expect(() => child.appendTo(rejectedTarget)).not.toThrow();
			if (rejection === "recursive") {
				expect(errorSpy).toHaveBeenCalledWith("Cannot move a node into itself or one of its descendants.");
			}
			else {
				expect(errorSpy).not.toHaveBeenCalled();
			}
			expect(child.element.parentNode).toBe(firstHost.element);
			expect(firstPlace.marker.disposed).toBe(false);
			expect(child.disposed).toBe(false);
			expect(orphanCallbacks.callbacks).toHaveLength(0);
		} finally {
			errorSpy.mockRestore();
			orphanCallbacks.restore();
		}

		current.set(secondPlace);
		await flushEffects();
		expect(child.element.parentNode).toBe(secondHost.element);

		placementOwner.remove();
		if (!child.disposed) child.remove();
		firstHost.remove();
		secondHost.remove();
	});

	it("appendTo and prependTo move components into their destination component", () => {
		const host = mountedComponent("div");
		const child = Component("span").text.set("child");
		const trailing = Component("span").text.set("trailing");

		host.append(trailing);
		child.prependTo(host);

		expect(Array.from(host.element.childNodes)).toEqual([child.element, trailing.element]);

		const secondHost = mountedComponent("section");
		child.appendTo(secondHost);

		expect(Array.from(secondHost.element.childNodes)).toEqual([child.element]);

		secondHost.remove();
		expect(child.disposed).toBe(true);
	});

	it("appendTo, prependTo, and insertTo keep ownerless children ownerless under disconnected managed targets", () => {
		vi.useFakeTimers();

		const root = mountedComponent("div");
		const managedContainer = Component("section").owner.add(root);
		const appended = Component("span").text.set("appended");
		const prepended = Component("span").text.set("prepended");
		const anchor = Component("span").text.set("anchor").owner.add(managedContainer);
		const inserted = Component("span").text.set("inserted");

		managedContainer.append(anchor);
		appended.appendTo(managedContainer);
		prepended.prependTo(managedContainer);
		inserted.insertTo("after", anchor);

		try {
			expect(Array.from(managedContainer.element.childNodes)).toEqual([
				prepended.element,
				anchor.element,
				inserted.element,
				appended.element,
			]);
			expect(appended.owner.get(), "appendTo should not rewrite explicit ownership for ownerless children").toBeNull();
			expect(prepended.owner.get(), "prependTo should not rewrite explicit ownership for ownerless children").toBeNull();
			expect(inserted.owner.get(), "insertTo should not rewrite explicit ownership for ownerless children").toBeNull();
			expect(() => {
				vi.advanceTimersByTime(0);
			}).not.toThrow();
			expect(appended.disposed).toBe(false);
			expect(prepended.disposed).toBe(false);
			expect(inserted.disposed).toBe(false);
			root.remove();
			expect(appended.disposed, "disposing the explicit owner should dispose the appended subtree").toBe(true);
			expect(prepended.disposed, "disposing the explicit owner should dispose the prepended subtree").toBe(true);
			expect(inserted.disposed, "disposing the explicit owner should dispose the inserted subtree").toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("append into a disconnected managed component keeps ownerless children ownerless", () => {
		vi.useFakeTimers();

		const root = mountedComponent("div");
		const parent = Component("section").owner.add(root);
		const child = Component("span").text.set("child");

		try {
			parent.append(child);

			expect(child.owner.get(), "append should not assign explicit ownership to an ownerless child").toBeNull();
			expect(() => {
				vi.advanceTimersByTime(0);
			}, "advancing the orphan check should not throw for internally managed children").not.toThrow();
			expect(child.disposed, "the internally managed child should remain alive before its owner is removed").toBe(false);

			root.remove();
			expect(child.disposed, "disposing the explicit owner should dispose the internally managed subtree").toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("appendTo and prependTo accept raw DOM parents like document.body", () => {
		const trailing = document.createElement("hr");
		document.body.replaceChildren(trailing);

		const prepended = Component("span").text.set("prepended");
		const appended = Component("span").text.set("appended");

		prepended.prependTo(document.body);
		appended.appendTo(document.body);

		expect(Array.from(document.body.childNodes)).toEqual([
			prepended.element,
			trailing,
			appended.element,
		]);
		expect(prepended.owner.get()).toBe(null);
		expect(appended.owner.get()).toBe(null);

		prepended.remove();
		appended.remove();
		trailing.remove();
	});

	describe("lifecycle mounting", () => {
		/** Verifies unmanaged components still defer orphan validation to a timeout tick, then run the check through Promise.then. */
		it("runs unmanaged orphan validation through Promise.then", () => {
			const orphanCheckSpy = captureOrphanCheck();

			try {
				Component("div");

				expect(orphanCheckSpy.orphanCheck, "the orphan check should be attached through Promise.then").toBeTypeOf("function");
				expect(() => orphanCheckSpy.orphanCheck?.(), "the Promise.then orphan callback should defer its uncaught rethrow").not.toThrow();
				expect(orphanCheckSpy.queuedError, "the orphan callback should queue an uncaught rethrow").toBeTypeOf("function");
				expect(() => orphanCheckSpy.queuedError?.(), "the queued rethrow should surface the orphan error").toThrow("Components must be connected to the document or have a managed owner before the next tick.");
			} finally {
				orphanCheckSpy.restore();
			}
		});

		it("Component inside a raw DOM element knows it's mounted when the container enters the document", async () => {
			vi.useFakeTimers();

			const container = document.createElement("div");
			const component = Component("span");
			const mountCallback = vi.fn();
			component.event.owned.on.Mount(mountCallback);

			container.appendChild(component.element);
			document.body.appendChild(container);

			try {
				expect(component.element.isConnected, "raw DOM mounting should connect the component element").toBe(true);
				expect(mountCallback, "Mount event should not fire before the orphan check").not.toHaveBeenCalled();
				expect(() => {
					vi.advanceTimersByTime(0);
				}, "the orphan check should not throw once the raw container is in the document").not.toThrow();
				await flushEffects();
				expect(component.disposed, "a connected component should not be disposed by the orphan check").toBe(false);
				expect(mountCallback, "Mount event should fire as a self-healing operation when the orphan check finds isConnected").toHaveBeenCalledTimes(1);
			} finally {
				component.remove();
				container.remove();
				vi.useRealTimers();
			}
		});

		it("removing a parent Component disposes owned descendant Components through non-wrapped intermediaries", () => {
			const parent = mountedComponent("section");
			const child = Component("span");
			const mountCallback = vi.fn();
			const disposeCallback = vi.fn();
			const intermediary = document.createElement("div");

			child.event.owned.on.Mount(mountCallback);
			child.event.owned.on.Dispose(disposeCallback);

			parent.append(child);
			expect(mountCallback, "Mount event should fire when child is appended via kitsui API").toHaveBeenCalledTimes(1);

			parent.element.appendChild(intermediary);
			intermediary.appendChild(child.element);

			expect(child.element.parentElement, "the owned child should be nested under the raw intermediary before removal").toBe(intermediary);
			expect(child.disposed, "the owned child should remain active before the parent is removed").toBe(false);

			parent.remove();

			expect(disposeCallback, "Dispose event should fire when parent is removed").toHaveBeenCalledTimes(1);
			expect(child.disposed, "removing the parent should dispose owned descendants even through raw DOM intermediaries").toBe(true);
			expect(child.element.isConnected, "disposed descendants should no longer be connected").toBe(false);
		});

		it("removing a parent Component disposes descendant Components inside intermediate non-wrapped elements", async () => {
			vi.useFakeTimers();

			const parent = mountedComponent("section");
			const intermediary = document.createElement("div");
			const child = Component("span");
			const mountCallback = vi.fn();
			const disposeCallback = vi.fn();

			child.event.owned.on.Mount(mountCallback);
			child.event.owned.on.Dispose(disposeCallback);

			parent.element.appendChild(intermediary);
			intermediary.appendChild(child.element);

			try {
				expect(child.element.isConnected, "the raw DOM child should be connected before the parent is removed").toBe(true);
				expect(mountCallback, "Mount event should not fire before the orphan check").not.toHaveBeenCalled();
				expect(() => {
					vi.advanceTimersByTime(0);
				}, "the orphan check should not throw while the raw DOM child is connected").not.toThrow();
				await flushEffects();
				expect(mountCallback, "Mount event should fire as a self-healing operation").toHaveBeenCalledTimes(1);

				parent.remove();

				expect(disposeCallback, "Dispose event should fire when parent tree is removed").toHaveBeenCalledTimes(1);
				expect(child.disposed, "descendant Components inside raw DOM intermediaries should be disposed when the parent is removed").toBe(true);
				expect(child.element.isConnected, "disposed descendants should no longer be connected").toBe(false);
			} finally {
				intermediary.remove();
				vi.useRealTimers();
			}
		});

		it.each(["open", "closed"] as const)("removing an outer Component reaches a wrapped descendant inside a nested raw %s ShadowRoot", async (mode) => {
			vi.useFakeTimers();
			const outer = mountedComponent("section");
			const intermediary = document.createElement("div");
			const shadowHost = document.createElement("article");
			const shadowRoot = shadowHost.attachShadow({ mode });
			const child = Component("span");
			outer.element.append(intermediary);
			intermediary.append(shadowHost);
			shadowRoot.append(child.element);

			try {
				expect(() => vi.advanceTimersByTime(0)).not.toThrow();
				await flushEffects();
				expect.soft(child.disposed).toBe(false);
				expect.soft(child.element.parentNode).toBe(shadowRoot);

				outer.remove();
				expect(child.disposed).toBe(true);
			} finally {
				if (!outer.disposed) outer.remove();
				if (!child.disposed) child.remove();
				vi.useRealTimers();
			}
		});

		it("preserves explicitly-owned components when their implicit parent is removed, allowing re-append", () => {
			const parent = mountedComponent("section");
			const newParent = mountedComponent("article");
			const explicitOwner = mountedComponent("aside");
			const child = Component("div");

			child.owner.add(explicitOwner);
			parent.append(child);

			expect(child.element.parentElement, "child should be in parent").toBe(parent.element);
			expect(child.disposed, "child should not be disposed before parent removal").toBe(false);

			parent.remove();

			expect(child.disposed, "child should survive parent removal due to explicit owner").toBe(false);
			expect(child.element.isConnected, "child element should be disconnected after parent removal").toBe(false);

			newParent.append(child);

			expect(child.element.parentElement, "child should be in new parent").toBe(newParent.element);
			expect(child.element.isConnected, "child should be connected after re-append").toBe(true);
			expect(child.disposed, "child should still be alive after re-append").toBe(false);

			explicitOwner.remove();

			expect(child.disposed, "child should be disposed when explicit owner is removed").toBe(true);
		});
	});

	describe("Mount event", () => {
		it("fires when component is appended to DOM via appendTo", () => {
			const component = Component("div");
			const mountCallback = vi.fn();

			component.event.owned.on.Mount(mountCallback);
			component.appendTo(document.body);

			expect(mountCallback, "Mount event should fire when appended to the DOM").toHaveBeenCalledTimes(1);

			component.remove();
		});

		it("fires when component is appended as a child via append", () => {
			const parent = mountedComponent("div");
			const child = Component("div");
			const mountCallback = vi.fn();

			child.event.owned.on.Mount(mountCallback);
			parent.append(child);

			expect(mountCallback, "Mount event should fire when appended as a child").toHaveBeenCalledTimes(1);

			parent.remove();
		});

		it("fires only once even when component is moved", () => {
			const firstParent = mountedComponent("div");
			const secondParent = mountedComponent("section");
			const mountCallback = vi.fn();
			const child = Component("div");

			child.event.owned.on.Mount(mountCallback);
			firstParent.append(child);
			secondParent.append(child);

			expect(mountCallback, "Mount event fires only once, not on each move").toHaveBeenCalledTimes(1);

			secondParent.remove();
			firstParent.remove();
		});

		it("is accessible via event.owned.on.Mount", () => {
			const component = Component("div");
			const mountCallback = vi.fn();

			component.event.owned.on.Mount(mountCallback);
			component.appendTo(document.body);

			expect(mountCallback, "event.owned.on.Mount listener should fire").toHaveBeenCalledTimes(1);

			component.remove();
		});
	});

	describe("Dispose event", () => {
		it("fires when component is removed", () => {
			const component = mountedComponent("div");
			const disposeCallback = vi.fn();

			component.event.owned.on.Dispose(disposeCallback);
			component.remove();

			expect(disposeCallback, "Dispose event should fire on removal").toHaveBeenCalledTimes(1);
		});

		it("fires before the element is detached from DOM", () => {
			const component = mountedComponent("div");
			let wasConnected = false;

			component.event.owned.on.Dispose(() => {
				wasConnected = component.element.isConnected;
			});
			component.remove();

			expect(wasConnected, "element should still be connected when Dispose fires").toBe(true);
		});

		it("is accessible via event.owned.on.Dispose", () => {
			const component = mountedComponent("div");
			const disposeCallback = vi.fn();

			component.event.owned.on.Dispose(disposeCallback);
			component.remove();

			expect(disposeCallback, "event.owned.on.Dispose listener should fire").toHaveBeenCalledTimes(1);
		});
	});

	it("appendToWhen toggles self-placement and parks the component in storage when hidden", async () => {
		const host = mountedComponent("div");
		const child = Component("span").text.set("child");
		const visible = State(host, false);
		const result = child.appendToWhen(visible, host);

		expect(result).toBe(child);

		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();
		expect(host.element.lastElementChild).toBe(child.element);

		visible.set(false);
		await flushEffects();
		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		child.remove();
		visible.set(true);
		await flushEffects();
		expect(child.element.parentElement).toBeNull();
	});

	it("conditional raw-node placement without a wrapped ancestor uses a stable lifecycle owner", async () => {
		const visibilityOwner = mountedComponent("div");
		const leading = document.createElement("hr");
		const trailing = document.createElement("hr");
		const appended = Component("span").text.set("appended");
		const prepended = Component("span").text.set("prepended");
		const inserted = Component("span").text.set("inserted");
		const visible = State(visibilityOwner, false);
		document.body.replaceChildren(leading, trailing);
		const appendResult = appended.appendToWhen(visible, document.body);
		const prependResult = prepended.prependToWhen(visible, document.body);
		const insertResult = inserted.insertToWhen(visible, "before", trailing);

		expect(appendResult).toBe(appended);
		expect(prependResult).toBe(prepended);
		expect(insertResult).toBe(inserted);

		expect(appended.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(prepended.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(inserted.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(document.body)).toEqual([
			prepended.element,
			leading,
			inserted.element,
			trailing,
			appended.element,
		]);

		appended.remove();
		prepended.remove();
		inserted.remove();
		visibilityOwner.remove();
		leading.remove();
		trailing.remove();
	});

	it("prependToWhen toggles self-placement at the front of the destination component", async () => {
		const host = mountedComponent("div");
		const trailing = Component("span").text.set("trailing");
		const child = Component("span").text.set("child");
		const visible = State(host, true);

		host.append(trailing);
		child.prependToWhen(visible, host);

		expect(nonCommentNodes(host.element)).toEqual([child.element, trailing.element]);

		visible.set(false);
		await flushEffects();
		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
	});

	it("appendToWhen and prependToWhen inherit the nearest wrapped ancestor from raw DOM parents", async () => {
		const owner = mountedComponent("div");
		const slot = document.createElement("div");
		const trailing = document.createElement("hr");
		const appended = Component("span").text.set("appended");
		const prepended = Component("span").text.set("prepended");
		const visible = State(owner, false);

		owner.element.append(slot);
		slot.append(trailing);
		const appendedResult = appended.appendToWhen(visible, slot);
		const prependedResult = prepended.prependToWhen(visible, slot);

		expect(appendedResult).toBe(appended);
		expect(prependedResult).toBe(prepended);

		expect(appended.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(prepended.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(slot)).toEqual([
			prepended.element,
			trailing,
			appended.element,
		]);

		owner.remove();
		expect(nonCommentNodes(slot)).toEqual([trailing]);
		expect(Array.from(slot.childNodes).filter((node) => node instanceof Comment)).toHaveLength(0);
		expect(appended.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(prepended.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		appended.remove();
		prepended.remove();
	});

	it("insertTo and insertToWhen place components relative to existing nodes", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const child = Component("span").text.set("child");
		const trailing = Component("span").text.set("trailing");
		const visible = State(host, false);

		host.append(anchor, trailing);
		child.insertTo("after", anchor);

		expect(Array.from(host.element.childNodes)).toEqual([anchor.element, child.element, trailing.element]);

		const conditional = Component("span").text.set("conditional");
		conditional.insertToWhen(visible, "before", trailing);

		expect(conditional.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();
		expect(nonCommentNodes(host.element)).toEqual([
			anchor.element,
			child.element,
			conditional.element,
			trailing.element,
		]);
	});

	it("insertTo and insertToWhen inherit the nearest wrapped ancestor from raw reference nodes", async () => {
		const owner = mountedComponent("div");
		const slot = document.createElement("div");
		const anchor = document.createElement("hr");
		const trailing = document.createElement("hr");
		const child = Component("span").text.set("child");
		const conditional = Component("span").text.set("conditional");
		const visible = State(owner, false);

		owner.element.append(slot);
		slot.append(anchor, trailing);
		child.insertTo("after", anchor);
		const result = conditional.insertToWhen(visible, "before", trailing);

		expect(result).toBe(conditional);

		expect(nonCommentNodes(slot)).toEqual([
			anchor,
			child.element,
			trailing,
		]);
		expect(conditional.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(slot)).toEqual([
			anchor,
			child.element,
			conditional.element,
			trailing,
		]);

		owner.remove();
		expect(child.disposed).toBe(true);
		expect(nonCommentNodes(slot)).toEqual([
			anchor,
			trailing,
		]);
		expect(Array.from(slot.childNodes).filter((node) => node instanceof Comment)).toHaveLength(0);
		expect(conditional.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		conditional.remove();
	});

	it("place switches between markers and storage", async () => {
		const owner = mountedComponent("section");
		const left = mountedComponent("div");
		const right = mountedComponent("div");
		const child = Component("span").text.set("child");
		const current = State<Place | null>(owner, null);
		let leftPlace: any;
		let rightPlace: any;

		child.place(owner, (Place) => {
			leftPlace = Place().appendTo(left);
			rightPlace = Place().prependTo(right);

			current.set(leftPlace);
			return current;
		});

		expect(left.element.firstElementChild).toBe(child.element);

		current.set(rightPlace);
		await flushEffects();
		expect(right.element.firstElementChild).toBe(child.element);

		current.set(null);
		await flushEffects();
		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		current.set(leftPlace);
		await flushEffects();
		expect(left.element.firstElementChild).toBe(child.element);
	});

	it("place can move between explicit marker targets and cleans them up with the owner", async () => {
		const owner = mountedComponent("section");
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const child = Component("span").text.set("child");
		const current = State<Place | null>(owner, null);
		let beforeAnchor: any;
		let afterAnchor: any;

		host.append(anchor);

		child.place(owner, (Place) => {
			beforeAnchor = Place().insertTo("before", anchor);
			afterAnchor = Place().insertTo("after", anchor);
			current.set(beforeAnchor);
			return current;
		});

		expect(beforeAnchor.marker.node.data).toBe("kitsui:place");
		expect(afterAnchor.marker.node.data).toBe("kitsui:place");

		expect(nonCommentNodes(host.element)).toEqual([child.element, anchor.element]);
		expect(Array.from(host.element.childNodes).filter((node) => node instanceof Comment)).toHaveLength(2);

		current.set(afterAnchor);
		await flushEffects();
		expect(nonCommentNodes(host.element)).toEqual([anchor.element, child.element]);

		owner.remove();
		expect(Array.from(host.element.childNodes)).toEqual([anchor.element]);
		expect(Array.from(host.element.childNodes).filter((node) => node instanceof Comment)).toHaveLength(0);
		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		child.remove();
	});

	it.each([0, 2])("rolls back a throwing placer after creating %i provisional Place markers", (placeCount) => {
		const placementOwner = mountedComponent("section");
		const host = mountedComponent("div");
		const child = Component("span");
		const places: Place[] = [];

		try {
			expect.soft(() => child.place(placementOwner, (PlaceConstructor) => {
				for (let index = 0; index < placeCount; index += 1) {
					places.push(PlaceConstructor().appendTo(host));
				}
				throw new Error("placer failed");
			})).toThrow("placer failed");

			expect(places.every(place => place.marker.disposed)).toBe(true);
			expect(Array.from(host.element.childNodes).filter(node => node instanceof Comment)).toHaveLength(0);
			expect(child.element.parentNode).toBeNull();
			expect(child.owner.get()).toBeNull();

			const orphanCheck = captureOrphanCheck();
			try {
				child.owner.add(placementOwner, "orphan-probe");
				child.owner.remove("orphan-probe");
				expect(orphanCheck.orphanCheck).toBeTypeOf("function");
				expect(() => orphanCheck.orphanCheck?.()).not.toThrow();
				expect(() => orphanCheck.queuedError?.()).toThrow("Components must be connected to the document or have a managed owner before the next tick.");
				child.appendTo(host);
				placementOwner.remove();
				expect(child.element.parentNode).toBe(host.element);
				expect(child.disposed).toBe(false);
			} finally {
				orphanCheck.restore();
			}
		} finally {
			for (const place of places) {
				if (!place.marker.disposed) place.remove();
			}
			if (!child.disposed) child.remove();
			placementOwner.remove();
			host.remove();
		}
	});

	it.each([0, 2])("rolls back an invalid placer result after creating %i provisional Place markers", (placeCount) => {
		const placementOwner = mountedComponent("section");
		const host = mountedComponent("div");
		const child = Component("span");
		const places: Place[] = [];

		try {
			expect(() => child.place(placementOwner, (PlaceConstructor) => {
				for (let index = 0; index < placeCount; index += 1) {
					places.push(PlaceConstructor().appendTo(host));
				}
				return {} as State.Readonly<Place | null>;
			})).toThrow("Component.place placer must return a State<Place | null>.");

			expect.soft(places.every(place => place.marker.disposed)).toBe(true);
			expect.soft(Array.from(host.element.childNodes).filter(node => node instanceof Comment)).toHaveLength(0);
			expect.soft(child.element.parentNode).toBeNull();
			expect.soft(child.owner.get()).toBeNull();
			expect.soft(() => child.appendTo(host)).not.toThrow();
			placementOwner.remove();
			expect.soft(child.element.parentNode).toBe(host.element);
			expect(child.disposed).toBe(false);
		} finally {
			for (const place of places) {
				if (!place.marker.disposed) place.remove();
			}
			if (!child.disposed) child.remove();
			if (!placementOwner.disposed) placementOwner.remove();
			host.remove();
		}
	});

	it("treats a removed place marker as null placement and logs an error", async () => {
		const owner = mountedComponent("section");
		const host = mountedComponent("div");
		const child = Component("span").text.set("child");
		const current = State<Place | null>(owner, null);
		let targetPlace: any;

		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

		child.place(owner, (Place) => {
			targetPlace = Place().appendTo(host);
			return current;
		});

		host.clear();
		current.set(targetPlace);
		await flushEffects();

		expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		consoleErrorSpy.mockRestore();
		child.remove();
	});

	it("preserves externally placement-owned children when their implicit parent is removed", () => {
		const placementOwner = mountedComponent("section");
		const parent = mountedComponent("div");
		const child = Component("span").text.set("child");
		const current = State<Place | null>(placementOwner, null);

		child.place(placementOwner, (Place) => {
			const place = Place().appendTo(parent);
			current.set(place);
			return current;
		});

		expect(parent.element.contains(child.element), "the placed child should start under the implicit parent").toBe(true);

		parent.remove();

		expect(child.disposed, "the live placement owner should protect the child from implicit parent disposal").toBe(false);
		expect(() => {
			child.style.set({ color: "rebeccapurple" });
		}, "placement-owned children should remain mutable after implicit parent disposal").not.toThrow();

		placementOwner.remove();
		child.remove();
	});

	it("preserves externally placement-owned children when their host is cleared", () => {
		const placementOwner = mountedComponent("section");
		const host = mountedComponent("div");
		const child = Component("span").text.set("child");
		const current = State<Place | null>(placementOwner, null);

		child.place(placementOwner, (Place) => {
			const place = Place().appendTo(host);
			current.set(place);
			return current;
		});

		host.clear();

		expect(child.disposed, "clearing the host should not dispose externally placement-owned children").toBe(false);
		expect(() => {
			child.style.set({ color: "rebeccapurple" });
		}, "placement-owned children should remain mutable after host clearing").not.toThrow();

		placementOwner.remove();
		child.remove();
	});

	it("preserves externally placement-owned children when text replaces their host contents", () => {
		const placementOwner = mountedComponent("section");
		const host = mountedComponent("div");
		const child = Component("span").text.set("child");
		const current = State<Place | null>(placementOwner, null);

		child.place(placementOwner, (Place) => {
			const place = Place().appendTo(host);
			current.set(place);
			return current;
		});

		host.text.set("done");

		expect(host.element.textContent).toBe("done");
		expect(child.disposed, "setting host text should not dispose externally placement-owned children").toBe(false);
		expect(() => {
			child.style.set({ color: "rebeccapurple" });
		}, "placement-owned children should remain mutable after text replacement").not.toThrow();

		placementOwner.remove();
		child.remove();
	});

	it("disposes placed components after placement owner removal when they stay unmanaged", () => {
		const placementOwner = mountedComponent("section");
		const host = mountedComponent("div");
		const child = Component("span").text.set("child");
		const current = State<Place | null>(placementOwner, null);

		child.place(placementOwner, (Place) => {
			const place = Place().appendTo(host);
			current.set(place);
			return current;
		});

		const orphanCheckSpy = captureOrphanCheck();

		try {
			placementOwner.remove();

			expect(child.disposed, "placement owner cleanup should not synchronously dispose the child").toBe(false);
			expect(orphanCheckSpy.orphanCheck, "removing the placement owner should schedule deferred unmanaged cleanup").toBeTypeOf("function");
			expect(() => orphanCheckSpy.orphanCheck?.(), "the deferred cleanup should not throw").not.toThrow();
			expect(child.disposed, "still-unmanaged placed children should be disposed by deferred cleanup").toBe(true);
			expect(orphanCheckSpy.queuedError, "deferred placement cleanup should not queue an orphan error").toBeNull();
		} finally {
			orphanCheckSpy.restore();
			child.remove();
		}
	});

	it("allows placed components to be re-appended before placement-owner orphan validation runs", () => {
		const placementOwner = mountedComponent("section");
		const host = mountedComponent("div");
		const newHost = mountedComponent("article");
		const child = Component("span").text.set("child");
		const current = State<Place | null>(placementOwner, null);

		child.place(placementOwner, (Place) => {
			const place = Place().appendTo(host);
			current.set(place);
			return current;
		});

		const orphanCheckSpy = captureOrphanCheck();

		try {
			placementOwner.remove();
			newHost.append(child);

			expect(child.disposed, "same-tick reappend should keep the child alive").toBe(false);
			expect(orphanCheckSpy.orphanCheck, "placement cleanup should still schedule deferred cleanup before the reappend clears it").toBeTypeOf("function");
			expect(() => orphanCheckSpy.orphanCheck?.(), "reappend before deferred cleanup should keep the child alive").not.toThrow();
			expect(child.disposed, "managed reappended children should not be disposed by deferred cleanup").toBe(false);
			expect(orphanCheckSpy.queuedError, "managed reappended children should not queue an orphan error").toBeNull();
		} finally {
			orphanCheckSpy.restore();
			child.remove();
			newHost.remove();
		}
	});

	it("removes the owning component when a conditional marker is removed", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const sibling = Component("span").text.set("sibling");
		const visible = State(host, false);

		host.append(anchor);
		anchor.insertWhen(visible, "before", sibling);

		findCommentNode(host.element, "kitsui:conditional")?.remove();
		visible.set(true);
		await flushEffects();

		expect(anchor.disposed).toBe(true);
		expect(sibling.disposed).toBe(true);
		expect(host.element.childNodes).toHaveLength(0);
	});

	it("removes the owner when an appendWhen marker is removed", async () => {
		const host = mountedComponent("div");
		const child = Component("span").text.set("child");
		const visible = State(host, false);

		host.appendWhen(visible, child);

		findCommentNode(host.element, "kitsui:conditional")?.remove();
		visible.set(true);
		await flushEffects();

		expect(host.disposed).toBe(true);
		expect(child.disposed).toBe(true);
		expect(host.element.childNodes).toHaveLength(0);
	});

	it("removes the owner when a prependWhen marker is removed", async () => {
		const host = mountedComponent("div");
		const trailing = Component("span").text.set("trailing");
		const child = Component("span").text.set("child");
		const visible = State(host, false);

		host.append(trailing);
		host.prependWhen(visible, child);

		findCommentNode(host.element, "kitsui:conditional")?.remove();
		visible.set(true);
		await flushEffects();

		expect(host.disposed).toBe(true);
		expect(child.disposed).toBe(true);
		expect(trailing.disposed).toBe(true);
		expect(host.element.childNodes).toHaveLength(0);
	});

	it("does not reparent raw conditional nodes after marker-loss disposal", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const raw = document.createElement("em");
		raw.textContent = "raw";
		const visible = State(host, false);

		host.append(anchor);
		anchor.insertWhen(visible, "before", raw);

		findCommentNode(host.element, "kitsui:conditional")?.remove();
		visible.set(true);
		await flushEffects();

		expect(anchor.disposed).toBe(true);
		expect(raw.parentNode).toBeNull();
		expect(host.element.childNodes).toHaveLength(0);
	});

	it("preserves explicitly-owned appendWhen children when the host is removed", async () => {
		const host = mountedComponent("div");
		const retentionOwner = mountedComponent("section");
		const visible = State(host, true);
		const child = Component("span").text.set("child").owner.add(retentionOwner);

		host.appendWhen(visible, child);
		expect(host.element.contains(child.element)).toBe(true);

		host.remove();

		expect(child.disposed).toBe(false);
		expect(child.element.isConnected).toBe(false);

		retentionOwner.remove();
		expect(child.disposed).toBe(true);
	});

	it("preserves explicitly-owned prependWhen children when the host is removed", async () => {
		const host = mountedComponent("div");
		const retentionOwner = mountedComponent("section");
		const visible = State(host, true);
		const child = Component("span").text.set("child").owner.add(retentionOwner);

		host.prependWhen(visible, child);
		expect(host.element.contains(child.element)).toBe(true);

		host.remove();

		expect(child.disposed).toBe(false);
		expect(child.element.isConnected).toBe(false);

		retentionOwner.remove();
		expect(child.disposed).toBe(true);
	});

	it("preserves explicitly-owned insertWhen children when the host is removed", async () => {
		const host = mountedComponent("div");
		const retentionOwner = mountedComponent("section");
		const visible = State(host, true);
		const anchor = Component("span").text.set("anchor");
		const child = Component("span").text.set("child").owner.add(retentionOwner);

		host.append(anchor);
		anchor.insertWhen(visible, "after", child);
		expect(host.element.contains(child.element)).toBe(true);

		host.remove();

		expect(child.disposed).toBe(false);
		expect(child.element.isConnected).toBe(false);

		retentionOwner.remove();
		expect(child.disposed).toBe(true);
	});

	it("replaces earlier placement controllers when a new placement is applied", () => {
		const left = mountedComponent("div");
		const right = mountedComponent("div");
		const child = Component("span").text.set("child");
		const visible = State(left, false);

		child.appendToWhen(visible, left);
		child.appendTo(right);

		visible.set(true);
		expect(right.element.firstElementChild).toBe(child.element);
		expect(left.element.childNodes).toHaveLength(0);
	});

	it("keeps replacement placement ownership when the old owner and physical host are removed", () => {
		const firstOwner = mountedComponent("section");
		const secondOwner = mountedComponent("aside");
		const host = mountedComponent("div");
		const child = Component("span");
		let secondPlace!: Place;

		child.place(firstOwner, (PlaceConstructor) => State.Readonly<Place | null>(PlaceConstructor().appendTo(host)));
		child.place(secondOwner, (PlaceConstructor) => {
			secondPlace = PlaceConstructor().appendTo(host);
			return State.Readonly<Place | null>(secondPlace);
		});

		firstOwner.remove();
		expect(secondPlace.marker.disposed).toBe(false);
		host.remove();

		expect(child.disposed).toBe(false);
		expect(secondPlace.marker.disposed).toBe(false);
		expect(child.element.parentNode).toBe(host.element);

		secondOwner.remove();
		expect(secondPlace.marker.disposed).toBe(true);
		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		child.remove();
	});

	it("creates and memoizes a ClassManipulator from the style getter", () => {
		const component = mountedComponent("div");
		const style = Style.Class("component-style-memo", { color: "red" });

		expect(component.class).toBe(component.class);

		component.class.add(style);
		expect(component.element.classList.contains(style.className)).toBe(true);
	});

	it("creates and memoizes an AttributeManipulator from the attribute getters", () => {
		const component = mountedComponent("button");

		expect(component.attribute).toBeInstanceOf(AttributeManipulator);
		expect(component.attribute).toBe(component.attribute);
	});
});
