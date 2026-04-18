import { Component, Style } from "../../../src";
import { stackColumn } from "../styles";

export interface EditorComponent extends Component {
	createResultPanel (): Component;
}

const editorWrapStyle = Style.Class("docs-editor-wrap", {
	...stackColumn,
	flex: "1 1 0",
	gap: "8px",
	minWidth: 0,
});

const editorToolbarStyle = Style.Class("docs-editor-toolbar", {
	alignItems: "center",
	display: "flex",
	gap: "8px",
});

const editorLabelStyle = Style.Class("docs-editor-label", {
	color: "$textSecondary",
	fontSize: "12px",
	fontWeight: 600,
	letterSpacing: "0.05em",
	textTransform: "uppercase",
});

const editorSelectStyle = Style.Class("docs-editor-select", {
	background: "$bgSurface",
	border: "1px solid $borderMuted",
	borderRadius: "6px",
	color: "$textPrimary",
	fontSize: "13px",
	padding: "4px 8px",
});

const editorContainerStyle = Style.Class("docs-editor-container", {
	border: "1px solid $borderSubtle",
	borderRadius: "8px",
	flex: "1 1 0",
	minHeight: "320px",
	overflow: "hidden",
});

const resultWrapStyle = Style.Class("docs-editor-result-wrap", {
	...stackColumn,
	flex: "1 1 0",
	gap: "8px",
	minWidth: 0,
});

const resultLabelStyle = Style.Class("docs-editor-result-label", {
	color: "$textSecondary",
	fontSize: "12px",
	fontWeight: 600,
	letterSpacing: "0.05em",
	textTransform: "uppercase",
});

const resultPanelStyle = Style.Class("docs-editor-result-panel", {
	background: "$bgPage",
	border: "1px solid $borderSubtle",
	borderRadius: "8px",
	flex: "1 1 0",
	minHeight: "320px",
	overflow: "auto",
	padding: "24px",
});

export default function Editor (): EditorComponent {
	const toolbar = Component("div").class.add(editorToolbarStyle);

	Component("label")
		.class.add(editorLabelStyle)
		.text.set("Example")
		.attribute.set("for", "docs-editor-example-select")
		.appendTo(toolbar);

	Component("select")
		.class.add(editorSelectStyle)
		.attribute.set("id", "docs-editor-example-select")
		.appendTo(toolbar);

	const container = Component("div")
		.class.add(editorContainerStyle)
		.attribute.set("id", "docs-editor-container");

	const editorWrap = Component("div")
		.class.add(editorWrapStyle)
		.append(toolbar, container);

	const editorComponent = Object.assign(editorWrap, {
		createResultPanel (): Component {
			const resultWrap = Component("div")
				.class.add(resultWrapStyle)
				.setOwner(editorComponent);

			Component("span")
				.class.add(resultLabelStyle)
				.text.set("Output")
				.appendTo(resultWrap);

			Component("div")
				.class.add(resultPanelStyle)
				.attribute.set("id", "docs-editor-result-panel")
				.appendTo(resultWrap);

			return resultWrap;
		},
	}) as EditorComponent;

	return editorComponent;
}
