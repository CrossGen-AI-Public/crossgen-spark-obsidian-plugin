/**
 * Manager for inline chat functionality
 * Orchestrates detection, widget display, and marker writing
 */

import type { App, Editor, TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { InlineChatDetector } from './InlineChatDetector';
import { InlineChatWidget } from './InlineChatWidget';
import type { DetectedAgentMention } from './types';
import type { MentionDecorator } from '../mention/MentionDecorator';
import { ResultWriter } from '../services/ResultWriter';
import {
	AGENT_PREFIX_REGEX,
	INLINE_CHAT_START_MARKER_REGEX,
	INLINE_CHAT_PENDING_MARKER_REGEX,
} from '../constants';

interface PendingChat {
	uuid: string;
	filePath: string;
	agentName: string;
	timestamp: number;
}

export class InlineChatManager {
	private static instance: InlineChatManager;
	private app: App;
	private mentionDecorator: MentionDecorator;
	private detector: InlineChatDetector;
	private activeWidget: InlineChatWidget | null = null;
	private currentMention: DetectedAgentMention | null = null;
	private currentEditor: Editor | null = null;
	private editorChangeHandler: ((editor: Editor) => void) | null = null;
	private markerId: string = ''; // Unique ID for this inline chat instance
	private pendingChats: Map<string, PendingChat> = new Map(); // Track chats waiting for daemon
	private fileModifyHandler: ((file: TFile) => void) | null = null;
	private agentMentionCompleteHandler: EventListener | null = null;
	private currentFilePath: string = ''; // Track current file with active markers
	private isAdjustingContent: boolean = false; // Track when we're programmatically modifying content

	private constructor(app: App, mentionDecorator: MentionDecorator) {
		this.app = app;
		this.mentionDecorator = mentionDecorator;
		this.detector = new InlineChatDetector(app);
	}

	public static getInstance(app: App, mentionDecorator: MentionDecorator): InlineChatManager {
		if (!InlineChatManager.instance) {
			InlineChatManager.instance = new InlineChatManager(app, mentionDecorator);
		}
		return InlineChatManager.instance;
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
			void this.handleAgentMentionComplete(evt.detail);
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
		// Ignore changes we're making ourselves (adjusting blank lines, inserting markers, etc.)
		if (this.isAdjustingContent) {
			return;
		}

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
	private async handleAgentMentionComplete(detail: {
		agentName: string;
		editor: Editor;
		line: number;
	}): Promise<void> {
		const { agentName, editor, line } = detail;

		// Check if already has marker (don't show widget if already processed)
		if (this.detector.hasExistingMarker(editor, line)) {
			return;
		}

		// Validate agent
		if (!(await this.detector.isValidAgent(agentName))) {
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

				// Hide the processing widget if it's for this chat
				if (this.activeWidget?.isVisible()) {
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
				// Clean up markers from the file
				void ResultWriter.getInstance(this.app).cleanupMarkersFromFile(chat.filePath);

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

		// Generate unique marker ID
		this.markerId = `spark-inline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		// Set flag to ignore editor change events from our modifications
		this.isAdjustingContent = true;

		// Remove @agent from the file
		const lineContent = editor.getLine(mention.line);
		const agentPattern = new RegExp(`@${mention.agentName}\\s*`);
		const cleanedLine = lineContent.replace(agentPattern, '').trim();
		editor.setLine(mention.line, cleanedLine);

		// Insert markers with minimal blank lines (will be adjusted based on widget height)
		const insertPosition = { line: mention.line + 1, ch: 0 };
		const markerStart = `<!-- ${this.markerId}-start -->\n`;
		const blankLines = '\n\n\n'; // 3 blank lines initially (will be adjusted dynamically)
		const markerEnd = `<!-- ${this.markerId}-end -->`;
		const insertText = `${markerStart + blankLines + markerEnd}\n`;

		editor.replaceRange(insertText, insertPosition);

		// Track if the line was empty after removing mention (for positioning adjustment)
		const lineWasEmpty = cleanedLine.length === 0;

		// Wait for DOM to update, then position widget
		window.setTimeout(() => {
			const position = this.calculateWidgetPosition(editor);
			if (!position) {
				console.warn('[Spark Inline Chat] Could not calculate widget position');
				this.cleanupMarkers(editor);
				return;
			}

			// If the line was empty, adjust position up by one line height (21px)
			// so widget appears at the empty line, not below it
			const adjustedTop = lineWasEmpty ? position.top - 21 : position.top;

			// Create and show widget (no initial message, agent is stored separately)
			this.activeWidget = new InlineChatWidget(this.app, {
				agentName: mention.agentName,
				onSend: message => this.handleSend(message),
				onCancel: () => this.handleCancel(),
				onHeightChange: height => this.adjustBlankLines(height),
				top: adjustedTop,
				left: position.left,
				parentElement: position.parentElement,
				mentionDecorator: this.mentionDecorator,
			});

			this.activeWidget.show();

			// Reset flag after widget is shown and initial height adjustment is done
			// Widget calls notifyHeightChange after 10ms, so wait a bit longer
			window.setTimeout(() => {
				this.isAdjustingContent = false;
			}, 100);
		}, 50);
	}

	/**
	 * Hide the widget and clean up temporary markers
	 */
	private hideWidget(): void {
		if (this.activeWidget) {
			this.activeWidget.hide();
			this.activeWidget = null;
		}

		// Clean up temporary markers if we have them
		// Note: After sending, these markers are already replaced with final format,
		// so cleanupMarkers will just do nothing (no markers found)
		if (this.currentEditor && this.markerId) {
			this.cleanupMarkers(this.currentEditor);
		}
	}

	/**
	 * Adjust blank lines between markers to match widget height
	 */
	private adjustBlankLines(widgetHeight: number): void {
		if (!this.currentEditor || !this.markerId) {
			return;
		}

		// Calculate needed lines (font-size: 14px * line-height: 1.5 = 21px per line)
		// Subtract 1 because we need one less line than the height suggests
		const linesNeeded = Math.ceil(widgetHeight / 21) - 1;

		// Find the marker positions in the document
		const content = this.currentEditor.getValue();
		const startMarker = `<!-- ${this.markerId}-start -->`;
		const endMarker = `<!-- ${this.markerId}-end -->`;

		const startIndex = content.indexOf(startMarker);
		const endIndex = content.indexOf(endMarker);

		if (startIndex === -1 || endIndex === -1) {
			return; // Markers not found
		}

		// Find line numbers for markers
		let startLine = 0;
		let endLine = 0;
		let charCount = 0;

		const lines = content.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const lineLength = lines[i].length + 1; // +1 for newline

			if (charCount + lineLength > startIndex && startLine === 0) {
				startLine = i;
			}
			if (charCount + lineLength > endIndex && endLine === 0) {
				endLine = i;
				break;
			}

			charCount += lineLength;
		}

		// Replace content between markers with correct number of blank lines
		const newBlankLines = '\n'.repeat(linesNeeded);
		const from = { line: startLine + 1, ch: 0 };
		const to = { line: endLine, ch: 0 };

		// Set flag to ignore editor change events from this modification
		this.isAdjustingContent = true;
		this.currentEditor.replaceRange(newBlankLines, from, to);
		// Reset flag after a brief delay to ensure the change event has been processed
		window.setTimeout(() => {
			this.isAdjustingContent = false;
		}, 50);
	}

	/**
	 * Calculate position for widget using invisible marker placeholders
	 */
	private calculateWidgetPosition(
		editor: Editor
	): { top: number; left: number; parentElement: HTMLElement } | null {
		// Get editor container (CodeMirror 6 structure)
		// biome-ignore lint/suspicious/noExplicitAny: CodeMirror internal property access
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
		ResultWriter.getInstance(this.app).cleanupMarkersFromEditor(editor, this.markerId);
	}

	/**
	 * Handle send button click
	 */
	private handleSend(message: string): void {
		if (!this.currentEditor || !this.currentMention) {
			return;
		}

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

		// Extract clean user message (remove @agent prefix)
		const cleanMessage = message.replace(AGENT_PREFIX_REGEX, '').trim();

		// Transform widget to processing state first (so we can measure its height)
		if (this.activeWidget) {
			this.activeWidget.transformToProcessing(cleanMessage);

			// Wait for DOM to update, then calculate needed newlines
			window.setTimeout(() => {
				if (this.activeWidget && this.currentEditor) {
					// Get widget height and calculate lines needed
					const widgetHeight = this.activeWidget.getHeight();
					// font-size: 14px * line-height: 1.5 = 21px per line
					// Subtract 1 because we need one less line than the height suggests
					const linesNeeded = Math.ceil(widgetHeight / 21);

					// Replace markers with calculated newlines
					ResultWriter.getInstance(this.app).replaceMarkersWithFinalFormat(
						this.currentEditor,
						this.markerId,
						this.currentMention?.agentName || '',
						message,
						uuid,
						linesNeeded
					);
				}
			}, 10);
		} else {
			// Fallback if no widget (shouldn't happen)
			ResultWriter.getInstance(this.app).replaceMarkersWithFinalFormat(
				this.currentEditor,
				this.markerId,
				this.currentMention?.agentName || '',
				message,
				uuid
			);
		}

		// Show notification
		new Notice(`Message sent to @${this.currentMention.agentName}`);

		// Don't reset state yet - keep widget visible in processing mode
		// State will be reset when completion is detected in handleFileModify()
	}

	/**
	 * Handle cancel button click
	 */
	private handleCancel(): void {
		// Hide widget first (to prevent visual glitches)
		if (this.activeWidget) {
			this.activeWidget.hide();
			this.activeWidget = null;
		}

		// Clean up markers and blank lines
		if (this.currentEditor && this.markerId) {
			this.cleanupMarkers(this.currentEditor);
		}

		// Return focus to editor
		if (this.currentEditor) {
			this.currentEditor.focus();
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
		this.markerId = '';
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
				const hasTempMarkers = INLINE_CHAT_START_MARKER_REGEX.test(content);
				const hasDaemonMarkers = INLINE_CHAT_PENDING_MARKER_REGEX.test(content);

				if (hasTempMarkers || hasDaemonMarkers) {
					await ResultWriter.getInstance(this.app).cleanupMarkersFromFile(file.path);
				}
			} catch (error) {
				console.error('[Spark Inline Chat] Error scanning file:', file.path, error);
			}
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
			await ResultWriter.getInstance(this.app).cleanupMarkersFromFile(this.currentFilePath);
		}

		// Clean up markers from all pending chat files
		const pendingFiles = new Set(Array.from(this.pendingChats.values()).map(chat => chat.filePath));
		for (const filePath of pendingFiles) {
			await ResultWriter.getInstance(this.app).cleanupMarkersFromFile(filePath);
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
