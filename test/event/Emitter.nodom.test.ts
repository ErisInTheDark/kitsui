// @vitest-environment node
import { expect, it } from "vitest";
import { Emitter, Owner } from "../../src/index";

interface PingEvents {
	ping (value: number): number;
}

class Pinger {
	readonly event = new Emitter<this, PingEvents>(this);
}

it("loads from the package entrypoint and dispatches with no DOM", () => {
	expect(typeof document).toBe("undefined");

	const owner = Owner();
	const pinger = new Pinger();
	pinger.event.on.ping(owner, (_host, value) => value + 1);
	Emitter.of(Pinger).on.ping(owner, (_host, value) => value * 2);

	expect(pinger.event.reduce.ping(3)).toBe(7);
	owner.dispose();
	expect(pinger.event.reduce.ping(3)).toBe(3);
});
