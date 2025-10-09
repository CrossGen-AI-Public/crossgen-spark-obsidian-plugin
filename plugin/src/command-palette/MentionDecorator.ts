import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { App, SuggestModal, TFile } from 'obsidian';

/**
 * Decorator that makes @mentions clickable and visually distinct
 */
export class MentionDecorator {
	private app: App;
	private validAgents: Set<string> = new Set();

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
	 * Create the editor extension
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

			// Skip decoration if cursor is INSIDE this mention (user is editing it)
			if (cursor > from && cursor < to) {
				continue;
			}

			// Check if there's a valid separator after the mention (space, newline, punctuation, or end of line)
			const charAfter = text[match.index + mention.length];
			const validSeparators = ' \n,.!?)]}\t';
			const hasValidSeparator = !charAfter || validSeparators.includes(charAfter);

			// Only decorate if there's a valid separator (mention is complete)
			// OR if cursor is not immediately after the mention (user moved away)
			if (!hasValidSeparator && cursor === to) {
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
