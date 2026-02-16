/**
 * Reusable model selector — pill buttons + custom dropdown popover
 * Used by main chat, inline chat, and (via CSS class sharing) workflow views
 */

import type { ModelOption } from '../models';
import { getShortModelLabel } from '../models';

const CLOUD_LABEL = '\u2601 Cloud'; // ☁ Cloud — eslint sentence-case bypass
const LOCAL_LABEL = '\u26A1 Local'; // ⚡ Local — eslint sentence-case bypass

export interface ModelSelectorOptions {
	models: ModelOption[];
	defaultModel: string;
	compact?: boolean;
	dropdownDirection?: 'up' | 'down';
	onChange: (modelId: string | null) => void;
	onProviderChange?: (provider: 'cloud' | 'local') => void;
	initialProvider?: 'cloud' | 'local';
	/** Pre-select this model on creation (persisted selection from node data) */
	initialSelection?: string;
}

export class ModelSelector {
	private containerEl: HTMLElement | null = null;
	private triggerEl: HTMLButtonElement | null = null;
	private triggerLabelEl: HTMLElement | null = null;
	private dropdownEl: HTMLElement | null = null;
	private providerToggleEl: HTMLElement | null = null;
	private options: ModelSelectorOptions;

	private isOpen = false;
	private activeProvider: 'cloud' | 'local';
	private selectedModel: string | null = null;
	private highlightedIndex = -1;
	private filteredItems: Array<{ id: string; label: string }> = [];

	// Bound handlers for cleanup
	private boundOnDocumentClick: ((e: MouseEvent) => void) | null = null;
	private boundOnKeyDown: ((e: KeyboardEvent) => void) | null = null;

	constructor(options: ModelSelectorOptions) {
		this.options = options;
		this.activeProvider = options.initialProvider ?? 'cloud';
		this.selectedModel = options.initialSelection ?? null;
	}

	create(): HTMLElement {
		this.containerEl = document.createElement('div');
		this.containerEl.className = this.options.compact
			? 'spark-model-selector spark-model-selector--compact'
			: 'spark-model-selector';

		// Provider toggle (only if local models exist)
		const hasLocal = this.options.models.some(m => m.provider === 'local');
		if (hasLocal) {
			this.providerToggleEl = this.createProviderToggle();
			this.containerEl.appendChild(this.providerToggleEl);
		}

		// Trigger pill
		this.triggerEl = document.createElement('button');
		this.triggerEl.className = 'spark-model-trigger';
		this.triggerEl.type = 'button';

		this.triggerLabelEl = document.createElement('span');
		this.triggerLabelEl.className = 'spark-model-trigger-label';
		this.updateTriggerLabel();

		this.triggerEl.appendChild(this.triggerLabelEl);
		this.triggerEl.addEventListener('click', e => {
			e.stopPropagation();
			this.toggle();
		});

		this.containerEl.appendChild(this.triggerEl);

		// Dropdown (hidden initially)
		this.dropdownEl = document.createElement('div');
		this.dropdownEl.className = 'spark-model-dropdown';
		if (this.options.dropdownDirection === 'down') {
			this.dropdownEl.classList.add('is-below');
		}
		this.dropdownEl.classList.add('is-hidden');
		this.containerEl.appendChild(this.dropdownEl);

		return this.containerEl;
	}

	private createProviderToggle(): HTMLElement {
		const toggle = document.createElement('button');
		toggle.className = 'spark-model-provider-toggle';
		toggle.type = 'button';

		const cloudOpt = document.createElement('span');
		cloudOpt.className = 'spark-provider-option';
		cloudOpt.dataset.provider = 'cloud';
		cloudOpt.textContent = CLOUD_LABEL;

		const localOpt = document.createElement('span');
		localOpt.className = 'spark-provider-option';
		localOpt.dataset.provider = 'local';
		localOpt.textContent = LOCAL_LABEL;

		toggle.appendChild(cloudOpt);
		toggle.appendChild(localOpt);
		this.updateProviderToggleClasses(toggle);

		toggle.addEventListener('click', e => {
			e.stopPropagation();
			this.activeProvider = this.activeProvider === 'cloud' ? 'local' : 'cloud';
			this.updateProviderToggleClasses(toggle);
			// When switching to cloud, auto-select first cloud model so engine
			// gets an explicit override (otherwise localOverride in config wins).
			// When switching to local, null lets the config default handle it.
			const filtered = this.getFilteredModels();
			if (this.activeProvider === 'cloud') {
				this.selectedModel = filtered[0]?.id ?? null;
			} else {
				// Prefer the configured default if it's a local model, else first local
				const defaultIsLocal = filtered.some(m => m.id === this.options.defaultModel);
				this.selectedModel = defaultIsLocal ? this.options.defaultModel : (filtered[0]?.id ?? null);
			}
			this.options.onChange(this.selectedModel);
			this.updateTriggerLabel();
			this.options.onProviderChange?.(this.activeProvider);
			if (this.isOpen) {
				this.buildDropdownItems();
			}
		});

		return toggle;
	}

	private updateProviderToggleClasses(toggle: HTMLElement): void {
		const options = toggle.querySelectorAll('.spark-provider-option');
		options.forEach(opt => {
			const el = opt as HTMLElement;
			if (el.dataset.provider === this.activeProvider) {
				el.classList.add('is-active');
			} else {
				el.classList.remove('is-active');
			}
		});
	}

	private getFilteredModels(): ModelOption[] {
		const providerKey = this.activeProvider === 'cloud' ? 'anthropic' : 'local';
		return this.options.models.filter(m => m.provider === providerKey);
	}

	private getDefaultLabelForProvider(): string {
		const filtered = this.getFilteredModels();
		if (filtered.length > 0) {
			return getShortModelLabel(filtered[0].id);
		}
		return this.activeProvider === 'cloud' ? 'Cloud' : 'Local';
	}

	private updateTriggerLabel(): void {
		if (!this.triggerLabelEl) return;
		if (this.selectedModel) {
			this.triggerLabelEl.textContent = getShortModelLabel(this.selectedModel);
		} else {
			this.triggerLabelEl.textContent = this.getDefaultLabelForProvider();
		}
	}

	private toggle(): void {
		if (this.isOpen) {
			this.close();
		} else {
			this.open();
		}
	}

	private open(): void {
		if (!this.dropdownEl || !this.triggerEl) return;
		this.isOpen = true;
		this.triggerEl.classList.add('is-open');
		this.dropdownEl.classList.remove('is-hidden');
		this.highlightedIndex = -1;
		this.buildDropdownItems();

		// Add listeners
		this.boundOnDocumentClick = (e: MouseEvent) => {
			if (!this.containerEl?.contains(e.target as Node)) {
				this.close();
			}
		};
		this.boundOnKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);

		// Delay to avoid the current click from immediately closing
		const docClickHandler = this.boundOnDocumentClick;
		const keyHandler = this.boundOnKeyDown;
		requestAnimationFrame(() => {
			if (docClickHandler) document.addEventListener('click', docClickHandler);
			if (keyHandler) document.addEventListener('keydown', keyHandler);
		});
	}

	private close(): void {
		if (!this.dropdownEl || !this.triggerEl) return;
		this.isOpen = false;
		this.triggerEl.classList.remove('is-open');
		this.dropdownEl.classList.add('is-hidden');
		this.highlightedIndex = -1;

		if (this.boundOnDocumentClick) {
			document.removeEventListener('click', this.boundOnDocumentClick);
			this.boundOnDocumentClick = null;
		}
		if (this.boundOnKeyDown) {
			document.removeEventListener('keydown', this.boundOnKeyDown);
			this.boundOnKeyDown = null;
		}
	}

	private buildDropdownItems(): void {
		if (!this.dropdownEl) return;
		this.dropdownEl.empty();
		this.filteredItems = [];

		const filtered = this.getFilteredModels();

		for (const model of filtered) {
			this.filteredItems.push({
				id: model.id,
				label: getShortModelLabel(model.id),
			});
		}

		// Render items
		this.filteredItems.forEach((item, index) => {
			const el = document.createElement('div');
			el.className = 'spark-model-dropdown-item';
			const isSelected = item.id === this.selectedModel;
			if (isSelected) {
				el.classList.add('is-selected');
			}

			const labelSpan = document.createElement('span');
			labelSpan.textContent = item.label;
			el.appendChild(labelSpan);

			if (isSelected) {
				const check = document.createElement('span');
				check.className = 'spark-model-check';
				check.textContent = '✓';
				el.appendChild(check);
			}

			el.addEventListener('click', e => {
				e.stopPropagation();
				this.selectItem(item.id);
			});

			el.addEventListener('mouseenter', () => {
				this.setHighlight(index);
			});

			this.dropdownEl?.appendChild(el);
		});
	}

	private selectItem(id: string): void {
		this.selectedModel = id;
		this.options.onChange(id);
		this.updateTriggerLabel();
		this.close();
	}

	private setHighlight(index: number): void {
		if (!this.dropdownEl) return;
		const items = this.dropdownEl.querySelectorAll('.spark-model-dropdown-item');
		items.forEach((el, i) => {
			if (i === index) {
				el.classList.add('is-highlighted');
			} else {
				el.classList.remove('is-highlighted');
			}
		});
		this.highlightedIndex = index;
	}

	private handleKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			this.close();
			return;
		}

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			const next = Math.min(this.highlightedIndex + 1, this.filteredItems.length - 1);
			this.setHighlight(next);
			this.scrollHighlightedIntoView();
			return;
		}

		if (e.key === 'ArrowUp') {
			e.preventDefault();
			const prev = Math.max(this.highlightedIndex - 1, 0);
			this.setHighlight(prev);
			this.scrollHighlightedIntoView();
			return;
		}

		if (e.key === 'Enter' && this.highlightedIndex >= 0) {
			e.preventDefault();
			const item = this.filteredItems[this.highlightedIndex];
			if (item) {
				this.selectItem(item.id);
			}
		}
	}

	private scrollHighlightedIntoView(): void {
		if (!this.dropdownEl) return;
		const items = this.dropdownEl.querySelectorAll('.spark-model-dropdown-item');
		const highlighted = items[this.highlightedIndex] as HTMLElement | undefined;
		highlighted?.scrollIntoView({ block: 'nearest' });
	}

	// Public API

	getSelectedModel(): string | null {
		return this.selectedModel;
	}

	getActiveProvider(): 'cloud' | 'local' {
		return this.activeProvider;
	}

	reset(): void {
		this.selectedModel = null;
		this.updateTriggerLabel();
	}

	setDefault(model: string): void {
		this.options.defaultModel = model;
		this.updateTriggerLabel();
	}

	refresh(models: ModelOption[], defaultModel: string): void {
		this.options.models = models;
		this.options.defaultModel = defaultModel;
		// Rebuild provider toggle visibility
		const hasLocal = models.some(m => m.provider === 'local');
		if (hasLocal && !this.providerToggleEl && this.containerEl && this.triggerEl) {
			this.providerToggleEl = this.createProviderToggle();
			this.containerEl.insertBefore(this.providerToggleEl, this.triggerEl);
		} else if (!hasLocal && this.providerToggleEl) {
			this.providerToggleEl.remove();
			this.providerToggleEl = null;
			this.activeProvider = 'cloud';
		}
		this.updateTriggerLabel();
		if (this.isOpen) {
			this.buildDropdownItems();
		}
	}

	destroy(): void {
		this.close();
		this.containerEl?.remove();
		this.containerEl = null;
		this.triggerEl = null;
		this.triggerLabelEl = null;
		this.dropdownEl = null;
		this.providerToggleEl = null;
	}
}
