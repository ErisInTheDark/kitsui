import { describe, expect, it } from "vitest";
import { Component } from "../../src/component/Component";
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

describe("Component.Breakdown", () => {
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

			visible.set(false);
			await flushEffects();

			expect(part!.owner.get(), "hiding a Breakdown-owned part should not clear its explicit owner").toBe(owner);

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

	/** Verifies duplicate keys are rejected within a single render pass. */
	it("throws on duplicate keys within one pass", () => {
		const owner = mountedComponent("div");
		const source = State(owner, "initial");

		try {
			expect(() => {
				Component.Breakdown(owner, source, (Part) => {
					Part("alpha", "one", textPart);
					Part("alpha", "two", textPart);
				});
			}, "duplicate keys should fail during the same breakdown pass").toThrow("registered the key alpha more than once");
		}
		finally {
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