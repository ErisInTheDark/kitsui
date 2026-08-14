import { describe, expect, it } from "vitest";
import { compileStyleValue } from "../../src/component/styleValue";

describe("style value compilation", () => {
	it("preserves numbers and values without shorthand", () => {
		expect(compileStyleValue(12)).toBe("12");
		expect(compileStyleValue("min(100%, 40rem)")).toBe("min(100%, 40rem)");
	});

	it("preserves existing variable access shorthand", () => {
		expect(compileStyleValue("$gap ${fallbackGap: 1rem}")).toBe("var(--gap) var(--fallback-gap, 1rem)");
		expect(compileStyleValue("-$offset")).toBe("calc(-1 * var(--offset))");
	});

	it("compiles calculation shorthand with variable access", () => {
		expect(compileStyleValue("[100% - $gap]")).toBe("calc(100% - var(--gap))");
		expect(compileStyleValue("[100% - ${gap: 1rem}]")).toBe("calc(100% - var(--gap, 1rem))");
		expect(compileStyleValue("[-$offset]")).toBe("calc(calc(-1 * var(--offset)))");
	});

	it("compiles multiple and nested calculations", () => {
		expect(compileStyleValue("translate([100% - $x], [50% - $y])")).toBe("translate(calc(100% - var(--x)), calc(50% - var(--y)))");
		expect(compileStyleValue("[100% - [2 * $gap]]")).toBe("calc(100% - calc(2 * var(--gap)))");
		expect(compileStyleValue("[[1px * $iconZoom] * max($scaleFactorPixelPerfect, $scale) / $scaleFactor]")).toBe("calc(calc(1px * var(--icon-zoom)) * max(var(--scale-factor-pixel-perfect), var(--scale)) / var(--scale-factor))");
	});

	it("emits doubled square brackets as an opaque literal bracket group", () => {
		expect(compileStyleValue("[[sidebar-start]] 1fr [[sidebar-end]]")).toBe("[sidebar-start] 1fr [sidebar-end]");
		expect(compileStyleValue("[[line-$gap]]")).toBe("[line-$gap]");
		expect(compileStyleValue("[100% - [[literal]]]")).toBe("calc(100% - [literal])");
	});

	it("preserves empty and unmatched bracket groups", () => {
		expect(compileStyleValue("[] [ ]")).toBe("[] [ ]");
		expect(compileStyleValue("[100% - $gap")).toBe("[100% - var(--gap)");
		expect(compileStyleValue("[[sidebar-start]")).toBe("[[sidebar-start]");
	});
});
