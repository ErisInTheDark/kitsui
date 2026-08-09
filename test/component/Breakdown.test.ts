import { describe, expect, it, vi } from "vitest";
import { Component } from "../../src/component/Component";
import { DOMTree } from "../../src/component/DOMTree";
import breakdownExtension from "../../src/component/extensions/breakdownExtension";
import placeExtension from "../../src/component/extensions/placeExtension";
import { State } from "../../src/state/State";

placeExtension();
breakdownExtension();

/** Mounts a component into the document body for lifecycle-sensitive tests. */
function mountedComponent<NAME extends keyof HTMLElementTagNameMap = "div"> (tagName: NAME = "div" as NAME): Component<HTMLElementTagNameMap[NAME]> {
	return Component(tagName).appendTo(document.body);
}

/** Waits for queued state listeners to flush. */
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

/** Builds a keyed part component that mirrors its state into text content. */
function textPart (state: State<string>): Component<HTMLSpanElement> {
	return Component("span").text.set(state);
}

function trackStructuralMoves (parent: Element): {
	readonly count: number;
	readonly nodes: readonly Node[];
	reset: () => void;
	restore: () => void;
} {
	const nodes: Node[] = [];
	let insideMoveBefore = false;
	const originalInsertBefore = parent.insertBefore.bind(parent);
	const insertBeforeSpy = vi.spyOn(parent, "insertBefore").mockImplementation((node, child) => {
		if (!insideMoveBefore) {
			nodes.push(node);
		}
		return originalInsertBefore(node, child);
	});
	const moveParent = parent as Element & {
		moveBefore?: (node: Node, child: Node | null) => unknown;
	};
	const originalMoveBefore = moveParent.moveBefore?.bind(parent);
	const moveBeforeSpy = originalMoveBefore
		? vi.spyOn(moveParent, "moveBefore").mockImplementation((node, child) => {
			nodes.push(node);
			insideMoveBefore = true;
			try {
				return originalMoveBefore(node, child);
			} finally {
				insideMoveBefore = false;
			}
		})
		: null;

	return {
		get count (): number {
			return nodes.length;
		},
		get nodes (): readonly Node[] {
			return nodes;
		},
		reset (): void {
			nodes.length = 0;
		},
		restore (): void {
			moveBeforeSpy?.mockRestore();
			insertBeforeSpy.mockRestore();
		},
	};
}

describe("Component.Breakdown", () => {
	it("materializes ownerless part descendants before orphan validation", async () => {
		const owner = mountedComponent("div");
		const source = State(owner, 0);
		let child!: Component;
		let childMounts = 0;

		try {
			Component.Breakdown(owner, source, (Part, count) => {
				if (count === 0) return;

				const part = Part("fish", () => {
					child = Component("span");
					child.event.owned.on.Mount(() => childMounts += 1);
					const built = Component("article").append(child);
					expect(child.element.parentNode, "the child should stay physical until commit").toBeNull();
					expect(DOMTree.parentOf(child.element), "the child should have its virtual parent immediately").toBe(built.element);
					return built;
				});
				owner.append(part);
			});

			source.set(1);
			await flushEffects();
			expect(child.element.isConnected).toBe(true);
			expect(childMounts).toBe(1);
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			expect(child.disposed, "the orphan timer should accept the materialized virtual placement").toBe(false);
		} finally {
			owner.remove();
		}
	});

	it("supports fluent instance breakdowns owned by the component", async () => {
		const owner = mountedComponent("div");
		const source = State(owner, "one");
		let handlerOwner: Component | undefined;
		let firstPart: Component | undefined;
		let secondPart: Component | undefined;
		let renderCount = 0;

		try {
			const returned = owner.breakdown(source, (component, Part, value) => {
				handlerOwner = component;
				renderCount += 1;
				const part = Part("value", value, textPart);
				component.append(part);

				if (renderCount === 1) {
					firstPart = part;
					return;
				}

				secondPart = part;
			});

			expect(returned).toBe(owner);
			expect(handlerOwner).toBe(owner);
			expect(firstPart, "the first pass should create the keyed part").toBeDefined();
			expect(firstPart!.owner.get(), "the instance component should own the keyed part").toBe(owner);
			expect(owner.element.textContent).toBe("one");

			source.set("two");
			await flushEffects();

			expect(secondPart, "the second pass should reuse the same keyed part").toBe(firstPart);
			expect(owner.element.textContent).toBe("two");

			owner.remove();
			expect(firstPart!.disposed, "owner removal should dispose instance breakdown parts").toBe(true);
		}
		finally {
			if (!owner.disposed) {
				owner.remove();
			}
		}
	});

	/** Verifies keyed parts are reused while their internal state continues to update. */
	it("reuses keyed parts across updates and updates their part state", async () => {
		const owner = mountedComponent("div");
		const source = State(owner, [{ key: "alpha", value: "one" }]);
		let firstPart: Component | undefined;
		let secondPart: Component | undefined;
		let renderCount = 0;

		try {
			Component.Breakdown(owner, source, (Part, entries) => {
				renderCount += 1;

				for (const entry of entries) {
					const part = Part(entry.key, entry.value, textPart);
					owner.append(part);

					if (renderCount === 1) {
						firstPart = part;
						continue;
					}

					secondPart = part;
				}
			});

			expect(firstPart, "the first pass should create the keyed part").toBeDefined();
			expect(firstPart!.element.textContent, "the initial part state should be rendered immediately").toBe("one");

			source.set([{ key: "alpha", value: "two" }]);
			await flushEffects();

			expect(secondPart, "the second pass should reuse the same keyed component").toBe(firstPart);
			expect(firstPart!.element.textContent, "reused parts should receive the updated keyed value").toBe("two");
		}
		finally {
			owner.remove();
		}
	});

	/** Verifies reused parts move to the new source order without being recreated. */
	it("reorders reused parts to match source order", async () => {
		const owner = mountedComponent("div");
		const source = State(owner, [
			{ key: "alpha", value: "alpha" },
			{ key: "beta", value: "beta" },
			{ key: "gamma", value: "gamma" },
		]);
		const firstPassParts = new Map<string, Component>();
		let secondPassParts: Component[] = [];
		let renderCount = 0;

		try {
			Component.Breakdown(owner, source, (Part, entries) => {
				renderCount += 1;
				const localParts: Component[] = [];

				for (const entry of entries) {
					const part = Part(entry.key, entry.value, textPart);
					owner.append(part);
					localParts.push(part);

					if (renderCount === 1) {
						firstPassParts.set(entry.key, part);
					}
				}

				if (renderCount === 2) {
					secondPassParts = localParts;
				}
			});

			source.set([
				{ key: "gamma", value: "gamma" },
				{ key: "beta", value: "beta" },
				{ key: "alpha", value: "alpha" },
			]);
			await flushEffects();

			expect(secondPassParts[0], "the first reused part should be gamma after reordering").toBe(firstPassParts.get("gamma"));
			expect(secondPassParts[1], "the second reused part should be beta after reordering").toBe(firstPassParts.get("beta"));
			expect(secondPassParts[2], "the third reused part should be alpha after reordering").toBe(firstPassParts.get("alpha"));
			expect(Array.from(owner.element.children), "the container order should follow the reordered source").toEqual([
				secondPassParts[0].element,
				secondPassParts[1].element,
				secondPassParts[2].element,
			]);
		}
		finally {
			owner.remove();
		}
	});

	/** Verifies omitted keyed parts are removed and disposed on the next pass. */
	it("removes omitted parts and disposes them", async () => {
		const owner = mountedComponent("div");
		const source = State(owner, [
			{ key: "alpha", value: "alpha" },
			{ key: "beta", value: "beta" },
			{ key: "gamma", value: "gamma" },
		]);
		let alpha: Component | undefined;
		let beta: Component | undefined;
		let gamma: Component | undefined;

		try {
			Component.Breakdown(owner, source, (Part, entries) => {
				for (const entry of entries) {
					const part = Part(entry.key, entry.value, textPart);
					owner.append(part);

					if (entry.key === "alpha") {
						alpha = part;
					}

					if (entry.key === "beta") {
						beta = part;
					}

					if (entry.key === "gamma") {
						gamma = part;
					}
				}
			});

			source.set([{ key: "beta", value: "beta-updated" }]);
			await flushEffects();

			expect(alpha!.disposed, "parts omitted from the next pass should be disposed").toBe(true);
			expect(gamma!.disposed, "parts omitted from the next pass should be disposed").toBe(true);
			expect(beta!.disposed, "the retained keyed part should stay alive").toBe(false);
			expect(beta!.element.textContent, "the retained keyed part should receive the updated value").toBe("beta-updated");
			expect(Array.from(owner.element.children), "only retained parts should remain in the container").toEqual([
				beta!.element,
			]);
		}
		finally {
			owner.remove();
		}
	});

	/** Verifies stateless keyed parts are reused as the count changes and omitted ones are disposed. */
	it("reuses stateless keyed parts across count changes and disposes omitted ones", async () => {
		const owner = mountedComponent("div");
		const sourceStateNumber = State(owner, 2);
		const buildCounts = new Map<number, number>();
		let initialPart0: Component | undefined;
		let initialPart1: Component | undefined;
		let grownPart0: Component | undefined;
		let grownPart1: Component | undefined;
		let grownPart2: Component | undefined;
		let shrunkPart0: Component | undefined;

		try {
			Component.Breakdown(owner, sourceStateNumber, (Part, count) => {
				for (let index = 0; index < count; index += 1) {
					const part = Part(index, () => {
						buildCounts.set(index, (buildCounts.get(index) ?? 0) + 1);
						return Component("span").text.set(`part-${index}`);
					});
					owner.append(part);

					if (count === 2 && index === 0) {
						initialPart0 = part;
					}

					if (count === 2 && index === 1) {
						initialPart1 = part;
					}

					if (count === 3 && index === 0) {
						grownPart0 = part;
					}

					if (count === 3 && index === 1) {
						grownPart1 = part;
					}

					if (count === 3 && index === 2) {
						grownPart2 = part;
					}

					if (count === 1 && index === 0) {
						shrunkPart0 = part;
					}
				}
			});

			expect(buildCounts.get(0), "the first stateless keyed part should build only once").toBe(1);
			expect(buildCounts.get(1), "the second stateless keyed part should build only once").toBe(1);

			sourceStateNumber.set(3);
			await flushEffects();

			expect(grownPart0, "growing the count should reuse the first stateless keyed part").toBe(initialPart0);
			expect(grownPart1, "growing the count should reuse the second stateless keyed part").toBe(initialPart1);
			expect(buildCounts.get(0), "the first stateless keyed part should not rebuild when the count grows").toBe(1);
			expect(buildCounts.get(1), "the second stateless keyed part should not rebuild when the count grows").toBe(1);
			expect(buildCounts.get(2), "the new stateless keyed part should build once when introduced").toBe(1);

			sourceStateNumber.set(1);
			await flushEffects();

			expect(shrunkPart0, "shrinking the count should keep the retained stateless keyed part").toBe(initialPart0);
			expect(initialPart1!.disposed, "stateless keyed parts omitted by a smaller count should be disposed").toBe(true);
			expect(grownPart2!.disposed, "stateless keyed parts omitted by a smaller count should be disposed").toBe(true);
			expect(Array.from(owner.element.children), "only the retained stateless keyed part should remain in the container").toEqual([
				initialPart0!.element,
			]);
		}
		finally {
			owner.remove();
		}
	});

	/** Verifies Breakdown-owned parts keep their explicit owner after placement operations. */
	it("keeps Breakdown-owned parts explicitly owned after appendTo, prependTo, and insertTo", () => {
		const owner = mountedComponent("section");
		const container = mountedComponent("div");
		const anchor = Component("span").text.set("anchor").appendTo(container);
		const source = State(owner, "initial");
		let appended: Component | undefined;
		let prepended: Component | undefined;
		let inserted: Component | undefined;

		try {
			Component.Breakdown(owner, source, (Part) => {
				appended = Part("append", "append", textPart).appendTo(container);
				prepended = Part("prepend", "prepend", textPart).prependTo(container);
				inserted = Part("insert", "insert", textPart).insertTo("before", anchor);
			});

			expect(appended!.owner.get(), "appendTo should not replace the Breakdown owner").toBe(owner);
			expect(prepended!.owner.get(), "prependTo should not replace the Breakdown owner").toBe(owner);
			expect(inserted!.owner.get(), "insertTo should not replace the Breakdown owner").toBe(owner);

			container.remove();

			expect(appended!.disposed, "explicitly owned Breakdown parts should survive container removal").toBe(false);
			expect(prepended!.disposed, "explicitly owned Breakdown parts should survive container removal").toBe(false);
			expect(inserted!.disposed, "explicitly owned Breakdown parts should survive container removal").toBe(false);

			owner.remove();

			expect(appended!.disposed, "owner disposal should clean up Breakdown-owned parts").toBe(true);
			expect(prepended!.disposed, "owner disposal should clean up Breakdown-owned parts").toBe(true);
			expect(inserted!.disposed, "owner disposal should clean up Breakdown-owned parts").toBe(true);
		}
		finally {
			if (!container.disposed) {
				container.remove();
			}

			if (!owner.disposed) {
				owner.remove();
			}
		}
	});

	/** Verifies reactive placement does not clear the Breakdown owner. */
	it("keeps Breakdown-owned parts explicitly owned through appendToWhen", async () => {
		const owner = mountedComponent("section");
		const container = mountedComponent("div");
		const visible = State(owner, true);
		const source = State(owner, "append");
		let part: Component | undefined;

		try {
			Component.Breakdown(owner, source, (Part, value) => {
				part = Part("append", value, textPart).appendToWhen(visible, container);
			});

			expect(part!.owner.get(), "appendToWhen should preserve the Breakdown owner").toBe(owner);
			expect(part!.element.parentNode, "appendToWhen should place the part on the initial pass").toBe(container.element);

			source.set("updated");
			await flushEffects();

			expect(part!.element.parentNode, "rerendering should keep the reused part at its conditional destination").toBe(container.element);
			expect(part!.element.textContent, "rerendering should update the reused part state").toBe("updated");

			visible.set(false);
			await flushEffects();

			expect(part!.owner.get(), "hiding a Breakdown-owned part should not clear its explicit owner").toBe(owner);
			expect(part!.element.parentNode).not.toBe(container.element);

			visible.set(true);
			await flushEffects();

			expect(part!.element.parentNode, "showing the reused part should restore its conditional destination").toBe(container.element);
			visible.set(false);
			await flushEffects();

			container.remove();
			expect(part!.disposed, "Breakdown-owned parts should survive container disposal while hidden").toBe(false);

			owner.remove();
			expect(part!.disposed, "disposing the Breakdown owner should still dispose the reactively placed part").toBe(true);
		}
		finally {
			if (!container.disposed) {
				container.remove();
			}

			if (!owner.disposed) {
				owner.remove();
			}
		}
	});

	/** Verifies duplicate keys in one pass reuse the existing keyed part instead of failing. */
	it("reuses duplicate keys within one pass", async () => {
		const owner = mountedComponent("div");
		const source = State(owner, "initial");
		let firstPart: Component | undefined;
		let secondPart: Component | undefined;
		let laterPart: Component | undefined;
		let buildCount = 0;

		try {
			Component.Breakdown(owner, source, (Part, value) => {
				const part = Part("alpha", value, (state) => {
					buildCount += 1;
					return textPart(state);
				});
				owner.append(part);

				if (value === "initial") {
					firstPart = part;
					secondPart = Part("alpha", "updated-in-pass", textPart);
					owner.append(secondPart);
					return;
				}

				laterPart = part;
			});

			expect(secondPart, "a duplicate key should return the same part during one pass").toBe(firstPart);
			expect(buildCount, "a duplicate key should not build a second component").toBe(1);
			expect(firstPart!.disposed, "a duplicate key should still be marked seen for cleanup").toBe(false);
			expect(owner.element.children, "a duplicate append should move the existing element, not clone it").toHaveLength(1);
			await flushEffects();
			expect(firstPart!.element.textContent, "the duplicate keyed value should update the existing part state").toBe("updated-in-pass");

			source.set("later");
			await flushEffects();

			expect(laterPart, "later passes should keep reusing the same keyed part").toBe(firstPart);
			expect(firstPart!.element.textContent, "later passes should update the same part normally").toBe("later");
		}
		finally {
			owner.remove();
		}
	});

	it("does not reinsert a sibling disposed by a Mount listener during commit", () => {
		const owner = mountedComponent();
		const source = State(owner, 0);
		let disposedPart: Component | undefined;
		let mountedPart: Component | undefined;

		try {
			Component.Breakdown(owner, source, (Part) => {
				disposedPart = Part("disposed", () => Component("span").text.set("disposed"));
				mountedPart = Part("mounted", () => {
					const component = Component("span").text.set("mounted");
					component.event.owned.on.Mount(() => disposedPart!.remove());
					return component;
				});
				owner.append(disposedPart, mountedPart);
			});

			expect(disposedPart!.disposed).toBe(true);
			expect(disposedPart!.element.parentNode).toBeNull();
			expect(Array.from(owner.element.childNodes)).toEqual([mountedPart!.element]);
		} finally {
			owner.remove();
		}
	});

	it("preserves a Mount listener's component move after the transaction materializes", () => {
		const owner = mountedComponent();
		const destination = mountedComponent("aside");
		const source = State(owner, 0);
		let movedPart: Component | undefined;
		let mountedPart: Component | undefined;

		try {
			Component.Breakdown(owner, source, (Part) => {
				movedPart = Part("moved", () => Component("span").text.set("moved"));
				mountedPart = Part("mounted", () => {
					const component = Component("span").text.set("mounted");
					component.event.owned.on.Mount(() => movedPart!.appendTo(destination));
					return component;
				});
				owner.append(movedPart, mountedPart);
			});

			expect(movedPart!.element.parentNode).toBe(destination.element);
			expect(Array.from(owner.element.childNodes)).toEqual([mountedPart!.element]);
		} finally {
			owner.remove();
			destination.remove();
		}
	});

	it("does not use a raw anchor removed by a Mount listener later in the commit", () => {
		const owner = mountedComponent();
		const source = State(owner, 0);
		const rawAnchor = document.createElement("hr");
		let leadingPart: Component | undefined;
		let mountedPart: Component | undefined;
		owner.element.append(rawAnchor);

		try {
			expect(() => {
				Component.Breakdown(owner, source, (Part) => {
					leadingPart = Part("leading", () => Component("span").text.set("leading"));
					mountedPart = Part("mounted", () => {
						const component = Component("span").text.set("mounted");
						component.event.owned.on.Mount(() => rawAnchor.remove());
						return component;
					});
					leadingPart.insertTo("before", rawAnchor);
					owner.append(mountedPart);
				});
			}).not.toThrow();

			expect(Array.from(owner.element.childNodes)).toEqual([
				leadingPart!.element,
				mountedPart!.element,
			]);
		} finally {
			owner.remove();
		}
	});

	it("does not move a live part into a destination part disposed later in the pass", async () => {
		const owner = mountedComponent();
		const source = State(owner, true);
		let child: Component | undefined;
		let parent: Component | undefined;

		Component.Breakdown(owner, source, (Part, includeParent) => {
			child = Part("child", () => Component("span").text.set("child"));
			if (includeParent) {
				parent = Part("parent", () => Component("article"));
				child.appendTo(owner);
				owner.append(parent);
				return;
			}

			child.appendTo(parent!);
		});

		try {
			source.set(false);
			await flushEffects();

			expect(parent!.disposed).toBe(true);
			expect(child!.disposed).toBe(false);
			expect(child!.element.parentNode).toBe(owner.element);
			expect(owner.element.textContent).toBe("child");
		} finally {
			owner.remove();
		}
	});

	it("does not move a live part into a raw descendant of a destination part disposed later in the pass", async () => {
		const owner = mountedComponent();
		const source = State(owner, true);
		const rawDestination = document.createElement("header");
		let child: Component | undefined;
		let parent: Component | undefined;

		Component.Breakdown(owner, source, (Part, includeParent) => {
			child = Part("child", () => Component("span").text.set("child"));
			if (includeParent) {
				parent = Part("parent", () => Component("article").append(rawDestination));
				child.appendTo(owner);
				owner.append(parent);
				return;
			}

			child.appendTo(rawDestination);
		});

		try {
			source.set(false);
			await flushEffects();

			expect(parent!.disposed).toBe(true);
			expect(child!.disposed).toBe(false);
			expect(child!.element.parentNode).toBe(owner.element);
			expect(rawDestination.contains(child!.element)).toBe(false);
		} finally {
			owner.remove();
		}
	});

	it("treats a placement relative to a part removed later in the pass as a no-op", async () => {
		const owner = mountedComponent();
		const source = State(owner, true);
		let moving: Component | undefined;
		let reference: Component | undefined;

		Component.Breakdown(owner, source, (Part, includeReference) => {
			moving = Part("moving", () => Component("span").text.set("moving"));
			if (includeReference) {
				reference = Part("reference", () => Component("span").text.set("reference"));
				owner.append(moving, reference);
				return;
			}

			moving.insertTo("before", reference!);
		});

		try {
			source.set(false);
			await flushEffects();

			expect(reference!.disposed).toBe(true);
			expect(moving!.element.parentNode).toBe(owner.element);
			expect(owner.element.textContent).toBe("moving");
		} finally {
			owner.remove();
		}
	});

	it("resolves insertion relative to a part placed virtually earlier in the pass", () => {
		const owner = mountedComponent();
		const source = State(owner, 0);
		let first: Component | undefined;
		let second: Component | undefined;

		try {
			expect(() => {
				Component.Breakdown(owner, source, (Part) => {
					first = Part("first", () => Component("span").text.set("first"));
					second = Part("second", () => Component("span").text.set("second"));
					first.appendTo(owner);
					second.insertTo("before", first);
				});
			}).not.toThrow();

			expect(Array.from(owner.element.childNodes)).toEqual([
				second!.element,
				first!.element,
			]);
		} finally {
			owner.remove();
		}
	});

	it("preserves mixed Part and raw-node order within one kitsui append call", () => {
		const owner = mountedComponent();
		const source = State(owner, 0);
		const raw = document.createElement("hr");
		let first: Component | undefined;
		let second: Component | undefined;

		try {
			Component.Breakdown(owner, source, (Part) => {
				first = Part("first", () => Component("span").text.set("first"));
				second = Part("second", () => Component("span").text.set("second"));
				owner.append(first, raw, second);
			});

			expect(Array.from(owner.element.childNodes)).toEqual([
				first!.element,
				raw,
				second!.element,
			]);
		} finally {
			owner.remove();
		}
	});

	it("consumes DocumentFragment children before resolving later virtual placements", () => {
		const owner = mountedComponent();
		const source = State(owner, 0);
		const fragment = document.createDocumentFragment();
		const raw = document.createElement("i");
		let part: Component | undefined;
		fragment.append(raw);

		try {
			expect(() => {
				Component.Breakdown(owner, source, (Part) => {
					part = Part("part", () => Component("b"));
					owner.append(fragment);
					part.insertTo("before", raw);
				});
			}).not.toThrow();

			expect(Array.from(owner.element.childNodes)).toEqual([part!.element, raw]);
			expect(fragment.childNodes).toHaveLength(0);
		} finally {
			owner.remove();
		}
	});

	it("keeps ShadowRoot as a persistent transaction destination", async () => {
		const owner = mountedComponent();
		const host = document.createElement("div");
		const shadowRoot = host.attachShadow({ mode: "open" });
		const source = State(owner, 0);
		let part: Component | undefined;
		document.body.append(host);

		Component.Breakdown(owner, source, (Part) => {
			part = Part("part", () => Component("span"));
			part.appendTo(shadowRoot);
		});

		try {
			expect(part!.element.parentNode).toBe(shadowRoot);

			source.set(1);
			await flushEffects();

			expect(part!.element.parentNode).toBe(shadowRoot);
			expect(shadowRoot.childNodes).toHaveLength(1);
		} finally {
			owner.remove();
			host.remove();
		}
	});

	it("does not resurrect a disposed queued part when its element is rewrapped", () => {
		const owner = mountedComponent();
		const source = State(owner, 0);
		let disposedPart: Component | undefined;
		let replacement: Component | undefined;

		try {
			Component.Breakdown(owner, source, (Part) => {
				disposedPart = Part("part", () => Component("span"));
				owner.append(disposedPart);
				const element = disposedPart.element;
				disposedPart.remove();
				replacement = Component(element);
			});

			expect(disposedPart!.disposed).toBe(true);
			expect(replacement!.disposed).toBe(false);
			expect(replacement!.element.parentNode).toBeNull();
			expect(owner.element.childNodes).toHaveLength(0);
		} finally {
			replacement?.remove();
			owner.remove();
		}
	});

	it("dispatches Mount when a queued part already matches the final physical tree", () => {
		const owner = mountedComponent();
		const source = State(owner, 0);
		const mount = vi.fn();
		let part: Component | undefined;

		try {
			Component.Breakdown(owner, source, (Part) => {
				part = Part("part", () => {
					const component = Component("span");
					component.event.owned.on.Mount(mount);
					return component;
				});
				owner.append(part);
				owner.element.append(part.element);
			});

			expect(part!.element.parentNode).toBe(owner.element);
			expect(mount).toHaveBeenCalledTimes(1);
		} finally {
			owner.remove();
		}
	});

	it("recovers a conditional placeholder dropped with its omitted prepend reference", async () => {
		const owner = mountedComponent();
		const source = State(owner, true);
		const visible = State(owner, false);
		const child = Component("span").text.set("child");

		Component.Breakdown(owner, source, (Part, includeReference) => {
			if (includeReference) {
				owner.append(Part("reference", () => Component("i")));
				return;
			}

			owner.prependWhen(visible, child);
		});

		try {
			source.set(false);
			await flushEffects();
			expect(owner.disposed).toBe(false);

			visible.set(true);
			await flushEffects();

			expect(owner.disposed).toBe(false);
			expect(child.element.parentNode).toBe(owner.element);
		} finally {
			owner.remove();
		}
	});

	it("rejects recursive placement using the virtual parent graph", () => {
		const owner = mountedComponent();
		const source = State(owner, 0);
		const error = vi.spyOn(console, "error").mockImplementation(() => { });
		let parent: Component | undefined;
		let child: Component | undefined;

		try {
			Component.Breakdown(owner, source, (Part) => {
				parent = Part("parent", () => Component("article"));
				child = Part("child", () => Component("span"));
				owner.append(parent);
				parent.append(child);
				child.append(parent);
			});

			expect(parent!.element.parentNode).toBe(owner.element);
			expect(child!.element.parentNode).toBe(parent!.element);
			expect(error).toHaveBeenCalledWith("Cannot move a node into itself or one of its descendants.");
		} finally {
			error.mockRestore();
			owner.remove();
		}
	});

	it("commits an identical append tree without structural DOM moves", async () => {
		const owner = mountedComponent();
		const source = State(owner, ["alpha", "beta", "gamma"]);
		const initialParts = new Map<string, Component>();

		Component.Breakdown(owner, source, (Part, values) => {
			for (const value of values) {
				const part = Part(value, value, textPart);
				owner.append(part);
				initialParts.set(value, part);
			}
		});

		const moves = trackStructuralMoves(owner.element);
		try {
			source.set(["alpha", "beta", "gamma"]);
			await flushEffects();

			expect(moves.count).toBe(0);
			expect(Array.from(owner.element.children)).toEqual([
				initialParts.get("alpha")!.element,
				initialParts.get("beta")!.element,
				initialParts.get("gamma")!.element,
			]);
		} finally {
			moves.restore();
			owner.remove();
		}
	});

	it("updates part content without moving an unchanged keyed layout", async () => {
		const owner = mountedComponent();
		const source = State(owner, [{ key: "alpha", value: "one" }]);
		let part: Component | undefined;

		Component.Breakdown(owner, source, (Part, values) => {
			part = Part(values[0].key, values[0].value, textPart);
			owner.append(part);
		});

		const moves = trackStructuralMoves(owner.element);
		try {
			source.set([{ key: "alpha", value: "two" }]);
			await flushEffects();

			expect(moves.count).toBe(0);
			expect(part!.element.textContent).toBe("two");
		} finally {
			moves.restore();
			owner.remove();
		}
	});

	it("inserts one new keyed part without moving retained siblings", async () => {
		const owner = mountedComponent();
		const source = State(owner, ["alpha", "gamma"]);

		Component.Breakdown(owner, source, (Part, values) => {
			for (const value of values) {
				owner.append(Part(value, value, textPart));
			}
		});

		const moves = trackStructuralMoves(owner.element);
		try {
			source.set(["alpha", "beta", "gamma"]);
			await flushEffects();

			expect(moves.count).toBe(1);
			expect(owner.element.textContent).toBe("alphabetagamma");
		} finally {
			moves.restore();
			owner.remove();
		}
	});

	it("removes an omitted part without moving retained siblings", async () => {
		const owner = mountedComponent();
		const source = State(owner, ["alpha", "beta", "gamma"]);
		let beta: Component | undefined;

		Component.Breakdown(owner, source, (Part, values) => {
			for (const value of values) {
				const part = Part(value, value, textPart);
				owner.append(part);
				if (value === "beta") {
					beta = part;
				}
			}
		});

		const moves = trackStructuralMoves(owner.element);
		try {
			source.set(["alpha", "gamma"]);
			await flushEffects();

			expect(moves.count).toBe(0);
			expect(beta!.disposed).toBe(true);
			expect(owner.element.textContent).toBe("alphagamma");
		} finally {
			moves.restore();
			owner.remove();
		}
	});

	it("uses one structural move for a one-move keyed reorder", async () => {
		const owner = mountedComponent();
		const source = State(owner, ["alpha", "beta", "gamma"]);

		Component.Breakdown(owner, source, (Part, values) => {
			for (const value of values) {
				owner.append(Part(value, value, textPart));
			}
		});

		const moves = trackStructuralMoves(owner.element);
		try {
			source.set(["alpha", "gamma", "beta"]);
			await flushEffects();

			expect(moves.count).toBe(1);
			expect(owner.element.textContent).toBe("alphagammabeta");
		} finally {
			moves.restore();
			owner.remove();
		}
	});

	it("reconciles prepend and before/after placements atomically", async () => {
		const owner = mountedComponent("section");
		const host = mountedComponent();
		const anchor = Component("b").text.set("anchor").appendTo(host);
		const source = State(owner, 0);

		Component.Breakdown(owner, source, (Part) => {
			Part("prepended", () => Component("span").text.set("prepended")).prependTo(host);
			Part("before", () => Component("span").text.set("before")).insertTo("before", anchor);
			Part("after", () => Component("span").text.set("after")).insertTo("after", anchor);
		});

		const moves = trackStructuralMoves(host.element);
		try {
			source.set(1);
			await flushEffects();

			expect(moves.count).toBe(0);
			expect(host.element.textContent).toBe("prependedbeforeanchorafter");
		} finally {
			moves.restore();
			owner.remove();
			host.remove();
		}
	});

	it("moves parts between destinations using their final virtual parents", async () => {
		const owner = mountedComponent("section");
		const left = mountedComponent();
		const right = mountedComponent("aside");
		const source = State<{ alpha: Component; beta: Component }>(owner, { alpha: left, beta: right });

		Component.Breakdown(owner, source, (Part, destinations) => {
			Part("alpha", () => Component("span").text.set("alpha")).appendTo(destinations.alpha);
			Part("beta", () => Component("span").text.set("beta")).appendTo(destinations.beta);
		});

		source.set({ alpha: right, beta: left });
		await flushEffects();

		expect(left.element.textContent).toBe("beta");
		expect(right.element.textContent).toBe("alpha");
		owner.remove();
		left.remove();
		right.remove();
	});

	it("treats immediate raw DOM changes as immovable commit anchors", async () => {
		const owner = mountedComponent();
		const source = State(owner, false);
		const raw = document.createElement("hr");
		let alpha: Component | undefined;
		let beta: Component | undefined;

		Component.Breakdown(owner, source, (Part, addRaw) => {
			if (addRaw) {
				owner.element.append(raw);
			}
			alpha = Part("alpha", () => Component("span").text.set("alpha"));
			beta = Part("beta", () => Component("span").text.set("beta"));
			owner.append(alpha);
			owner.append(beta);
		});

		const moves = trackStructuralMoves(owner.element);
		try {
			source.set(true);
			await flushEffects();

			expect(Array.from(owner.element.childNodes)).toEqual([
				raw,
				alpha!.element,
				beta!.element,
			]);
			expect(moves.nodes).not.toContain(raw);
			expect(owner.element.textContent).toBe("alphabeta");
		} finally {
			moves.restore();
			owner.remove();
		}
	});

	it("collapses repeated placement requests to one part's final virtual position", async () => {
		const owner = mountedComponent("section");
		const left = mountedComponent();
		const right = mountedComponent("aside");
		const source = State(owner, 0);
		let part: Component | undefined;
		const leftMoves = trackStructuralMoves(left.element);
		const rightMoves = trackStructuralMoves(right.element);

		try {
			Component.Breakdown(owner, source, (Part) => {
				part = Part("moving", () => Component("span").text.set("moving"));
				part.appendTo(left);
				part.appendTo(right);
				part.prependTo(left);
			});

			expect(leftMoves.count + rightMoves.count).toBe(1);
			expect(left.element.firstChild).toBe(part!.element);
			expect(right.element.contains(part!.element)).toBe(false);

			leftMoves.reset();
			rightMoves.reset();
			source.set(1);
			await flushEffects();
			expect(leftMoves.count + rightMoves.count).toBe(0);
			expect(left.element.firstChild).toBe(part!.element);
			expect(right.element.contains(part!.element)).toBe(false);
		} finally {
			leftMoves.restore();
			rightMoves.restore();
			owner.remove();
			left.remove();
			right.remove();
		}
	});

	it("moves one Breakdown part into another Breakdown part", async () => {
		const owner = mountedComponent();
		const source = State(owner, 0);
		let card: Component | undefined;
		let title: Component | undefined;

		Component.Breakdown(owner, source, (Part) => {
			card = Part("card", () => Component("article"));
			title = Part("title", () => Component("h1").text.set("Title"));
			card.append(title);
			owner.append(card);
		});

		expect(card!.element.parentNode).toBe(owner.element);
		expect(title!.element.parentNode).toBe(card!.element);

		const ownerMoves = trackStructuralMoves(owner.element);
		const cardMoves = trackStructuralMoves(card!.element);
		try {
			source.set(1);
			await flushEffects();

			expect(ownerMoves.count + cardMoves.count).toBe(0);
			expect(title!.element.parentNode).toBe(card!.element);
		} finally {
			cardMoves.restore();
			ownerMoves.restore();
			owner.remove();
		}
	});

	it("moves a part into a static descendant created by another part's builder", async () => {
		const owner = mountedComponent();
		const source = State(owner, "First title");
		let card: Component | undefined;
		let header: Component | undefined;
		let title: Component | undefined;

		Component.Breakdown(owner, source, (Part, value) => {
			card = Part("card", () => {
				header = Component("header");
				return Component("article").append(header);
			});
			title = Part("title", value, textPart);
			header!.append(title);
			owner.append(card);
		});

		expect(header!.element.parentNode).toBe(card!.element);
		expect(title!.element.parentNode).toBe(header!.element);

		const ownerMoves = trackStructuralMoves(owner.element);
		const headerMoves = trackStructuralMoves(header!.element);
		try {
			source.set("Second title");
			await flushEffects();

			expect(ownerMoves.count + headerMoves.count).toBe(0);
			expect(header!.element.textContent).toBe("Second title");
			expect(title!.element.parentNode).toBe(header!.element);
		} finally {
			headerMoves.restore();
			ownerMoves.restore();
			owner.remove();
		}
	});

	it("shares the outer movement transaction with a nested Breakdown created by a part builder", () => {
		const owner = mountedComponent();
		const source = State(owner, "nested title");
		let card: Component | undefined;
		let title: Component | undefined;
		let titleParentAfterNestedBreakdown: ParentNode | null | undefined;
		let titleVirtualParentAfterNestedBreakdown: ParentNode | null | undefined;

		Component.Breakdown(owner, source, (Part) => {
			card = Part("card", () => {
				const component = Component("article");
				Component.Breakdown(component, source, (NestedPart, value) => {
					title = NestedPart("title", value, textPart);
					component.append(title);
				});
				titleParentAfterNestedBreakdown = title!.element.parentNode;
				titleVirtualParentAfterNestedBreakdown = DOMTree.parentOf(title!.element);
				return component;
			});
			owner.append(card);
		});

		expect(titleParentAfterNestedBreakdown).toBeNull();
		expect(titleVirtualParentAfterNestedBreakdown).toBe(card!.element);
		expect(card!.element.parentNode).toBe(owner.element);
		expect(title!.element.parentNode).toBe(card!.element);
		expect(title!.element.textContent).toBe("nested title");
		owner.remove();
	});

	it("updates Breakdown virtual placement synchronously while delaying physical placement until commit", () => {
		const owner = mountedComponent();
		const source = State(owner, "value");
		let physicalParentInsideHandler: ParentNode | null | undefined;
		let virtualParentInsideHandler: ParentNode | null | undefined;
		let virtualChildrenInsideHandler: Node[] | undefined;
		let virtuallyConnectedInsideHandler: boolean | undefined;
		let part: Component | undefined;

		Component.Breakdown(owner, source, (Part) => {
			part = Part("part", () => Component("span"));
			owner.append(part);
			physicalParentInsideHandler = part.element.parentNode;
			virtualParentInsideHandler = DOMTree.parentOf(part.element);
			virtualChildrenInsideHandler = DOMTree.childrenOf(owner.element);
			virtuallyConnectedInsideHandler = DOMTree.isConnected(part.element);
		});

		expect.soft(physicalParentInsideHandler).toBeNull();
		expect.soft(virtualParentInsideHandler).toBe(owner.element);
		expect.soft(virtualChildrenInsideHandler).toContain(part!.element);
		expect.soft(virtuallyConnectedInsideHandler).toBe(true);
		expect(part!.element.parentNode).toBe(owner.element);
		owner.remove();
	});

	it("commits movement intents recorded before a throwing handler and rethrows the original error", () => {
		const owner = mountedComponent();
		const source = State(owner, "value");
		let part: Component | undefined;
		const expected = new Error("render failed");

		expect(() => {
			Component.Breakdown(owner, source, (Part) => {
				part = Part("part", () => Component("span"));
				owner.append(part);
				throw expected;
			});
		}).toThrow(expected);

		expect(part!.element.parentNode).toBe(owner.element);
		owner.remove();
	});

	it("disposes every part when aggregate cleanup encounters a throwing part-state cleanup", () => {
		const owner = mountedComponent("section");
		const source = State(owner, 0);
		const cleanupError = new Error("part state cleanup failed");
		const parts: Component[] = [];
		const partStates: State<number>[] = [];
		const cleanup = Component.Breakdown(owner, source, (Part) => {
			for (const key of ["first", "later"] as const) {
				const part = Part(key, 0, (partState) => {
					partStates.push(partState);
					if (key === "first") {
						partState.onCleanup(() => {
							throw cleanupError;
						});
					}
					return Component("span");
				});
				parts.push(part);
				owner.append(part);
			}
		});

		try {
			expect.soft(() => cleanup()).toThrow(cleanupError);
			expect.soft(partStates.map(state => state.disposed)).toEqual([true, true]);
			expect.soft(parts.map(part => part.disposed)).toEqual([true, true]);
			expect(owner.element.childNodes).toHaveLength(0);
		} finally {
			if (!owner.disposed) owner.remove();
		}
	});

	it("keeps a handler error primary when transaction materialization also fails", () => {
		const owner = mountedComponent("section");
		const source = State(owner, 0);
		const handlerError = new Error("Breakdown handler failed");
		const materializationError = new Error("Breakdown materialization failed");
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
		const insertBeforeSpy = vi.spyOn(owner.element, "insertBefore").mockImplementation(() => {
			throw materializationError;
		});

		try {
			let thrown: unknown;
			try {
				Component.Breakdown(owner, source, (Part) => {
					owner.append(Part("part", () => Component("span")));
					throw handlerError;
				});
			} catch (error) {
				thrown = error;
			}

			expect.soft(thrown).toBe(handlerError);
			expect.soft(consoleErrorSpy).toHaveBeenCalled();
			expect(consoleErrorSpy.mock.calls.flat()).toContain(materializationError);
		} finally {
			insertBeforeSpy.mockRestore();
			consoleErrorSpy.mockRestore();
			if (!owner.disposed) owner.remove();
		}
	});

	it("cleans a newly built part when its owner disposes during the builder", async () => {
		vi.useFakeTimers();
		const queuedErrors: VoidFunction[] = [];
		const queueMicrotaskSpy = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(callback => queuedErrors.push(callback));
		const owner = mountedComponent("div");
		const source = State(owner, "initial");
		let built!: Component;
		let partState!: State<string>;

		try {
			expect(() => {
				Component.Breakdown(owner, source, (Part) => {
					Part("alpha", "one", (state) => {
						partState = state;
						built = Component("span");
						owner.remove();
						return built;
					});
				});
			}).toThrow("Disposed owners cannot be modified.");

			expect.soft(partState.disposed).toBe(true);
			expect.soft(built.disposed).toBe(true);
			await vi.runAllTimersAsync();
			await Promise.resolve();
			expect(queuedErrors).toEqual([]);
		} finally {
			queueMicrotaskSpy.mockRestore();
			vi.useRealTimers();
			if (built && !built.disposed) built.remove();
		}
	});

	it("rejects an already-disposed builder root and immediately disposes its part State", () => {
		const owner = mountedComponent("div");
		const source = State(owner, "initial");
		let partState!: State<string>;

		try {
			let thrown: unknown;
			try {
				Component.Breakdown(owner, source, (Part) => {
					Part("alpha", "one", (state) => {
						partState = state;
						const disposed = Component("span");
						disposed.remove();
						return disposed;
					});
				});
			} catch (error) {
				thrown = error;
			}
			expect.soft(thrown).toBeInstanceOf(Error);
			expect.soft((thrown as Error | undefined)?.message).toBe("Component.Breakdown part builders must return an active Component.");
			expect(partState.disposed).toBe(true);
		} finally {
			owner.remove();
		}
	});

	/** Verifies builder output must not already be owned by another component. */
	it("throws when a builder returns an explicitly-owned component", () => {
		const owner = mountedComponent("div");
		const otherOwner = mountedComponent("section");
		const source = State(owner, "initial");
		const explicitlyOwned = Component("span").owner.add(otherOwner);

		try {
			expect(() => {
				Component.Breakdown(owner, source, (Part) => {
					Part("alpha", "one", () => explicitlyOwned);
				});
			}, "Breakdown should reject builders that return an explicitly-owned component").toThrow("ownerless Component");
		}
		finally {
			otherOwner.remove();
			owner.remove();
		}
	});

	/** Verifies builder output must be an unplaced component. */
	it("throws when a builder returns an already-placed component", () => {
		const owner = mountedComponent("div");
		const source = State(owner, "initial");
		const alreadyPlaced = Component("span").text.set("placed").appendTo(document.body);

		try {
			expect(() => {
				Component.Breakdown(owner, source, (Part) => {
					Part("alpha", "one", () => alreadyPlaced);
				});
			}, "Breakdown should reject builders that return a placed component").toThrow("unplaced Component");
		}
		finally {
			alreadyPlaced.remove();
			owner.remove();
		}
	});
});
