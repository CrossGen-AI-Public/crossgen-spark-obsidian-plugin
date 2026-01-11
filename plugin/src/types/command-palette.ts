import type { Editor, EditorPosition } from 'obsidian';

/**
 * Item in the command palette autocomplete
 */
export interface PaletteItem {
	type: 'command' | 'agent' | 'file' | 'folder' | 'variable';
	id: string;
	name: string;
	description?: string;
	path?: string;
	/** Icon for the item (emoji or character) */
	icon?: string;
}

/**
 * Context when a trigger character is detected
 */
export interface TriggerContext {
	editor: Editor;
	line: number;
	ch: number;
	triggerChar: string;
	query: string;
}

/**
 * Extended editor type with coordsAtPos method and cm property
 */
export interface EditorWithCoords extends Editor {
	coordsAtPos(
		_pos: EditorPosition
	): { top: number; left: number; bottom: number; right: number } | null;
	cm?: {
		dom: HTMLElement;
	};
}
