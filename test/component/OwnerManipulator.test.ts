import { describe, expect, it, vi } from "vitest";
import { Component } from "../../src/component/Component";
import placeExtension from "../../src/component/extensions/placeExtension";
import { OwnerManipulator } from "../../src/component/OwnerManipulator";
import { Owner } from "../../src/state/State";

placeExtension();

function mountedComponent<NAME extends keyof HTMLElementTagNameMap = "div">(tagName: NAME = "div" as NAME): Component<HTMLElementTagNameMap[NAME]> {
	return Component(tagName).appendTo(document.body);
}

class TestOwner extends Owner {
	remove (): void {
		this.dispose();
	}
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

describe("OwnerManipulator", () => {
	it("is memoized and exposes the current explicit owner set", async () => {
		vi.useFakeTimers();

		const host = mountedComponent("section");
		const owner = new TestOwner();

		try {
			expect(host.owner, "the owner manipulator should be memoized on the host").toBe(host.owner);
			expect(host.owner, "the host should expose the public OwnerManipulator").toBeInstanceOf(OwnerManipulator);

			host.owner.add(owner);
			vi.advanceTimersByTime(0);

			expect(host.owner.get(), "get() should return the registered explicit owner when exactly one is present").toBe(owner);
			expect(host.owner.getAll(), "getAll() should list every registered explicit owner without duplicates").toEqual([owner]);

			host.remove();
			owner.remove();
			vi.advanceTimersByTime(0);
		}
		finally {
			vi.useRealTimers();
		}
	});

	it("supports overlapping explicit owners until the last one is cleaned up", async () => {
		vi.useFakeTimers();

		const host = mountedComponent("section");
		const firstOwner = new TestOwner();
		const secondOwner = new TestOwner();

		try {
			host.owner.add(firstOwner);
			host.owner.add(secondOwner);
			vi.advanceTimersByTime(0);

			expect(host.owner.get(), "get() should return one of the registered explicit owners when several overlap").not.toBeNull();
			expect([firstOwner, secondOwner], "get() should return one of the registered explicit owners when several overlap").toContain(host.owner.get());
			expect(host.owner.getAll(), "getAll() should keep every overlapping explicit owner").toEqual(expect.arrayContaining([firstOwner, secondOwner]));
			expect(host.owner.getAll(), "getAll() should not duplicate overlapping owners").toHaveLength(2);

			firstOwner.remove();
			vi.advanceTimersByTime(0);

			expect(host.disposed, "the host should stay alive while any explicit owner remains").toBe(false);
			expect(host.owner.getAll(), "removing one explicit owner should keep the remaining owner registered").toEqual([secondOwner]);
			expect(host.owner.get(), "get() should still report the remaining owner after the first one is cleaned up").toBe(secondOwner);

			secondOwner.remove();
			vi.advanceTimersByTime(0);

			expect(host.disposed, "the host should dispose only after the last explicit owner is cleaned up").toBe(true);
		}
		finally {
			vi.useRealTimers();
		}
	});

	it("removes explicit owners by owner, by id, and by composite", async () => {
		vi.useFakeTimers();

		const host = mountedComponent("section");
		const anonymousOwner = new TestOwner();
		const keyedOwner = new TestOwner();
		const compositeOwner = new TestOwner();

		try {
			host.owner.add(anonymousOwner);
			host.owner.add(keyedOwner, "keyed");
			host.owner.add(compositeOwner, "composite");
			vi.advanceTimersByTime(0);

			host.owner.remove(anonymousOwner);
			expect(host.owner.getAll(), "remove(owner) should clear all claims registered for that owner").toEqual(expect.arrayContaining([keyedOwner, compositeOwner]));
			expect(host.owner.getAll(), "remove(owner) should clear only the matching owner").toHaveLength(2);

			host.owner.remove("keyed");
			expect(host.owner.getAll(), "remove(id) should clear the keyed claim without affecting unrelated owners").toEqual([compositeOwner]);

			host.owner.remove("composite", compositeOwner);
			expect(host.owner.get(), "remove(id, owner) should clear the matching composite claim").toBeNull();
			expect(host.disposed, "manually removing the last explicit owner should clear ownership without disposing the host").toBe(false);

			anonymousOwner.remove();
			keyedOwner.remove();
			compositeOwner.remove();
			vi.advanceTimersByTime(0);
		}
		finally {
			vi.useRealTimers();
		}
	});
});