import { Component, State, Style, whenHover } from "kitsui";

document.addEventListener("DOMContentLoaded", () => {
	const key = "kitsui-theme";

	const root = Component.query(".docs-theme");
	const headerRight = Component.query(".docs-header-right");
	if (!root || !headerRight)
		return;

	const prefersDark = matchMedia("(prefers-color-scheme:dark)");

	const schemeSetting = State(root, localStorage.getItem(key) as "dark" | "light" | null);
	const schemeState = schemeSetting.map(root, setting => setting ?? (prefersDark.matches ? "dark" as const : "light" as const));
	prefersDark.addEventListener("change", schemeState.recompute);

	const schemeStyleDark = Style.Class("docs-theme-dark", { colorScheme: "dark" });
	const schemeStyleLight = Style.Class("docs-theme-light", { colorScheme: "light" });
	const schemeStyleState = schemeState.map(root, (state) => state === "dark" ? schemeStyleDark : schemeStyleLight);
	root.class.add(schemeStyleState);

	const toggleStyle = Style.Class("docs-theme-toggle", {
		alignItems: "center",
		background: "none",
		border: "1px solid $borderMuted",
		borderRadius: "6px",
		color: "$textMuted",
		cursor: "pointer",
		display: "flex",
		height: "32px",
		justifyContent: "center",
		padding: "0",
		width: "32px",
		...whenHover({ borderColor: "$textSecondary", color: "$textPrimary" }),
	});

	const toggle = Component("button")
		.class.add(toggleStyle)
		.attribute.set("id", "theme-toggle")
		.attribute.set("aria-label", "Toggle color scheme")
		.event.owned.on.click(() => {
			if (schemeSetting.value) {
				schemeSetting.set(null);
				localStorage.removeItem(key);
			} else {
				const override = prefersDark.matches ? "light" : "dark";
				schemeSetting.set(override);
				localStorage.setItem(key, override);
			}
		})
		.appendTo(headerRight);

	const SUN_ICON = `<svg id="theme-sun" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
	const MOON_ICON = `<svg id="theme-moon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5 5.5 5.5 0 1 0 13.5 9.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
	Component.fromHTML(SUN_ICON).appendToWhen(schemeState.equals("light"), toggle);
	Component.fromHTML(MOON_ICON).appendToWhen(schemeState.equals("dark"), toggle);
});
	