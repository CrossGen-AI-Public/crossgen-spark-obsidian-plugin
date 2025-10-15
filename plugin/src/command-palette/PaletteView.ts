import { App } from 'obsidian';
import { PaletteItem } from '../types/command-palette';

/**
 * Manages the visual palette UI
 * Handles rendering, selection, and user interaction
 */
export class PaletteView {
	private static readonly ITEM_ICONS: Record<PaletteItem['type'], string> = {
		command: '✨',
		agent: '🤖',
		file: '📝',
		folder: '📁',
	};

	private app: App;
	private containerEl: HTMLElement | null = null;
	private selectedIndex: number = 0;
	private items: PaletteItem[] = [];

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Create and show the palette DOM
	 */
	show(items: PaletteItem[], cursorCoords: { top: number; left: number }): void {
		this.hide();
		this.items = items;
		this.selectedIndex = 0;

		this.containerEl = this.createContainer(cursorCoords);
		this.renderItems();
	}

	/**
	 * Create the palette container element
	 */
	private createContainer(coords: { top: number; left: number }): HTMLElement {
		const container = document.body.createDiv('spark-palette');
		container.style.position = 'fixed';
		container.style.top = `${coords.top + 20}px`;
		container.style.left = `${coords.left}px`;
		document.body.appendChild(container);
		return container;
	}

	/**
	 * Render all items
	 */
	private renderItems(): void {
		if (!this.containerEl) return;

		this.containerEl.empty();

		if (this.items.length === 0) {
			this.renderEmptyState();
			return;
		}

		this.items.forEach((item, index) => {
			const itemEl = this.createItemElement(item, index);
			this.containerEl?.appendChild(itemEl);
		});
	}

	/**
	 * Render empty state
	 */
	private renderEmptyState(): void {
		if (!this.containerEl) return;
		const noResults = this.containerEl.createDiv('spark-palette-no-results');
		noResults.textContent = 'No results found';
	}

	/**
	 * Create DOM element for a single item
	 */
	private createItemElement(item: PaletteItem, index: number): HTMLElement {
		const row = this.createItemRow(index);
		const icon = this.createItemIcon(item.type);
		const content = this.createItemContent(item);

		row.appendChild(icon);
		row.appendChild(content);
		row.addEventListener('click', () => this.onItemSelected(item));

		return row;
	}

	/**
	 * Create item row container
	 */
	private createItemRow(index: number): HTMLElement {
		const row = document.createElement('div');
		row.className = 'spark-palette-item';
		if (index === this.selectedIndex) {
			row.classList.add('selected');
		}
		return row;
	}

	/**
	 * Create item icon element
	 */
	private createItemIcon(type: PaletteItem['type']): HTMLElement {
		const icon = document.createElement('div');
		icon.className = 'spark-palette-icon';
		icon.textContent = PaletteView.ITEM_ICONS[type];
		return icon;
	}

	/**
	 * Create item content element
	 */
	private createItemContent(item: PaletteItem): HTMLElement {
		const content = document.createElement('div');
		content.className = 'spark-palette-content';

		const name = document.createElement('div');
		name.className = 'spark-palette-name';
		name.textContent = item.name;
		content.appendChild(name);

		if (item.description) {
			const desc = document.createElement('div');
			desc.className = 'spark-palette-desc';
			desc.textContent = item.description;
			content.appendChild(desc);
		}

		return content;
	}

	/**
	 * Select next item
	 */
	selectNext(): void {
		if (this.items.length === 0) return;
		this.selectedIndex = Math.min(this.selectedIndex + 1, this.items.length - 1);
		this.updateSelectionUI();
	}

	/**
	 * Select previous item
	 */
	selectPrevious(): void {
		this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
		this.updateSelectionUI();
	}

	/**
	 * Update visual selection
	 */
	private updateSelectionUI(): void {
		if (!this.containerEl) return;

		const items = this.containerEl.querySelectorAll('.spark-palette-item');
		items.forEach((item, index) => {
			item.classList.toggle('selected', index === this.selectedIndex);
		});

		this.scrollSelectedIntoView(items);
	}

	/**
	 * Scroll selected item into view
	 */
	private scrollSelectedIntoView(items: NodeListOf<Element>): void {
		const selectedEl = items[this.selectedIndex] as HTMLElement;
		selectedEl?.scrollIntoView({ block: 'nearest' });
	}

	/**
	 * Get currently selected item
	 */
	getSelectedItem(): PaletteItem | null {
		return this.items[this.selectedIndex] || null;
	}

	/**
	 * Dispatch item selection event
	 */
	private onItemSelected(item: PaletteItem): void {
		const event = new CustomEvent('spark-palette-select', {
			detail: { item },
		});
		document.dispatchEvent(event);
	}

	/**
	 * Hide and remove the palette
	 */
	hide(): void {
		this.containerEl?.remove();
		this.containerEl = null;
		this.items = [];
		this.selectedIndex = 0;
	}

	/**
	 * Check if palette is visible
	 */
	isVisible(): boolean {
		return this.containerEl !== null;
	}
}
