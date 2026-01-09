/**
 * ClaudeCodeProvider Tests
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ClaudeCodeProvider } from '../../src/providers/ClaudeCodeProvider.js';
import type { ProviderConfig } from '../../src/types/provider.js';
import { Logger } from '../../src/logger/Logger.js';
import { ProviderType } from '../../src/types/provider.js';

// Mock child_process.exec
const mockExec = jest.fn() as jest.MockedFunction<
  () => Promise<{ stdout: string; stderr: string }>
>;

jest.mock('child_process', () => ({
  exec: mockExec,
}));

// Mock util.promisify to return our mocked exec
jest.mock('util', () => ({
  promisify: jest.fn(() => mockExec),
}));

describe('ClaudeCodeProvider', () => {
  const mockConfig: ProviderConfig = {
    name: 'claude-code',
    type: ProviderType.ANTHROPIC,
    model: 'claude-sonnet-4-5',
    maxTokens: 4096,
    temperature: 0.7,
  };

  beforeEach(() => {
    // Initialize logger
    Logger.resetInstance();
    Logger.getInstance({ level: 'error', console: false });

    // Reset all mocks
    jest.clearAllMocks();
    mockExec.mockReset();
  });

  afterEach(() => {
    Logger.resetInstance();
  });

  describe('constructor', () => {
    it('should create provider with valid config', () => {
      const provider = new ClaudeCodeProvider(mockConfig);

      expect(provider.name).toBe('claude-code');
      expect(provider.type).toBe(ProviderType.ANTHROPIC);
    });

    it('should initialize with custom name from config', () => {
      const config = { ...mockConfig, name: 'custom-claude-code' };
      const provider = new ClaudeCodeProvider(config);

      expect(provider.name).toBe('custom-claude-code');
    });
  });

  describe('supportsTools', () => {
    it('should return false', () => {
      const provider = new ClaudeCodeProvider(mockConfig);

      expect(provider.supportsTools()).toBe(false);
    });
  });

  describe('supportsFileOperations', () => {
    it('should return false', () => {
      const provider = new ClaudeCodeProvider(mockConfig);

      expect(provider.supportsFileOperations()).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should return Claude models', () => {
      const provider = new ClaudeCodeProvider(mockConfig);

      const models = provider.getAvailableModels();

      expect(models).toContain('claude-sonnet-4-5-20250929');
      expect(models).toContain('claude-3-5-haiku-20241022');
      expect(models).toContain('claude-3-haiku-20240307');
    });
  });

  describe('supportsFallback', () => {
    it('should return true if fallbackProvider is configured', () => {
      const config = {
        ...mockConfig,
        fallbackProvider: 'claude-client',
      };

      const provider = new ClaudeCodeProvider(config);

      expect(provider.supportsFallback()).toBe(true);
    });

    it('should return false if no fallbackProvider', () => {
      const provider = new ClaudeCodeProvider(mockConfig);

      expect(provider.supportsFallback()).toBe(false);
    });
  });

  describe('getFallbackProvider', () => {
    it('should return fallbackProvider if configured', () => {
      const config = {
        ...mockConfig,
        fallbackProvider: 'claude-client',
      };

      const provider = new ClaudeCodeProvider(config);

      expect(provider.getFallbackProvider()).toBe('claude-client');
    });

    it('should return null if no fallbackProvider', () => {
      const provider = new ClaudeCodeProvider(mockConfig);

      expect(provider.getFallbackProvider()).toBeNull();
    });
  });

  describe('getConfig', () => {
    it('should return provider configuration', () => {
      const provider = new ClaudeCodeProvider(mockConfig);

      const config = provider.getConfig();

      expect(config.name).toBe('claude-code');
      expect(config.type).toBe(ProviderType.ANTHROPIC);
      expect(config.model).toBe('claude-sonnet-4-5');
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.7);
    });

    it('should include fallbackProvider in config if set', () => {
      const configWithFallback = {
        ...mockConfig,
        fallbackProvider: 'claude-agent',
      };
      const provider = new ClaudeCodeProvider(configWithFallback);

      const config = provider.getConfig();

      expect(config.fallbackProvider).toBe('claude-agent');
    });
  });
});
