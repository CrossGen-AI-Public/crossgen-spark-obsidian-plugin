import { App } from 'obsidian';
import { PaletteItem } from '../types/command-palette';

export class PaletteView {
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
		// Remove existing palette first
		this.hide();

		// Now assign new items
		this.items = items;
		this.selectedIndex = 0;

		// Create container
		this.containerEl = document.body.createDiv('spark-palette');

		// Position near cursor using fixed positioning
		this.containerEl.style.position = 'fixed';
		this.containerEl.style.top = `${cursorCoords.top + 20}px`;
		this.containerEl.style.left = `${cursorCoords.left}px`;

		// Append to body
		document.body.appendChild(this.containerEl);

		// Render items
		this.renderItems();
	}

	/**
	 * Render all items
	 */
	private renderItems(): void {
		if (!this.containerEl) return;

		this.containerEl.empty();

		if (this.items.length === 0) {
			const noResults = this.containerEl.createDiv('spark-palette-no-results');
			noResults.textContent = 'No results found';
			return;
		}

		this.items.forEach((item, index) => {
			const itemEl = this.createItemElement(item, index);
			this.containerEl?.appendChild(itemEl);
		});
	}

	/**
	 * Create DOM element for a single item
	 */
	private createItemElement(item: PaletteItem, index: number): HTMLElement {
		const row = document.createElement('div');
		row.className = 'spark-palette-item';

		if (index === this.selectedIndex) {
			row.classList.add('selected');
		}

		// Icon
		const icon = document.createElement('div');
		icon.className = 'spark-palette-icon';
		icon.textContent = this.getIcon(item.type);
		row.appendChild(icon);

		// Content
		const content = document.createElement('div');
		content.className = 'spark-palette-content';
		row.appendChild(content);

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

		// Click handler
		row.addEventListener('click', () => {
			this.onItemSelected(item);
		});

		return row;
	}

	/**
	 * Get icon for item type
	 */
	private getIcon(type: PaletteItem['type']): string {
		const icons: Record<PaletteItem['type'], string> = {
			command: '✨',
			agent: '🤖',
			file: '📝',
			folder: '📁',
		};
		return icons[type];
	}

	/**
	 * Update selected index
	 */
	selectNext(): void {
		if (this.items.length === 0) return;
		this.selectedIndex = Math.min(this.selectedIndex + 1, this.items.length - 1);
		this.updateSelection();
	}

	selectPrevious(): void {
		this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
		this.updateSelection();
	}

	/**
	 * Update visual selection
	 */
	private updateSelection(): void {
		if (!this.containerEl) return;

		const items = this.containerEl.querySelectorAll('.spark-palette-item');
		items.forEach((item, index) => {
			if (index === this.selectedIndex) {
				item.classList.add('selected');
			} else {
				item.classList.remove('selected');
			}
		});

		// Scroll selected item into view
		const selectedEl = items[this.selectedIndex] as HTMLElement;
		if (selectedEl) {
			selectedEl.scrollIntoView({ block: 'nearest' });
		}
	}

	/**
	 * Get currently selected item
	 */
	getSelectedItem(): PaletteItem | null {
		return this.items[this.selectedIndex] || null;
	}

	/**
	 * Called when item is selected
	 */
	private onItemSelected(item: PaletteItem): void {
		// This will be handled by CommandPaletteManager
		// Dispatch a custom event
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
