/**
 * Manager for inline chat functionality
 * Orchestrates detection, widget display, and marker writing
 */

import type { App, Editor, TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { InlineChatDetector } from './InlineChatDetector';
import { InlineChatWidget } from './InlineChatWidget';
import type { DetectedAgentMention } from './types';

interface PendingChat {
	uuid: string;
	filePath: string;
	agentName: string;
	timestamp: number;
}

export class InlineChatManager {
	private app: App;
	private detector: InlineChatDetector;
	private activeWidget: InlineChatWidget | null = null;
	private currentMention: DetectedAgentMention | null = null;
	private currentEditor: Editor | null = null;
	private editorChangeHandler: ((editor: Editor) => void) | null = null;
	private originalMentionText: string = ''; // Store original @agent text for restoration
	private mentionLineNumber: number = -1;
	private insertedBlankLines: number = 0; // Track how many blank lines we inserted
	private markerId: string = ''; // Unique ID for this inline chat instance
	private pendingChats: Map<string, PendingChat> = new Map(); // Track chats waiting for daemon
	private fileModifyHandler: ((file: TFile) => void) | null = null;
	private currentUserMessage: string = ''; // Track current user message for processing display
	private agentMentionCompleteHandler: EventListener | null = null;
	private currentFilePath: string = ''; // Track current file with active markers

	constructor(app: App) {
		this.app = app;
		this.detector = new InlineChatDetector();
	}

	/**
	 * Initialize the manager and register event handlers
	 * Call this during plugin load
	 */
	initialize(): void {
		// Create editor change handler
		this.editorChangeHandler = (editor: Editor) => {
			this.handleEditorChange(editor);
		};

		// Register with workspace
		this.app.workspace.on('editor-change', this.editorChangeHandler);

		// Create file modification handler to detect when daemon completes
		this.fileModifyHandler = (file: TFile) => {
			void this.handleFileModify(file);
		};

		// Register file modification listener
		this.app.vault.on('modify', this.fileModifyHandler);

		// Listen for agent mention completion from command palette
		this.agentMentionCompleteHandler = ((evt: CustomEvent) => {
			this.handleAgentMentionComplete(evt.detail);
		}) as EventListener;
		document.addEventListener('spark-agent-mention-complete', this.agentMentionCompleteHandler);

		// Clean up any orphaned markers from previous sessions (crashes, force quits, etc.)
		// Wait for workspace to be ready to ensure vault is fully loaded
		this.app.workspace.onLayoutReady(() => {
			void this.cleanupOrphanedMarkers();
		});
	}

	/**
	 * Handle editor change event
	 * Call this from plugin's EditorChange event
	 */
	handleEditorChange(editor: Editor): void {
		// Check if widget should be hidden (no mention and no pending chats)
		const mention = this.detector.detectAgentMention(editor);
		if (!mention && this.activeWidget?.isVisible() && this.pendingChats.size === 0) {
			this.hideWidget();
		}
	}

	/**
	 * Handle agent mention completion from command palette
	 * This is the clear event that triggers inline chat widget
	 */
	private handleAgentMentionComplete(detail: {
		agentName: string;
		editor: Editor;
		line: number;
	}): void {
		const { agentName, editor, line } = detail;

		console.log('[Spark Inline Chat] Agent mention completed via palette', {
			agentName,
			line,
		});

		// Check if already has marker (don't show widget if already processed)
		if (this.detector.hasExistingMarker(editor, line)) {
			return;
		}

		// Validate agent
		if (!this.detector.isValidAgent(agentName)) {
			return;
		}

		// Create mention object
		const mention: DetectedAgentMention = {
			agentName,
			line,
			ch: editor.getCursor().ch,
			position: editor.getCursor(),
		};

		// Show widget
		this.currentMention = mention;
		this.currentEditor = editor;
		this.showWidget(editor, mention);
	}

	/**
	 * Handle file modification event
	 * Detects when daemon completes inline chat requests
	 */
	private async handleFileModify(file: TFile): Promise<void> {
		// Only process if we have pending chats
		if (this.pendingChats.size === 0) {
			return;
		}

		// Check if this file has any pending chats
		const pendingForFile = Array.from(this.pendingChats.values()).filter(
			chat => chat.filePath === file.path
		);

		if (pendingForFile.length === 0) {
			return;
		}

		// Read file content
		const content = await this.app.vault.read(file);

		// Check each pending chat to see if it's complete
		// Since daemon now removes all markers, we detect completion by the absence of pending marker
		for (const pendingChat of pendingForFile) {
			const pendingMarker = `<!-- spark-inline-chat:pending:${pendingChat.uuid}`;

			// If pending marker is gone, the daemon has processed it
			if (!content.includes(pendingMarker)) {
				// Chat completed (daemon removed markers and inserted response)
				const elapsed = Date.now() - pendingChat.timestamp;
				console.log('[Spark Inline Chat] Chat completed:', {
					uuid: pendingChat.uuid,
					agent: pendingChat.agentName,
					elapsed: `${elapsed}ms`,
				});

				// Hide the processing widget if it's for this chat
				if (this.activeWidget && this.activeWidget.isVisible()) {
					this.hideWidget();
					this.resetState();
				}

				// Show subtle notification
				new Notice(`✓ @${pendingChat.agentName} responded (${Math.round(elapsed / 1000)}s)`);

				// Remove from pending
				this.pendingChats.delete(pendingChat.uuid);
			}
		}

		// Clean up old pending chats (older than 5 minutes)
		// Also remove markers from files to prevent corruption
		const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
		for (const [uuid, chat] of this.pendingChats.entries()) {
			if (chat.timestamp < fiveMinutesAgo) {
				console.warn('[Spark Inline Chat] Removing stale pending chat:', {
					uuid,
					age: Date.now() - chat.timestamp,
				});

				// Clean up markers from the file
				void this.cleanupMarkersFromFile(chat.filePath);

				this.pendingChats.delete(uuid);
			}
		}
	}

	/**
	 * Show the inline chat widget
	 */
	private showWidget(editor: Editor, mention: DetectedAgentMention): void {
		// Hide existing widget if any
		this.hideWidget();

		// Track current file path
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			this.currentFilePath = activeFile.path;
		}

		// Store original mention text and line number for potential restoration
		this.mentionLineNumber = mention.line;
		this.originalMentionText = editor.getLine(mention.line);

		// Generate unique marker ID
		this.markerId = `spark-inline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		// Remove @agent from the file
		const lineContent = editor.getLine(mention.line);
		const agentPattern = new RegExp(`@${mention.agentName}\\s*`);
		const cleanedLine = lineContent.replace(agentPattern, '').trim();
		editor.setLine(mention.line, cleanedLine);

		// Insert markers and blank lines to create space for the widget
		const insertPosition = { line: mention.line + 1, ch: 0 };
		const markerStart = `<!-- ${this.markerId}-start -->\n`;
		const blankLines = '\n\n\n\n\n\n\n'; // 7 blank lines for widget space (~210px)
		const markerEnd = `<!-- ${this.markerId}-end -->`;
		const insertText = markerStart + blankLines + markerEnd + '\n';

		editor.replaceRange(insertText, insertPosition);
		this.insertedBlankLines = 9; // start marker + 7 blanks + end marker

		// Wait for DOM to update, then position widget
		window.setTimeout(() => {
			const position = this.calculateWidgetPosition(editor);
			if (!position) {
				console.warn('[Spark Inline Chat] Could not calculate widget position');
				this.cleanupMarkers(editor);
				return;
			}

			// Create and show widget (no initial message, agent is stored separately)
			this.activeWidget = new InlineChatWidget(this.app, {
				agentName: mention.agentName,
				onSend: message => this.handleSend(message),
				onCancel: () => this.handleCancel(),
				top: position.top,
				left: position.left,
				parentElement: position.parentElement,
			});

			this.activeWidget.show();
		}, 50);
	}

	/**
	 * Hide the widget without cleaning up (used when switching to new mention)
	 */
	private hideWidget(): void {
		// Just hide the widget, don't clean up markers/blank lines
		// Cleanup is handled by handleCancel() or handleSend()
		if (this.activeWidget) {
			this.activeWidget.hide();
			this.activeWidget = null;
		}
	}

	/**
	 * Calculate position for widget using invisible marker placeholders
	 */
	private calculateWidgetPosition(
		editor: Editor
	): { top: number; left: number; parentElement: HTMLElement } | null {
		// Get editor container (CodeMirror 6 structure)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const editorEl = (editor as any).cm?.dom as HTMLElement | undefined;
		if (!editorEl) {
			return null;
		}

		// Find the scroller element (this is what scrolls)
		const scrollerEl = editorEl.querySelector('.cm-scroller') as HTMLElement;
		if (!scrollerEl) {
			return null;
		}

		const scrollerRect = scrollerEl.getBoundingClientRect();

		// Find the marker elements by searching for the comment text
		// The markers are rendered as HTML comments in the DOM
		const allLines = Array.from(editorEl.querySelectorAll('.cm-line'));
		let startMarkerLine: HTMLElement | null = null;
		let endMarkerLine: HTMLElement | null = null;

		for (const line of allLines) {
			const text = line.textContent || '';
			if (text.includes(`${this.markerId}-start`)) {
				startMarkerLine = line as HTMLElement;
			} else if (text.includes(`${this.markerId}-end`)) {
				endMarkerLine = line as HTMLElement;
			}
		}

		if (!startMarkerLine || !endMarkerLine) {
			console.warn('[Spark Inline Chat] Could not find marker lines');
			return null;
		}

		const startRect = startMarkerLine.getBoundingClientRect();

		// Find content area for left alignment
		const contentArea = editorEl.querySelector('.cm-content');
		const contentRect = contentArea?.getBoundingClientRect();

		// Position widget between the markers, accounting for scroll
		const top = startRect.bottom - scrollerRect.top + scrollerEl.scrollTop + 5;
		const left = (contentRect?.left || scrollerRect.left) - scrollerRect.left;

		console.log('[Spark Inline Chat] Widget position:', {
			markerId: this.markerId,
			startMarkerFound: !!startMarkerLine,
			endMarkerFound: !!endMarkerLine,
			scrollTop: scrollerEl.scrollTop,
			calculatedTop: top,
			left,
		});

		return {
			top,
			left,
			parentElement: scrollerEl,
		};
	}

	/**
	 * Clean up markers from document (removes all lines between and including markers)
	 */
	private cleanupMarkers(editor: Editor): void {
		if (!this.markerId) {
			console.log('[Spark Inline Chat] No marker ID to clean up');
			return;
		}

		// Find the start and end marker lines
		const lineCount = editor.lineCount();
		let startLine = -1;
		let endLine = -1;

		for (let i = 0; i < lineCount; i++) {
			const line = editor.getLine(i);
			if (line.includes(`${this.markerId}-start`)) {
				startLine = i;
			} else if (line.includes(`${this.markerId}-end`)) {
				endLine = i;
				break; // Found both, stop searching
			}
		}

		console.log('[Spark Inline Chat] Cleanup markers:', {
			markerId: this.markerId,
			startLine,
			endLine,
			totalLines: lineCount,
		});

		if (startLine === -1 || endLine === -1) {
			console.warn('[Spark Inline Chat] Could not find markers to clean up');
			return;
		}

		// Remove all lines from start to end (inclusive)
		// We need to remove from end to start to avoid line number shifting
		for (let i = endLine; i >= startLine; i--) {
			editor.replaceRange('', { line: i, ch: 0 }, { line: i + 1, ch: 0 });
		}

		console.log('[Spark Inline Chat] Cleaned up markers successfully');
	}

	/**
	 * Handle send button click
	 */
	private handleSend(message: string): void {
		if (!this.currentEditor || !this.currentMention) {
			return;
		}

		console.log('[Spark Inline Chat] Send clicked', {
			agent: this.currentMention.agentName,
			message,
		});

		// Get current file path
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('Error: No active file');
			return;
		}

		// Generate UUID for daemon tracking
		const uuid = window.crypto.randomUUID();

		// Track this pending chat for completion detection
		this.pendingChats.set(uuid, {
			uuid,
			filePath: activeFile.path,
			agentName: this.currentMention.agentName,
			timestamp: Date.now(),
		});

		console.log('[Spark Inline Chat] Tracking pending chat:', {
			uuid,
			filePath: activeFile.path,
			totalPending: this.pendingChats.size,
		});

		// Extract clean user message (remove @agent prefix)
		const cleanMessage = message.replace(/^@\w+\s*/, '').trim();
		this.currentUserMessage = cleanMessage;

		// Transform widget to processing state first (so we can measure its height)
		if (this.activeWidget) {
			this.activeWidget.transformToProcessing(cleanMessage);

			// Wait for DOM to update, then calculate needed newlines
			window.setTimeout(() => {
				if (this.activeWidget && this.currentEditor) {
					// Get widget height and calculate lines needed
					const widgetHeight = this.activeWidget.getHeight();
					// Assume ~22px per line in editor (typical line height)
					const linesNeeded = Math.ceil(widgetHeight / 22);

					// Replace markers with calculated newlines
					this.replacMarkersWithFinalFormat(this.currentEditor, message, uuid, linesNeeded);
				}
			}, 10);
		} else {
			// Fallback if no widget (shouldn't happen)
			this.replacMarkersWithFinalFormat(this.currentEditor, message, uuid);
		}

		// Show notification
		new Notice(`Message sent to @${this.currentMention.agentName}`);

		// Don't reset state yet - keep widget visible in processing mode
		// State will be reset when completion is detected in handleFileModify()
	}

	/**
	 * Replace positioning markers with final daemon-readable format
	 * Converts: <!-- spark-inline-{id}-start --> ... <!-- spark-inline-{id}-end -->
	 * To: <!-- spark-inline-chat:pending:uuid --> User: message <!-- /spark-inline-chat -->
	 * Plus empty lines to make space for the widget
	 */
	private replacMarkersWithFinalFormat(
		editor: Editor,
		userMessage: string,
		uuid: string,
		linesNeeded: number = 3
	): void {
		if (!this.markerId) {
			console.warn('[Spark Inline Chat] No marker ID to replace');
			return;
		}

		// Find the start and end marker lines
		const lineCount = editor.lineCount();
		let startLine = -1;
		let endLine = -1;

		for (let i = 0; i < lineCount; i++) {
			const line = editor.getLine(i);
			if (line.includes(`${this.markerId}-start`)) {
				startLine = i;
			} else if (line.includes(`${this.markerId}-end`)) {
				endLine = i;
				break;
			}
		}

		if (startLine === -1 || endLine === -1) {
			console.warn('[Spark Inline Chat] Could not find markers to replace');
			return;
		}

		// Extract user message (remove @agent prefix if present)
		const cleanMessage = userMessage.replace(/^@\w+\s*/, '').trim();

		// Build final marker format with agent and user message encoded in the comment
		// This keeps it hidden from view while still parseable by the daemon
		// Format: <!-- spark-inline-chat:pending:uuid:agentName:message -->
		// Escape newlines in message so it fits in a single-line HTML comment
		const agentName = this.currentMention?.agentName || '';
		const escapedMessage = cleanMessage.replace(/\n/g, '\\n');
		const openingMarker = `<!-- spark-inline-chat:pending:${uuid}:${agentName}:${escapedMessage} -->`;
		const closingMarker = `<!-- /spark-inline-chat -->`;

		// Add newlines to make space for the widget (so it doesn't overlap text)
		const newlines = '\n'.repeat(Math.max(linesNeeded - 1, 2)); // At least 2 lines
		const finalContent = `${openingMarker}\n${newlines}${closingMarker}`;

		console.log('[Spark Inline Chat] Replacing markers:', {
			startLine,
			endLine,
			uuid,
			agentName,
			markerId: this.markerId,
			linesNeeded,
		});

		// Replace all lines between start and end (inclusive) with final format
		editor.replaceRange(
			finalContent + '\n',
			{ line: startLine, ch: 0 },
			{ line: endLine + 1, ch: 0 }
		);

		console.log('[Spark Inline Chat] Markers replaced successfully');
	}

	/**
	 * Handle cancel button click
	 */
	private handleCancel(): void {
		console.log('[Spark Inline Chat] Cancel clicked');

		// Hide widget first (to prevent visual glitches)
		if (this.activeWidget) {
			this.activeWidget.hide();
			this.activeWidget = null;
		}

		// Clean up markers and blank lines
		if (this.currentEditor && this.markerId) {
			this.cleanupMarkers(this.currentEditor);
		}

		// Keep the mention removed (don't restore it)

		// Reset state
		this.resetState();
	}

	/**
	 * Reset internal state
	 */
	private resetState(): void {
		this.currentMention = null;
		this.currentEditor = null;
		this.originalMentionText = '';
		this.mentionLineNumber = -1;
		this.insertedBlankLines = 0;
		this.markerId = '';
		this.currentUserMessage = '';
		this.currentFilePath = '';
	}

	/**
	 * Scan all files and clean up orphaned markers from previous sessions
	 * Called on plugin initialization to handle crashes/force quits
	 */
	private async cleanupOrphanedMarkers(): Promise<void> {
		const markdownFiles = this.app.vault.getMarkdownFiles();

		for (const file of markdownFiles) {
			try {
				const content = await this.app.vault.read(file);

				// Check if file has any inline chat markers
				const hasTempMarkers = /<!--\s*spark-inline-[\w-]+-start\s*-->/.test(content);
				const hasDaemonMarkers = /<!--\s*spark-inline-chat:pending:/.test(content);

				if (hasTempMarkers || hasDaemonMarkers) {
					await this.cleanupMarkersFromFile(file.path);
				}
			} catch (error) {
				console.error('[Spark Inline Chat] Error scanning file:', file.path, error);
			}
		}
	}

	/**
	 * Remove all inline chat markers from a file (both temporary and daemon format)
	 * This ensures files are never left in a corrupted state
	 */
	private async cleanupMarkersFromFile(filePath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file) {
			return;
		}

		try {
			// Read file content
			const content = await this.app.vault.read(file as TFile);
			let modifiedContent = content;

			// Pattern 1: Remove temporary positioning markers and content between them
			// Format: <!-- spark-inline-{id}-start --> ... <!-- spark-inline-{id}-end -->
			const tempMarkerPattern =
				/<!--\s*spark-inline-[\w-]+-start\s*-->\n[\s\S]*?<!--\s*spark-inline-[\w-]+-end\s*-->\n?/g;
			modifiedContent = modifiedContent.replace(tempMarkerPattern, '');

			// Pattern 2: Remove daemon format markers and content between them
			// Format: <!-- spark-inline-chat:pending:uuid:agent:message --> ... <!-- /spark-inline-chat -->
			const daemonMarkerPattern =
				/<!--\s*spark-inline-chat:pending:[\w-]+:[^>]+\s*-->\n[\s\S]*?<!--\s*\/spark-inline-chat\s*-->\n?/g;
			modifiedContent = modifiedContent.replace(daemonMarkerPattern, '');

			// Write back if we made changes
			if (modifiedContent !== content) {
				await this.app.vault.modify(file as TFile, modifiedContent);
			}
		} catch (error) {
			console.error('[Spark Inline Chat] Error cleaning up markers:', error);
		}
	}

	/**
	 * Cleanup when plugin unloads
	 * Removes all markers to prevent leaving files in corrupted state
	 */
	async cleanup(): Promise<void> {
		// Hide widget first
		this.hideWidget();

		// Clean up markers from current file if any
		if (this.currentFilePath) {
			await this.cleanupMarkersFromFile(this.currentFilePath);
		}

		// Clean up markers from all pending chat files
		const pendingFiles = new Set(Array.from(this.pendingChats.values()).map(chat => chat.filePath));
		for (const filePath of pendingFiles) {
			await this.cleanupMarkersFromFile(filePath);
		}

		// Unregister editor change handler
		if (this.editorChangeHandler) {
			this.app.workspace.off('editor-change', this.editorChangeHandler);
			this.editorChangeHandler = null;
		}

		// Unregister file modification handler
		if (this.fileModifyHandler) {
			this.app.vault.off('modify', this.fileModifyHandler);
			this.fileModifyHandler = null;
		}

		// Unregister agent mention complete handler
		if (this.agentMentionCompleteHandler) {
			document.removeEventListener(
				'spark-agent-mention-complete',
				this.agentMentionCompleteHandler
			);
			this.agentMentionCompleteHandler = null;
		}

		// Clear pending chats
		this.pendingChats.clear();
	}
}
