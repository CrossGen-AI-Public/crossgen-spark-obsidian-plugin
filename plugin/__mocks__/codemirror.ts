// Mock CodeMirror for testing

export const EditorView = {
	theme: () => { },
	decorations: () => { },
};

export const EditorState = {
	create: () => { },
};

export const StateField = {
	define: () => { },
};

export const Decoration = {
	mark: () => { },
	widget: () => { },
};

export const ViewPlugin = {
	define: () => { },
	fromClass: () => { },
};

export class RangeSetBuilder {
	add() { }
	finish() {
		return () => { };
	}
}
