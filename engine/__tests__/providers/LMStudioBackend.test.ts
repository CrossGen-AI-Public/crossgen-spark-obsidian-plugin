/**
 * LMStudioBackend Tests
 * Uses constructor injection to avoid ESM module mocking issues.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Logger } from '../../src/logger/Logger.js';
import { SparkError } from '../../src/types/index.js';
import { LMStudioBackend } from '../../src/providers/local/LMStudioBackend.js';
import type { LMStudioClientLike } from '../../src/providers/local/LMStudioBackend.js';

type RespondResult = { content: string; stats?: { predictedTokensCount: number } };
type RespondFn = (chat: unknown, opts: unknown) => { result: () => Promise<RespondResult> };
type ModelResult = { respond: RespondFn };

function createMockClient() {
  const mockResult = jest.fn<() => Promise<RespondResult>>();
  const mockRespond = jest.fn<RespondFn>().mockReturnValue({ result: mockResult });
  const mockModel = jest.fn<(name: string) => Promise<ModelResult>>().mockResolvedValue({ respond: mockRespond });
  const mockListDownloadedModels = jest.fn<LMStudioClientLike['system']['listDownloadedModels']>();

  const client: LMStudioClientLike = {
    llm: { model: mockModel },
    system: { listDownloadedModels: mockListDownloadedModels },
  };

  return { client, mockModel, mockRespond, mockResult, mockListDownloadedModels };
}

// Mock @lmstudio/sdk's Chat.from (still needed for the static method call)
jest.mock('@lmstudio/sdk', () => ({
  LMStudioClient: jest.fn(),
  Chat: { from: jest.fn((msgs: unknown) => msgs) },
}));

describe('LMStudioBackend', () => {
  let backend: LMStudioBackend;
  let mocks: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    Logger.resetInstance();
    Logger.getInstance({ level: 'error', console: false });

    mocks = createMockClient();
    backend = new LMStudioBackend(mocks.client);
  });

  afterEach(() => {
    Logger.resetInstance();
  });

  describe('constructor', () => {
    it('should have name "lmstudio"', () => {
      expect(backend.name).toBe('lmstudio');
    });
  });

  describe('complete', () => {
    it('should call model.respond() and return result', async () => {
      mocks.mockResult.mockResolvedValue({
        content: 'Hello from local model',
        stats: { predictedTokensCount: 5 },
      });

      const result = await backend.complete(
        [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
        { model: 'test-community/test-model', temperature: 0.7, maxTokens: 1024 }
      );

      expect(mocks.mockModel).toHaveBeenCalledWith('test-community/test-model');
      expect(result.content).toBe('Hello from local model');
      expect(result.usage.outputTokens).toBe(5);
      expect(result.usage.inputTokens).toBe(0);
    });

    it('should handle missing stats gracefully', async () => {
      mocks.mockResult.mockResolvedValue({ content: 'Response' });

      const result = await backend.complete(
        [{ role: 'user', content: 'Hi' }],
        { model: 'test/model' }
      );

      expect(result.usage.outputTokens).toBe(0);
    });

    it('should wrap context length errors with LOCAL_CONTEXT_LENGTH code', async () => {
      mocks.mockModel.mockRejectedValue(
        new Error('\u001b[91m Cannot truncate prompt with n_keep (7973) >= n_ctx (4096) \u001b[39m')
      );

      try {
        await backend.complete([{ role: 'user', content: 'Hi' }], { model: 'test/model' });
        throw new Error('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SparkError);
        expect((e as SparkError).message).toMatch(/Prompt too long for local model/);
        expect((e as SparkError).code).toBe('LOCAL_CONTEXT_LENGTH');
      }
    });

    it('should wrap model-not-found errors with LOCAL_MODEL_NOT_FOUND code', async () => {
      mocks.mockModel.mockRejectedValue(
        new Error('\u001b[91m Failed to find the model "bad/model" \u001b[39m')
      );

      try {
        await backend.complete([{ role: 'user', content: 'Hi' }], { model: 'bad/model' });
        throw new Error('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SparkError);
        expect((e as SparkError).message).toMatch(/not found in LM Studio/);
        expect((e as SparkError).code).toBe('LOCAL_MODEL_NOT_FOUND');
      }
    });

    it('should wrap connection errors with LOCAL_CONNECTION_ERROR code', async () => {
      mocks.mockModel.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:1234'));

      try {
        await backend.complete([{ role: 'user', content: 'Hi' }], { model: 'test/model' });
        throw new Error('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SparkError);
        expect((e as SparkError).message).toMatch(/Cannot connect to LM Studio/);
        expect((e as SparkError).code).toBe('LOCAL_CONNECTION_ERROR');
      }
    });

    it('should timeout with LOCAL_CONNECTION_ERROR when model lookup hangs', async () => {
      // Simulate LM Studio SDK hanging forever (never resolves, never rejects)
      mocks.mockModel.mockReturnValue(new Promise(() => {}));

      try {
        await backend.complete([{ role: 'user', content: 'Hi' }], { model: 'test/model' });
        throw new Error('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SparkError);
        expect((e as SparkError).message).toMatch(/Cannot connect to LM Studio/);
        expect((e as SparkError).code).toBe('LOCAL_CONNECTION_ERROR');
      }
    }, 20_000);
  });

  describe('listModels', () => {
    it('should return downloaded LLM models mapped to LocalModelInfo', async () => {
      mocks.mockListDownloadedModels.mockResolvedValue([
        {
          path: 'community/model-a',
          displayName: 'Model A',
          paramsString: '3B',
          sizeBytes: 2000000000,
          trainedForToolUse: false,
          maxContextLength: 4096,
          type: 'llm',
        },
        {
          path: 'community/model-b',
          displayName: 'Model B',
          paramsString: '7B',
          sizeBytes: 5000000000,
          trainedForToolUse: true,
          maxContextLength: 8192,
          type: 'llm',
        },
        {
          path: 'community/embedding-model',
          displayName: 'Embedding',
          paramsString: '1B',
          sizeBytes: 500000000,
          trainedForToolUse: false,
          maxContextLength: 512,
          type: 'embedding',
        },
      ]);

      const models = await backend.listModels();

      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        path: 'community/model-a',
        displayName: 'Model A',
        paramsString: '3B',
        sizeBytes: 2000000000,
        trainedForToolUse: false,
        maxContextLength: 4096,
      });
      expect(models[1]?.path).toBe('community/model-b');
    });

    it('should filter out non-LLM models', async () => {
      mocks.mockListDownloadedModels.mockResolvedValue([
        {
          path: 'community/embedding',
          displayName: 'Embed',
          paramsString: '1B',
          sizeBytes: 500000000,
          trainedForToolUse: false,
          maxContextLength: 512,
          type: 'embedding',
        },
      ]);

      const models = await backend.listModels();
      expect(models).toHaveLength(0);
    });

    it('should handle undefined paramsString', async () => {
      mocks.mockListDownloadedModels.mockResolvedValue([
        {
          path: 'community/model-c',
          displayName: 'Model C',
          paramsString: undefined,
          sizeBytes: 1000000000,
          trainedForToolUse: false,
          maxContextLength: 2048,
          type: 'llm',
        },
      ]);

      const models = await backend.listModels();
      expect(models[0]?.paramsString).toBe('');
    });
  });

  describe('isAvailable', () => {
    it('should return true when LM Studio is accessible', async () => {
      mocks.mockListDownloadedModels.mockResolvedValue([]);

      const available = await backend.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when LM Studio is not running', async () => {
      mocks.mockListDownloadedModels.mockRejectedValue(new Error('Connection refused'));

      const available = await backend.isAvailable();
      expect(available).toBe(false);
    });
  });
});
