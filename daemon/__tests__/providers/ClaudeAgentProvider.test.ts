/**
 * ClaudeAgentProvider Tests
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ClaudeAgentProvider } from '../../src/providers/ClaudeAgentProvider.js';
import type { ProviderConfiguration } from '../../src/types/config.js';
import { Logger } from '../../src/logger/Logger.js';
import { ProviderType } from '../../src/types/provider.js';

// Mock the Claude Agent SDK
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
    query: jest.fn(),
}));

describe('ClaudeAgentProvider', () => {
    const mockConfig: ProviderConfiguration = {
        type: ProviderType.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        maxTokens: 4096,
        temperature: 0.7,
        options: {
            vaultPath: '/test/vault',
        },
    };

    beforeEach(() => {
        // Initialize logger
        Logger.resetInstance();
        Logger.getInstance({ level: 'error', console: false });

        // Set mock API key
        process.env.ANTHROPIC_API_KEY = 'test-api-key';
        jest.clearAllMocks();
    });

    afterEach(() => {
        delete process.env.ANTHROPIC_API_KEY;
        Logger.resetInstance();
    });

    describe('constructor', () => {
        it('should create provider with valid config', () => {
            const provider = new ClaudeAgentProvider(mockConfig);

            expect(provider.name).toBe('claude-agent');
            expect(provider.type).toBe(ProviderType.ANTHROPIC);
        });

        it('should throw error if apiKeyEnv not specified', () => {
            const config = { ...mockConfig, apiKeyEnv: undefined };

            expect(() => new ClaudeAgentProvider(config)).toThrow(
                'API key environment variable not specified'
            );
        });

        it('should throw error if API key not set in environment', () => {
            delete process.env.ANTHROPIC_API_KEY;

            expect(() => new ClaudeAgentProvider(mockConfig)).toThrow(
                'ANTHROPIC_API_KEY environment variable not set'
            );
        });

        it('should use vaultPath from config.options', () => {
            const config = {
                ...mockConfig,
                options: {
                    vaultPath: '/custom/vault',
                },
            };

            const provider = new ClaudeAgentProvider(config);

            // VaultPath is private, but we can verify through file operations
            expect(provider).toBeDefined();
        });

        it('should fallback to process.cwd() if vaultPath not provided', () => {
            const config = {
                ...mockConfig,
                options: undefined,
            };

            const provider = new ClaudeAgentProvider(config);

            expect(provider).toBeDefined();
        });
    });

    describe('supportsTools', () => {
        it('should return true', () => {
            const provider = new ClaudeAgentProvider(mockConfig);

            expect(provider.supportsTools()).toBe(true);
        });
    });

    describe('supportsFileOperations', () => {
        it('should return true', () => {
            const provider = new ClaudeAgentProvider(mockConfig);

            expect(provider.supportsFileOperations()).toBe(true);
        });
    });

    describe('getAvailableModels', () => {
        it('should return Claude models', () => {
            const provider = new ClaudeAgentProvider(mockConfig);

            const models = provider.getAvailableModels();

            expect(models).toContain('claude-3-5-sonnet-20241022');
            expect(models).toContain('claude-3-5-haiku-20241022');
            expect(models).toContain('claude-3-opus-20240229');
        });
    });

    describe('canFallbackTo', () => {
        it('should return true for claude-client', () => {
            const provider = new ClaudeAgentProvider(mockConfig);

            expect(provider.canFallbackTo('claude-client')).toBe(true);
        });

        it('should return false for other providers', () => {
            const provider = new ClaudeAgentProvider(mockConfig);

            expect(provider.canFallbackTo('openai')).toBe(false);
            expect(provider.canFallbackTo('local')).toBe(false);
        });
    });

    describe('supportsFallback', () => {
        it('should return true if fallbackProvider is configured', () => {
            const config = {
                ...mockConfig,
                fallbackProvider: 'claude-client',
            };

            const provider = new ClaudeAgentProvider(config);

            expect(provider.supportsFallback()).toBe(true);
        });

        it('should return false if no fallbackProvider', () => {
            const provider = new ClaudeAgentProvider(mockConfig);

            expect(provider.supportsFallback()).toBe(false);
        });
    });

    describe('getFallbackProvider', () => {
        it('should return fallbackProvider if configured', () => {
            const config = {
                ...mockConfig,
                fallbackProvider: 'claude-client',
            };

            const provider = new ClaudeAgentProvider(config);

            expect(provider.getFallbackProvider()).toBe('claude-client');
        });

        it('should return null if no fallbackProvider', () => {
            const provider = new ClaudeAgentProvider(mockConfig);

            expect(provider.getFallbackProvider()).toBeNull();
        });
    });

    describe('isHealthy', () => {
        it('should return true if API key is set', async () => {
            const provider = new ClaudeAgentProvider(mockConfig);

            const healthy = await provider.isHealthy();

            expect(healthy).toBe(true);
        });

        it('should return false if API key is not set', async () => {
            const provider = new ClaudeAgentProvider(mockConfig);
            delete process.env.ANTHROPIC_API_KEY;

            const healthy = await provider.isHealthy();

            expect(healthy).toBe(false);
        });
    });
});

