/**
 * LocalProvider Tests
 * Uses constructor injection for the backend to avoid ESM module mocking issues.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Logger } from '../../src/logger/Logger.js';
import type { LocalBackend, LocalCompletionResult, LocalModelInfo } from '../../src/providers/local/LocalBackend.js';
import { LocalProvider } from '../../src/providers/LocalProvider.js';
import type { ProviderConfig } from '../../src/types/provider.js';
import { ProviderType } from '../../src/types/provider.js';

function createMockBackend(): LocalBackend & {
  complete: jest.Mock<(...args: unknown[]) => Promise<LocalCompletionResult>>;
  listModels: jest.Mock<() => Promise<LocalModelInfo[]>>;
  isAvailable: jest.Mock<() => Promise<boolean>>;
} {
  return {
    name: 'lmstudio',
    complete: jest.fn<(...args: unknown[]) => Promise<LocalCompletionResult>>(),
    listModels: jest.fn<() => Promise<LocalModelInfo[]>>(),
    isAvailable: jest.fn<() => Promise<boolean>>(),
  };
}

describe('LocalProvider', () => {
  const mockConfig: ProviderConfig = {
    name: 'local',
    type: ProviderType.LOCAL,
    model: 'test-community/test-model',
    maxTokens: 2048,
    temperature: 0.7,
    options: { backend: 'lmstudio', enableTools: false },
  };

  let mockBackend: ReturnType<typeof createMockBackend>;

  beforeEach(() => {
    Logger.resetInstance();
    Logger.getInstance({ level: 'error', console: false });
    mockBackend = createMockBackend();
  });

  afterEach(() => {
    Logger.resetInstance();
  });

  describe('constructor', () => {
    it('should create provider without API key', () => {
      const provider = new LocalProvider(mockConfig, mockBackend);

      expect(provider.name).toBe('local');
      expect(provider.type).toBe(ProviderType.LOCAL);
    });

    it('should initialize with custom name from config', () => {
      const config = { ...mockConfig, name: 'my-local' };
      const provider = new LocalProvider(config, mockBackend);

      expect(provider.name).toBe('my-local');
    });

    it('should throw on unknown backend when no backend injected', () => {
      const config = { ...mockConfig, options: { backend: 'unknown' } };

      expect(() => new LocalProvider(config)).toThrow('Unknown local backend: unknown');
    });
  });

  describe('supportsTools', () => {
    it('should return true by default (no enableTools option)', () => {
      const config = { ...mockConfig, options: { backend: 'lmstudio' } };
      const provider = new LocalProvider(config, mockBackend);

      expect(provider.supportsTools()).toBe(true);
    });

    it('should return false when enableTools is false', () => {
      const provider = new LocalProvider(mockConfig, mockBackend);

      expect(provider.supportsTools()).toBe(false);
    });

    it('should return true when enableTools is true', () => {
      const config = { ...mockConfig, options: { backend: 'lmstudio', enableTools: true } };
      const provider = new LocalProvider(config, mockBackend);

      expect(provider.supportsTools()).toBe(true);
    });
  });

  describe('supportsFileOperations', () => {
    it('should match supportsTools()', () => {
      const provider = new LocalProvider(mockConfig, mockBackend);

      expect(provider.supportsFileOperations()).toBe(provider.supportsTools());
    });
  });

  describe('getAvailableModels', () => {
    it('should return empty list initially', () => {
      const provider = new LocalProvider(mockConfig, mockBackend);

      expect(provider.getAvailableModels()).toEqual([]);
    });

    it('should return cached models after isHealthy()', async () => {
      mockBackend.isAvailable.mockResolvedValue(true);
      mockBackend.listModels.mockResolvedValue([
        { path: 'community/model-a', displayName: 'A', paramsString: '3B', sizeBytes: 0, trainedForToolUse: false, maxContextLength: 4096 },
        { path: 'community/model-b', displayName: 'B', paramsString: '7B', sizeBytes: 0, trainedForToolUse: true, maxContextLength: 8192 },
      ]);

      const provider = new LocalProvider(mockConfig, mockBackend);
      await provider.isHealthy();

      expect(provider.getAvailableModels()).toEqual([
        'community/model-a',
        'community/model-b',
      ]);
    });
  });

  describe('isHealthy', () => {
    it('should delegate to backend.isAvailable()', async () => {
      mockBackend.isAvailable.mockResolvedValue(true);
      mockBackend.listModels.mockResolvedValue([]);

      const provider = new LocalProvider(mockConfig, mockBackend);
      const healthy = await provider.isHealthy();

      expect(healthy).toBe(true);
      expect(mockBackend.isAvailable).toHaveBeenCalled();
    });

    it('should return false when backend is unavailable', async () => {
      mockBackend.isAvailable.mockResolvedValue(false);

      const provider = new LocalProvider(mockConfig, mockBackend);
      const healthy = await provider.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should refresh model cache on success', async () => {
      mockBackend.isAvailable.mockResolvedValue(true);
      mockBackend.listModels.mockResolvedValue([
        { path: 'community/model-x', displayName: 'X', paramsString: '3B', sizeBytes: 0, trainedForToolUse: false, maxContextLength: 4096 },
      ]);

      const provider = new LocalProvider(mockConfig, mockBackend);
      await provider.isHealthy();

      expect(mockBackend.listModels).toHaveBeenCalled();
      expect(provider.getAvailableModels()).toEqual(['community/model-x']);
    });

    it('should not refresh model cache on failure', async () => {
      mockBackend.isAvailable.mockResolvedValue(false);

      const provider = new LocalProvider(mockConfig, mockBackend);
      await provider.isHealthy();

      expect(mockBackend.listModels).not.toHaveBeenCalled();
      expect(provider.getAvailableModels()).toEqual([]);
    });

    it('should return false on exception', async () => {
      mockBackend.isAvailable.mockRejectedValue(new Error('Connection error'));

      const provider = new LocalProvider(mockConfig, mockBackend);
      const healthy = await provider.isHealthy();

      expect(healthy).toBe(false);
    });
  });

  describe('supportsFallback', () => {
    it('should return true if fallbackProvider is configured', () => {
      const config = { ...mockConfig, fallbackProvider: 'claude-client' };
      const provider = new LocalProvider(config, mockBackend);

      expect(provider.supportsFallback()).toBe(true);
    });

    it('should return false if no fallbackProvider', () => {
      const provider = new LocalProvider(mockConfig, mockBackend);

      expect(provider.supportsFallback()).toBe(false);
    });
  });

  describe('getFallbackProvider', () => {
    it('should return fallbackProvider if configured', () => {
      const config = { ...mockConfig, fallbackProvider: 'claude-client' };
      const provider = new LocalProvider(config, mockBackend);

      expect(provider.getFallbackProvider()).toBe('claude-client');
    });

    it('should return null if no fallbackProvider', () => {
      const provider = new LocalProvider(mockConfig, mockBackend);

      expect(provider.getFallbackProvider()).toBeNull();
    });
  });

  describe('getConfig', () => {
    it('should return provider configuration with LOCAL type', () => {
      const provider = new LocalProvider(mockConfig, mockBackend);
      const config = provider.getConfig();

      expect(config.name).toBe('local');
      expect(config.type).toBe(ProviderType.LOCAL);
      expect(config.model).toBe('test-community/test-model');
      expect(config.maxTokens).toBe(2048);
      expect(config.temperature).toBe(0.7);
    });
  });

  describe('complete', () => {
    it('should delegate to backend with built messages', async () => {
      mockBackend.complete.mockResolvedValue({
        content: 'Local model response',
        usage: { inputTokens: 0, outputTokens: 10 },
      });

      const provider = new LocalProvider(mockConfig, mockBackend);
      const result = await provider.complete({
        prompt: 'Hello',
        systemPrompt: 'You are helpful',
      });

      expect(result.content).toBe('Local model response');
      expect(mockBackend.complete).toHaveBeenCalledWith(
        [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
        {
          model: 'test-community/test-model',
          maxTokens: 2048,
          temperature: 0.7,
        }
      );
    });

    it('should use options.model over config.model', async () => {
      mockBackend.complete.mockResolvedValue({
        content: 'Response',
        usage: { inputTokens: 0, outputTokens: 5 },
      });

      const provider = new LocalProvider(mockConfig, mockBackend);
      await provider.complete({
        prompt: 'Hi',
        model: 'override/model',
      });

      expect(mockBackend.complete).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ model: 'override/model' })
      );
    });

    it('should build messages with context files', async () => {
      mockBackend.complete.mockResolvedValue({
        content: 'Response',
        usage: { inputTokens: 0, outputTokens: 5 },
      });

      const provider = new LocalProvider(mockConfig, mockBackend);
      await provider.complete({
        prompt: 'Summarize',
        context: {
          agentPersona: 'You are a writer',
          files: [
            { path: 'doc.md', content: 'Document content', priority: 'high' },
          ],
        },
      });

      const [messages] = mockBackend.complete.mock.calls[0]!;
      const msgs = messages as Array<{ role: string; content: string }>;

      expect(msgs).toHaveLength(2);
      expect(msgs[0]!.role).toBe('system');
      expect(msgs[0]!.content).toContain('agent_persona');
      expect(msgs[0]!.content).toContain('You are a writer');
      expect(msgs[0]!.content).toContain('doc.md');
      expect(msgs[0]!.content).toContain('Document content');
      expect(msgs[1]!.role).toBe('user');
      expect(msgs[1]!.content).toBe('Summarize');
    });

    it('should omit system message when no system content', async () => {
      mockBackend.complete.mockResolvedValue({
        content: 'Response',
        usage: { inputTokens: 0, outputTokens: 5 },
      });

      const provider = new LocalProvider(mockConfig, mockBackend);
      await provider.complete({ prompt: 'Hi' });

      const [messages] = mockBackend.complete.mock.calls[0]!;
      const msgs = messages as Array<{ role: string; content: string }>;

      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.role).toBe('user');
    });
  });
});
