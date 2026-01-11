/**
 * Configuration validator
 * Validates config structure and required fields
 */

import type { IConfigValidator, SparkConfig } from '../types/config.js';
import { SparkError } from '../types/index.js';
import { ProviderType } from '../types/provider.js';

export class ConfigValidator implements IConfigValidator {
  public validate(config: unknown): SparkConfig {
    if (!config || typeof config !== 'object') {
      throw new SparkError('Configuration must be an object', 'INVALID_CONFIG');
    }

    const cfg = config as Record<string, unknown>;

    this.validateEngine(cfg.engine);
    this.validateAI(cfg.ai);
    this.validateLogging(cfg.logging);
    this.validateFeatures(cfg.features);

    return cfg as unknown as SparkConfig;
  }

  private validateEngine(engine: unknown): void {
    if (!engine || typeof engine !== 'object') {
      throw new SparkError('engine configuration is required', 'INVALID_CONFIG_ENGINE');
    }

    const d = engine as Record<string, unknown>;

    if (!d.watch || typeof d.watch !== 'object') {
      throw new SparkError('engine.watch is required', 'INVALID_CONFIG_WATCH');
    }

    const watch = d.watch as Record<string, unknown>;
    if (!Array.isArray(watch.patterns) || watch.patterns.length === 0) {
      throw new SparkError('engine.watch.patterns must be a non-empty array', 'INVALID_PATTERNS');
    }

    if (!Array.isArray(watch.ignore)) {
      throw new SparkError('engine.watch.ignore must be an array', 'INVALID_IGNORE');
    }

    if (typeof d.debounce_ms !== 'number') {
      throw new SparkError('engine.debounce_ms must be a number', 'INVALID_DEBOUNCE');
    }

    if (d.debounce_ms < 0) {
      throw new SparkError('engine.debounce_ms must be a non-negative number', 'INVALID_DEBOUNCE');
    }
  }

  private validateAI(ai: unknown): void {
    if (!ai || typeof ai !== 'object') {
      throw new SparkError('ai configuration is required', 'INVALID_CONFIG_AI');
    }

    const a = ai as Record<string, unknown>;

    // Validate multi-provider format
    if (a.defaultProvider && a.providers) {
      this.validateMultiProviderConfig(a);
    } else {
      throw new SparkError(
        'ai.defaultProvider and ai.providers are required',
        'INVALID_AI_PROVIDER'
      );
    }
  }

  private validateMultiProviderConfig(a: Record<string, unknown>): void {
    // Validate defaultProvider
    if (!a.defaultProvider || typeof a.defaultProvider !== 'string') {
      throw new SparkError('ai.defaultProvider must be a string', 'INVALID_AI_PROVIDER');
    }

    // Validate providers object
    if (!a.providers || typeof a.providers !== 'object') {
      throw new SparkError('ai.providers must be an object', 'INVALID_AI_PROVIDER');
    }

    const providers = a.providers as Record<string, unknown>;

    // Check if defaultProvider exists in providers
    if (!(a.defaultProvider in providers)) {
      throw new SparkError(
        `ai.defaultProvider "${a.defaultProvider}" not found in ai.providers`,
        'INVALID_AI_PROVIDER'
      );
    }

    // Validate each provider configuration
    for (const [name, config] of Object.entries(providers)) {
      this.validateProviderConfig(name, config);
    }
  }

  private validateProviderConfig(name: string, config: unknown): void {
    if (!config || typeof config !== 'object') {
      throw new SparkError(`ai.providers.${name} must be an object`, 'INVALID_PROVIDER_CONFIG');
    }

    const c = config as Record<string, unknown>;

    // Validate type
    if (!c.type || typeof c.type !== 'string') {
      throw new SparkError(`ai.providers.${name}.type is required`, 'INVALID_PROVIDER_CONFIG');
    }

    const validTypes = Object.values(ProviderType);
    if (!validTypes.includes(c.type as ProviderType)) {
      throw new SparkError(
        `ai.providers.${name}.type must be one of: ${validTypes.join(', ')}`,
        'INVALID_PROVIDER_CONFIG'
      );
    }

    // Validate model
    if (!c.model || typeof c.model !== 'string' || c.model.trim().length === 0) {
      throw new SparkError(
        `ai.providers.${name}.model is required and must be a non-empty string`,
        'INVALID_PROVIDER_CONFIG'
      );
    }

    // No additional optional field validation needed

    if (c.maxTokens !== undefined && typeof c.maxTokens !== 'number') {
      throw new SparkError(
        `ai.providers.${name}.maxTokens must be a number`,
        'INVALID_PROVIDER_CONFIG'
      );
    }

    if (c.temperature !== undefined && typeof c.temperature !== 'number') {
      throw new SparkError(
        `ai.providers.${name}.temperature must be a number`,
        'INVALID_PROVIDER_CONFIG'
      );
    }

    if (c.fallbackProvider !== undefined && typeof c.fallbackProvider !== 'string') {
      throw new SparkError(
        `ai.providers.${name}.fallbackProvider must be a string`,
        'INVALID_PROVIDER_CONFIG'
      );
    }
  }

  private validateLogging(logging: unknown): void {
    if (!logging || typeof logging !== 'object') {
      throw new SparkError('logging configuration is required', 'INVALID_CONFIG_LOGGING');
    }

    const l = logging as Record<string, unknown>;

    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!l.level || !validLevels.includes(l.level as string)) {
      throw new SparkError(
        `logging.level must be one of: ${validLevels.join(', ')}`,
        'INVALID_LOG_LEVEL'
      );
    }
  }

  private validateFeatures(features: unknown): void {
    if (!features || typeof features !== 'object') {
      throw new SparkError('features configuration is required', 'INVALID_CONFIG_FEATURES');
    }

    const f = features as Record<string, unknown>;

    if (typeof f.slash_commands !== 'boolean') {
      throw new SparkError('features.slash_commands must be a boolean', 'INVALID_FEATURE_FLAG');
    }

    if (typeof f.chat_assistant !== 'boolean') {
      throw new SparkError('features.chat_assistant must be a boolean', 'INVALID_FEATURE_FLAG');
    }

    if (typeof f.trigger_automation !== 'boolean') {
      throw new SparkError('features.trigger_automation must be a boolean', 'INVALID_FEATURE_FLAG');
    }
  }
}
