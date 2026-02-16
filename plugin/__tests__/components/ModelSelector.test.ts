import { jest } from '@jest/globals';
import { ModelSelector, type ModelSelectorOptions } from '../../src/components/ModelSelector';
import type { ModelOption } from '../../src/models';

// Obsidian adds .empty() to HTMLElement — polyfill for jsdom
if (!HTMLElement.prototype.empty) {
	HTMLElement.prototype.empty = function () {
		while (this.firstChild) this.removeChild(this.firstChild);
	};
}

const CLOUD_MODELS: ModelOption[] = [
	{ id: 'claude-sonnet-4-5-20250929', provider: 'anthropic', label: 'Claude Sonnet 4.5', group: 'Anthropic Claude', disabled: false },
	{ id: 'claude-haiku-4-5-20251001', provider: 'anthropic', label: 'Claude Haiku 4.5', group: 'Anthropic Claude', disabled: false },
	{ id: 'claude-opus-4-1-20250805', provider: 'anthropic', label: 'Claude Opus 4.1', group: 'Anthropic Claude', disabled: false },
];

const LOCAL_MODELS: ModelOption[] = [
	{ id: 'lmstudio-community/qwen3-4b-thinking-2507', provider: 'local', label: 'qwen3-4b-thinking-2507', group: 'Local (LM Studio)', disabled: false },
	{ id: 'meta-llama/Llama-3.1-8B-Instruct', provider: 'local', label: 'Llama-3.1-8B-Instruct', group: 'Local (LM Studio)', disabled: false },
];

const ALL_MODELS = [...CLOUD_MODELS, ...LOCAL_MODELS];

function createSelector(overrides: Partial<ModelSelectorOptions> = {}): {
	selector: ModelSelector;
	el: HTMLElement;
	onChange: jest.Mock<(modelId: string | null) => void>;
	onProviderChange: jest.Mock<(provider: 'cloud' | 'local') => void>;
} {
	const onChange = jest.fn<(modelId: string | null) => void>();
	const onProviderChange = jest.fn<(provider: 'cloud' | 'local') => void>();
	const selector = new ModelSelector({
		models: ALL_MODELS,
		defaultModel: 'claude-sonnet-4-5-20250929',
		onChange,
		onProviderChange,
		...overrides,
	});
	const el = selector.create();
	return { selector, el, onChange, onProviderChange };
}

describe('ModelSelector', () => {
	describe('creation and rendering', () => {
		it('creates a container element', () => {
			const { el } = createSelector();
			expect(el).toBeInstanceOf(HTMLElement);
			expect(el.className).toContain('spark-model-selector');
		});

		it('shows provider toggle when local models exist', () => {
			const { el } = createSelector();
			const toggle = el.querySelector('.spark-model-provider-toggle');
			expect(toggle).not.toBeNull();
		});

		it('hides provider toggle when no local models', () => {
			const { el } = createSelector({ models: CLOUD_MODELS });
			const toggle = el.querySelector('.spark-model-provider-toggle');
			expect(toggle).toBeNull();
		});

		it('shows trigger button with model label', () => {
			const { el } = createSelector();
			const label = el.querySelector('.spark-model-trigger-label');
			expect(label).not.toBeNull();
			expect(label!.textContent).toBeTruthy();
		});

		it('creates dropdown element (hidden initially)', () => {
			const { el } = createSelector();
			const dropdown = el.querySelector('.spark-model-dropdown');
			expect(dropdown).not.toBeNull();
			expect(dropdown!.classList.contains('is-hidden')).toBe(true);
		});
	});

	describe('initialSelection', () => {
		it('pre-selects the given cloud model', () => {
			const { selector, el } = createSelector({
				initialSelection: 'claude-haiku-4-5-20251001',
			});
			expect(selector.getSelectedModel()).toBe('claude-haiku-4-5-20251001');
			const label = el.querySelector('.spark-model-trigger-label');
			expect(label!.textContent).toContain('Haiku 4.5');
		});

		it('pre-selects a local model with local provider', () => {
			const { selector, el } = createSelector({
				initialProvider: 'local',
				initialSelection: 'lmstudio-community/qwen3-4b-thinking-2507',
			});
			expect(selector.getSelectedModel()).toBe('lmstudio-community/qwen3-4b-thinking-2507');
			expect(selector.getActiveProvider()).toBe('local');
			const label = el.querySelector('.spark-model-trigger-label');
			expect(label!.textContent).toContain('qwen3-4b-thinking-2507');
		});

		it('persists selection after dropdown open/close cycle', () => {
			const { selector, el } = createSelector({
				initialSelection: 'claude-opus-4-1-20250805',
			});
			// Open and close the dropdown without selecting anything
			const trigger = el.querySelector('.spark-model-trigger') as HTMLButtonElement;
			trigger.click(); // open
			trigger.click(); // close
			expect(selector.getSelectedModel()).toBe('claude-opus-4-1-20250805');
		});

		it('defaults to null when no initialSelection', () => {
			const { selector } = createSelector();
			expect(selector.getSelectedModel()).toBeNull();
		});
	});

	describe('model selection via dropdown', () => {
		it('selects a model when clicked in dropdown', () => {
			const { selector, el, onChange } = createSelector();
			// Open dropdown
			const trigger = el.querySelector('.spark-model-trigger') as HTMLButtonElement;
			trigger.click();

			// Click a model item
			const items = el.querySelectorAll('.spark-model-dropdown-item');
			expect(items.length).toBeGreaterThan(0);
			(items[1] as HTMLElement).click();

			expect(selector.getSelectedModel()).toBe('claude-haiku-4-5-20251001');
			expect(onChange).toHaveBeenCalledWith('claude-haiku-4-5-20251001');
		});

		it('updates trigger label after selection', () => {
			const { el } = createSelector();
			const trigger = el.querySelector('.spark-model-trigger') as HTMLButtonElement;
			trigger.click();

			const items = el.querySelectorAll('.spark-model-dropdown-item');
			(items[1] as HTMLElement).click();

			const label = el.querySelector('.spark-model-trigger-label');
			expect(label!.textContent).toContain('Haiku 4.5');
		});

		it('closes dropdown after selection', () => {
			const { el } = createSelector();
			const trigger = el.querySelector('.spark-model-trigger') as HTMLButtonElement;
			trigger.click();

			const dropdown = el.querySelector('.spark-model-dropdown')!;
			expect(dropdown.classList.contains('is-hidden')).toBe(false);

			const items = el.querySelectorAll('.spark-model-dropdown-item');
			(items[0] as HTMLElement).click();

			expect(dropdown.classList.contains('is-hidden')).toBe(true);
		});

		it('marks selected item with is-selected class in dropdown', () => {
			const { el } = createSelector({
				initialSelection: 'claude-haiku-4-5-20251001',
			});
			const trigger = el.querySelector('.spark-model-trigger') as HTMLButtonElement;
			trigger.click();

			const items = el.querySelectorAll('.spark-model-dropdown-item');
			const selectedItem = Array.from(items).find(item =>
				item.classList.contains('is-selected')
			);
			expect(selectedItem).not.toBeUndefined();
			expect(selectedItem!.textContent).toContain('Haiku 4.5');
		});
	});

	describe('provider toggle', () => {
		it('starts with cloud provider by default', () => {
			const { selector } = createSelector();
			expect(selector.getActiveProvider()).toBe('cloud');
		});

		it('respects initialProvider option', () => {
			const { selector } = createSelector({ initialProvider: 'local' });
			expect(selector.getActiveProvider()).toBe('local');
		});

		it('switches provider on toggle click', () => {
			const { el, onProviderChange } = createSelector();
			const toggle = el.querySelector('.spark-model-provider-toggle') as HTMLButtonElement;
			toggle.click();
			expect(onProviderChange).toHaveBeenCalledWith('local');
		});

		it('filters dropdown to local models after switching to local', () => {
			const { el } = createSelector();
			// Switch to local
			const toggle = el.querySelector('.spark-model-provider-toggle') as HTMLButtonElement;
			toggle.click();

			// Open dropdown
			const trigger = el.querySelector('.spark-model-trigger') as HTMLButtonElement;
			trigger.click();

			const items = el.querySelectorAll('.spark-model-dropdown-item');
			expect(items.length).toBe(LOCAL_MODELS.length);
		});

		it('fires onChange with a model when switching providers', () => {
			const { el, onChange } = createSelector();
			const toggle = el.querySelector('.spark-model-provider-toggle') as HTMLButtonElement;
			toggle.click(); // to local
			expect(onChange).toHaveBeenCalled();
		});
	});

	describe('reset', () => {
		it('clears selection', () => {
			const { selector } = createSelector({
				initialSelection: 'claude-haiku-4-5-20251001',
			});
			expect(selector.getSelectedModel()).toBe('claude-haiku-4-5-20251001');
			selector.reset();
			expect(selector.getSelectedModel()).toBeNull();
		});
	});

	describe('refresh', () => {
		it('updates models and default', () => {
			const { selector, el } = createSelector({ models: CLOUD_MODELS });
			// Initially no provider toggle
			expect(el.querySelector('.spark-model-provider-toggle')).toBeNull();

			// Refresh with local models added
			selector.refresh(ALL_MODELS, 'claude-sonnet-4-5-20250929');
			expect(el.querySelector('.spark-model-provider-toggle')).not.toBeNull();
		});

		it('removes provider toggle when local models disappear', () => {
			const { selector, el } = createSelector();
			expect(el.querySelector('.spark-model-provider-toggle')).not.toBeNull();

			selector.refresh(CLOUD_MODELS, 'claude-sonnet-4-5-20250929');
			expect(el.querySelector('.spark-model-provider-toggle')).toBeNull();
		});
	});

	describe('destroy', () => {
		it('removes container element', () => {
			const { selector, el } = createSelector();
			const parent = document.createElement('div');
			parent.appendChild(el);
			expect(parent.children.length).toBe(1);

			selector.destroy();
			expect(parent.children.length).toBe(0);
		});

		it('can be called multiple times safely', () => {
			const { selector } = createSelector();
			selector.destroy();
			selector.destroy(); // should not throw
		});
	});

	describe('keyboard navigation', () => {
		it('closes dropdown on Escape', async () => {
			const { el } = createSelector();
			const trigger = el.querySelector('.spark-model-trigger') as HTMLButtonElement;
			trigger.click(); // open

			const dropdown = el.querySelector('.spark-model-dropdown')!;
			expect(dropdown.classList.contains('is-hidden')).toBe(false);

			// The keydown handler is registered via requestAnimationFrame — flush it
			await new Promise(resolve => requestAnimationFrame(resolve));

			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
			expect(dropdown.classList.contains('is-hidden')).toBe(true);
		});
	});

	describe('compact mode', () => {
		it('adds compact class when compact option is true', () => {
			const { el } = createSelector({ compact: true });
			expect(el.className).toContain('spark-model-selector--compact');
		});
	});

	describe('dropdown direction', () => {
		it('adds is-below class for down direction', () => {
			const { el } = createSelector({ dropdownDirection: 'down' });
			const dropdown = el.querySelector('.spark-model-dropdown');
			expect(dropdown!.classList.contains('is-below')).toBe(true);
		});

		it('does not add is-below class for up direction', () => {
			const { el } = createSelector({ dropdownDirection: 'up' });
			const dropdown = el.querySelector('.spark-model-dropdown');
			expect(dropdown!.classList.contains('is-below')).toBe(false);
		});
	});
});
