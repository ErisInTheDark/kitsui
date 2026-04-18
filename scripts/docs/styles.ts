import { Style } from "../../src";

export const monoFont = Style({
	fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
});

export const containerCenter = Style({
	margin: "0 auto",
	maxWidth: "1120px",
	width: "100%",
});

export const stackColumn = Style({
	display: "flex",
	flexDirection: "column",
});

export const pageLayoutStyle = Style.Class("docs-layout-page", {
	background: "$bgPage",
	color: "$textPrimary",
	...stackColumn,
	fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
	fontSize: "17px",
	lineHeight: 1.6,
	minHeight: "100vh",
});

export const pageHeroBase = Style({
	...stackColumn,
	borderBottom: "1px solid $borderSubtle",
	gap: "8px",
	paddingBottom: "20px",
});

export const pageTitleBase = Style({
	color: "$textBright",
	fontSize: "31px",
	fontWeight: 700,
	letterSpacing: "-0.02em",
	lineHeight: 1.2,
});

export const pageSummaryBase = Style({
	color: "$textSubtle",
	fontSize: "15px",
	lineHeight: 1.5,
});

export const sectionTitleBase = Style({
	color: "$textBright",
	fontSize: "22px",
	fontWeight: 700,
	letterSpacing: "-0.01em",
	marginTop: "16px",
});

export const homeHeroClass = Style.Class("docs-home-hero", {
	...pageHeroBase,
});

export const homeTitleClass = Style.Class("docs-home-title", {
	...pageTitleBase,
});

export const homeSummaryClass = Style.Class("docs-home-summary", {
	...pageSummaryBase,
});

export const theme = Style.Class("docs-theme", {
	colorScheme: "light dark",

	// Background — in light mode: main content white, less important bgs get darker
	$bgPage: "light-dark( #fafafa, #0d0d0d)",
	$bgCodeBlock: "light-dark( #f3f3f3, #111)",
	$bgSurface: "light-dark( #eaeaea, #161616)",
	$bgRaised: "light-dark( #e0e0e0, #1a1a1a)",

	// Borders
	$borderSubtle: "light-dark( #ddd, #1a1a1a)",
	$borderCode: "light-dark( #d0d0d0, #222)",
	$borderMuted: "light-dark( #c0c0c0, #333)",

	// Text
	$textBright: "light-dark( #111, #fff)",
	$textPrimary: "light-dark( #1a1a1a, #e4e4e4)",
	$textBody: "light-dark( #333, #ccc)",
	$textMuted: "light-dark( #666, #aaa)",
	$textSecondary: "light-dark( #777, #888)",
	$textSubtle: "light-dark( #888, #777)",
	$textDim: "light-dark( #999, #666)",

	// Syntax highlighting
	$syntaxType: "light-dark( #2e7d32, #a3e635)",
	$syntaxReference: "light-dark( #1565c0, #60a5fa)",
	$syntaxKeyword: "light-dark( #4a7fa8, #7aafe0)",
	$syntaxLiteral: "light-dark( #b8860b, #f59e0b)",
	$syntaxPunctuation: "light-dark( #999, #666)",
	$syntaxMethod: "light-dark( #7b1fa2, #c084fc)",

	// Semantic accents
	$accentPrimary: "light-dark( #2e7d32, #a3e635)",
	$accentReturns: "light-dark( #1565c0, #60a5fa)",
	$accentThrows: "light-dark( #c62828, #f87171)",
});
