/**
 * Floating input widget for inline chat
 */

import type { App } from 'obsidian';

export interface InlineChatWidgetOptions {
	/** Agent name to display */
	agentName: string;
	/** Initial message (pre-populated in textarea) */
	initialMessage?: string;
	/** Callback when user clicks send */
	onSend: (message: string) => void;
	/** Callback when user clicks cancel or dismisses */
	onCancel: () => void;
	/** Top position in pixels */
	top: number;
	/** Left position in pixels */
	left: number;
	/** Parent element to attach widget to (for proper scrolling) */
	parentElement?: HTMLElement;
}

export class InlineChatWidget {
	private app: App;
	private containerEl: HTMLElement | null = null;
	private textareaEl: HTMLTextAreaElement | null = null;
	private sendButtonEl: HTMLButtonElement | null = null;
	private options: InlineChatWidgetOptions;

	constructor(app: App, options: InlineChatWidgetOptions) {
		this.app = app;
		this.options = options;
	}

	/**
	 * Show the widget
	 */
	show(): void {
		if (this.containerEl) {
			return; // Already showing
		}

		this.containerEl = this.createWidget();

		// Append to parent element (editor container) instead of document.body
		// This makes it scroll with the document
		const parent = this.options.parentElement || document.body;
		parent.appendChild(this.containerEl);

		// Set initial message if provided
		if (this.textareaEl && this.options.initialMessage) {
			this.textareaEl.value = this.options.initialMessage;
			// Move cursor to end
			this.textareaEl.selectionStart = this.textareaEl.value.length;
			this.textareaEl.selectionEnd = this.textareaEl.value.length;
		}

		// Focus textarea after a brief delay to ensure DOM is ready
		window.setTimeout(() => {
			this.textareaEl?.focus();
			this.autoResizeTextarea();
		}, 10);
	}

	/**
	 * Hide the widget
	 */
	hide(): void {
		if (this.containerEl) {
			this.containerEl.remove();
			this.containerEl = null;
			this.textareaEl = null;
			this.sendButtonEl = null;
		}
	}

	/**
	 * Check if widget is visible
	 */
	isVisible(): boolean {
		return this.containerEl !== null;
	}

	/**
	 * Create the widget DOM structure (Cursor-style)
	 */
	private createWidget(): HTMLElement {
		const container = document.createElement('div');
		container.addClass('spark-inline-chat-widget');
		container.style.position = 'absolute';
		container.style.top = `${this.options.top}px`;
		container.style.left = `${this.options.left}px`;

		// Main content area with textarea and buttons in one container
		const mainContent = container.createDiv('spark-inline-chat-content');

		// Textarea with agent mention pre-populated
		this.textareaEl = mainContent.createEl('textarea', {
			cls: 'spark-inline-chat-textarea',
			attr: {
				placeholder: `Ask @${this.options.agentName}...`,
				rows: '1',
			},
		});

		// Handle Enter key (Cmd/Ctrl+Enter to send, Shift+Enter for newline)
		this.textareaEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				e.stopPropagation();
				console.log('[InlineChatWidget] Cmd+Enter pressed, sending...');
				this.handleSend();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				console.log('[InlineChatWidget] Escape pressed, cancelling...');
				this.options.onCancel();
			}
		});

		// Auto-resize textarea as user types
		this.textareaEl.addEventListener('input', () => {
			this.autoResizeTextarea();
		});

		// Action buttons row
		const actionsRow = mainContent.createDiv('spark-inline-chat-actions');

		// Helper text
		const helperText = actionsRow.createDiv('spark-inline-chat-helper');
		helperText.setText('⌘↵ to send, Esc to cancel');

		// Buttons container
		const buttonsContainer = actionsRow.createDiv('spark-inline-chat-buttons');

		const cancelButton = buttonsContainer.createEl('button', {
			cls: 'spark-inline-chat-button spark-inline-chat-button-cancel',
			text: 'Cancel',
		});
		cancelButton.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			console.log('[InlineChatWidget] Cancel button clicked');
			this.options.onCancel();
		});

		this.sendButtonEl = buttonsContainer.createEl('button', {
			cls: 'spark-inline-chat-button spark-inline-chat-button-send',
			text: 'Send',
		});
		this.sendButtonEl.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			console.log('[InlineChatWidget] Send button clicked');
			this.handleSend();
		});

		// Click outside to close
		window.setTimeout(() => {
			const handleClickOutside = (e: MouseEvent) => {
				if (this.containerEl && !this.containerEl.contains(e.target as Node)) {
					console.log('[InlineChatWidget] Clicked outside, cancelling...');
					this.options.onCancel();
					document.removeEventListener('mousedown', handleClickOutside);
				}
			};
			document.addEventListener('mousedown', handleClickOutside);
		}, 100);

		return container;
	}

	/**
	 * Handle send action
	 */
	private handleSend(): void {
		console.log('[InlineChatWidget] handleSend called');
		if (!this.textareaEl) {
			console.log('[InlineChatWidget] No textarea element');
			return;
		}

		const message = this.textareaEl.value.trim();
		console.log('[InlineChatWidget] Message:', message);

		if (message.length === 0) {
			console.log('[InlineChatWidget] Empty message, not sending');
			return; // Don't send empty messages
		}

		console.log('[InlineChatWidget] Calling onSend callback');
		this.options.onSend(message);
	}

	/**
	 * Auto-resize textarea based on content
	 */
	private autoResizeTextarea(): void {
		if (!this.textareaEl) return;

		// Reset height to recalculate
		this.textareaEl.style.height = 'auto';

		// Set to scroll height (content height)
		const newHeight = Math.min(this.textareaEl.scrollHeight, 200); // Max 200px
		this.textareaEl.style.height = `${newHeight}px`;
	}

	/**
	 * Update widget position (useful if editor scrolls)
	 */
	updatePosition(top: number, left: number): void {
		if (this.containerEl) {
			this.containerEl.style.top = `${top}px`;
			this.containerEl.style.left = `${left}px`;
		}
	}
}
