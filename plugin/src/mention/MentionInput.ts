import type { App } from 'obsidian';
import { ChatMentionHandler } from './ChatMentionHandler';
import type { MentionDecorator } from './MentionDecorator';

export interface MentionInputOptions {
	/** Placeholder text */
	placeholder: string;
	/** Callback when content changes */
	onChange?: () => void;
	/** Callback when Enter is pressed (without Shift) */
	onSubmit?: () => void;
	/** Callback when Escape is pressed */
	onEscape?: () => void;
	/** Allow multi-line input (Shift+Enter for newline) */
	multiLine?: boolean;
	/** Enable clicking mentions to open files/chat (default: true) */
	enableMentionClick?: boolean;
	/** Initial content */
	initialContent?: string;
	/** Container element for palette positioning (optional) */
	paletteContainer?: HTMLElement;
}

/**
 * Reusable mention-capable input component
 * Uses contenteditable div with full mention decoration and command palette support
 */
export class MentionInput {
	private app: App;
	private mentionDecorator: MentionDecorator;
	private options: MentionInputOptions;
	private inputEl: HTMLDivElement | null = null;
	private mentionHandler: ChatMentionHandler | null = null;

	constructor(app: App, mentionDecorator: MentionDecorator, options: MentionInputOptions) {
		this.app = app;
		this.mentionDecorator = mentionDecorator;
		this.options = options;
	}

	/**
	 * Create and attach the input element
	 * Returns the contenteditable div element
	 */
	create(): HTMLDivElement {
		// Create contenteditable div
		this.inputEl = document.createElement('div');
		this.inputEl.className = 'spark-mention-input';
		this.inputEl.contentEditable = 'true';
		this.inputEl.setAttribute('data-placeholder', this.options.placeholder);
		this.inputEl.setAttribute('data-empty', 'true');

		// Set initial content if provided
		if (this.options.initialContent) {
			this.inputEl.textContent = this.options.initialContent;
			this.inputEl.setAttribute('data-empty', 'false');
		}

		// Create and attach mention handler
		this.mentionHandler = new ChatMentionHandler(this.app, this.mentionDecorator);
		void this.mentionHandler.initialize();
		this.mentionHandler.attachToInput(this.inputEl, this.options.paletteContainer);

		// Setup event listeners
		this.setupEventListeners();

		return this.inputEl;
	}

	/**
	 * Setup input event listeners
	 */
	private setupEventListeners(): void {
		if (!this.inputEl) return;

		// Handle input changes for placeholder
		this.inputEl.addEventListener('input', () => {
			if (!this.inputEl) return;

			// Check if input is empty
			const text = this.inputEl.textContent?.replace(/\u200B/g, '').trim() || '';
			const isEmpty = text.length === 0;

			// Clear completely if empty (for proper placeholder display)
			if (isEmpty && this.inputEl.textContent !== '') {
				this.inputEl.textContent = '';
			}

			this.inputEl.setAttribute('data-empty', isEmpty ? 'true' : 'false');

			// Call onChange callback
			this.options.onChange?.();
		});

		// Handle keyboard shortcuts
		this.inputEl.addEventListener('keydown', e => this.handleKeydown(e));

		// Handle paste to strip formatting
		this.inputEl.addEventListener('paste', e => {
			e.preventDefault();
			const text = e.clipboardData?.getData('text/plain') || '';
			this.insertTextAtCursor(text);
		});
	}

	/**
	 * Insert text at the current cursor position
	 */
	private insertTextAtCursor(text: string): void {
		if (!this.inputEl) return;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			// No selection, append to end
			this.inputEl.textContent = (this.inputEl.textContent || '') + text;
			return;
		}

		const range = selection.getRangeAt(0);
		range.deleteContents();
		const textNode = document.createTextNode(text);
		range.insertNode(textNode);

		// Position cursor after inserted text
		range.setStartAfter(textNode);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);

		// Trigger onChange
		this.options.onChange?.();
	}

	private handleKeydown(e: KeyboardEvent): void {
		// Let mention handler deal with palette first
		if (e.defaultPrevented) return;

		if (e.key === 'Enter') {
			if (e.shiftKey && this.options.multiLine) {
				e.preventDefault();
				this.insertLineBreakAtCursor();
				return;
			}

			e.preventDefault();
			this.options.onSubmit?.();
			return;
		}

		if (e.key === 'Escape') {
			e.preventDefault();
			this.options.onEscape?.();
		}
	}

	private insertLineBreakAtCursor(): void {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const range = selection.getRangeAt(0);
		range.deleteContents();

		// Insert <br>
		const br = document.createElement('br');
		range.insertNode(br);

		// Insert zero-width space after BR for cursor positioning
		const zwsp = document.createTextNode('\u200B');
		if (br.nextSibling) {
			br.parentNode?.insertBefore(zwsp, br.nextSibling);
		} else {
			br.parentNode?.appendChild(zwsp);
		}

		// Position cursor
		const newRange = document.createRange();
		newRange.setStart(zwsp, 0);
		newRange.setEnd(zwsp, 0);
		selection.removeAllRanges();
		selection.addRange(newRange);

		// Trigger onChange
		this.options.onChange?.();
	}

	/**
	 * Get the plain text content
	 */
	getText(): string {
		return this.inputEl?.textContent || '';
	}

	/**
	 * Set the text content
	 */
	setText(text: string): void {
		if (!this.inputEl) return;

		this.inputEl.textContent = text;
		this.inputEl.setAttribute('data-empty', text.trim().length === 0 ? 'true' : 'false');

		// Process content to apply mention styling
		this.mentionHandler?.processContent();
	}

	/**
	 * Clear the input
	 */
	clear(): void {
		if (!this.inputEl) return;

		this.inputEl.textContent = '';
		this.inputEl.setAttribute('data-empty', 'true');
	}

	/**
	 * Focus the input
	 */
	focus(): void {
		this.inputEl?.focus();
	}

	/**
	 * Focus and position cursor at the end
	 */
	focusEnd(): void {
		if (!this.inputEl) return;

		this.inputEl.focus();

		// Position cursor at the end
		const selection = window.getSelection();
		if (!selection) return;

		const range = document.createRange();
		range.selectNodeContents(this.inputEl);
		range.collapse(false); // false = collapse to end
		selection.removeAllRanges();
		selection.addRange(range);
	}

	/**
	 * Get the input element
	 */
	getElement(): HTMLDivElement | null {
		return this.inputEl;
	}

	/**
	 * Refresh mentions (call when agents/commands change)
	 */
	async refresh(): Promise<void> {
		await this.mentionHandler?.refresh();
	}

	/**
	 * Destroy and cleanup
	 */
	destroy(): void {
		this.mentionHandler?.destroy();
		this.mentionHandler = null;
		this.inputEl = null;
	}
}
