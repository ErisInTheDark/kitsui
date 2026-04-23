import { describe, expect, it, vi } from "vitest";
import { AttributeManipulator } from "../../src/component/AttributeManipulator";
import { Component } from "../../src/component/Component";
import placeExtension from "../../src/component/extensions/placeExtension";
import { Style } from "../../src/component/Style";
import { State } from "../../src/state/State";

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

function nonCommentNodes (element: HTMLElement): Node[] {
	return Array.from(element.childNodes).filter((node) => !(node instanceof Comment));
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

	it("setOwner can set and release explicit ownership", () => {
		const explicitOwner = mountedComponent("section");
		const child = Component("div");

		child.setOwner(explicitOwner);
		expect(child.getOwner(), "explicit owner should be set").toBe(explicitOwner);

		child.setOwner(null);
		expect(child.getOwner(), "explicit owner should be cleared").toBeNull();

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

			expect(child.getOwner(), "hidden conditional children should remain ownerless while parked").toBeNull();
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
		const child = Component("span").text.set("child").setOwner(retentionOwner);

		host.appendWhen(visible, child);

		expect(child.getOwner(), "conditionally parking a child should not override an existing explicit owner").toBe(retentionOwner);

		host.remove();
		retentionOwner.remove();
	});

	it("preserves explicit owners for hidden conditional children across visibility toggles", async () => {
		const host = mountedComponent("div");
		const retentionOwner = mountedComponent("section");
		const visible = State(host, false);
		const anchor = Component("span").text.set("anchor");
		const trailing = Component("span").text.set("trailing");
		const appended = Component("span").text.set("appended").setOwner(retentionOwner);
		const prepended = Component("span").text.set("prepended").setOwner(retentionOwner);
		const inserted = Component("span").text.set("inserted").setOwner(retentionOwner);

		host.append(anchor, trailing);
		host.appendWhen(visible, appended);
		host.prependWhen(visible, prepended);
		anchor.insertWhen(visible, "after", inserted);

		expect(appended.getOwner()).toBe(retentionOwner);
		expect(prepended.getOwner()).toBe(retentionOwner);
		expect(inserted.getOwner()).toBe(retentionOwner);

		visible.set(true);
		await flushEffects();

		expect(nonCommentNodes(host.element)).toEqual([
			prepended.element,
			anchor.element,
			inserted.element,
			trailing.element,
			appended.element,
		]);
		expect(appended.getOwner()).toBe(retentionOwner);
		expect(prepended.getOwner()).toBe(retentionOwner);
		expect(inserted.getOwner()).toBe(retentionOwner);

		visible.set(false);
		await flushEffects();

		expect(appended.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(prepended.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(inserted.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(appended.getOwner()).toBe(retentionOwner);
		expect(prepended.getOwner()).toBe(retentionOwner);
		expect(inserted.getOwner()).toBe(retentionOwner);

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

	it("preserves multi-component selection order across hidden conditional transitions", async () => {
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

			expect(selected.getOwner(), "hidden conditional selections should remain ownerless while parked").toBeNull();
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

	it("preserves multi-component selection order across hidden conditional transitions", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span").text.set("anchor");
		const visible = State(host, true);
		const owned = (label: string) => Component("span").text.set(label).setOwner(host);
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
		const selectedA = Component("span").text.set("selected-a").setOwner(retentionOwner);
		const selectedB = Component("span").text.set("selected-b").setOwner(retentionOwner);
		const selection = State(host, selectedA as Component | Iterable<Component>);

		host.appendWhen(visible, selection);
		expect(host.element.contains(selectedA.element)).toBe(true);

		visible.set(false);
		await flushEffects();

		selection.set(selectedB);
		await flushEffects();

		expect(selectedA.disposed).toBe(false);
		expect(selectedB.disposed).toBe(false);
		expect(selectedA.getOwner()).toBe(retentionOwner);
		expect(selectedB.getOwner()).toBe(retentionOwner);

		visible.set(true);
		await flushEffects();

		expect(host.element.contains(selectedA.element)).toBe(false);
		expect(host.element.contains(selectedB.element)).toBe(true);
	});

	it("disposes retained hidden conditional selections when the host is removed", async () => {
		const host = mountedComponent("div");
		const visible = State(host, true);
		const selectedA = Component("span").text.set("selected-a").setOwner(host);
		const selectedB = Component("span").text.set("selected-b").setOwner(host);
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

	it("preserves nested conditional children inside hidden selected components", async () => {
		const host = mountedComponent("div");
		const visible = State(host, true);
		const nestedVisible = State(host, true);
		const outerA = Component("section").setOwner(host);
		const outerB = Component("section").setOwner(host);
		const outerAText = Component("span").text.set("outer-a").setOwner(outerA);
		const nestedA = Component("span").text.set("nested-a").setOwner(outerA);
		const outerBText = Component("span").text.set("outer-b").setOwner(outerB);
		const nestedB = Component("span").text.set("nested-b").setOwner(outerB);
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
		const component = Component("span").text.set("test").setOwner(host);
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
		const managedContainer = Component("section").setOwner(root);
		const appended = Component("span").text.set("appended");
		const prepended = Component("span").text.set("prepended");
		const anchor = Component("span").text.set("anchor").setOwner(managedContainer);
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
			expect(appended.getOwner(), "appendTo should not rewrite explicit ownership for ownerless children").toBeNull();
			expect(prepended.getOwner(), "prependTo should not rewrite explicit ownership for ownerless children").toBeNull();
			expect(inserted.getOwner(), "insertTo should not rewrite explicit ownership for ownerless children").toBeNull();
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
		const parent = Component("section").setOwner(root);
		const child = Component("span").text.set("child");

		try {
			parent.append(child);

			expect(child.getOwner(), "append should not assign explicit ownership to an ownerless child").toBeNull();
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
		expect(prepended.getOwner()).toBe(null);
		expect(appended.getOwner()).toBe(null);

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

				expect(orphanCheckSpy.timeoutHandler, "unmanaged components should still arm a timeout-backed orphan tick").toBeTypeOf("function");
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

			component.setOwner(null);
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

		it("preserves explicitly-owned components when their implicit parent is removed, allowing re-append", () => {
			const parent = mountedComponent("section");
			const newParent = mountedComponent("article");
			const explicitOwner = mountedComponent("aside");
			const child = Component("div");

			child.setOwner(explicitOwner);
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
		const current = State<any>(owner, null);
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
		const current = State<any>(owner, null);
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

	it("treats a removed place marker as null placement and logs an error", async () => {
		const owner = mountedComponent("section");
		const host = mountedComponent("div");
		const child = Component("span").text.set("child");
		const current = State<any>(owner, null);
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
		const child = Component("span").text.set("child").setOwner(retentionOwner);

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
		const child = Component("span").text.set("child").setOwner(retentionOwner);

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
		const child = Component("span").text.set("child").setOwner(retentionOwner);

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