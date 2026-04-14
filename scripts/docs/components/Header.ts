import { Component, Style } from "../../../src";
import { containerCenter, monoFont } from "../styles";

const headerStyle = Style.Class("docs-header", {
	borderBottom: "1px solid $borderSubtle",
	padding: "14px 20px",
});

const headerChildrenStyle = Style({
	alignItems: "center",
	display: "flex",
	gap: "16px",
})

const innerStyle = Style.Class("docs-header-inner", {
	...containerCenter,
	...headerChildrenStyle,
	justifyContent: "space-between",
});

const leftStyle = Style.Class("docs-header-left", {
	...headerChildrenStyle,
});

const rightStyle = Style.Class("docs-header-right", {
	...headerChildrenStyle,
});

const brandStyle = Style.Class("docs-header-brand", {
	...monoFont,
	color: "$textPrimary",
	fontSize: "20px",
	fontWeight: 700,
	letterSpacing: "0.02em",
	textDecoration: "none",
});

const noteStyle = Style.Class("docs-header-note", {
	...monoFont,
	color: "$textSecondary",
	fontSize: "12px",
	letterSpacing: "0.06em",
	textTransform: "uppercase",
});

export default function Header (): Component {
	return Component("header")
		.class.add(headerStyle)
		.append(
			Component("div")
				.class.add(innerStyle)
				.append(
					Component("div")
						.class.add(leftStyle)
						.append(
							Component("a")
								.class.add(brandStyle)
								.text.set("kitsui")
								.attribute.set("href", "index.html"),
							Component("span")
								.class.add(noteStyle)
								.text.set("docs"),
					),
					Component("div")
						.class.add(rightStyle),
				),
		);
}