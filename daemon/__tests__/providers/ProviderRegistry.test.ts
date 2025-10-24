/**
 * ProviderRegistry Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ProviderRegistry } from '../../src/providers/ProviderRegistry.js';
import { ClaudeAgentProvider } from '../../src/providers/ClaudeAgentProvider.js';
import { Logger } from '../../src/logger/Logger.js';
import type { ProviderConfig } from '../../src/types/provider.js';

// Mock the Claude Agent SDK
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
    query: jest.fn(),
}));

describe('ProviderRegistry', () => {
    let registry: ProviderRegistry;

    beforeEach(() => {
        // Reset logger and registry before each test
        Logger.resetInstance();
        Logger.getInstance({ level: 'error', console: false });
        ProviderRegistry.resetInstance();
        registry = ProviderRegistry.getInstance();

        // Set up test API key
        process.env.ANTHROPIC_API_KEY = 'test-api-key-for-tests';
    });

    afterEach(() => {
        Logger.resetInstance();
    });

    describe('singleton', () => {
        it('should return same instance', () => {
            const instance1 = ProviderRegistry.getInstance();
            const instance2 = ProviderRegistry.getInstance();

            expect(instance1).toBe(instance2);
        });

        it('should reset instance', () => {
            const instance1 = ProviderRegistry.getInstance();
            ProviderRegistry.resetInstance();
            const instance2 = ProviderRegistry.getInstance();

            expect(instance1).not.toBe(instance2);
        });
    });

    describe('registerProvider', () => {
        it('should register a provider with simplified method', () => {
            const factory = (config: ProviderConfig) => new ClaudeAgentProvider(config);

            registry.registerProvider('test-provider', 'claude', factory);

            expect(registry.has('test-provider')).toBe(true);
        });

        it('should overwrite existing provider with warning', () => {
            const factory1 = (config: ProviderConfig) => new ClaudeAgentProvider(config);
            const factory2 = (config: ProviderConfig) => new ClaudeAgentProvider(config);

            registry.registerProvider('test-provider', 'claude', factory1);
            registry.registerProvider('test-provider', 'claude', factory2);

            expect(registry.has('test-provider')).toBe(true);
        });
    });

    describe('get', () => {
        it('should get registered provider registration', () => {
            const factory = (config: ProviderConfig) => new ClaudeAgentProvider(config);
            registry.registerProvider('test-provider', 'claude', factory);

            const registration = registry.get('test-provider');

            expect(registration).toBeDefined();
            expect(registration?.name).toBe('test-provider');
            expect(registration?.type).toBe('claude');
        });

        it('should return null for unregistered provider', () => {
            const registration = registry.get('unknown-provider');
            expect(registration).toBeNull();
        });
    });

    describe('has', () => {
        it('should return true for registered provider', () => {
            const factory = (config: ProviderConfig) => new ClaudeAgentProvider(config);
            registry.registerProvider('test-provider', 'claude', factory);

            expect(registry.has('test-provider')).toBe(true);
        });

        it('should return false for unregistered provider', () => {
            expect(registry.has('unknown-provider')).toBe(false);
        });
    });

    describe('getProviderNames', () => {
        it('should list all registered providers', () => {
            const factory1 = (config: ProviderConfig) => new ClaudeAgentProvider(config);
            const factory2 = (config: ProviderConfig) => new ClaudeAgentProvider(config);

            registry.registerProvider('provider1', 'claude', factory1);
            registry.registerProvider('provider2', 'claude', factory2);

            const providers = registry.getProviderNames();

            expect(providers).toContain('provider1');
            expect(providers).toContain('provider2');
            expect(providers.length).toBe(2);
        });

        it('should return empty array when no providers registered', () => {
            const providers = registry.getProviderNames();

            expect(providers).toEqual([]);
        });
    });

    describe('getProvidersByType', () => {
        it('should filter providers by type', () => {
            const factory = (config: ProviderConfig) => new ClaudeAgentProvider(config);
            registry.registerProvider('claude-provider', 'claude', factory);

            const claudeProviders = registry.getProvidersByType('claude');

            expect(claudeProviders.length).toBe(1);
            expect(claudeProviders[0]?.name).toBe('claude-provider');
        });

        it('should return empty array for type with no providers', () => {
            const openAIProviders = registry.getProvidersByType('openai');
            expect(openAIProviders).toEqual([]);
        });
    });

    describe('unregister', () => {
        it('should unregister a provider', () => {
            const factory = (config: ProviderConfig) => new ClaudeAgentProvider(config);
            registry.registerProvider('test-provider', 'claude', factory);

            const result = registry.unregister('test-provider');

            expect(result).toBe(true);
            expect(registry.has('test-provider')).toBe(false);
        });

        it('should return false for non-existent provider', () => {
            const result = registry.unregister('non-existent');
            expect(result).toBe(false);
        });
    });

    describe('clear', () => {
        it('should clear all registrations', () => {
            const factory1 = (config: ProviderConfig) => new ClaudeAgentProvider(config);
            const factory2 = (config: ProviderConfig) => new ClaudeAgentProvider(config);

            registry.registerProvider('provider1', 'claude', factory1);
            registry.registerProvider('provider2', 'claude', factory2);

            registry.clear();

            expect(registry.getProviderNames()).toEqual([]);
        });
    });
});

