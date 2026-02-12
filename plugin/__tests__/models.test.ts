import { jest } from '@jest/globals';
import {
	ALL_MODELS,
	ClaudeModel,
	fetchLocalModels,
	getLocalModelLabel,
	getLocalModels,
	getModelLabel,
	getModelsByProvider,
	getProviderLabel,
	isLMStudioConnected,
	MODEL_LABELS,
	ProviderType,
} from '../src/models';

// Mock readFile function
const mockReadFile = jest.fn((_path: string): Promise<string> => {
	return Promise.reject(new Error('not configured'));
});

describe('models', () => {
	beforeEach(() => {
		mockReadFile.mockReset();
	});

	describe('ProviderType', () => {
		it('has ANTHROPIC and LOCAL values', () => {
			expect(ProviderType.ANTHROPIC).toBe('anthropic');
			expect(ProviderType.LOCAL).toBe('local');
		});
	});

	describe('ALL_MODELS', () => {
		it('contains all Claude model values', () => {
			expect(ALL_MODELS).toEqual(Object.values(ClaudeModel));
			expect(ALL_MODELS.length).toBe(7);
		});
	});

	describe('getLocalModelLabel', () => {
		it('extracts name after slash', () => {
			expect(getLocalModelLabel('lmstudio-community/Qwen2.5-3B-Instruct')).toBe(
				'Qwen2.5-3B-Instruct'
			);
		});

		it('extracts last segment for deeply nested paths', () => {
			expect(getLocalModelLabel('org/sub/ModelName')).toBe('ModelName');
		});

		it('returns as-is when no slash', () => {
			expect(getLocalModelLabel('smollm2-360m-instruct')).toBe('smollm2-360m-instruct');
		});

		it('handles empty string', () => {
			expect(getLocalModelLabel('')).toBe('');
		});
	});

	describe('getModelLabel', () => {
		it('returns known label for Claude models', () => {
			expect(getModelLabel(ClaudeModel.SONNET_4_5)).toBe('Claude Sonnet 4.5 (Latest)');
			expect(getModelLabel(ClaudeModel.HAIKU_3)).toBe('Claude Haiku 3');
		});

		it('has labels for all Claude models', () => {
			for (const model of Object.values(ClaudeModel)) {
				expect(MODEL_LABELS[model]).toBeDefined();
			}
		});

		it('falls back to local model label extraction for unknown models', () => {
			expect(getModelLabel('lmstudio-community/Qwen2.5-3B-Instruct')).toBe(
				'Qwen2.5-3B-Instruct'
			);
		});

		it('returns raw string for flat unknown model', () => {
			expect(getModelLabel('some-unknown-model')).toBe('some-unknown-model');
		});
	});

	describe('getProviderLabel', () => {
		it('returns label for anthropic', () => {
			expect(getProviderLabel('anthropic')).toBe('Anthropic Claude');
		});

		it('returns label for local', () => {
			expect(getProviderLabel('local')).toBe('Local (LM Studio)');
		});

		it('returns raw string for unknown provider', () => {
			expect(getProviderLabel('openai')).toBe('openai');
		});
	});

	describe('getModelsByProvider', () => {
		it('returns Claude models for anthropic', () => {
			const models = getModelsByProvider('anthropic');
			expect(models).toEqual(Object.values(ClaudeModel));
		});

		it('returns cached local models for local', () => {
			const models = getModelsByProvider('local');
			expect(Array.isArray(models)).toBe(true);
		});

		it('returns empty array for unknown provider', () => {
			expect(getModelsByProvider('openai')).toEqual([]);
			expect(getModelsByProvider('')).toEqual([]);
		});
	});

	describe('fetchLocalModels', () => {
		it('reads models from local-models.json file', async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					connected: true,
					models: [
						{ path: 'lmstudio-community/Qwen2.5-3B-Instruct', displayName: 'Qwen2.5-3B-Instruct' },
						{ path: 'meta-llama/Llama-3.1-8B-Instruct', displayName: 'Llama-3.1-8B-Instruct' },
					],
					timestamp: Date.now(),
				})
			);

			const result = await fetchLocalModels(mockReadFile);

			expect(result).toEqual([
				'lmstudio-community/Qwen2.5-3B-Instruct',
				'meta-llama/Llama-3.1-8B-Instruct',
			]);
			expect(getLocalModels()).toEqual(result);
			expect(isLMStudioConnected()).toBe(true);
			expect(mockReadFile).toHaveBeenCalledWith('.spark/local-models.json');
		});

		it('sets connected=false when file read fails', async () => {
			mockReadFile.mockRejectedValue(new Error('File not found'));
			await fetchLocalModels(mockReadFile);
			expect(isLMStudioConnected()).toBe(false);
		});

		it('returns existing cache on file read error', async () => {
			// First, populate cache
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					connected: true,
					models: [{ path: 'org/Model-A', displayName: 'Model-A' }],
					timestamp: Date.now(),
				})
			);
			await fetchLocalModels(mockReadFile);
			expect(getLocalModels()).toEqual(['org/Model-A']);

			// Now fail — should keep existing cache but mark disconnected
			mockReadFile.mockRejectedValue(new Error('File not found'));
			const result = await fetchLocalModels(mockReadFile);

			expect(result).toEqual(['org/Model-A']);
			expect(getLocalModels()).toEqual(['org/Model-A']);
			expect(isLMStudioConnected()).toBe(false);
		});

		it('sets connected=false when file has connected=false', async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					connected: false,
					models: [],
					timestamp: Date.now(),
				})
			);

			const result = await fetchLocalModels(mockReadFile);

			expect(result).toEqual([]);
			expect(isLMStudioConnected()).toBe(false);
		});

		it('updates cache when models change', async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					connected: true,
					models: [{ path: 'org/Model-A', displayName: 'Model-A' }],
					timestamp: Date.now(),
				})
			);
			await fetchLocalModels(mockReadFile);
			expect(getLocalModels()).toEqual(['org/Model-A']);

			mockReadFile.mockResolvedValue(
				JSON.stringify({
					connected: true,
					models: [
						{ path: 'org/Model-A', displayName: 'Model-A' },
						{ path: 'org/Model-B', displayName: 'Model-B' },
					],
					timestamp: Date.now(),
				})
			);
			await fetchLocalModels(mockReadFile);
			expect(getLocalModels()).toEqual(['org/Model-A', 'org/Model-B']);
		});

		it('handles malformed JSON gracefully', async () => {
			mockReadFile.mockResolvedValue('not valid json');
			const result = await fetchLocalModels(mockReadFile);
			expect(isLMStudioConnected()).toBe(false);
			expect(result).toEqual(expect.any(Array));
		});
	});

	describe('getLocalModels', () => {
		it('returns cached models after fetch', async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					connected: true,
					models: [{ path: 'test/Model', displayName: 'Model' }],
					timestamp: Date.now(),
				})
			);
			await fetchLocalModels(mockReadFile);
			expect(getLocalModels()).toEqual(['test/Model']);
		});
	});

	describe('getModelsByProvider with local cache', () => {
		it('returns fetched local models', async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					connected: true,
					models: [{ path: 'org/LocalModel', displayName: 'LocalModel' }],
					timestamp: Date.now(),
				})
			);
			await fetchLocalModels(mockReadFile);

			const models = getModelsByProvider('local');
			expect(models).toContain('org/LocalModel');
		});
	});
});
