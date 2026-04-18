import { Component, Style } from "../../../src";
import Document from "../Document";
import Editor from "../components/Editor";
import PlaygroundLayout from "../components/PlaygroundLayout";

const playgroundShellStyle = Style.Class("docs-playground-shell", {
	alignItems: "stretch",
	display: "flex",
	flex: "1 1 0",
	flexWrap: "wrap",
	gap: "20px",
	minHeight: 0,
	minWidth: 0,
	width: "100%",
});

export default Document(async (doc, project, path) => {
	doc.setTitle("Playground - kitsui");

	return PlaygroundLayout((content) => {
		const editor = Editor();
		const resultPanel = editor.createResultPanel();

		Component("div")
			.class.add(playgroundShellStyle)
			.append(editor, resultPanel)
			.appendTo(content);
	}, path);
});
