import { Editor } from 'obsidian';
import { EditorWithCoords } from '../types/command-palette';

/**
 * Handles cursor coordinate detection for palette positioning
 */
export class CoordinateDetector {
	/**
	 * Get screen coordinates for the cursor position
	 */
	getCoordinates(editor: Editor): { top: number; left: number } | null {
		const line = editor.getLine(editor.getCursor().line);
		const isTable = line.includes('|');

		if (isTable) {
			return this.getTableCoordinates();
		}

		return this.getEditorCoordinates(editor);
	}

	/**
	 * Get coordinates for table cells using browser selection API
	 */
	private getTableCoordinates(): { top: number; left: number } | null {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return null;
		}

		const rect = selection.getRangeAt(0).getBoundingClientRect();

		if (this.isValidRect(rect)) {
			return { top: rect.top, left: rect.left };
		}

		return null;
	}

	/**
	 * Get coordinates from CodeMirror editor
	 */
	private getEditorCoordinates(editor: Editor): { top: number; left: number } | null {
		const coords = (editor as EditorWithCoords).coordsAtPos(editor.getCursor());

		if (coords && this.isValidCoords(coords)) {
			return { top: coords.top, left: coords.left };
		}

		return null;
	}

	/**
	 * Check if DOMRect has valid coordinates
	 */
	private isValidRect(rect: DOMRect): boolean {
		return rect.left > 0 && rect.top > 0;
	}

	/**
	 * Check if coordinates are valid
	 */
	private isValidCoords(coords: { top: number; left: number }): boolean {
		return coords.top > 0 && coords.left > 0;
	}
}
