import { describe, expect, it, vi } from "vitest";
import { Component } from "../../src/component/Component";
import { beginDOMTreeTransaction, DOMTree } from "../../src/component/DOMTree";
import { EventManipulator } from "../../src/component/EventManipulator";
import placeExtension from "../../src/component/extensions/placeExtension";
import { Marker } from "../../src/component/Marker";
import { Owner } from "../../src/state/State";

placeExtension();

function mountedComponent<NAME extends keyof HTMLElementTagNameMap = "div">(tagName: NAME = "div" as NAME): Component<HTMLElementTagNameMap[NAME]> {
	return Component(tagName).appendTo(document.body);
}

function captureThrown (action: () => void): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}

	throw new Error("Expected action to throw.");
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

describe("Marker", () => {
	it("updates virtual placement and ownership synchronously while Mount waits for commit", () => {
		const host = mountedComponent("section");
		const marker = Marker("transactional-marker");
		const mount = vi.fn();
		marker.event.owned.on.Mount(mount);
		const transaction = beginDOMTreeTransaction();

		marker.appendTo(host);

		expect.soft(DOMTree.parentOf(marker.node)).toBe(host.element);
		expect.soft(DOMTree.childrenOf(host.element)).toContain(marker.node);
		expect.soft(marker.owner.get()).toBe(host);
		expect.soft(marker.node.parentNode).toBeNull();
		expect.soft(mount).not.toHaveBeenCalled();

		transaction.commit();
		expect.soft(marker.node.parentNode).toBe(host.element);
		expect(mount).toHaveBeenCalledOnce();
		host.remove();
	});

	it("runs later Marker.use Mount hooks when an earlier Mount hook throws", () => {
		const host = mountedComponent("section");
		const marker = Marker("multiple-use-mount-error");
		const mountError = new Error("first Mount hook failed");
		const phases: string[] = [];
		marker.use(() => {
			phases.push("first Mount");
			throw mountError;
		});
		marker.use(() => {
			phases.push("later Mount");
			return () => phases.push("later cleanup");
		}, () => phases.push("later onDispose"));

		try {
			expect.soft(() => marker.appendTo(host)).toThrow(mountError);
			expect.soft(phases).toEqual(["first Mount", "later Mount"]);
			marker.remove();
			expect.soft(phases).toEqual(["first Mount", "later Mount", "later cleanup", "later onDispose"]);
			expect.soft(marker.disposed).toBe(true);
			expect(marker.node.marker).toBeUndefined();
		} finally {
			if (!marker.disposed) marker.remove();
			host.remove();
		}
	});

	it("runs later Marker.use cleanup and onDispose hooks when an earlier cleanup throws", () => {
		const host = mountedComponent("section");
		const marker = Marker("multiple-use-dispose-error");
		const cleanupError = new Error("first Dispose cleanup failed");
		const phases: string[] = [];
		marker.use(() => () => {
			phases.push("first cleanup");
			throw cleanupError;
		}, () => phases.push("first onDispose"));
		marker.use(() => () => phases.push("later cleanup"), () => phases.push("later onDispose"));
		marker.appendTo(host);

		try {
			expect.soft(() => marker.remove()).toThrow(cleanupError);
			expect.soft(phases).toEqual([
				"first cleanup",
				"first onDispose",
				"later cleanup",
				"later onDispose",
			]);
			expect.soft(marker.disposed).toBe(true);
			expect.soft(marker.disposing).toBe(false);
			expect.soft(marker.node.marker).toBeUndefined();
			expect(marker.node.parentNode).toBeNull();
		} finally {
			if (!marker.disposed) marker.remove();
			host.remove();
		}
	});

	it("runs cleanup before onDispose when Marker.use Mount removes the marker", () => {
		const host = mountedComponent();
		const marker = Marker("self-removing-use");
		const cleanupError = new Error("self-removing Mount cleanup failed");
		const disposeError = new Error("self-removing onDispose failed");
		const phases: string[] = [];
		marker.use(() => {
			phases.push("Mount");
			marker.remove();
			return () => {
				phases.push("cleanup");
				throw cleanupError;
			};
		}, () => {
			phases.push("onDispose");
			throw disposeError;
		});

		try {
			expect.soft(captureThrown(() => marker.appendTo(host))).toBe(cleanupError);
			expect.soft(phases).toEqual(["Mount", "cleanup", "onDispose"]);
			expect.soft(marker.disposed).toBe(true);
			expect.soft(marker.disposing).toBe(false);
			expect.soft(marker.node.parentNode).toBeNull();
			expect.soft(marker.node.marker).toBeUndefined();
			expect(() => marker.remove()).not.toThrow();
		} finally {
			if (!marker.disposed) marker.remove();
			host.remove();
		}
	});

	it.each([
		["use", (cleanup: () => void) => {
			const marker = Marker("use-remove-on-mount");
			return marker.use(() => {
				marker.remove();
				return cleanup;
			});
		}],
		["builder", (cleanup: () => void) => Marker.builder({
			id: () => "builder-remove-on-mount",
			build: (marker) => {
				marker.remove();
				return cleanup;
			},
		})()],
	] as const)("runs %s cleanup once when its Mount action synchronously removes the marker", (_api, createMarker) => {
		const host = mountedComponent("section");
		const cleanup = vi.fn();
		const marker = createMarker(cleanup);

		try {
			expect.soft(() => marker.appendTo(host)).not.toThrow();
			expect.soft(marker.disposed).toBe(true);
			expect(cleanup).toHaveBeenCalledTimes(1);
		} finally {
			if (!marker.disposed) marker.remove();
			host.remove();
		}
	});

	it("runs onDispose and reaches terminal state when mounted cleanup throws", () => {
		const host = mountedComponent("section");
		const marker = Marker("throwing-use-cleanup");
		const cleanupError = new Error("mounted cleanup failed");
		const mountCleanup = vi.fn(() => {
			throw cleanupError;
		});
		const onDispose = vi.fn();
		marker.use(() => mountCleanup, onDispose).appendTo(host);

		expect.soft(() => marker.remove()).toThrow(cleanupError);
		expect.soft(mountCleanup).toHaveBeenCalledOnce();
		expect.soft(onDispose).toHaveBeenCalledOnce();
		expect.soft(marker.disposed).toBe(true);
		expect.soft(marker.disposing).toBe(false);
		expect.soft(marker.node.marker).toBeUndefined();
		expect.soft(marker.node.parentNode).toBeNull();
		expect(() => marker.remove()).not.toThrow();
		host.remove();
	});

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
		marker.owner.add(owner);

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
		marker.owner.add(owner);

		await flushLifecycle();
		expect(events).toEqual([]);

		owner.dispose();

		expect(events).toEqual(["Dispose"]);
		expect(marker.disposed).toBe(true);
	});

	it("treats managed wrapped ancestors as implicit ownership", async () => {
		const owner = mountedComponent("section");
		const child = Component("div").owner.add(owner);
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

	it("treats a detached explicitly-managed ShadowRoot host as implicit ownership for a raw Marker", () => {
		const owner = mountedComponent("section");
		const host = Component("div").owner.add(owner);
		const shadowRoot = host.element.attachShadow({ mode: "open" });
		const orphanCapture = captureOrphanCheck();
		const marker = Marker("detached-shadow-managed");
		shadowRoot.append(marker.node);

		try {
			expect(orphanCapture.orphanCheck).toBeTypeOf("function");
			expect(() => orphanCapture.orphanCheck?.()).not.toThrow();
			expect.soft(orphanCapture.queuedError).toBeNull();
			expect.soft(marker.disposed).toBe(false);
			expect(marker.node.parentNode).toBe(shadowRoot);
		} finally {
			orphanCapture.restore();
			if (!marker.disposed) marker.remove();
			if (!host.disposed) host.remove();
			if (!owner.disposed) owner.remove();
		}
	});

	it("disposes a raw Marker inside a closed ShadowRoot when its wrapped host is removed", async () => {
		const host = mountedComponent("section");
		const shadowRoot = host.element.attachShadow({ mode: "closed" });
		const marker = Marker("raw-closed-shadow-child");
		const mount = vi.fn();
		marker.event.owned.on.Mount(mount);
		shadowRoot.append(marker.node);

		try {
			await flushLifecycle();
			expect.soft(mount).toHaveBeenCalledOnce();
			expect.soft(marker.disposed).toBe(false);

			host.remove();
			expect(marker.disposed).toBe(true);
		} finally {
			if (!host.disposed) host.remove();
			if (!marker.disposed) marker.remove();
		}
	});

	/** Verifies unmanaged markers still defer orphan validation to a timeout tick, then route the throw through Promise.then. */
	it("runs unmanaged orphan validation through Promise.then", () => {
		const orphanCapture = captureOrphanCheck();

		try {
			Marker("orphan");
			expect(orphanCapture.orphanCheck, "the orphan check should be attached through Promise.then").toBeTypeOf("function");
			expect(() => orphanCapture.orphanCheck?.(), "the Promise.then orphan callback should defer its uncaught rethrow").not.toThrow();
			expect(orphanCapture.queuedError, "the orphan callback should queue an uncaught rethrow").toBeTypeOf("function");
			expect(() => orphanCapture.queuedError?.(), "the queued rethrow should surface the orphan error").toThrow("Markers must be connected to the document or have a managed owner before the next tick.");
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
