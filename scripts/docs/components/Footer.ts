import { Component, Style } from "../../../src";
import { containerCenter, monoFont } from "../styles";

const footerStyle = Style.Class("docs-footer", {
	...monoFont,
	borderTop: "1px solid $borderSubtle",
	color: "$textSecondary",
	fontSize: "12px",
	letterSpacing: "0.04em",
	marginTop: "48px",
	padding: "16px 20px 24px",
});

const innerStyle = Style.Class("docs-footer-inner", {
	...containerCenter,
});

export default function Footer (): Component {
	return Component("footer")
		.class.add(footerStyle)
		.append(
			Component("div")
				.class.add(innerStyle)
				.text.set("kitsui — generated with kitsui"),
		);
}