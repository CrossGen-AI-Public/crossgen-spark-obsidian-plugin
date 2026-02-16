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
import { ProviderType } from '../types/provider.js';
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
   * Create provider from engine AI configuration
   */
  createFromConfig(aiConfig: AIConfig, providerName?: string): IAIProvider {
    const targetProvider = providerName || aiConfig.defaultProvider;

    if (!targetProvider) {
      throw new SparkError('No provider specified', 'PROVIDER_NOT_SPECIFIED', {
        availableProviders: this.registry.getProviderNames(),
      });
    }

    // Local override: redirect non-local providers to local
    const redirected = this.applyLocalOverride(aiConfig, targetProvider);
    if (redirected) return redirected;

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
   * Create provider with agent-specific overrides and optional explicit model override.
   * When modelOverride is set (from user's dropdown), it takes priority over agent config
   * and skips local override redirect (user made an explicit choice).
   */
  createWithAgentConfig(
    aiConfig: AIConfig,
    agentConfig?: { provider?: string; model?: string; temperature?: number; maxTokens?: number },
    modelOverride?: string
  ): IAIProvider {
    // Explicit model override from user dropdown takes priority
    if (modelOverride) {
      return this.createFromModelOverride(aiConfig, agentConfig, modelOverride);
    }

    const providerName = agentConfig?.provider || aiConfig.defaultProvider;

    this.logger.debug('Selecting provider', {
      agentRequestedProvider: agentConfig?.provider,
      defaultProvider: aiConfig.defaultProvider,
      selectedProvider: providerName,
      configuredProviders: Object.keys(aiConfig.providers),
    });

    // Local override: redirect non-local agents to local model
    // Agents that already specify provider: 'local' keep their own model
    const redirected = this.applyLocalOverride(aiConfig, providerName);
    if (redirected) return redirected;

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
   * Create provider from an explicit model override (user's dropdown selection).
   * Determines provider type from the model ID:
   * - Models containing '/' are local (e.g. "lmstudio-community/Qwen2.5-3B")
   * - Models starting with 'claude-' are Anthropic
   * Skips local override redirect since user made an explicit choice.
   */
  private createFromModelOverride(
    aiConfig: AIConfig,
    agentConfig: { temperature?: number; maxTokens?: number } | undefined,
    modelOverride: string
  ): IAIProvider {
    const isLocal = modelOverride.includes('/');
    const providerName = isLocal ? 'local' : aiConfig.defaultProvider;

    this.logger.info('Using explicit model override from dropdown', {
      modelOverride,
      resolvedProvider: providerName,
    });

    const providerConfig = aiConfig.providers[providerName];
    if (!providerConfig) {
      throw new SparkError(`Provider '${providerName}' not configured`, 'PROVIDER_NOT_CONFIGURED', {
        configuredProviders: Object.keys(aiConfig.providers),
      });
    }

    const config: ProviderConfig = this.convertConfiguration(providerName, {
      ...providerConfig,
      model: modelOverride,
      temperature: agentConfig?.temperature ?? providerConfig.temperature,
      maxTokens: agentConfig?.maxTokens ?? providerConfig.maxTokens,
    });

    // Always create fresh instance (override model varies)
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
   * If localOverride is enabled and the target provider is not already 'local',
   * redirect to the local provider with the override model.
   * Returns the local provider instance, or null if no override applies.
   */
  private applyLocalOverride(aiConfig: AIConfig, targetProvider: string): IAIProvider | null {
    const override = aiConfig.localOverride;
    if (!override?.enabled) return null;

    // Don't override providers that are already local
    const targetConfig = aiConfig.providers[targetProvider];
    if (targetConfig?.type === ProviderType.LOCAL) return null;

    const localProviderConfig = aiConfig.providers.local;
    if (!localProviderConfig) {
      throw new SparkError(
        'localOverride is enabled but no "local" provider is configured',
        'PROVIDER_NOT_CONFIGURED',
        { configuredProviders: Object.keys(aiConfig.providers) }
      );
    }

    this.logger.info('Local override active, redirecting to local provider', {
      originalProvider: targetProvider,
      overrideModel: override.model,
    });

    // Create local provider with the override model (bypass cache — model may differ)
    const config: ProviderConfig = this.convertConfiguration('local', {
      ...localProviderConfig,
      model: override.model,
    });

    return this.registry.createProvider('local', config);
  }

  /**
   * Convert ProviderConfiguration to ProviderConfig
   * Injects API key from secrets.yaml if available
   */
  private convertConfiguration(name: string, config: ProviderConfiguration): ProviderConfig {
    const apiKey = this.resolveApiKey(name);

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

  private resolveApiKey(name: string): string | undefined {
    if (!this.secretsLoader) return undefined;

    const direct = this.secretsLoader.getApiKey(name);
    if (direct) return direct;

    if (!name.startsWith('claude-')) return undefined;
    return this.resolveSharedAnthropicApiKey(name);
  }

  private resolveSharedAnthropicApiKey(name: string): string | undefined {
    if (!this.secretsLoader) return undefined;

    const generic = this.secretsLoader.getApiKey('anthropic');
    if (generic) return generic;

    const anthropicProviders = ['claude-agent', 'claude-client', 'claude-code'];
    return this.findFirstAvailableApiKey(anthropicProviders, name);
  }

  private findFirstAvailableApiKey(
    providerNames: string[],
    excludeName: string
  ): string | undefined {
    if (!this.secretsLoader) return undefined;

    for (const provider of providerNames) {
      if (provider === excludeName) continue;

      const key = this.secretsLoader.getApiKey(provider);
      if (key) {
        this.logger.debug(`Using shared API key from ${provider} for ${excludeName}`);
        return key;
      }
    }

    return undefined;
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
