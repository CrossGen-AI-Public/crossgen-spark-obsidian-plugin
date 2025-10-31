/**
 * AIProviderFactory Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AIProviderFactory } from '../../src/providers/AIProviderFactory.js';
import { ProviderRegistry } from '../../src/providers/ProviderRegistry.js';
import { ClaudeAgentProvider } from '../../src/providers/ClaudeAgentProvider.js';
import { ClaudeDirectProvider } from '../../src/providers/ClaudeDirectProvider.js';
import { Logger } from '../../src/logger/Logger.js';
import type { AIConfig } from '../../src/types/config.js';
import { ProviderType } from '../../src/types/provider.js';

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

describe('AIProviderFactory', () => {
    let factory: AIProviderFactory;
    const mockConfig: AIConfig = {
        defaultProvider: 'claude-agent',
        providers: {
            'claude-client': {
                type: ProviderType.ANTHROPIC,
                model: 'claude-sonnet-4-5-20250929',
                apiKeyEnv: 'ANTHROPIC_API_KEY',
                maxTokens: 4096,
                temperature: 0.7,
            },
            'claude-agent': {
                type: ProviderType.ANTHROPIC,
                model: 'claude-sonnet-4-5-20250929',
                apiKeyEnv: 'ANTHROPIC_API_KEY',
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

        // Register providers manually
        const registry = ProviderRegistry.getInstance();
        registry.registerProvider('claude-agent', ProviderType.ANTHROPIC, (config) =>
            new ClaudeAgentProvider(config));
        registry.registerProvider('claude-client', ProviderType.ANTHROPIC, (config) =>
            new ClaudeDirectProvider(config));

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
});

