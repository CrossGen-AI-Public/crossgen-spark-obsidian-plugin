import { type App, type Editor, TFile } from 'obsidian';
import {
	AGENT_PREFIX_REGEX,
	NEWLINE_REGEX,
	TEMP_MARKER_BLOCK_REGEX,
	DAEMON_MARKER_BLOCK_REGEX,
} from '../constants';

export class ResultWriter {
	private static instance: ResultWriter;
	private app: App;

	private constructor(app: App) {
		this.app = app;
	}

	public static getInstance(app?: App): ResultWriter {
		if (!ResultWriter.instance) {
			if (!app) {
				throw new Error('ResultWriter must be initialized with an App instance first.');
			}
			ResultWriter.instance = new ResultWriter(app);
		}
		return ResultWriter.instance;
	}

	/**
	 * Replace positioning markers with final daemon-readable format
	 */
	public replaceMarkersWithFinalFormat(
		editor: Editor,
		markerId: string,
		agentName: string,
		userMessage: string,
		uuid: string,
		linesNeeded: number = 3
	): void {
		if (!markerId) {
			console.warn('[ResultWriter] No marker ID to replace');
			return;
		}

		// Find the start and end marker lines
		const lineCount = editor.lineCount();
		let startLine = -1;
		let endLine = -1;

		for (let i = 0; i < lineCount; i++) {
			const line = editor.getLine(i);
			if (line.includes(`${markerId}-start`)) {
				startLine = i;
			} else if (line.includes(`${markerId}-end`)) {
				endLine = i;
				break;
			}
		}

		if (startLine === -1 || endLine === -1) {
			console.warn('[ResultWriter] Could not find markers to replace');
			return;
		}

		// Extract user message (remove @agent prefix if present)
		const cleanMessage = userMessage.replace(AGENT_PREFIX_REGEX, '').trim();

		// Build final marker format
		// Format: <!-- spark-inline-chat:pending:uuid:agentName:message -->
		const escapedMessage = cleanMessage.replace(NEWLINE_REGEX, '\\n');
		const openingMarker = `<!-- spark-inline-chat:pending:${uuid}:${agentName}:${escapedMessage} -->`;
		const closingMarker = `<!-- /spark-inline-chat -->`;

		// Add newlines to make space for the widget
		const newlines = '\n'.repeat(Math.max(linesNeeded - 1, 2));
		const finalContent = `${openingMarker}\n${newlines}${closingMarker}`;

		// Check if there's content after the end marker
		const hasContentAfter =
			endLine + 1 < lineCount && editor.getLine(endLine + 1).trim().length > 0;

		// Replace all lines between start and end (inclusive) with final format
		// Add extra newline if there's content after to ensure separation
		const trailingNewlines = hasContentAfter ? '\n\n' : '\n';
		editor.replaceRange(
			finalContent + trailingNewlines,
			{ line: startLine, ch: 0 },
			{ line: endLine + 1, ch: 0 }
		);
	}

	/**
	 * Remove all inline chat markers from a file
	 * Uses vault.process for atomic read-modify-write
	 */
	public async cleanupMarkersFromFile(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file || !(file instanceof TFile)) {
			return;
		}

		try {
			await this.app.vault.process(file, content => {
				let modifiedContent = content;

				// Pattern 1: Remove temporary positioning markers
				modifiedContent = modifiedContent.replace(TEMP_MARKER_BLOCK_REGEX, '');

				// Pattern 2: Remove daemon format markers
				modifiedContent = modifiedContent.replace(DAEMON_MARKER_BLOCK_REGEX, '');

				return modifiedContent;
			});
		} catch (error) {
			console.error('[ResultWriter] Error cleaning up markers:', error);
		}
	}

	/**
	 * Clean up markers from editor (removes all lines between and including markers)
	 */
	public cleanupMarkersFromEditor(editor: Editor, markerId: string): void {
		if (!markerId) return;

		const lineCount = editor.lineCount();
		let startLine = -1;
		let endLine = -1;

		for (let i = 0; i < lineCount; i++) {
			const line = editor.getLine(i);
			if (line.includes(`${markerId}-start`)) {
				startLine = i;
			} else if (line.includes(`${markerId}-end`)) {
				endLine = i;
				break;
			}
		}

		if (startLine === -1 || endLine === -1) {
			return;
		}

		// Remove from end to start to avoid line number shifting
		for (let i = endLine; i >= startLine; i--) {
			editor.replaceRange('', { line: i, ch: 0 }, { line: i + 1, ch: 0 });
		}
	}
}
