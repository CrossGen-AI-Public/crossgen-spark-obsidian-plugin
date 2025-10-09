import { Editor, EditorPosition } from 'obsidian';
import { ISparkPlugin } from '../types';
import { EditorWithCoords, PaletteItem, TriggerContext } from '../types/command-palette';
import { ItemLoader } from './ItemLoader';
import { FuzzyMatcher } from './FuzzyMatcher';
import { PaletteView } from './PaletteView';

export class CommandPaletteManager {
	private plugin: ISparkPlugin;
	private activeTrigger: TriggerContext | null = null;
	private itemLoader: ItemLoader;
	private fuzzyMatcher: FuzzyMatcher;
	private paletteView: PaletteView;
	private cachedItems: PaletteItem[] | null = null;
	private paletteSelectHandler: EventListener;

	constructor(plugin: ISparkPlugin) {
		this.plugin = plugin;
		this.itemLoader = new ItemLoader(plugin.app);
		this.fuzzyMatcher = new FuzzyMatcher();
		this.paletteView = new PaletteView(plugin.app);

		// Store event handler for cleanup
		this.paletteSelectHandler = ((evt: CustomEvent) => {
			this.onItemSelected(evt.detail.item);
		}) as EventListener;
	}

	/**
	 * Register editor extension to detect trigger characters
	 */
	register(): void {
		// Register event listener for editor changes
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('editor-change', (editor: Editor) => {
				this.handleEditorChange(editor);
			})
		);

		// Register keydown listener for palette navigation (use capture to intercept before editor)
		this.plugin.registerDomEvent(
			document,
			'keydown',
			(evt: KeyboardEvent) => {
				this.handleKeydown(evt);
			},
			true
		);

		// Register palette selection event
		document.addEventListener('spark-palette-select', this.paletteSelectHandler);
	}

	/**
	 * Handle editor change events
	 */
	private handleEditorChange(editor: Editor): void {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const charsBefore = line.substring(0, cursor.ch);

		// Check if last character is a trigger
		const lastChar = charsBefore[charsBefore.length - 1];

		if (lastChar === '/' || lastChar === '@') {
			// Check if this is a standalone trigger (not part of a word)
			// e.g., "test/" should trigger, but "http://" should not
			const charBeforeTrigger = charsBefore[charsBefore.length - 2];

			if (
				!charBeforeTrigger ||
				charBeforeTrigger === ' ' ||
				charBeforeTrigger === '\n' ||
				charBeforeTrigger === '\t'
			) {
				this.onTriggerDetected(editor, cursor, lastChar);
			}
		} else if (this.activeTrigger) {
			// User is typing after trigger - update query
			this.updateQuery(editor, cursor);
		}
	}

	/**
	 * Called when a trigger character is detected
	 */
	private onTriggerDetected(editor: Editor, cursor: EditorPosition, triggerChar: string): void {
		// Clear cache when new trigger is detected
		this.cachedItems = null;

		this.activeTrigger = {
			editor,
			line: cursor.line,
			ch: cursor.ch,
			triggerChar,
			query: '',
		};

		// Show palette
		void this.showPalette();
	}

	/**
	 * Update the search query as user types
	 */
	private updateQuery(editor: Editor, cursor: EditorPosition): void {
		if (!this.activeTrigger) return;

		const line = editor.getLine(cursor.line);
		const query = line.substring(this.activeTrigger.ch, cursor.ch);

		// Check if user moved away from trigger (e.g., pressed space or deleted trigger)
		if (query.includes(' ') || !line[this.activeTrigger.ch - 1]) {
			this.closePalette();
			return;
		}

		this.activeTrigger.query = query;

		// Update palette with filtered results
		void this.showPalette();
	}

	/**
	 * Show the command palette
	 */
	private async showPalette(): Promise<void> {
		const items = await this.getFilteredItems();

		if (!this.activeTrigger) return;

		// Get cursor coordinates from editor
		const coords = this.getCursorCoordinates(this.activeTrigger.editor);

		this.paletteView.show(items, coords);
	}

	/**
	 * Get screen coordinates for the cursor position
	 */
	private getCursorCoordinates(editor: Editor): { top: number; left: number } {
		const cursor = editor.getCursor();
		const coords = (editor as EditorWithCoords).coordsAtPos(cursor);

		if (coords) {
			return {
				top: coords.top,
				left: coords.left,
			};
		}

		// Fallback to a reasonable default
		return { top: 100, left: 100 };
	}

	/**
	 * Get filtered items based on current query
	 */
	private async getFilteredItems(): Promise<PaletteItem[]> {
		const allItems = await this.loadItems();
		const query = this.activeTrigger?.query || '';

		return this.fuzzyMatcher.match(query, allItems);
	}

	/**
	 * Load all available palette items
	 */
	private async loadItems(): Promise<PaletteItem[]> {
		// Cache items to avoid reloading on every trigger
		if (this.cachedItems) {
			return this.cachedItems;
		}

		const items: PaletteItem[] = [];

		// Load based on trigger type
		if (this.activeTrigger?.triggerChar === '/') {
			// Show commands only for "/"
			const commands = await this.itemLoader.loadCommands();
			items.push(...commands);
		} else if (this.activeTrigger?.triggerChar === '@') {
			// Show agents, files, and folders for "@"
			const [agents, files, folders] = await Promise.all([
				this.itemLoader.loadAgents(),
				this.itemLoader.loadFiles(),
				this.itemLoader.loadFolders(),
			]);
			items.push(...agents, ...files, ...folders);
		}

		this.cachedItems = items;
		return items;
	}

	/**
	 * Handle keyboard events
	 */
	private handleKeydown(evt: KeyboardEvent): void {
		if (!this.paletteView.isVisible()) return;

		switch (evt.key) {
			case 'ArrowDown':
				evt.preventDefault();
				evt.stopPropagation();
				this.paletteView.selectNext();
				break;
			case 'ArrowUp':
				evt.preventDefault();
				evt.stopPropagation();
				this.paletteView.selectPrevious();
				break;
			case 'Enter': {
				evt.preventDefault();
				evt.stopPropagation();
				const selectedItem = this.paletteView.getSelectedItem();
				if (selectedItem) {
					this.onItemSelected(selectedItem);
				}
				break;
			}
			case 'Escape':
				evt.preventDefault();
				evt.stopPropagation();
				this.closePalette();
				break;
		}
	}

	/**
	 * Handle item selection
	 */
	private onItemSelected(item: PaletteItem): void {
		if (!this.activeTrigger) return;

		const editor = this.activeTrigger.editor;
		const line = this.activeTrigger.line;
		const triggerCh = this.activeTrigger.ch;

		// Get current line content
		const lineContent = editor.getLine(line);

		// Remove trigger character and replace with selected item ID
		const before = lineContent.substring(0, triggerCh - 1);
		const after = lineContent.substring(editor.getCursor().ch);
		const newLine = before + item.id + after;

		// Update the line
		editor.setLine(line, newLine);

		// Set cursor after inserted text
		editor.setCursor({
			line,
			ch: triggerCh - 1 + item.id.length,
		});

		// Close palette
		this.closePalette();
	}

	/**
	 * Close the command palette
	 */
	public closePalette(): void {
		this.activeTrigger = null;
		this.cachedItems = null;
		this.paletteView.hide();
	}

	/**
	 * Clean up when plugin unloads
	 */
	unload(): void {
		this.closePalette();
		document.removeEventListener('spark-palette-select', this.paletteSelectHandler);
	}
}
