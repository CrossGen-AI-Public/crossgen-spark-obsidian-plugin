import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { App, SuggestModal, TFile } from 'obsidian';

/**
 * Decorator that makes @mentions clickable and visually distinct
 * Handles both CodeMirror (active table cells) and HTML (inactive table cells)
 */
export class MentionDecorator {
	private app: App;
	private validAgents: Set<string> = new Set();
	private observer: MutationObserver | null = null;

	constructor(app: App) {
		this.app = app;
		void this.loadValidAgents();
	}

	/**
	 * Load list of valid agents for validation
	 */
	private async loadValidAgents() {
		try {
			const agentsFolderExists = await this.app.vault.adapter.exists('.spark/agents');
			if (!agentsFolderExists) return;

			const agentsFolder = await this.app.vault.adapter.list('.spark/agents');
			for (const file of agentsFolder.files) {
				const basename = file.replace('.spark/agents/', '').replace('.md', '');
				this.validAgents.add(basename);
			}
		} catch {
			// Silently fail if .spark/agents doesn't exist
		}
	}

	/**
	 * Start observing HTML table cells for mention styling
	 */
	startTableObserver() {
		this.observer = new MutationObserver(() => {
			this.processAllTableCells();
		});

		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
		});

		// Process existing cells
		this.processAllTableCells();
	}

	/**
	 * Stop observing
	 */
	stopTableObserver() {
		this.observer?.disconnect();
		this.observer = null;
	}

	/**
	 * Process all inactive table cells
	 */
	private processAllTableCells() {
		const tables = document.querySelectorAll('.table-editor');
		tables.forEach(table => {
			const cells = table.querySelectorAll('.table-cell-wrapper');
			cells.forEach(cell => this.processTableCell(cell as HTMLElement));
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

		// Find mentions
		const mentionRegex = /(@[\w-]+\/?)/g;
		const matches = Array.from(text.matchAll(mentionRegex));

		if (matches.length === 0) {
			cell.removeAttribute('data-spark-processed');
			cell.removeAttribute('data-spark-text');
			return;
		}

		// Build HTML with styled mentions
		let html = '';
		let lastIndex = 0;

		for (const match of matches) {
			const mention = match[0];
			const index = match.index!;

			html += this.escapeHtml(text.substring(lastIndex, index));

			// Validate mention
			const isFolder = mention.endsWith('/');
			let mentionType: 'folder' | 'file' | 'agent' | null = null;

			if (isFolder) {
				const folderPath = mention.substring(1);
				const folderExists = this.app.vault
					.getMarkdownFiles()
					.some(f => f.path.startsWith(folderPath));
				if (folderExists) {
					mentionType = 'folder';
				}
			} else {
				const basename = mention.substring(1);
				const fileExists = this.app.vault.getMarkdownFiles().some(f => f.basename === basename);

				if (fileExists) {
					mentionType = 'file';
				} else if (this.validAgents.has(basename)) {
					mentionType = 'agent';
				}
			}

			// Add styled mention or plain text
			if (mentionType) {
				html += `<span class="spark-mention spark-mention-${mentionType}" data-mention="${this.escapeHtml(mention)}" data-type="${mentionType}">${this.escapeHtml(mention)}</span>`;
			} else {
				html += this.escapeHtml(mention);
			}

			lastIndex = index + mention.length;
		}

		html += this.escapeHtml(text.substring(lastIndex));

		cell.innerHTML = html || '<br>';
		cell.setAttribute('data-spark-processed', 'true');
		cell.setAttribute('data-spark-text', text);
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

		return ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;

				constructor(view: EditorView) {
					this.decorations = buildMentionDecorations(view, app, validAgents);
				}

				update(update: ViewUpdate) {
					if (update.docChanged || update.viewportChanged) {
						this.decorations = buildMentionDecorations(update.view, app, validAgents);
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
 * Build decorations for all mentions in the document
 */
function buildMentionDecorations(
	view: EditorView,
	app: App,
	validAgents: Set<string>
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;
	const cursor = view.state.selection.main.head;

	for (let i = 0; i < doc.length; ) {
		const line = doc.lineAt(i);
		const text = line.text;

		// Find all mentions in the line (@agent, @file, @folder/)
		const mentionRegex = /(@[\w-]+\/?)/g;
		let match;

		while ((match = mentionRegex.exec(text)) !== null) {
			const mention = match[0];
			const from = line.from + match.index;
			const to = from + mention.length;

			// Skip decoration if cursor is inside or at the end (user is editing)
			if (cursor >= from && cursor <= to) {
				continue;
			}

			// Validate and determine mention type
			const isFolder = mention.endsWith('/');
			let mentionType: 'folder' | 'file' | 'agent' | null = null;

			if (isFolder) {
				// Validate folder exists
				const folderPath = mention.substring(1); // Remove @
				const folderExists = app.vault.getMarkdownFiles().some(f => f.path.startsWith(folderPath));
				if (folderExists) {
					mentionType = 'folder';
				}
			} else {
				// Check if it's a file by looking for a matching basename
				const basename = mention.substring(1); // Remove @
				const fileExists = app.vault.getMarkdownFiles().some(f => f.basename === basename);

				if (fileExists) {
					mentionType = 'file';
				} else if (validAgents.has(basename)) {
					// Check if it's a valid agent from our cache
					mentionType = 'agent';
				}
			}

			// Only decorate if it's a valid mention
			if (mentionType) {
				const decoration = Decoration.mark({
					class: `spark-mention spark-mention-${mentionType}`,
					attributes: {
						'data-mention': mention,
						'data-type': mentionType,
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
export function handleMentionClick(app: App, event: MouseEvent) {
	const target = event.target as HTMLElement;

	if (!target.classList.contains('spark-mention')) {
		return;
	}

	const mention = target.getAttribute('data-mention');
	const type = target.getAttribute('data-type');

	if (!mention) return;

	// Check if Cmd (Mac) or Ctrl (Windows/Linux) is pressed
	const newTab = event.metaKey || event.ctrlKey;

	// Remove the @ prefix
	const path = mention.substring(1);

	if (type === 'folder') {
		// For folders, show a file picker
		const files = app.vault.getMarkdownFiles().filter(f => f.path.startsWith(path));
		if (files.length > 0) {
			new FolderFileSuggestModal(app, files, newTab).open();
		}
	} else {
		// For file/agent mentions (can't distinguish without .md extension)
		// Try to find as file first
		const file = app.vault.getMarkdownFiles().find(f => f.basename === path);
		if (file) {
			const leaf = newTab ? app.workspace.getLeaf('tab') : app.workspace.getLeaf();
			void leaf.openFile(file);
		} else {
			// Not a file, must be an agent - do nothing for now
			// TODO: In future, could show agent info or open chat with this agent
			return;
		}
	}

	event.preventDefault();
	event.stopPropagation();
}
