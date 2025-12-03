/**
 * Detects agent mentions in editor for inline chat
 */

import type { Editor, App } from 'obsidian';
import type { DetectedAgentMention } from './types';
import { ResourceService } from '../services/ResourceService';
import { AGENT_NAME_REGEX } from '../constants';

export class InlineChatDetector {
	private resourceService: ResourceService;

	constructor(app: App) {
		this.resourceService = ResourceService.getInstance(app);
	}

	/**
	 * Detect if cursor is right after an @agent mention on its own line
	 * Returns agent mention details if detected, null otherwise
	 */
	detectAgentMention(editor: Editor): DetectedAgentMention | null {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);

		// Check if cursor is at end of line (or followed only by whitespace)
		const afterCursor = line.substring(cursor.ch).trim();
		if (afterCursor.length > 0) {
			return null;
		}

		// Get text before cursor
		const beforeCursor = line.substring(0, cursor.ch).trim();

		// Match @agent pattern at end of line
		// Agent name: starts with letter, can contain letters, numbers, underscores, hyphens
		// Match @agent pattern at end of line
		// Agent name: starts with letter, can contain letters, numbers, underscores, hyphens
		const match = beforeCursor.match(AGENT_NAME_REGEX);

		if (!match) {
			return null;
		}

		const agentName = match[1];

		// Find position where @agent starts
		const agentStart = line.indexOf(`@${agentName}`);
		if (agentStart === -1) {
			return null;
		}

		return {
			agentName,
			position: {
				line: cursor.line,
				ch: agentStart,
			},
			line: cursor.line,
			ch: agentStart,
		};
	}

	/**
	 * Check if there's already an inline chat marker below this agent mention
	 * Returns true if marker exists (to prevent duplicate inputs)
	 */
	hasExistingMarker(editor: Editor, mentionLine: number): boolean {
		// Check next few lines for marker
		const maxLinesToCheck = 5;
		for (let i = 1; i <= maxLinesToCheck; i++) {
			const lineNum = mentionLine + i;
			if (lineNum >= editor.lineCount()) {
				break;
			}

			const line = editor.getLine(lineNum);
			if (line.includes('<!-- spark-inline-chat:')) {
				return true;
			}

			// Stop checking if we hit non-empty, non-comment line
			if (line.trim() && !line.trim().startsWith('<!--')) {
				break;
			}
		}

		return false;
	}

	/**
	 * Validate if agent exists (checks .spark/agents/ directory)
	 * For now, returns true for any valid agent name format
	 * TODO: Integrate with agent loader to validate actual agent files
	 */
	async isValidAgent(agentName: string): Promise<boolean> {
		return this.resourceService.validateAgent(agentName);
	}
}
