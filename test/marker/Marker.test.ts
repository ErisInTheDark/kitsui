import { describe, expect, it, vi } from "vitest";
import { Component } from "../../src/component/Component";
import { EventManipulator } from "../../src/component/EventManipulator";
import placeExtension from "../../src/component/extensions/placeExtension";
import { Marker } from "../../src/component/Marker";
import { Owner } from "../../src/state/State";

placeExtension();

function mountedComponent<NAME extends keyof HTMLElementTagNameMap = "div">(tagName: NAME = "div" as NAME): Component<HTMLElementTagNameMap[NAME]> {
	return Component(tagName).appendTo(document.body);
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

async function flushLifecycle (): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
	await flushEffects();
}

function captureOrphanCheck (): {
	orphanCheck: (() => void) | null;
	restore: () => void;
} {
	let orphanCheck: (() => void) | null = null;
	const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((handler: TimerHandler) => {
		if (typeof handler === "function") {
			orphanCheck = handler as unknown as () => void;
		}

		return 0 as unknown as ReturnType<typeof setTimeout>;
	}) as unknown as typeof setTimeout);

	return {
		get orphanCheck (): (() => void) | null {
			return orphanCheck;
		},
		restore (): void {
			setTimeoutSpy.mockRestore();
		},
	};
}

describe("Marker", () => {
	it("can be constructed with or without new and exposes node.marker", () => {
		const withNew = new Marker("with-new");
		const withoutNew = Marker("without-new");

		expect(withNew).toBeInstanceOf(Marker);
		expect(withoutNew).toBeInstanceOf(Marker);
		expect(withNew.node.data).toBe("with-new");
		expect(withoutNew.node.data).toBe("without-new");
		expect(withNew.node.marker).toBe(withNew);
		expect(withoutNew.node.marker).toBe(withoutNew);

		withNew.remove();
		withoutNew.remove();
	});

	it("memoizes the event manipulator", () => {
		const marker = Marker("memoized");

		expect(marker.event).toBeInstanceOf(EventManipulator);
		expect(marker.event).toBe(marker.event);

		marker.remove();
	});

	it("dispatches Mount when inserted and Dispose when removed", async () => {
		const marker = Marker("lifecycle");
		const events: string[] = [];

		marker.event.owned.on.Mount((event) => {
			events.push(`mount:${event.marker.node.data}`);
		});
		marker.event.owned.on.Dispose((event) => {
			events.push(`dispose:${event.marker.node.data}`);
		});

		document.body.append(marker.node);
		await flushLifecycle();

		expect(events).toEqual(["mount:lifecycle"]);

		marker.remove();

		expect(events).toEqual(["mount:lifecycle", "dispose:lifecycle"]);
		expect(marker.disposed).toBe(true);
		expect(marker.node.marker).toBeUndefined();
	});

	it("disposes when its explicit owner is disposed", async () => {
		const owner = mountedComponent("section");
		const marker = Marker("owned");
		const events: string[] = [];

		marker.event.owned.on.Mount(() => {
			events.push("Mount");
		});
		marker.event.owned.on.Dispose(() => {
			events.push("Dispose");
		});
		marker.setOwner(owner);

		await flushLifecycle();
		expect(events).toEqual([]);

		marker.appendTo(owner);
		expect(events).toEqual(["Mount"]);

		owner.remove();

		expect(events).toEqual(["Mount", "Dispose"]);
		expect(marker.disposed).toBe(true);
	});

	it("treats a plain Owner as a managed explicit owner", async () => {
		class TestOwner extends Owner { }

		const owner = new TestOwner();
		const marker = Marker("plain-owner");
		const events: string[] = [];

		marker.event.owned.on.Mount(() => {
			events.push("Mount");
		});
		marker.event.owned.on.Dispose(() => {
			events.push("Dispose");
		});
		marker.setOwner(owner);

		await flushLifecycle();
		expect(events).toEqual([]);

		owner.dispose();

		expect(events).toEqual(["Dispose"]);
		expect(marker.disposed).toBe(true);
	});

	it("treats managed wrapped ancestors as implicit ownership", async () => {
		const owner = mountedComponent("section");
		const child = Component("div").setOwner(owner);
		const marker = Marker("implicit");
		let mounts = 0;

		marker.event.owned.on.Mount(() => {
			mounts += 1;
		});

		child.element.append(marker.node);
		await flushLifecycle();

		expect(mounts).toBe(1);
		expect(marker.disposed).toBe(false);

		marker.remove();
		child.remove();
		owner.remove();
	});

	it("throws on the orphan check when it remains unmanaged", () => {
		const orphanCapture = captureOrphanCheck();

		try {
			Marker("orphan");
			expect(orphanCapture.orphanCheck).toBeTypeOf("function");
			expect(() => orphanCapture.orphanCheck?.()).toThrow("Markers must be connected to the document or have a managed owner before the next tick.");
		} finally {
			orphanCapture.restore();
		}
	});

	it("supports explicit owner listeners and off on marker events", () => {
		class TestOwner extends Owner { }

		const listenerOwner = new TestOwner();
		const marker = Marker("event-owner");
		const received: Marker[] = [];
		const listener = (event: CustomEvent & { marker: Marker }) => {
			received.push(event.marker);
		};

		marker.event.on.Mount(listenerOwner, listener);
		marker.node.dispatchEvent(new CustomEvent("Mount"));
		expect(received).toEqual([marker]);

		marker.event.off.Mount(listener);
		marker.node.dispatchEvent(new CustomEvent("Mount"));
		expect(received).toEqual([marker]);

		listenerOwner.dispose();
		marker.remove();
	});

	it("fires Mount only after appendTo inserts into a managed target", () => {
		const host = mountedComponent("section");
		const marker = Marker("append-to-host");
		const parentNodes: Array<ParentNode | null> = [];

		marker.event.owned.on.Mount((event) => {
			parentNodes.push(event.marker.node.parentNode);
		});

		marker.appendTo(host);

		expect(parentNodes).toEqual([host.element]);
		marker.remove();
		host.remove();
	});

	it("can insert relative to another marker", () => {
		const host = mountedComponent("div");
		const anchor = Marker("anchor").appendTo(host);
		const inserted = Marker("inserted").insertTo("before", anchor);

		expect(Array.from(host.element.childNodes)).toEqual([inserted.node, anchor.node]);

		inserted.remove();
		anchor.remove();
		host.remove();
	});
});