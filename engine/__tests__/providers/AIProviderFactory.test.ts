/**
 * AIProviderFactory Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AIProviderFactory } from '../../src/providers/AIProviderFactory.js';
import { ProviderRegistry } from '../../src/providers/ProviderRegistry.js';
import { ClaudeAgentProvider } from '../../src/providers/ClaudeAgentProvider.js';
import { ClaudeDirectProvider } from '../../src/providers/ClaudeDirectProvider.js';
import { LocalProvider } from '../../src/providers/LocalProvider.js';
import { Logger } from '../../src/logger/Logger.js';
import type { AIConfig } from '../../src/types/config.js';
import { ProviderType } from '../../src/types/provider.js';

// Mock SecretsLoader so tests don't depend on real ~/.spark/secrets.yaml
jest.mock('../../src/config/SecretsLoader.js', () => {
    class SecretsLoader {
        load() {}

        getApiKey(providerName: string): string | undefined {
            const envKey = `TEST_SECRET_${providerName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
            return process.env[envKey];
        }

        hasApiKey(providerName: string): boolean {
            return this.getApiKey(providerName) !== undefined;
        }

        clear() {}
        reload() {}
    }

    return { SecretsLoader };
});

// Mock the Claude Agent SDK
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
    query: jest.fn(),
}));

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            create: jest.fn(),
        },
    }));
});

// Mock LMStudioBackend so LocalProvider can be instantiated without a real server
jest.mock('../../src/providers/local/LMStudioBackend.js', () => {
    class LMStudioBackend {
        name = 'lmstudio';
        async complete() { return { content: 'mock', model: 'mock', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }; }
        async listModels() { return []; }
        async isAvailable() { return true; }
    }
    return { LMStudioBackend };
});

describe('AIProviderFactory', () => {
    let factory: AIProviderFactory;
    const mockConfig: AIConfig = {
        defaultProvider: 'claude-agent',
        providers: {
            'claude-client': {
                type: ProviderType.ANTHROPIC,
                model: 'claude-sonnet-4-5-20250929',
                maxTokens: 4096,
                temperature: 0.7,
            },
            'claude-agent': {
                type: ProviderType.ANTHROPIC,
                model: 'claude-sonnet-4-5-20250929',
                maxTokens: 4096,
                temperature: 0.7,
            },
        },
    };

    beforeEach(() => {
        // Reset logger and registry before each test
        Logger.resetInstance();
        Logger.getInstance({ level: 'error', console: false });
        ProviderRegistry.resetInstance();

        // Set up test API key
        process.env.ANTHROPIC_API_KEY = 'test-api-key-for-tests';
        delete process.env.TEST_SECRET_ANTHROPIC;
        delete process.env.TEST_SECRET_CLAUDE_AGENT;
        delete process.env.TEST_SECRET_CLAUDE_CLIENT;
        delete process.env.TEST_SECRET_CLAUDE_CODE;

        // Register providers manually
        const registry = ProviderRegistry.getInstance();
        registry.registerProvider('claude-agent', ProviderType.ANTHROPIC, (config) =>
            new ClaudeAgentProvider(config));
        registry.registerProvider('claude-client', ProviderType.ANTHROPIC, (config) =>
            new ClaudeDirectProvider(config));
        registry.registerProvider('local', ProviderType.LOCAL, (config) =>
            new LocalProvider(config));

        factory = new AIProviderFactory('/test/vault');
    });

    afterEach(() => {
        Logger.resetInstance();
    });

    describe('initialization', () => {
        it('should initialize successfully', () => {
            expect(factory).toBeInstanceOf(AIProviderFactory);
        });
    });

    describe('createFromConfig', () => {
        it('should throw error for unconfigured provider', () => {
            expect(() => factory.createFromConfig(mockConfig, 'unknown-provider')).toThrow(
                'Provider \'unknown-provider\' not configured'
            );
        });

        it('should handle provider configuration', () => {
            // Test passes config validation
            expect(mockConfig.defaultProvider).toBe('claude-agent');
            expect(mockConfig.providers['claude-client']).toBeDefined();
        });

        it('should create provider when a direct provider key is available', () => {
            process.env.TEST_SECRET_CLAUDE_CLIENT = 'direct-key';
            const provider = factory.createFromConfig(mockConfig, 'claude-client');
            expect(provider).toBeInstanceOf(ClaudeDirectProvider);
        });

        it('should fall back to generic anthropic key for claude-* providers', () => {
            process.env.TEST_SECRET_ANTHROPIC = 'shared-key';
            const provider = factory.createFromConfig(mockConfig, 'claude-agent');
            expect(provider).toBeInstanceOf(ClaudeAgentProvider);
        });

        it('should fall back to another Anthropic provider key when generic key is missing', () => {
            process.env.TEST_SECRET_CLAUDE_CLIENT = 'shared-from-client';
            const provider = factory.createFromConfig(mockConfig, 'claude-agent');
            expect(provider).toBeInstanceOf(ClaudeAgentProvider);
        });
    });

    describe('clearCache', () => {
        it('should clear the cache', () => {
            factory.clearCache();
            // Just verify method exists and doesn't throw
            expect(true).toBe(true);
        });
    });

    describe('removeFromCache', () => {
        it('should return false for non-existent provider', () => {
            const removed = factory.removeFromCache('non-existent');

            expect(removed).toBe(false);
        });
    });

    describe('localOverride', () => {
        const configWithLocal: AIConfig = {
            defaultProvider: 'claude-agent',
            providers: {
                'claude-agent': {
                    type: ProviderType.ANTHROPIC,
                    model: 'claude-sonnet-4-5-20250929',
                    maxTokens: 4096,
                    temperature: 0.7,
                },
                'local': {
                    type: ProviderType.LOCAL,
                    model: 'default-local-model',
                    maxTokens: 2048,
                    temperature: 0.7,
                    options: { backend: 'lmstudio' },
                },
            },
            localOverride: { enabled: true, model: 'override-model' },
        };

        it('should redirect non-local provider to local when override is enabled', () => {
            const provider = factory.createFromConfig(configWithLocal, 'claude-agent');
            expect(provider).toBeInstanceOf(LocalProvider);
            expect(provider.getConfig().model).toBe('override-model');
        });

        it('should redirect in createWithAgentConfig when override is enabled', () => {
            const provider = factory.createWithAgentConfig(configWithLocal, {
                model: 'claude-sonnet-4-5-20250929',
            });
            expect(provider).toBeInstanceOf(LocalProvider);
            expect(provider.getConfig().model).toBe('override-model');
        });

        it('should not override agent that already specifies provider: local', () => {
            const provider = factory.createWithAgentConfig(configWithLocal, {
                provider: 'local',
                model: 'my-specific-local-model',
            });
            expect(provider).toBeInstanceOf(LocalProvider);
            // Agent keeps its own model, not the override model
            expect(provider.getConfig().model).toBe('my-specific-local-model');
        });

        it('should use normal behavior when override is disabled', () => {
            const disabledConfig: AIConfig = {
                ...configWithLocal,
                localOverride: { enabled: false, model: 'override-model' },
            };
            process.env.TEST_SECRET_ANTHROPIC = 'test-key';
            const provider = factory.createFromConfig(disabledConfig, 'claude-agent');
            expect(provider).toBeInstanceOf(ClaudeAgentProvider);
        });

        it('should throw when override is enabled but no local provider configured', () => {
            const noLocalConfig: AIConfig = {
                defaultProvider: 'claude-agent',
                providers: {
                    'claude-agent': {
                        type: ProviderType.ANTHROPIC,
                        model: 'claude-sonnet-4-5-20250929',
                        maxTokens: 4096,
                        temperature: 0.7,
                    },
                },
                localOverride: { enabled: true, model: 'override-model' },
            };
            expect(() => factory.createFromConfig(noLocalConfig, 'claude-agent')).toThrow(
                'localOverride is enabled but no "local" provider is configured'
            );
        });

        it('should use default provider with override when no explicit provider requested', () => {
            const provider = factory.createFromConfig(configWithLocal);
            expect(provider).toBeInstanceOf(LocalProvider);
            expect(provider.getConfig().model).toBe('override-model');
        });

        it('should use normal behavior when localOverride is undefined', () => {
            const noOverrideConfig: AIConfig = {
                defaultProvider: 'claude-agent',
                providers: {
                    'claude-agent': {
                        type: ProviderType.ANTHROPIC,
                        model: 'claude-sonnet-4-5-20250929',
                        maxTokens: 4096,
                        temperature: 0.7,
                    },
                    'local': {
                        type: ProviderType.LOCAL,
                        model: 'default-local-model',
                        maxTokens: 2048,
                        temperature: 0.7,
                        options: { backend: 'lmstudio' },
                    },
                },
            };
            process.env.TEST_SECRET_ANTHROPIC = 'test-key';
            const provider = factory.createFromConfig(noOverrideConfig, 'claude-agent');
            expect(provider).toBeInstanceOf(ClaudeAgentProvider);
        });

        it('should use override model not base local model', () => {
            // The override model should be used, not the local provider's configured model
            const provider = factory.createFromConfig(configWithLocal, 'claude-agent');
            expect(provider.getConfig().model).toBe('override-model');
            expect(provider.getConfig().model).not.toBe('default-local-model');
        });

        it('should redirect createWithAgentConfig with no agentConfig', () => {
            const provider = factory.createWithAgentConfig(configWithLocal);
            expect(provider).toBeInstanceOf(LocalProvider);
            expect(provider.getConfig().model).toBe('override-model');
        });

        it('should redirect createWithAgentConfig with agent temperature override', () => {
            const provider = factory.createWithAgentConfig(configWithLocal, {
                temperature: 0.2,
            });
            // Even with agent overrides, local override takes precedence for non-local providers
            expect(provider).toBeInstanceOf(LocalProvider);
            expect(provider.getConfig().model).toBe('override-model');
        });

        it('should not override when explicitly requesting local provider in createFromConfig', () => {
            const provider = factory.createFromConfig(configWithLocal, 'local');
            expect(provider).toBeInstanceOf(LocalProvider);
            // Gets the base local model, not the override model
            expect(provider.getConfig().model).toBe('default-local-model');
        });

        it('should throw for createWithAgentConfig when override enabled but no local provider', () => {
            const noLocalConfig: AIConfig = {
                defaultProvider: 'claude-agent',
                providers: {
                    'claude-agent': {
                        type: ProviderType.ANTHROPIC,
                        model: 'claude-sonnet-4-5-20250929',
                        maxTokens: 4096,
                        temperature: 0.7,
                    },
                },
                localOverride: { enabled: true, model: 'override-model' },
            };
            expect(() => factory.createWithAgentConfig(noLocalConfig)).toThrow(
                'localOverride is enabled but no "local" provider is configured'
            );
        });
    });
});

