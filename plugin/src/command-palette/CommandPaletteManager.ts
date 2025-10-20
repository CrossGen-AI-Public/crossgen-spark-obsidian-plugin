import { Editor } from 'obsidian';
import { ISparkPlugin } from '../types';
import { PaletteItem, TriggerContext } from '../types/command-palette';
import { ItemLoader } from './ItemLoader';
import { FuzzyMatcher } from './FuzzyMatcher';
import { PaletteView } from './PaletteView';
import { CoordinateDetector } from './CoordinateDetector';
import { TriggerDetector } from './TriggerDetector';
import { MentionDecorator } from './MentionDecorator';

/**
 * Orchestrates the command palette functionality
 * Handles trigger detection, item loading, and palette display
 */
export class CommandPaletteManager {
	private plugin: ISparkPlugin;
	private activeTrigger: TriggerContext | null = null;
	private cachedItems: PaletteItem[] | null = null;
	private isInserting: boolean = false;
	private mentionDecorator: MentionDecorator | null = null;

	// Services
	private itemLoader: ItemLoader;
	private fuzzyMatcher: FuzzyMatcher;
	private paletteView: PaletteView;
	private coordinateDetector: CoordinateDetector;
	private triggerDetector: TriggerDetector;
	private paletteSelectHandler: EventListener;
	private clickOutsideHandler: EventListener;

	constructor(plugin: ISparkPlugin, mentionDecorator?: MentionDecorator) {
		this.plugin = plugin;
		this.mentionDecorator = mentionDecorator || null;
		this.itemLoader = new ItemLoader(plugin.app);
		this.fuzzyMatcher = new FuzzyMatcher();
		this.paletteView = new PaletteView(plugin.app);
		this.coordinateDetector = new CoordinateDetector();
		this.triggerDetector = new TriggerDetector();

		this.paletteSelectHandler = ((evt: CustomEvent) => {
			this.onItemSelected(evt.detail.item);
		}) as EventListener;

		this.clickOutsideHandler = ((evt: MouseEvent) => {
			this.handleClickOutside(evt);
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

		// Register click outside handler (use capture phase to handle before other handlers)
		this.plugin.registerDomEvent(document, 'mousedown', this.clickOutsideHandler, true);
	}

	/**
	 * Handle editor change events
	 */
	private handleEditorChange(editor: Editor): void {
		if (this.isInserting) {
			return;
		}

		// Check for new trigger character
		const newTrigger = this.triggerDetector.detectNewTrigger(editor);
		if (newTrigger) {
			this.activateNewTrigger(editor, newTrigger);
			return;
		}

		// Check if updating existing query
		if (this.activeTrigger) {
			this.updateExistingQuery(editor);
			return;
		}

		// Check if editing an existing mention
		const existingMention = this.triggerDetector.detectExistingMention(editor);
		if (existingMention) {
			this.activateExistingMention(editor, existingMention);
		}
	}

	/**
	 * Activate a newly typed trigger
	 */
	private activateNewTrigger(
		editor: Editor,
		trigger: { char: string; position: { line: number; ch: number } }
	): void {
		this.cachedItems = null;
		this.activeTrigger = {
			editor,
			line: trigger.position.line,
			ch: trigger.position.ch,
			triggerChar: trigger.char,
			query: '',
		};

		// Refresh decorator when palette opens to pick up new agents/commands
		if (this.mentionDecorator) {
			void this.mentionDecorator.refresh();
		}

		void this.showPalette();
	}

	/**
	 * Activate editing of an existing mention
	 */
	private activateExistingMention(
		editor: Editor,
		trigger: { char: string; position: { line: number; ch: number }; ch: number; query: string }
	): void {
		this.cachedItems = null;
		this.activeTrigger = {
			editor,
			line: trigger.position.line,
			ch: trigger.ch,
			triggerChar: trigger.char,
			query: trigger.query,
		};
		void this.showPalette();
	}

	/**
	 * Update query for active trigger
	 */
	private updateExistingQuery(editor: Editor): void {
		if (!this.activeTrigger) return;

		const query = this.triggerDetector.extractQuery(
			editor,
			this.activeTrigger.ch,
			this.activeTrigger.triggerChar
		);

		if (query === null) {
			this.closePalette();
			return;
		}

		this.activeTrigger.query = query;
		void this.showPalette();
	}

	/**
	 * Show the command palette
	 */
	private async showPalette(): Promise<void> {
		if (!this.activeTrigger) return;

		const items = await this.getFilteredItems();
		const coords = this.coordinateDetector.getCoordinates(this.activeTrigger.editor);

		if (coords) {
			this.paletteView.show(items, coords);
		}
	}

	/**
	 * Get filtered items based on current query
	 */
	private async getFilteredItems(): Promise<PaletteItem[]> {
		const allItems = await this.loadItemsForTrigger();
		const query = this.activeTrigger?.query || '';
		return this.fuzzyMatcher.match(query, allItems);
	}

	/**
	 * Load items based on trigger type
	 */
	private async loadItemsForTrigger(): Promise<PaletteItem[]> {
		if (this.cachedItems) {
			return this.cachedItems;
		}

		const triggerChar = this.activeTrigger?.triggerChar;

		if (triggerChar === '/') {
			this.cachedItems = await this.itemLoader.loadCommands();
		} else if (triggerChar === '@') {
			this.cachedItems = await this.loadMentionItems();
		} else {
			this.cachedItems = [];
		}

		return this.cachedItems;
	}

	/**
	 * Load all mention items (agents, files, folders)
	 */
	private async loadMentionItems(): Promise<PaletteItem[]> {
		const [agents, files, folders] = await Promise.all([
			this.itemLoader.loadAgents(),
			this.itemLoader.loadFiles(),
			this.itemLoader.loadFolders(),
		]);
		return [...agents, ...files, ...folders];
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
			case 'Enter':
			case 'Tab': {
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

		const { editor, line, ch } = this.activeTrigger;
		this.closePalette();

		this.insertItem(editor, line, ch, item.id);
		this.scheduleInsertionFlagClear();
	}

	/**
	 * Insert selected item into editor
	 */
	private insertItem(editor: Editor, line: number, triggerCh: number, itemId: string): void {
		this.isInserting = true;

		const currentCursor = editor.getCursor();
		const replacement = `${itemId} `;

		// Use replaceRange instead of setLine - better for tables
		// Replaces from trigger char position to current cursor
		editor.replaceRange(replacement, { line, ch: triggerCh - 1 }, { line, ch: currentCursor.ch });

		// replaceRange automatically positions cursor at end of replacement
	}

	/**
	 * Schedule clearing of insertion flag
	 */
	private scheduleInsertionFlagClear(): void {
		window.setTimeout(() => {
			this.isInserting = false;
		}, 50);
	}

	/**
	 * Handle clicks outside the palette
	 */
	private handleClickOutside(evt: MouseEvent): void {
		if (!this.paletteView.isVisible()) return;

		const target = evt.target as Element;
		if (!this.paletteView.containsElement(target)) {
			// Click is outside palette - close it
			this.closePalette();
		}
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
