import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runTypecheck } from "../scripts/typecheck";
import { heldTree, withAppended } from "./utility/heldTree";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const docsClientTsconfigPath = path.join(projectRoot, "scripts", "docs", "client", "tsconfig.json");

describe("typecheck", () => {
	it("points the docs client project at source types instead of dist declarations", async () => {
		const docsClientTsconfig = await readFile(docsClientTsconfigPath, "utf8");

		expect(docsClientTsconfig).toMatch(/"@inthedark\/kitsui"\s*:\s*\["\.\.\/\.\.\/\.\.\/src\/index\.ts"\]/u);
	});

	it("reports errors in files the arc view holds, not their disk versions", async () => {
		const tree = heldTree({
			"src/utility/reportUncaught.ts": "export function reportUncaught (error: unknown): number {\n\treturn error;\n}\n",
		});

		const [root] = await runTypecheck({ tree, only: ["root"] });

		expect(root.diagnostics.length).toBeGreaterThan(0);
		expect(root.output).toContain("reportUncaught.ts");
	}, 60_000);

	it("checks the consumer probe against the published declaration bundle", async () => {
		const tree = heldTree({
			"scripts/typecheck/kitsui-dts-check.ts": await withAppended("scripts/typecheck/kitsui-dts-check.ts", "const notAState: number = State(Owner(), \"text\");"),
		});

		const [bundled] = await runTypecheck({ tree, only: ["bundled declarations"] });

		expect(bundled.output).toContain("kitsui-dts-check.ts");
	}, 60_000);

	it("passes the bundled declaration project for the current sources", async () => {
		const [bundled] = await runTypecheck({ tree: heldTree({}), only: ["bundled declarations"] });

		expect(bundled.output).toBe("");
	}, 60_000);
});
