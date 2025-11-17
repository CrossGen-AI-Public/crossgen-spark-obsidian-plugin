/**
 * Manager for inline chat functionality
 * Orchestrates detection, widget display, and marker writing
 */

import type { App, Editor } from 'obsidian';
import { Notice } from 'obsidian';
import { InlineChatDetector } from './InlineChatDetector';
import { InlineChatWidget } from './InlineChatWidget';
import type { DetectedAgentMention } from './types';

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

	constructor(app: App) {
		this.app = app;
		this.detector = new InlineChatDetector();
	}

	/**
	 * Initialize the manager and register event handlers
	 * Call this during plugin load
	 */
	initialize(): void {
		console.log('[Spark Inline Chat] Initialized');

		// Create editor change handler
		this.editorChangeHandler = (editor: Editor) => {
			this.handleEditorChange(editor);
		};

		// Register with workspace
		this.app.workspace.on('editor-change', this.editorChangeHandler);
	}

	/**
	 * Handle editor change event
	 * Call this from plugin's EditorChange event
	 */
	handleEditorChange(editor: Editor): void {
		// Detect agent mention at cursor
		const mention = this.detector.detectAgentMention(editor);

		// If no mention, hide widget if showing
		if (!mention) {
			if (this.activeWidget?.isVisible()) {
				this.hideWidget();
			}
			return;
		}

		// Check if already has marker (don't show widget if already processed)
		if (this.detector.hasExistingMarker(editor, mention.line)) {
			return;
		}

		// Validate agent
		if (!this.detector.isValidAgent(mention.agentName)) {
			return;
		}

		// If same mention as before, don't recreate widget
		if (
			this.currentMention &&
			this.currentMention.agentName === mention.agentName &&
			this.currentMention.line === mention.line
		) {
			return;
		}

		// New mention detected - show widget
		this.currentMention = mention;
		this.currentEditor = editor;
		this.showWidget(editor, mention);
	}

	/**
	 * Show the inline chat widget
	 */
	private showWidget(editor: Editor, mention: DetectedAgentMention): void {
		// Hide existing widget if any
		this.hideWidget();

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

			// Create and show widget with @agent pre-populated
			this.activeWidget = new InlineChatWidget(this.app, {
				agentName: mention.agentName,
				initialMessage: `@${mention.agentName} `,
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

		// TODO Step 2: Insert marker and user message
		// For now, just log and hide widget
		// Will implement in Step 2:
		// 1. Generate unique ID
		// 2. Insert marker after @agent line
		// 3. Insert user message
		// 4. Close widget

		this.hideWidget();

		// Show temporary notification
		new Notice(`Inline chat: Message sent to @${this.currentMention.agentName}`);
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
		this.currentMention = null;
		this.currentEditor = null;
		this.originalMentionText = '';
		this.mentionLineNumber = -1;
		this.insertedBlankLines = 0;
		this.markerId = '';
	}

	/**
	 * Cleanup when plugin unloads
	 */
	cleanup(): void {
		this.hideWidget();

		// Unregister editor change handler
		if (this.editorChangeHandler) {
			this.app.workspace.off('editor-change', this.editorChangeHandler);
			this.editorChangeHandler = null;
		}
	}
}
