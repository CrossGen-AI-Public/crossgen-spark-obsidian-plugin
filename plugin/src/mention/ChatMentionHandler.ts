import type { App, TFile } from 'obsidian';
import type { MentionDecorator } from './MentionDecorator';
import { PaletteView } from '../command-palette/PaletteView';
import { ItemLoader } from '../command-palette/ItemLoader';
import { FuzzyMatcher } from '../command-palette/FuzzyMatcher';
import type { PaletteItem } from '../types/command-palette';
import { ResourceService } from '../services/ResourceService';

/**
 * Manages mentions and commands in the chat input
 * Adapts the command palette's mention system for chat use
 */
export class ChatMentionHandler {
	private app: App;
	private mentionDecorator: MentionDecorator;
	private inputElement: HTMLDivElement | null = null;
	private isProcessing = false;
	private paletteView: PaletteView;
	private itemLoader: ItemLoader;
	private fuzzyMatcher: FuzzyMatcher;
	private resourceService: ResourceService;
	private currentTrigger: { char: string; position: number } | null = null;
	private chatContainer: HTMLElement | null = null;

	constructor(app: App, mentionDecorator: MentionDecorator) {
		this.app = app;
		this.mentionDecorator = mentionDecorator;
		this.paletteView = new PaletteView();
		this.itemLoader = new ItemLoader(app);
		this.fuzzyMatcher = new FuzzyMatcher();
		this.resourceService = ResourceService.getInstance(app);
	}

	/**
	 * Initialize the mention handler
	 * Note: mentionDecorator should already be initialized by the plugin
	 */
	async initialize(): Promise<void> {
		// mentionDecorator is already initialized by the plugin
		// No need to initialize again
	}

	/**
	 * Attach to chat input element (contenteditable div)
	 */
	attachToInput(inputElement: HTMLDivElement, chatContainer?: HTMLElement): void {
		this.inputElement = inputElement;
		this.chatContainer = chatContainer || null;
		this.setupInputEventListeners();
	}

	/**
	 * Setup event listeners for the input
	 */
	private setupInputEventListeners(): void {
		if (!this.inputElement) return;

		// Handle input changes for mention decoration
		this.inputElement.addEventListener('input', this.handleInput.bind(this));

		// Handle clicks on mentions
		this.inputElement.addEventListener('click', this.handleClick.bind(this));

		// Process on focus (in case agents/commands changed)
		this.inputElement.addEventListener('focus', this.handleFocus.bind(this));

		// Handle keyboard navigation for palette
		this.inputElement.addEventListener('keydown', this.handleKeydown.bind(this));

		// Listen for palette selection
		document.addEventListener('spark-palette-select', this.handlePaletteSelection.bind(this));
	}

	/**
	 * Handle keydown for palette navigation
	 */
	private handleKeydown(event: KeyboardEvent): void {
		if (!this.paletteView.isVisible()) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				event.stopPropagation();
				this.paletteView.selectNext();
				break;
			case 'ArrowUp':
				event.preventDefault();
				event.stopPropagation();
				this.paletteView.selectPrevious();
				break;
			case 'Enter':
			case 'Tab':
				event.preventDefault();
				event.stopPropagation();
				this.selectCurrentPaletteItem();
				break;
			case 'Escape':
				event.preventDefault();
				event.stopPropagation();
				this.hidePalette();
				break;
		}
	}

	/**
	 * Select the currently highlighted palette item
	 */
	private selectCurrentPaletteItem(): void {
		const selectedItem = this.paletteView.getSelectedItem();
		if (selectedItem) {
			this.insertPaletteItem(selectedItem);
		}
	}

	/**
	 * Handle palette item selection (from click)
	 */
	private handlePaletteSelection(event: Event): void {
		// Only handle if our palette is visible
		if (!this.paletteView.isVisible()) return;

		const customEvent = event as CustomEvent;
		const item = customEvent.detail.item as PaletteItem;
		if (item) {
			this.insertPaletteItem(item);
		}
	}

	/**
	 * Insert selected palette item into input
	 */
	private insertPaletteItem(item: PaletteItem): void {
		if (!this.inputElement || !this.currentTrigger) return;

		// Use getTextWithLineBreaks to preserve newlines (not textContent which strips <br>)
		const text = this.getTextWithLineBreaks(this.inputElement);
		const triggerPos = this.currentTrigger.position;

		// Find end of current mention/command
		const cursorPos = this.getCursorTextPosition();

		// Build replacement text (use item.id to preserve lowercase)
		let itemName = item.id.substring(1); // Remove trigger character from ID
		// Remove trailing slash if present (folder IDs include it, we'll add it back)
		if (itemName.endsWith('/')) {
			itemName = itemName.slice(0, -1);
		}
		const prefix = item.type === 'command' ? '/' : '@';
		const suffix = item.type === 'folder' ? '/' : '';
		// Use non-breaking space (\u00A0) so it's preserved in HTML rendering
		const replacement = `${prefix}${itemName}${suffix}\u00A0`;

		// Replace text (preserving newlines)
		const before = text.substring(0, triggerPos);
		const after = text.substring(cursorPos);
		const newText = before + replacement + after;

		// Hide palette
		this.hidePalette();

		// Calculate cursor position BEFORE processing content
		const newCursorPos = triggerPos + replacement.length;

		// Update input with DOM APIs and apply styling
		const tokens = newText.includes('@') || newText.includes('/') ? this.findTokens(newText) : [];
		this.rebuildContentWithDOM(newText, tokens);

		// Set cursor after inserted item (after processing to account for HTML changes)
		this.setCursorPosition(newCursorPos);

		// Focus the input
		this.inputElement.focus();
	}

	/**
	 * Set cursor position in contenteditable
	 */
	private setCursorPosition(offset: number): void {
		if (!this.inputElement) return;

		const selection = window.getSelection();
		if (!selection) return;

		try {
			const range = this.createRangeAtOffset(this.inputElement, offset);
			if (range) {
				selection.removeAllRanges();
				selection.addRange(range);
			}
		} catch (error) {
			console.debug('Failed to set cursor:', error);
		}
	}

	/**
	 * Handle input changes and update mention decoration
	 */
	private handleInput(): void {
		if (!this.inputElement || this.isProcessing) return;

		// Always save cursor position before processing
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;

		const range = selection.getRangeAt(0);
		const cursorOffset = this.getCursorOffset(range);

		// Check for @@ pattern (current file shortcut) before palette trigger
		if (this.checkForCurrentFileMention()) {
			return; // @@ was handled, don't process further
		}

		// Check for palette trigger
		this.checkForPalette();

		// Process the content (returns true if HTML was modified)
		const contentModified = this.processContent();

		// Only restore cursor if we actually modified the HTML
		// (If no modification, browser's cursor is already correct)
		if (contentModified) {
			this.restoreCursor(cursorOffset);
		}
	}

	/**
	 * Check for @@ pattern and replace with current active file mention
	 * @returns true if @@ was found and replaced, false otherwise
	 */
	private checkForCurrentFileMention(): boolean {
		if (!this.inputElement) return false;

		const text = this.getTextWithLineBreaks(this.inputElement);
		const cursorPos = this.getCursorTextPosition();

		// Check if text before cursor ends with @@ (preceded by start or whitespace)
		const textBeforeCursor = text.substring(0, cursorPos);
		const doubleAtMatch = textBeforeCursor.match(/(?:^|[\s\u00A0])@@$/);

		if (!doubleAtMatch) return false;

		// Get the active file
		const activeFile = this.getActiveFile();
		if (!activeFile) {
			return false;
		}

		// Calculate position of @@ in the text
		const doubleAtPos = cursorPos - 2;

		// Build replacement text: @filename with non-breaking space after
		const fileName = activeFile.basename;
		const replacement = `@${fileName}\u00A0`;

		// Replace @@ with the file mention
		const before = text.substring(0, doubleAtPos);
		const after = text.substring(cursorPos);
		const newText = before + replacement + after;

		// Calculate new cursor position (after the inserted mention)
		const newCursorPos = doubleAtPos + replacement.length;

		// Update input with DOM APIs and apply styling
		const tokens = newText.includes('@') || newText.includes('/') ? this.findTokens(newText) : [];
		this.rebuildContentWithDOM(newText, tokens);

		// Set cursor after the inserted mention
		this.setCursorPosition(newCursorPos);

		this.inputElement.focus();
		this.hidePalette();

		return true;
	}

	/**
	 * Get the currently active file in the workspace
	 */
	private getActiveFile(): TFile | null {
		return this.app.workspace.getActiveFile();
	}

	/**
	 * Check if we should show/update the palette
	 */
	private checkForPalette(): void {
		if (!this.inputElement) return;

		// Use getTextWithLineBreaks to properly handle newlines (not textContent which strips <br>)
		const text = this.getTextWithLineBreaks(this.inputElement);
		const cursorPos = this.getCursorTextPosition();

		// Find trigger before cursor
		const textBeforeCursor = text.substring(0, cursorPos);
		const triggerMatch = textBeforeCursor.match(/(?:^|\s)([@/])([\w-]*)$/);

		if (triggerMatch) {
			const triggerChar = triggerMatch[1];
			const query = triggerMatch[2];
			const triggerPos = textBeforeCursor.lastIndexOf(triggerChar);

			this.currentTrigger = { char: triggerChar, position: triggerPos };
			void this.showPalette(triggerChar, query);
		} else {
			this.hidePalette();
		}
	}

	/**
	 * Get cursor position in text content
	 */
	private getCursorTextPosition(): number {
		if (!this.inputElement) return 0;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return 0;

		const range = selection.getRangeAt(0);
		return this.getCursorOffset(range);
	}

	/**
	 * Show the palette with filtered items
	 */
	private async showPalette(triggerChar: string, query: string): Promise<void> {
		// Load items based on trigger
		let items: PaletteItem[] = [];
		if (triggerChar === '@') {
			const agents = await this.itemLoader.loadAgents();
			const files = await this.itemLoader.loadFiles();
			const folders = await this.itemLoader.loadFolders();
			items = [...agents, ...files, ...folders];
		} else if (triggerChar === '/') {
			items = await this.itemLoader.loadCommands();
		}

		// Filter items by query
		const filteredItems = query ? this.fuzzyMatcher.match(query, items) : items.slice(0, 10);

		// Get cursor coordinates (not used for chat, but kept for compatibility)
		const coords = this.getCursorCoordinates();
		if (coords) {
			this.paletteView.show(
				filteredItems,
				coords,
				coords.positionAbove,
				this.chatContainer || undefined
			);
		}
	}

	/**
	 * Hide the palette
	 */
	private hidePalette(): void {
		this.paletteView.hide();
		this.currentTrigger = null;
	}

	/**
	 * Get cursor coordinates for palette positioning
	 */
	private getCursorCoordinates(): { top: number; left: number; positionAbove: boolean } | null {
		if (!this.inputElement) return null;

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return null;

		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();

		// Estimate palette height (max-height is 300px)
		const paletteHeight = 300;
		const viewportHeight = window.innerHeight;
		const spaceBelow = viewportHeight - rect.bottom;

		// If not enough space below, position above the cursor
		let top = rect.top;
		let positionAbove = false;
		if (spaceBelow < paletteHeight + 20 && rect.top > paletteHeight) {
			// Position above cursor
			top = rect.top - paletteHeight - 20;
			positionAbove = true;
		}

		return {
			top: top,
			left: rect.left,
			positionAbove: positionAbove,
		};
	}

	/**
	 * Process content and apply mention styling
	 * @returns true if HTML was modified, false otherwise
	 */
	processContent(): boolean {
		if (!this.inputElement) return false;

		this.isProcessing = true;

		try {
			// Extract text while preserving line breaks
			const text = this.getTextWithLineBreaks(this.inputElement);

			// No mentions/commands - don't interfere with native editing
			if (!text.includes('@') && !text.includes('/')) {
				// Only check if we need to clean up existing token spans
				const existingSpans = this.inputElement.querySelectorAll('.spark-token');
				if (existingSpans.length > 0) {
					// Had tokens before, now removed - rebuild to clean up spans
					this.rebuildContentWithDOM(text, []);
					return true;
				}
				// Plain text, let browser handle natively
				return false;
			}

			// Find all tokens (mentions and commands)
			const tokens = this.findTokens(text);

			if (tokens.length === 0) {
				// No valid tokens, check if cleanup needed
				const existingSpans = this.inputElement.querySelectorAll('.spark-token');
				if (existingSpans.length > 0) {
					this.rebuildContentWithDOM(text, []);
					return true;
				}
				return false;
			}

			// Check if DOM needs updating by comparing token count
			const existingSpans = this.inputElement.querySelectorAll('.spark-token');
			const validTokenCount = tokens.filter(t => t.type).length;

			// Only rebuild if token structure changed
			if (existingSpans.length !== validTokenCount) {
				this.rebuildContentWithDOM(text, tokens);
				return true;
			}

			// Check if token content changed
			let tokensMatch = true;
			const validTokens = tokens.filter(t => t.type);
			existingSpans.forEach((span, idx) => {
				const token = validTokens[idx];
				if (!token || span.textContent !== token.text) {
					tokensMatch = false;
				}
			});

			if (!tokensMatch) {
				this.rebuildContentWithDOM(text, tokens);
				return true;
			}

			return false;
		} finally {
			this.isProcessing = false;
		}
	}

	/**
	 * Rebuild contenteditable content using DOM APIs
	 */
	private rebuildContentWithDOM(
		text: string,
		tokens: Array<{ text: string; start: number; end: number; type: string | null }>
	): void {
		if (!this.inputElement) return;

		// Clear content
		this.inputElement.textContent = '';

		if (tokens.length === 0) {
			// No tokens, just add text with line breaks
			this.appendTextWithLineBreaks(this.inputElement, text);
			return;
		}

		// Build DOM with styled tokens
		let lastIndex = 0;

		for (const token of tokens) {
			// Add text before token
			const textSegment = text.substring(lastIndex, token.start);
			if (textSegment) {
				this.appendTextWithLineBreaks(this.inputElement, textSegment);
			}

			// Add styled token or plain text
			if (token.type) {
				const span = document.createElement('span');
				span.className = `spark-token spark-token-${token.type}`;
				span.dataset.token = token.text;
				span.dataset.type = token.type;
				span.textContent = token.text;
				this.inputElement.appendChild(span);
			} else {
				this.inputElement.appendChild(document.createTextNode(token.text));
			}

			lastIndex = token.end;
		}

		// Add remaining text
		const remainingText = text.substring(lastIndex);
		if (remainingText) {
			this.appendTextWithLineBreaks(this.inputElement, remainingText);
		}
	}

	/**
	 * Append text to element, converting newlines to <br> elements
	 */
	private appendTextWithLineBreaks(element: HTMLElement, text: string): void {
		const parts = text.split('\n');
		for (let i = 0; i < parts.length; i++) {
			if (parts[i]) {
				element.appendChild(document.createTextNode(parts[i]));
			}
			// Add <br> between parts (each split point represents a newline)
			// Don't add <br> after the last part
			if (i < parts.length - 1) {
				element.appendChild(document.createElement('br'));
			}
		}
	}

	/**
	 * Extract text from contenteditable while preserving line breaks
	 * Converts <br> elements to \n characters
	 * Filters out zero-width spaces (used only for cursor positioning)
	 */
	private getTextWithLineBreaks(element: HTMLElement): string {
		let text = '';
		for (const node of Array.from(element.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				// Filter out zero-width spaces (used for cursor positioning only)
				const nodeText = (node.textContent || '').replace(/\u200B/g, '');
				text += nodeText;
			} else if (node.nodeName === 'BR') {
				text += '\n';
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				// Recursively process child elements (like spans)
				text += this.getTextWithLineBreaks(node as HTMLElement);
			}
		}
		return text;
	}

	/**
	 * Find all tokens (mentions and commands) in text
	 */
	private findTokens(
		text: string
	): Array<{ text: string; start: number; end: number; type: string | null }> {
		const tokens: Array<{ text: string; start: number; end: number; type: string | null }> = [];

		// Find @mentions
		const mentionRegex = /(@[\w-]+\/?)/g;
		let match: RegExpExecArray | null = null;
		while ((match = mentionRegex.exec(text)) !== null) {
			const mention = match[0];
			const type = this.resourceService.validateMentionType(mention);
			tokens.push({
				text: mention,
				start: match.index,
				end: match.index + mention.length,
				type,
			});
		}

		// Find /commands
		const commandRegex = /(?:^|\s)(\/[\w-]+)/g;
		while ((match = commandRegex.exec(text)) !== null) {
			const command = match[1];
			const type = this.resourceService.validateCommandType(command);
			tokens.push({
				text: command,
				start: match.index + (match[0].length - command.length),
				end: match.index + match[0].length,
				type,
			});
		}

		// Sort by start position
		tokens.sort((a, b) => a.start - b.start);
		return tokens;
	}

	/**
	 * Get cursor offset within element
	 * Calculates position in text representation with newlines (same as getTextWithLineBreaks)
	 */
	private getCursorOffset(range: Range): number {
		if (!this.inputElement) return 0;

		let offset = 0;
		const endContainer = range.endContainer;
		const endOffset = range.endOffset;

		// Special case: cursor is positioned in the input element itself (not in a child node)
		// This happens when cursor is after a <br> or between nodes
		if (endContainer === this.inputElement) {
			// Walk through child nodes up to the offset
			for (let i = 0; i < endOffset && i < this.inputElement.childNodes.length; i++) {
				const child = this.inputElement.childNodes[i];
				if (child.nodeType === Node.TEXT_NODE) {
					const text = child.textContent || '';
					const len = text.replace(/\u200B/g, '').length;

					offset += len;
				} else if (child.nodeName === 'BR') {
					offset += 1;
				} else if (child.nodeType === Node.ELEMENT_NODE) {
					// Recursively count content in element
					const len = this.getTextWithLineBreaks(child as HTMLElement).length;
					offset += len;
				}
			}
			return offset;
		}

		// Walk through DOM and calculate position accounting for <br> elements
		const walker = document.createTreeWalker(
			this.inputElement,
			NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
			{
				acceptNode: node => {
					// Stop if we've reached the cursor position
					if (range.endContainer === node) {
						return NodeFilter.FILTER_ACCEPT;
					}
					// Check if cursor is inside this node
					if (node.contains(range.endContainer)) {
						return NodeFilter.FILTER_ACCEPT;
					}
					// Skip nodes after cursor
					const position = range.endContainer.compareDocumentPosition(node);
					if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
						return NodeFilter.FILTER_REJECT;
					}
					return NodeFilter.FILTER_ACCEPT;
				},
			}
		);

		let currentNode = walker.nextNode();
		while (currentNode) {
			if (currentNode === range.endContainer) {
				// We've reached the cursor position
				if (currentNode.nodeType === Node.TEXT_NODE) {
					// Filter out zero-width spaces
					const text = currentNode.textContent?.substring(0, range.endOffset) || '';
					offset += text.replace(/\u200B/g, '').length;
				}
				break;
			} else if (currentNode.contains(range.endContainer)) {
				// Cursor is inside this node, keep traversing
				currentNode = walker.nextNode();
				continue;
			} else if (currentNode.nodeType === Node.TEXT_NODE) {
				// Text node before cursor - filter out zero-width spaces
				const text = currentNode.textContent || '';
				offset += text.replace(/\u200B/g, '').length;
			} else if (currentNode.nodeName === 'BR') {
				// BR element - count as newline
				offset += 1;
			}
			currentNode = walker.nextNode();
		}

		return offset;
	}

	/**
	 * Restore cursor position after content update
	 */
	private restoreCursor(offset: number): void {
		if (!this.inputElement) return;

		const selection = window.getSelection();
		if (!selection) return;
		try {
			const range = this.createRangeAtOffset(this.inputElement, offset);
			if (range) {
				selection.removeAllRanges();
				selection.addRange(range);
			} else {
				console.error('[restoreCursor] Failed - no range created');
			}
		} catch (error) {
			console.error('[restoreCursor] Error:', error);
		}
	}

	/**
	 * Create a range at a specific text offset
	 * Must match the logic of getCursorOffset (count <br> as 1, filter zero-width spaces)
	 */
	private createRangeAtOffset(element: HTMLElement, offset: number): Range | null {
		const range = document.createRange();
		let currentOffset = 0;

		const walk = (node: Node): boolean => {
			if (node.nodeType === Node.TEXT_NODE) {
				// Filter out zero-width spaces (same as getCursorOffset)
				const text = node.textContent || '';
				const filteredText = text.replace(/\u200B/g, '');
				const textLength = filteredText.length;

				if (currentOffset + textLength >= offset) {
					// Map the offset back to the actual node offset (accounting for zero-width spaces)
					const targetOffset = offset - currentOffset;
					let nodeOffset = 0;
					let filteredOffset = 0;
					while (filteredOffset < targetOffset && nodeOffset < text.length) {
						if (text[nodeOffset] !== '\u200B') {
							filteredOffset++;
						}
						nodeOffset++;
					}

					range.setStart(node, nodeOffset);
					range.setEnd(node, nodeOffset);
					return true;
				}
				currentOffset += textLength;
			} else if (node.nodeName === 'BR') {
				// BR elements count as 1 character (newline)
				if (currentOffset === offset) {
					// Cursor is right before this BR
					range.setStartBefore(node);
					range.setEndBefore(node);
					return true;
				}
				if (currentOffset + 1 === offset) {
					// Cursor is right after this BR
					if (node.nextSibling) {
						// Position at start of next sibling
						if (node.nextSibling.nodeType === Node.TEXT_NODE) {
							range.setStart(node.nextSibling, 0);
							range.setEnd(node.nextSibling, 0);
						} else {
							range.setStartBefore(node.nextSibling);
							range.setEndBefore(node.nextSibling);
						}
					} else {
						// No next sibling - need to insert a zero-width space after BR
						const parent = node.parentNode;
						if (parent) {
							const zwsp = document.createTextNode('\u200B');
							parent.insertBefore(zwsp, node.nextSibling);
							range.setStart(zwsp, 0);
							range.setEnd(zwsp, 0);
						}
					}
					return true;
				}
				currentOffset += 1;
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				// Walk through child nodes
				for (let i = 0; i < node.childNodes.length; i++) {
					if (walk(node.childNodes[i])) {
						return true;
					}
				}
			}
			return false;
		};

		if (walk(element)) {
			return range;
		}

		// Fallback: place cursor at end
		range.selectNodeContents(element);
		range.collapse(false);
		return range;
	}

	/**
	 * Handle focus to refresh content
	 */
	private handleFocus(): void {
		this.processContent();
	}

	/**
	 * Handle clicks on mentions
	 */
	private handleClick(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		const tokenElement = target.closest('.spark-token');

		if (!tokenElement) return;

		// Check if clicked element is an agent mention
		if (tokenElement.getAttribute('data-type') === 'agent') {
			// Stop propagation to prevent global listener from firing
			// We want to do NOTHING when clicking an agent mention in the input
			// (just allow default cursor placement)
			event.stopPropagation();
			event.preventDefault();
			return;
		}

		// Handle click on decorated mentions
		this.mentionDecorator.handleMentionClick(event);
	}

	/**
	 * Refresh mentions (call when agents/commands change)
	 */
	async refresh(): Promise<void> {
		await this.mentionDecorator.refresh();
		this.processContent();
	}

	/**
	 * Clean up event listeners
	 */
	destroy(): void {
		if (this.inputElement) {
			this.inputElement.removeEventListener('input', this.handleInput);
			this.inputElement.removeEventListener('click', this.handleClick);
			this.inputElement.removeEventListener('focus', this.handleFocus);
			this.inputElement.removeEventListener('keydown', this.handleKeydown);
		}
		document.removeEventListener('spark-palette-select', this.handlePaletteSelection);
		this.hidePalette();
	}
}
