/**
 * AI Provider Factory
 * Creates AI provider instances based on configuration
 * Uses ProviderRegistry for provider lookup
 */

import { SecretsLoader } from '../config/SecretsLoader.js';
import { Logger } from '../logger/Logger.js';
import type { AIConfig, ProviderConfiguration } from '../types/config.js';
import { SparkError } from '../types/index.js';
import type { IAIProvider, ProviderConfig } from '../types/provider.js';
import { ProviderRegistry } from './ProviderRegistry.js';

export class AIProviderFactory {
  private registry: ProviderRegistry;
  private logger: Logger;
  private providers: Map<string, IAIProvider> = new Map();
  private vaultPath?: string;
  private secretsLoader?: SecretsLoader;

  constructor(vaultPath?: string) {
    this.registry = ProviderRegistry.getInstance();
    this.logger = Logger.getInstance();
    this.vaultPath = vaultPath;

    // Initialize secrets loader if vault path is available
    if (vaultPath) {
      this.secretsLoader = new SecretsLoader(vaultPath);
      this.secretsLoader.load();
    }
  }

  /**
   * Create or get cached provider instance
   */
  getProvider(name: string, config: ProviderConfig): IAIProvider {
    // Check cache first
    const cached = this.providers.get(name);
    if (cached) {
      this.logger.debug('Using cached provider', { provider: name });
      return cached;
    }

    // Create new provider
    const provider = this.registry.createProvider(name, config);
    this.providers.set(name, provider);
    return provider;
  }

  /**
   * Create provider from daemon AI configuration
   */
  createFromConfig(aiConfig: AIConfig, providerName?: string): IAIProvider {
    const targetProvider = providerName || aiConfig.defaultProvider;

    if (!targetProvider) {
      throw new SparkError('No provider specified', 'PROVIDER_NOT_SPECIFIED', {
        availableProviders: this.registry.getProviderNames(),
      });
    }

    // Get provider configuration
    const providerConfig = aiConfig.providers[targetProvider];
    if (!providerConfig) {
      throw new SparkError(
        `Provider '${targetProvider}' not configured`,
        'PROVIDER_NOT_CONFIGURED',
        {
          configuredProviders: Object.keys(aiConfig.providers),
        }
      );
    }

    // Convert ProviderConfiguration to ProviderConfig
    const config: ProviderConfig = this.convertConfiguration(targetProvider, providerConfig);

    return this.getProvider(targetProvider, config);
  }

  /**
   * Create provider with agent-specific overrides
   */
  createWithAgentConfig(
    aiConfig: AIConfig,
    agentConfig?: { provider?: string; model?: string; temperature?: number; maxTokens?: number }
  ): IAIProvider {
    const providerName = agentConfig?.provider || aiConfig.defaultProvider;

    this.logger.debug('Selecting provider', {
      agentRequestedProvider: agentConfig?.provider,
      defaultProvider: aiConfig.defaultProvider,
      selectedProvider: providerName,
      configuredProviders: Object.keys(aiConfig.providers),
    });

    const providerConfig = aiConfig.providers[providerName];

    if (!providerConfig) {
      throw new SparkError(`Provider '${providerName}' not configured`, 'PROVIDER_NOT_CONFIGURED', {
        configuredProviders: Object.keys(aiConfig.providers),
      });
    }

    // If no agent overrides, use cached provider
    if (
      !agentConfig ||
      (!agentConfig.model && !agentConfig.temperature && !agentConfig.maxTokens)
    ) {
      const config: ProviderConfig = this.convertConfiguration(providerName, providerConfig);
      return this.getProvider(providerName, config);
    }

    // Agent has overrides - create fresh provider instance (don't cache)
    // This ensures each agent's config is respected
    const config: ProviderConfig = this.convertConfiguration(providerName, {
      ...providerConfig,
      model: agentConfig.model || providerConfig.model,
      temperature: agentConfig.temperature ?? providerConfig.temperature,
      maxTokens: agentConfig.maxTokens ?? providerConfig.maxTokens,
    });

    this.logger.debug('Creating provider with agent overrides (bypassing cache)', {
      provider: providerName,
      agentModel: agentConfig.model,
      agentTemperature: agentConfig.temperature,
      agentMaxTokens: agentConfig.maxTokens,
    });

    // Create fresh instance, don't use cache
    return this.registry.createProvider(providerName, config);
  }

  /**
   * Get fallback provider if available
   */
  getFallbackProvider(primaryProviderName: string, aiConfig: AIConfig): IAIProvider | null {
    const primaryConfig = aiConfig.providers[primaryProviderName];
    if (!primaryConfig?.fallbackProvider) {
      return null;
    }

    const fallbackName = primaryConfig.fallbackProvider;
    const fallbackConfig = aiConfig.providers[fallbackName];

    if (!fallbackConfig) {
      this.logger.warn('Fallback provider not configured', {
        primary: primaryProviderName,
        fallback: fallbackName,
      });
      return null;
    }

    try {
      const config = this.convertConfiguration(fallbackName, fallbackConfig);
      return this.getProvider(fallbackName, config);
    } catch (error) {
      this.logger.error('Failed to create fallback provider', {
        fallback: fallbackName,
        error,
      });
      return null;
    }
  }

  /**
   * Check if provider is healthy
   */
  async checkHealth(providerName: string, aiConfig: AIConfig): Promise<boolean> {
    try {
      const provider = this.createFromConfig(aiConfig, providerName);
      return await provider.isHealthy();
    } catch (error) {
      this.logger.error('Health check failed', { provider: providerName, error });
      return false;
    }
  }

  /**
   * Clear provider cache
   */
  clearCache(): void {
    this.providers.clear();
    this.logger.debug('Provider cache cleared');
  }

  /**
   * Remove specific provider from cache
   */
  removeFromCache(name: string): boolean {
    return this.providers.delete(name);
  }

  /**
   * Convert ProviderConfiguration to ProviderConfig
   * Injects API key from secrets.yaml if available
   */
  private convertConfiguration(name: string, config: ProviderConfiguration): ProviderConfig {
    // Get API key from secrets loader only
    let apiKey: string | undefined;
    if (this.secretsLoader) {
      apiKey = this.secretsLoader.getApiKey(name);

      // Fallback for Anthropic providers: try shared keys
      if (!apiKey && name.startsWith('claude-')) {
        // Try generic 'anthropic' key
        apiKey = this.secretsLoader.getApiKey('anthropic');

        // If still no key, try other known Anthropic provider keys
        if (!apiKey) {
          const anthropicProviders = ['claude-agent', 'claude-client', 'claude-code'];
          for (const provider of anthropicProviders) {
            if (provider !== name) {
              apiKey = this.secretsLoader.getApiKey(provider);
              if (apiKey) {
                this.logger.debug(`Using shared API key from ${provider} for ${name}`);
                break;
              }
            }
          }
        }
      }
    }

    return {
      name,
      type: config.type,
      model: config.model,
      apiKey,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      systemPrompt: config.systemPrompt,
      fallbackProvider: config.fallbackProvider,
      options: {
        ...config.options,
        vaultPath: this.vaultPath, // Pass vaultPath to providers that need it
      },
    };
  }

  /**
   * Reload secrets from file (useful for hot reload)
   */
  public reloadSecrets(): void {
    if (this.secretsLoader) {
      this.secretsLoader.reload();
      this.logger.info('Secrets reloaded');
    }
  }
}
