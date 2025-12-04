import { RangeSetBuilder } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from '@codemirror/view';
import { type App, SuggestModal, type TFile } from 'obsidian';
import { COMMAND_REGEX, MENTION_REGEX } from '../constants';
import { ResourceService } from '../services/ResourceService';

/**
 * Token types that can be decorated
 */
type TokenType = 'agent' | 'file' | 'folder' | 'command';

/**
 * Decorator that makes @mentions and /commands clickable and visually distinct
 * Handles both CodeMirror (active table cells) and HTML (inactive table cells)
 */
export class MentionDecorator {
	private app: App;
	private resourceService: ResourceService;
	private observer: MutationObserver | null = null;
	private plugin?: { chatManager?: { openChatWithAgent: (agentName: string) => void } };

	constructor(
		app: App,
		plugin?: { chatManager?: { openChatWithAgent: (agentName: string) => void } }
	) {
		this.app = app;
		this.resourceService = ResourceService.getInstance(app);
		this.plugin = plugin;
	}

	/**
	 * Initialize the decorator by pre-loading agents and commands into cache
	 * Must be called before createExtension()
	 */
	async initialize(): Promise<void> {
		// Pre-load agents and commands into service caches
		await this.resourceService.loadAgents();
		await this.resourceService.loadCommands();
	}

	/**
	 * Refresh the decorator by invalidating and reloading agents and commands
	 * Called automatically when command palette opens
	 */
	async refresh(): Promise<void> {
		// Invalidate and reload caches
		this.resourceService.invalidateCache();
		await this.resourceService.loadAgents();
		await this.resourceService.loadCommands();
		// Trigger re-decoration of all elements
		this.processAllElements();
		// Force all open markdown editors to update their CodeMirror decorations
		this.forceEditorUpdates();
	}

	/**
	 * Decorate mentions and commands in plain text content
	 * Returns HTML string with styled spans for valid mentions/commands
	 */
	public decorateText(content: string): string {
		// Escape HTML
		let html = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

		// Decorate @mentions (avoid emails - at start OR not preceded by email chars)
		html = html.replace(new RegExp(MENTION_REGEX), (match, prefix, mention) => {
			const type = this.resourceService.validateMentionType(mention);
			if (type) {
				return `${prefix}<span class="spark-token spark-token-${type}" data-token="${mention}" data-type="${type}">${mention}</span>`;
			}
			return match; // Not a valid mention, keep as-is
		});

		// Decorate /commands
		html = html.replace(new RegExp(COMMAND_REGEX), (match, command) => {
			const type = this.resourceService.validateCommandType(command);
			if (type) {
				return match.replace(
					command,
					`<span class="spark-token spark-token-command" data-token="${command}" data-type="command">${command}</span>`
				);
			}
			return match; // Not a valid command, keep as-is
		});

		return html;
	}

	/**
	 * Decorate mentions/commands in an HTML element
	 * Public API for decorating rendered HTML content (e.g., markdown-rendered text)
	 */
	public decorateElement(element: HTMLElement): void {
		// Reuse the existing processTableCell logic which handles DOM walking and decoration
		this.processTableCell(element);
	}

	/**
	 * Decorate mentions in an HTML element using TreeWalker to preserve HTML structure
	 * Public API for decorating rendered HTML content where structure must be preserved
	 */
	public decorateMentionsInElement(element: HTMLElement): void {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
		const nodesToProcess: { node: Text; parent: Node }[] = [];

		// Collect text nodes that might contain mentions
		let currentNode = walker.nextNode();
		while (currentNode) {
			if (currentNode.textContent && currentNode.parentNode) {
				const text = currentNode.textContent;
				// Only process if contains potential mentions
				if (text.includes('@')) {
					nodesToProcess.push({
						node: currentNode as Text,
						parent: currentNode.parentNode,
					});
				}
			}
			currentNode = walker.nextNode();
		}

		// Process collected nodes (done separately to avoid modifying while iterating)
		for (const { node, parent } of nodesToProcess) {
			this.decorateTextNode(node, parent);
		}
	}

	/**
	 * Decorate mentions in a single text node
	 */
	private decorateTextNode(textNode: Text, parent: Node): void {
		const text = textNode.textContent || '';

		// Find all mentions
		const replacements: Array<{
			start: number;
			end: number;
			text: string;
			type: string;
		}> = [];

		const mentionRegex = new RegExp(MENTION_REGEX);
		let match: RegExpExecArray | null = null;
		while ((match = mentionRegex.exec(text)) !== null) {
			const prefix = match[1] || '';
			const mention = match[2];
			const mentionStart = match.index + prefix.length;

			const type = this.validateMention(mention);

			// Only add if it's a valid mention
			if (type) {
				replacements.push({
					start: mentionStart,
					end: mentionStart + mention.length,
					text: mention,
					type,
				});
			}
		}

		if (replacements.length === 0) {
			return;
		}

		// Sort by position and create fragments
		replacements.sort((a, b) => a.start - b.start);

		const fragment = document.createDocumentFragment();
		let lastIndex = 0;

		for (const replacement of replacements) {
			// Add text before the mention
			if (replacement.start > lastIndex) {
				fragment.appendChild(document.createTextNode(text.substring(lastIndex, replacement.start)));
			}

			// Add the mention span
			const span = document.createElement('span');
			span.className = `spark-token spark-token-${replacement.type}`;
			span.setAttribute('data-token', replacement.text);
			span.setAttribute('data-type', replacement.type);
			span.textContent = replacement.text;
			fragment.appendChild(span);

			lastIndex = replacement.end;
		}

		// Add any remaining text
		if (lastIndex < text.length) {
			fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
		}

		// Replace the text node with the fragment
		parent.replaceChild(fragment, textNode);
	}

	/**
	 * Force all open markdown editors to update their decorations
	 */
	private forceEditorUpdates(): void {
		this.app.workspace.iterateAllLeaves(leaf => {
			// @ts-expect-error - Accessing internal Obsidian API
			if (leaf.view?.getViewType?.() === 'markdown' && leaf.view?.editor?.cm) {
				// @ts-expect-error - Accessing CodeMirror internal API
				leaf.view.editor.cm.dispatch({});
			}
		});
	}

	/**
	 * Start observing HTML table cells and metadata properties for mention styling
	 */
	startTableObserver() {
		this.observer = new MutationObserver(() => {
			this.processAllElements();
		});

		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
		});

		// Listen for focus events on contenteditable metadata inputs
		document.addEventListener('focusin', this.handleFocusIn.bind(this));
		document.addEventListener('focusout', this.handleFocusOut.bind(this));

		// Process existing elements
		this.processAllElements();
	}

	/**
	 * Stop observing
	 */
	stopTableObserver() {
		this.observer?.disconnect();
		this.observer = null;
		document.removeEventListener('focusin', this.handleFocusIn.bind(this));
		document.removeEventListener('focusout', this.handleFocusOut.bind(this));
	}

	/**
	 * Handle focus into contenteditable fields
	 */
	private handleFocusIn(event: FocusEvent) {
		const target = event.target as HTMLElement;
		if (target.classList.contains('metadata-input-longtext') && target.isContentEditable) {
			// Remove decoration attributes to allow clean editing
			target.removeAttribute('data-spark-processed');
			target.removeAttribute('data-spark-text');
		}
	}

	/**
	 * Handle focus out from contenteditable fields
	 */
	private handleFocusOut(event: FocusEvent) {
		const target = event.target as HTMLElement;
		if (target.classList.contains('metadata-input-longtext') && target.isContentEditable) {
			// Re-process after a short delay to allow Obsidian to save changes
			window.setTimeout(() => {
				this.processTableCell(target);
			}, 100);
		}
	}

	/**
	 * Process all inactive table cells and metadata properties
	 */
	private processAllElements() {
		// Process table cells
		const tables = document.querySelectorAll('.table-editor');
		tables.forEach(table => {
			const cells = table.querySelectorAll('.table-cell-wrapper');
			cells.forEach(cell => {
				this.processTableCell(cell as HTMLElement);
			});
		});

		// Process metadata property values
		const metadataInputs = document.querySelectorAll('.metadata-input-longtext');
		metadataInputs.forEach(input => {
			this.processTableCell(input as HTMLElement);
		});
	}

	/**
	 * Process a single inactive table cell to add mention styling
	 */
	private processTableCell(cell: HTMLElement) {
		// Skip if cell is being edited (contains CodeMirror)
		if (cell.querySelector('.cm-content, .cm-editor')) {
			cell.removeAttribute('data-spark-processed');
			cell.removeAttribute('data-spark-text');
			return;
		}

		// Skip if contenteditable element is currently focused
		if (cell.isContentEditable && document.activeElement === cell) {
			return;
		}

		// Skip if already processed and content hasn't changed
		const currentText = cell.textContent || '';
		const lastProcessedText = cell.getAttribute('data-spark-text');
		if (cell.hasAttribute('data-spark-processed') && lastProcessedText === currentText) {
			return;
		}

		const text = currentText;
		if (!text.includes('@') && !text.includes('/')) {
			cell.removeAttribute('data-spark-processed');
			cell.removeAttribute('data-spark-text');
			return;
		}

		// Find all tokens (mentions and commands)
		const tokens = this.findTokens(text);

		if (tokens.length === 0) {
			cell.removeAttribute('data-spark-processed');
			cell.removeAttribute('data-spark-text');
			return;
		}

		// Build DOM with styled tokens
		cell.empty();
		let lastIndex = 0;

		for (const token of tokens) {
			// Add text before token
			const beforeText = text.substring(lastIndex, token.start);
			if (beforeText) {
				cell.appendText(beforeText);
			}

			// Add styled token or plain text
			if (token.type) {
				const span = cell.createSpan({
					cls: `spark-token spark-token-${token.type}`,
				});
				span.dataset.token = token.text;
				span.dataset.type = token.type;
				span.textContent = token.text;
			} else {
				cell.appendText(token.text);
			}

			lastIndex = token.end;
		}

		// Add remaining text
		const remainingText = text.substring(lastIndex);
		if (remainingText) {
			cell.appendText(remainingText);
		}

		// Ensure cell has content (for cursor positioning)
		if (!cell.hasChildNodes()) {
			cell.createEl('br');
		}

		cell.setAttribute('data-spark-processed', 'true');
		cell.setAttribute('data-spark-text', text);
	}

	/**
	 * Find all tokens (mentions and commands) in text
	 */
	private findTokens(
		text: string
	): Array<{ text: string; start: number; end: number; type: TokenType | null }> {
		const tokens: Array<{ text: string; start: number; end: number; type: TokenType | null }> = [];

		// Find @mentions
		const mentionRegex = new RegExp(MENTION_REGEX);
		let match: RegExpExecArray | null = null;
		while ((match = mentionRegex.exec(text)) !== null) {
			const mention = match[2]; // Group 2 is the mention
			const type = this.validateMention(mention);
			tokens.push({
				text: mention,
				start: match.index,
				end: match.index + mention.length,
				type,
			});
		}

		// Find /commands
		const commandRegex = new RegExp(COMMAND_REGEX);
		while ((match = commandRegex.exec(text)) !== null) {
			const command = match[1]; // Group 1 is the command without leading space
			const type = this.validateCommand(command);
			tokens.push({
				text: command,
				start: match.index + (match[0].length - command.length), // Adjust for leading space
				end: match.index + match[0].length,
				type,
			});
		}

		// Sort by start position
		tokens.sort((a, b) => a.start - b.start);
		return tokens;
	}

	/**
	 * Validate and determine mention type (agent/file/folder)
	 * Public method used by decoration builder
	 */
	public validateMention(mention: string): TokenType | null {
		const isFolder = mention.endsWith('/');
		const basename = mention.substring(1); // Remove @

		if (isFolder) {
			// Remove trailing slash for folder lookup
			const folderPath = basename.endsWith('/') ? basename.slice(0, -1) : basename;
			const folderExists = this.app.vault.getFolderByPath(folderPath) !== null;
			return folderExists ? 'folder' : null;
		} else {
			const fileExists = this.app.vault.getMarkdownFiles().some(f => f.basename === basename);
			if (fileExists) {
				return 'file';
			} else {
				// Use service cache - cache is pre-loaded in initialize/refresh
				const agentNames = this.resourceService.validAgentsCache;
				if (agentNames?.has(basename)) {
					return 'agent';
				}
			}
		}

		return null;
	}

	/**
	 * Validate and determine if command exists
	 * Public method used by decoration builder
	 */
	public validateCommand(command: string): TokenType | null {
		const commandName = command.substring(1); // Remove /
		// Use service cache - cache is pre-loaded in initialize/refresh
		const commandNames = this.resourceService.validCommandsCache;
		return commandNames?.has(commandName) ? 'command' : null;
	}

	/**
	 * Build decorations for all tokens (mentions and commands) in the document
	 */
	private buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const doc = view.state.doc;

		for (let i = 0; i < doc.length; ) {
			const line = doc.lineAt(i);
			const text = line.text;

			// Find all @mentions
			const mentionRegex = new RegExp(MENTION_REGEX);
			let match: RegExpExecArray | null = null;
			while ((match = mentionRegex.exec(text)) !== null) {
				const mention = match[2]; // Group 2 is the mention
				const type = this.validateMention(mention);

				if (type) {
					const from = line.from + match.index;
					const to = from + mention.length;
					const decoration = Decoration.mark({
						class: `spark-token spark-token-${type}`,
						attributes: {
							'data-token': mention,
							'data-type': type,
						},
					});
					builder.add(from, to, decoration);
				}
			}

			// Find all /commands (only at start of line or after whitespace)
			const commandRegex = new RegExp(COMMAND_REGEX);
			while ((match = commandRegex.exec(text)) !== null) {
				const command = match[1];
				const type = this.validateCommand(command);

				if (type) {
					const from = line.from + match.index + (match[0].length - command.length);
					const to = from + command.length;
					const decoration = Decoration.mark({
						class: `spark-token spark-token-command`,
						attributes: {
							'data-token': command,
							'data-type': 'command',
						},
					});
					builder.add(from, to, decoration);
				}
			}

			i = line.to + 1;
		}

		return builder.finish();
	}

	/**
	 * Create the editor extension for CodeMirror
	 */
	createExtension() {
		const mentionDecorator = this;

		return ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;

				constructor(view: EditorView) {
					this.decorations = mentionDecorator.buildDecorations(view);
				}

				update(update: ViewUpdate) {
					if (update.docChanged || update.viewportChanged) {
						this.decorations = mentionDecorator.buildDecorations(update.view);
					}
				}
			},
			{
				decorations: v => v.decorations,
			}
		);
	}

	/**
	 * Handle clicks on mentions
	 */
	public handleMentionClick(event: MouseEvent) {
		const target = event.target as HTMLElement;

		if (!target.classList.contains('spark-token')) {
			return;
		}

		const token = target.getAttribute('data-token');
		const type = target.getAttribute('data-type');

		if (!token) return;

		// Handle commands differently
		if (type === 'command') {
			console.debug('Command clicked:', token);
			// TODO: Show command documentation or execute command
			return;
		}

		// Check if Cmd (Mac) or Ctrl (Windows/Linux) is pressed
		const newTab = event.metaKey || event.ctrlKey;

		// Remove the @ prefix for mentions
		const path = token.substring(1);

		if (type === 'folder') {
			// For folders, show a file picker
			const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(path));
			if (files.length > 0) {
				new FolderFileSuggestModal(this.app, files, newTab).open();
			}
		} else if (type === 'agent') {
			// For agent mentions, open chat with the agent pre-mentioned
			if (this.plugin?.chatManager) {
				this.plugin.chatManager.openChatWithAgent(path);
			}
			return;
		} else {
			// For file mentions
			const file = this.app.vault.getMarkdownFiles().find(f => f.basename === path);
			if (file) {
				const leaf = newTab ? this.app.workspace.getLeaf('tab') : this.app.workspace.getLeaf();
				void leaf.openFile(file);
			}
		}

		event.preventDefault();
	}
}

/**
 * Folder file suggest modal for selecting files from a folder
 */
class FolderFileSuggestModal extends SuggestModal<TFile> {
	private files: TFile[];
	private newTab: boolean;

	constructor(app: App, files: TFile[], newTab: boolean) {
		super(app);
		this.files = files;
		this.newTab = newTab;
	}

	getSuggestions(_query: string): TFile[] {
		return this.files;
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.createEl('div', { text: file.path });
	}

	onChooseSuggestion(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		const leaf = this.newTab ? this.app.workspace.getLeaf('tab') : this.app.workspace.getLeaf();
		void leaf.openFile(file);
	}
}
