import type { Editor, EditorPosition } from 'obsidian';

export interface TriggerInfo {
	char: string;
	position: EditorPosition;
	ch: number; // Character position after trigger
	query: string;
}

/**
 * Detects trigger characters in editor and extracts query text
 */
export class TriggerDetector {
	private static readonly TRIGGER_CHARS = ['/', '@'];
	private static readonly VALID_SEPARATORS = [' ', '\n', '\t', '|'];

	/**
	 * Check if last typed character is a trigger
	 */
	detectNewTrigger(editor: Editor): TriggerInfo | null {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const charsBefore = line.substring(0, cursor.ch);
		const lastChar = charsBefore[charsBefore.length - 1];

		if (!this.isTriggerChar(lastChar)) {
			return null;
		}

		if (!this.isStandaloneTrigger(charsBefore)) {
			return null;
		}

		return {
			char: lastChar,
			position: cursor,
			ch: cursor.ch,
			query: '',
		};
	}

	/**
	 * Detect if cursor is within an existing mention being edited
	 */
	detectExistingMention(editor: Editor): TriggerInfo | null {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const charsBefore = line.substring(0, cursor.ch);

		// Find the last trigger character before cursor
		const triggerMatch = charsBefore.match(/(?:^|\s|\|)([@/])[\w-]*$/);
		if (!triggerMatch) {
			return null;
		}

		const triggerChar = triggerMatch[1];
		const triggerIndex = charsBefore.lastIndexOf(triggerChar);

		if (!this.isStandaloneTrigger(charsBefore.substring(0, triggerIndex + 1))) {
			return null;
		}

		return {
			char: triggerChar,
			position: cursor,
			ch: triggerIndex + 1,
			query: charsBefore.substring(triggerIndex + 1),
		};
	}

	/**
	 * Extract query text after trigger
	 */
	extractQuery(editor: Editor, triggerCh: number, triggerChar: string): string | null {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const query = line.substring(triggerCh, cursor.ch);

		// Check if trigger was deleted or query contains space
		if (line[triggerCh - 1] !== triggerChar || query.includes(' ')) {
			return null;
		}

		return query;
	}

	/**
	 * Check if character is a trigger
	 */
	private isTriggerChar(char: string): boolean {
		return TriggerDetector.TRIGGER_CHARS.includes(char);
	}

	/**
	 * Check if trigger is standalone (not part of a word like "http://")
	 */
	private isStandaloneTrigger(textBeforeTrigger: string): boolean {
		const charBeforeTrigger = textBeforeTrigger[textBeforeTrigger.length - 2];

		return !charBeforeTrigger || TriggerDetector.VALID_SEPARATORS.includes(charBeforeTrigger);
	}
}
