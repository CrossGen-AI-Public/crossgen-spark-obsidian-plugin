import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { App, SuggestModal, TFile } from 'obsidian';

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
	private validAgents: Set<string> = new Set();
	private validCommands: Set<string> = new Set();
	private observer: MutationObserver | null = null;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Initialize the decorator by loading agents and commands
	 * Must be called before createExtension()
	 */
	async initialize(): Promise<void> {
		await this.loadValidAgents();
		await this.loadValidCommands();
	}

	/**
	 * Refresh the decorator by reloading agents and commands
	 * Called automatically when command palette opens
	 */
	async refresh(): Promise<void> {
		await this.loadValidAgents();
		await this.loadValidCommands();
		// Trigger re-decoration of all elements
		this.processAllElements();
		// Force all open markdown editors to update their CodeMirror decorations
		this.forceEditorUpdates();
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
	 * Load list of valid agents for validation
	 */
	private async loadValidAgents() {
		try {
			// Clear existing agents to refresh the list
			this.validAgents.clear();

			const agentsFolderExists = await this.app.vault.adapter.exists('.spark/agents');
			if (!agentsFolderExists) {
				console.error('Spark: .spark/agents folder does not exist');
				return;
			}

			const agentsFolder = await this.app.vault.adapter.list('.spark/agents');
			for (const file of agentsFolder.files) {
				const basename = file.replace('.spark/agents/', '').replace('.md', '');
				// Skip README files
				if (basename.toLowerCase() === 'readme') {
					continue;
				}
				this.validAgents.add(basename);
			}
		} catch (error) {
			console.error('Spark: Failed to load agents', error);
		}
	}

	/**
	 * Load list of valid commands for validation
	 */
	private async loadValidCommands() {
		try {
			// Clear existing commands to refresh the list
			this.validCommands.clear();

			const commandsFolderExists = await this.app.vault.adapter.exists('.spark/commands');
			if (!commandsFolderExists) {
				console.error('Spark: .spark/commands folder does not exist');
				return;
			}

			const commandsFolder = await this.app.vault.adapter.list('.spark/commands');
			for (const file of commandsFolder.files) {
				const basename = file.replace('.spark/commands/', '').replace('.md', '');
				// Skip README files
				if (basename.toLowerCase() === 'readme') {
					continue;
				}
				this.validCommands.add(basename);
			}
		} catch (error) {
			console.error('Spark: Failed to load commands', error);
		}
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
			cells.forEach(cell => this.processTableCell(cell as HTMLElement));
		});

		// Process metadata property values
		const metadataInputs = document.querySelectorAll('.metadata-input-longtext');
		metadataInputs.forEach(input => this.processTableCell(input as HTMLElement));
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

		// Build HTML with styled tokens
		let html = '';
		let lastIndex = 0;

		for (const token of tokens) {
			html += this.escapeHtml(text.substring(lastIndex, token.start));

			// Add styled token or plain text
			if (token.type) {
				html += `<span class="spark-token spark-token-${token.type}" data-token="${this.escapeHtml(token.text)}" data-type="${token.type}">${this.escapeHtml(token.text)}</span>`;
			} else {
				html += this.escapeHtml(token.text);
			}

			lastIndex = token.end;
		}

		html += this.escapeHtml(text.substring(lastIndex));

		cell.innerHTML = html || '<br>';
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
		const mentionRegex = /(@[\w-]+\/?)/g;
		let match;
		while ((match = mentionRegex.exec(text)) !== null) {
			const mention = match[0];
			const type = this.validateMention(mention);
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
	 * Validate and determine mention type
	 */
	private validateMention(mention: string): TokenType | null {
		const isFolder = mention.endsWith('/');

		if (isFolder) {
			const folderPath = mention.substring(1);
			const folderExists = this.app.vault
				.getMarkdownFiles()
				.some(f => f.path.startsWith(folderPath));
			return folderExists ? 'folder' : null;
		} else {
			const basename = mention.substring(1);
			const fileExists = this.app.vault.getMarkdownFiles().some(f => f.basename === basename);

			if (fileExists) {
				return 'file';
			} else if (this.validAgents.has(basename)) {
				return 'agent';
			}
		}

		return null;
	}

	/**
	 * Validate and determine if command exists
	 */
	private validateCommand(command: string): TokenType | null {
		const commandName = command.substring(1); // Remove /
		return this.validCommands.has(commandName) ? 'command' : null;
	}

	/**
	 * Escape HTML special characters
	 */
	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	/**
	 * Create the editor extension for CodeMirror
	 */
	createExtension() {
		const app = this.app;
		const validAgents = this.validAgents;
		const validCommands = this.validCommands;

		return ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;

				constructor(view: EditorView) {
					this.decorations = buildMentionDecorations(view, app, validAgents, validCommands);
				}

				update(update: ViewUpdate) {
					if (update.docChanged || update.viewportChanged) {
						this.decorations = buildMentionDecorations(
							update.view,
							app,
							validAgents,
							validCommands
						);
					}
				}
			},
			{
				decorations: v => v.decorations,
			}
		);
	}
}

/**
 * Build decorations for all tokens (mentions and commands) in the document
 */
function buildMentionDecorations(
	view: EditorView,
	app: App,
	validAgents: Set<string>,
	validCommands: Set<string>
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;

	// Helper to validate mentions
	const validateMention = (mention: string): TokenType | null => {
		const isFolder = mention.endsWith('/');
		if (isFolder) {
			const folderPath = mention.substring(1);
			const folderExists = app.vault.getMarkdownFiles().some(f => f.path.startsWith(folderPath));
			return folderExists ? 'folder' : null;
		} else {
			const basename = mention.substring(1);
			const fileExists = app.vault.getMarkdownFiles().some(f => f.basename === basename);
			if (fileExists) {
				return 'file';
			} else if (validAgents.has(basename)) {
				return 'agent';
			}
		}
		return null;
	};

	// Helper to validate commands
	const validateCommand = (command: string): TokenType | null => {
		const commandName = command.substring(1); // Remove /
		return validCommands.has(commandName) ? 'command' : null;
	};

	for (let i = 0; i < doc.length; ) {
		const line = doc.lineAt(i);
		const text = line.text;

		// Find all @mentions
		const mentionRegex = /(@[\w-]+\/?)/g;
		let match;
		while ((match = mentionRegex.exec(text)) !== null) {
			const mention = match[0];
			const type = validateMention(mention);

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
		const commandRegex = /(?:^|\s)(\/[\w-]+)/g;
		while ((match = commandRegex.exec(text)) !== null) {
			const command = match[1];
			const type = validateCommand(command);

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
 * Modal to select a file from a folder
 */
class FolderFileSuggestModal extends SuggestModal<TFile> {
	private files: TFile[];
	private newTab: boolean;

	constructor(app: App, files: TFile[], newTab: boolean) {
		super(app);
		this.files = files;
		this.newTab = newTab;
	}

	getSuggestions(query: string): TFile[] {
		const lowerQuery = query.toLowerCase();
		return this.files.filter(
			file =>
				file.basename.toLowerCase().includes(lowerQuery) ||
				file.path.toLowerCase().includes(lowerQuery)
		);
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		el.createDiv({ text: file.basename, cls: 'suggestion-title' });
		el.createDiv({ text: file.path, cls: 'suggestion-note' });
	}

	onChooseSuggestion(file: TFile) {
		const leaf = this.newTab ? this.app.workspace.getLeaf('tab') : this.app.workspace.getLeaf();
		void leaf.openFile(file);
	}
}

/**
 * Handle clicks on mentions
 */
export function handleMentionClick(
	app: App,
	event: MouseEvent,
	plugin?: { chatManager?: { openChatWithAgent: (agentName: string) => void } }
) {
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
		const files = app.vault.getMarkdownFiles().filter(f => f.path.startsWith(path));
		if (files.length > 0) {
			new FolderFileSuggestModal(app, files, newTab).open();
		}
	} else if (type === 'agent') {
		// For agent mentions, open chat with the agent pre-mentioned
		if (plugin && plugin.chatManager) {
			plugin.chatManager.openChatWithAgent(path);
			event.preventDefault();
		}
		return;
	} else {
		// For file mentions
		const file = app.vault.getMarkdownFiles().find(f => f.basename === path);
		if (file) {
			const leaf = newTab ? app.workspace.getLeaf('tab') : app.workspace.getLeaf();
			void leaf.openFile(file);
		}
	}

	event.preventDefault();
}
