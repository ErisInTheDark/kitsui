import { describe, expect, it, vi } from "vitest";
import { AttributeManipulator } from "../../src/component/AttributeManipulator";
import { Component } from "../../src/component/Component";
import placeExtension from "../../src/component/extensions/placeExtension";
import { Style } from "../../src/component/Style";
import { State } from "../../src/state/State";

declare module "../../src/component/Component" {
	interface ComponentExtensions {
		testComponentExtension (): string;
	}
}

placeExtension();

function mountedComponent (tagName: string = "div", options?: { className?: string; textContent?: string }): Component {
	return Component(tagName, options).mount(document.body);
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

function nonCommentNodes (element: HTMLElement): Node[] {
	return Array.from(element.childNodes).filter((node) => !(node instanceof Comment));
}

function findCommentNode (element: HTMLElement, data: string): Comment | undefined {
	return Array.from(element.childNodes).find((node) => node instanceof Comment && node.data === data) as Comment | undefined;
}

describe("Component", () => {
	it("can be constructed with or without new and still supports instanceof", () => {
		const withNew = new Component("div").mount(document.body);
		const withoutNew = Component("span").mount(document.body);

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

	it("exposes wrapped components through node.component and rejects duplicate wraps", () => {
		const element = document.createElement("div");
		document.body.append(element);
		const component = Component(element);

		expect(element.component).toBe(component);
		expect(() => Component.wrap(element)).toThrow("already has a component");
		component.remove();
		expect(element.component).toBeUndefined();
	});

	it("wraps DOM elements and appends children", () => {
		const root = mountedComponent("div", { className: "shell" });
		const child = Component("span", { textContent: "world" });

		root.append("hello ", child);

		expect(root.element.className).toBe("shell");
		expect(root.element.textContent).toBe("hello world");
		expect(root.element.children).toHaveLength(1);
		expect(root.element.firstElementChild?.tagName).toBe("SPAN");
		expect(child.element.parentElement).toBe(root.element);
	});

	it("prepends children in-order", () => {
		const root = mountedComponent("div");
		const first = Component("span", { textContent: "first" });
		const second = Component("span", { textContent: "second" });

		root.append(Component("span", { textContent: "tail" }));
		root.prepend(first, second);

		expect(root.element.textContent).toBe("firstsecondtail");
	});

	it("renders append state children anchored by a comment and replaces old selections", async () => {
		const host = mountedComponent("div");
		const trailing = Component("span", { textContent: "trailing" });
		const dynamic = State<Component | Array<Component | null> | null>(host, null);
		const alpha = Component("span", { textContent: "alpha" });
		const beta = Component("span", { textContent: "beta" });
		const gamma = Component("span", { textContent: "gamma" });

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
		const trailing = Component("span", { textContent: "trailing" });
		const dynamic = State<Component | Array<Component | null> | null>(host, null);
		const alpha = Component("span", { textContent: "alpha" });
		const beta = Component("span", { textContent: "beta" });

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
		const anchor = Component("span", { textContent: "anchor" });
		const dynamic = State<Component | Array<Component | null> | null>(host, null);
		const before = Component("span", { textContent: "before" });
		const after = Component("span", { textContent: "after" });

		host.append(anchor);
		anchor.insert("before", dynamic);

		dynamic.set([before, null, after]);
		await flushEffects();
		expect(nonCommentNodes(host.element)).toEqual([before.element, after.element, anchor.element]);

		dynamic.set(null);
		await flushEffects();
		expect(nonCommentNodes(host.element)).toEqual([anchor.element]);
	});

	it("reacts to state changes through bindState", async () => {
		const component = mountedComponent("div");
		const counter = State(component, 0);
		const unsubscribe = component.bindState(counter, (value, target) => {
			target.setText(`count:${value}`);
		});

		expect(component.element.textContent).toBe("count:0");

		counter.set(2);
		await flushEffects();
		expect(component.element.textContent).toBe("count:2");

		unsubscribe();
		counter.set(3);
		await flushEffects();
		expect(component.element.textContent).toBe("count:2");
	});

	it("releases state bindings when the component is removed", () => {
		const component = mountedComponent("div");
		const counter = State(component, 0);
		const calls: number[] = [];

		component.bindState(counter, (value) => {
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

	it("setOwner can release a component from its owner", () => {
		const owner = mountedComponent("section");
		const child = Component("div");

		owner.append(child);
		child.setOwner(null);
		owner.remove();

		expect(child.disposed).toBe(false);
		expect(child.element.parentElement).toBe(owner.element);
		child.remove();
	});

	it("clear disposes managed component children", () => {
		const host = mountedComponent("div");
		const child = Component("span");

		host.append(child);
		host.clear();

		expect(child.disposed).toBe(true);
		expect(host.element.childNodes).toHaveLength(0);
	});

	it("setText disposes managed component children", () => {
		const host = mountedComponent("div");
		const child = Component("span");

		host.append(child);
		host.setText("done");

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
		const leading = Component("span", { textContent: "leading" });
		const toggled = Component("span", { textContent: "toggled" });
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

	it("keeps conditional component children alive while parked and disposes them on cleanup", async () => {
		const host = mountedComponent("div");
		const toggled = Component("span", { textContent: "toggled" });
		const visible = State(host, false);
		const cleanup = host.appendWhen(visible, toggled);

		expect(toggled.disposed).toBe(false);

		visible.set(true);
		await flushEffects();
		expect(host.element.firstElementChild).toBe(toggled.element);

		visible.set(false);
		await flushEffects();
		expect(toggled.disposed).toBe(false);

		cleanup();
		expect(toggled.disposed).toBe(true);
	});

	it("prepends conditional children at the front of the component", async () => {
		const host = mountedComponent("div");
		const trailing = Component("span", { textContent: "trailing" });
		const toggled = Component("span", { textContent: "prepended" });
		const visible = State(host, true);

		host.append(trailing);
		host.prependWhen(visible, toggled);

		expect(host.element.firstElementChild).toBe(toggled.element);

		visible.set(false);
		await flushEffects();

		expect(host.element.firstChild).toBeInstanceOf(Comment);
		expect(host.element.lastElementChild).toBe(trailing.element);
	});

	it("inserts sibling nodes before and after itself and inherits the current owner", () => {
		const owner = mountedComponent("div");
		const target = Component("span", { textContent: "target" });
		const before = Component("span", { textContent: "before" });
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
		const anchor = Component("span", { textContent: "anchor" });
		const leading = Component("span", { textContent: "leading" });
		const middle = document.createElement("hr");
		const trailing = Component("span", { textContent: "trailing" });

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

	it("toggles sibling insertion with insertWhen", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span", { textContent: "anchor" });
		const before = Component("span", { textContent: "before" });
		const after = Component("span", { textContent: "after" });
		const visible = State(host, false);

		host.append(anchor);
		anchor.insertWhen(visible, "before", before);
		anchor.insertWhen(visible, "after", after);

		expect(Array.from(host.element.childNodes).filter((node) => node instanceof Comment)).toHaveLength(2);
		expect(before.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(after.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();

		expect(Array.from(host.element.childNodes)).toEqual([before.element, anchor.element, after.element]);

		visible.set(false);
		await flushEffects();

		expect(Array.from(host.element.childNodes).filter((node) => node instanceof Comment)).toHaveLength(2);
		expect(before.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(after.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
	});

	it("accepts arrays of insertables in insertWhen", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span", { textContent: "anchor" });
		const first = Component("span", { textContent: "first" });
		const second = Component("span", { textContent: "second" });
		const visible = State(host, false);

		host.append(anchor);
		anchor.insertWhen(visible, "after", [first, second]);

		expect(first.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		expect(second.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();

		expect(Array.from(host.element.childNodes)).toEqual([
			anchor.element,
			first.element,
			second.element,
		]);
	});

	it("appendTo and prependTo move components into their destination component", () => {
		const host = mountedComponent("div");
		const child = Component("span", { textContent: "child" });
		const trailing = Component("span", { textContent: "trailing" });

		host.append(trailing);
		child.prependTo(host);

		expect(Array.from(host.element.childNodes)).toEqual([child.element, trailing.element]);

		const secondHost = mountedComponent("section");
		child.appendTo(secondHost);

		expect(Array.from(secondHost.element.childNodes)).toEqual([child.element]);

		secondHost.remove();
		expect(child.disposed).toBe(true);
	});

	it("appendToWhen toggles self-placement and parks the component in storage when hidden", async () => {
		const host = mountedComponent("div");
		const child = Component("span", { textContent: "child" });
		const visible = State(host, false);
		const cleanup = child.appendToWhen(visible, host);

		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		visible.set(true);
		await flushEffects();
		expect(host.element.lastElementChild).toBe(child.element);

		visible.set(false);
		await flushEffects();
		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");

		cleanup();
		visible.set(true);
		await flushEffects();
		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
		child.remove();
	});

	it("prependToWhen toggles self-placement at the front of the destination component", async () => {
		const host = mountedComponent("div");
		const trailing = Component("span", { textContent: "trailing" });
		const child = Component("span", { textContent: "child" });
		const visible = State(host, true);

		host.append(trailing);
		child.prependToWhen(visible, host);

		expect(nonCommentNodes(host.element)).toEqual([child.element, trailing.element]);

		visible.set(false);
		await flushEffects();
		expect(child.element.parentElement?.tagName).toBe("KITSUI-STORAGE");
	});

	it("insertTo and insertToWhen place components relative to existing nodes", async () => {
		const host = mountedComponent("div");
		const anchor = Component("span", { textContent: "anchor" });
		const child = Component("span", { textContent: "child" });
		const trailing = Component("span", { textContent: "trailing" });
		const visible = State(host, false);

		host.append(anchor, trailing);
		child.insertTo("after", anchor);

		expect(Array.from(host.element.childNodes)).toEqual([anchor.element, child.element, trailing.element]);

		const conditional = Component("span", { textContent: "conditional" });
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

	it("place switches between markers and storage", async () => {
		const owner = mountedComponent("section");
		const left = mountedComponent("div");
		const right = mountedComponent("div");
		const child = Component("span", { textContent: "child" });
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
		const anchor = Component("span", { textContent: "anchor" });
		const child = Component("span", { textContent: "child" });
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
		const child = Component("span", { textContent: "child" });
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
		const anchor = Component("span", { textContent: "anchor" });
		const sibling = Component("span", { textContent: "sibling" });
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

	it("replaces earlier placement controllers when a new placement is applied", () => {
		const left = mountedComponent("div");
		const right = mountedComponent("div");
		const child = Component("span", { textContent: "child" });
		const visible = State(left, false);

		child.appendToWhen(visible, left);
		child.appendTo(right);

		visible.set(true);
		expect(right.element.firstElementChild).toBe(child.element);
		expect(left.element.childNodes).toHaveLength(0);
	});

	it("uses moveBefore when the parent node provides it", () => {
		const host = mountedComponent("div");
		const child = Component("span", { textContent: "child" });
		const calls: Array<[Node, Node | null]> = [];
		const moveHost = host.element as HTMLElement & {
			moveBefore?: (node: Node, child: Node | null) => void;
		};

		moveHost.moveBefore = (node, beforeNode) => {
			calls.push([node, beforeNode]);
			host.element.insertBefore(node, beforeNode);
		};

		child.appendTo(host);

		expect(calls).toEqual([[child.element, null]]);
		expect(host.element.firstElementChild).toBe(child.element);
	});

	it("creates and memoizes a ClassManipulator from the style getter", () => {
		const component = mountedComponent("div");
		const style = Style("component-style-memo", { color: "red" });

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