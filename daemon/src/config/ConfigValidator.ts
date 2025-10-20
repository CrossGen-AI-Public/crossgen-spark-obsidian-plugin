/**
 * Configuration validator
 * Validates config structure and required fields
 */

import type { IConfigValidator, SparkConfig } from '../types/config.js';
import { SparkError } from '../types/index.js';

export class ConfigValidator implements IConfigValidator {
  public validate(config: unknown): SparkConfig {
    if (!config || typeof config !== 'object') {
      throw new SparkError('Configuration must be an object', 'INVALID_CONFIG');
    }

    const cfg = config as Record<string, unknown>;

    this.validateDaemon(cfg.daemon);
    this.validateAI(cfg.ai);
    this.validateLogging(cfg.logging);
    this.validateFeatures(cfg.features);

    return cfg as unknown as SparkConfig;
  }

  private validateDaemon(daemon: unknown): void {
    if (!daemon || typeof daemon !== 'object') {
      throw new SparkError('daemon configuration is required', 'INVALID_CONFIG_DAEMON');
    }

    const d = daemon as Record<string, unknown>;

    if (!d.watch || typeof d.watch !== 'object') {
      throw new SparkError('daemon.watch is required', 'INVALID_CONFIG_WATCH');
    }

    const watch = d.watch as Record<string, unknown>;
    if (!Array.isArray(watch.patterns) || watch.patterns.length === 0) {
      throw new SparkError('daemon.watch.patterns must be a non-empty array', 'INVALID_PATTERNS');
    }

    if (!Array.isArray(watch.ignore)) {
      throw new SparkError('daemon.watch.ignore must be an array', 'INVALID_IGNORE');
    }

    if (typeof d.debounce_ms !== 'number') {
      throw new SparkError('daemon.debounce_ms must be a number', 'INVALID_DEBOUNCE');
    }

    if (d.debounce_ms < 0) {
      throw new SparkError('daemon.debounce_ms must be a non-negative number', 'INVALID_DEBOUNCE');
    }
  }

  private validateAI(ai: unknown): void {
    if (!ai || typeof ai !== 'object') {
      throw new SparkError('ai configuration is required', 'INVALID_CONFIG_AI');
    }

    const a = ai as Record<string, unknown>;

    if (!a.provider || typeof a.provider !== 'string') {
      throw new SparkError('ai.provider is required', 'INVALID_AI_PROVIDER');
    }

    const validProviders = ['claude', 'openai', 'local'];
    if (!validProviders.includes(a.provider as string)) {
      throw new SparkError(
        `ai.provider must be one of: ${validProviders.join(', ')}`,
        'INVALID_AI_PROVIDER'
      );
    }

    if (a.provider === 'claude') {
      if (!a.claude || typeof a.claude !== 'object') {
        throw new SparkError(
          'ai.claude configuration is required when provider is "claude"',
          'INVALID_CLAUDE_CONFIG'
        );
      }
      this.validateClaudeConfig(a.claude as Record<string, unknown>);
    }
  }

  private validateClaudeConfig(claude: Record<string, unknown>): void {
    // Validate model
    if (!claude.model || typeof claude.model !== 'string') {
      throw new SparkError('ai.claude.model is required', 'INVALID_CLAUDE_MODEL');
    }

    if (claude.model.trim().length === 0) {
      throw new SparkError('ai.claude.model cannot be empty', 'INVALID_CLAUDE_MODEL');
    }

    // Validate known model patterns
    const validModelPrefixes = ['claude-', 'gpt-']; // Allow gpt- for potential future compatibility
    const hasValidPrefix = validModelPrefixes.some((prefix) =>
      (claude.model as string).startsWith(prefix)
    );

    if (!hasValidPrefix) {
      throw new SparkError(
        `ai.claude.model should start with one of: ${validModelPrefixes.join(', ')}. Got: ${claude.model}`,
        'INVALID_CLAUDE_MODEL'
      );
    }

    // Validate api_key_env
    if (!claude.api_key_env || typeof claude.api_key_env !== 'string') {
      throw new SparkError('ai.claude.api_key_env is required', 'INVALID_CLAUDE_API_KEY_ENV');
    }

    if (claude.api_key_env.trim().length === 0) {
      throw new SparkError('ai.claude.api_key_env cannot be empty', 'INVALID_CLAUDE_API_KEY_ENV');
    }

    // Validate max_tokens
    if (typeof claude.max_tokens !== 'number') {
      throw new SparkError('ai.claude.max_tokens must be a number', 'INVALID_CLAUDE_MAX_TOKENS');
    }

    if (claude.max_tokens <= 0) {
      throw new SparkError(
        'ai.claude.max_tokens must be greater than 0',
        'INVALID_CLAUDE_MAX_TOKENS'
      );
    }

    if (claude.max_tokens > 200000) {
      throw new SparkError(
        'ai.claude.max_tokens is too large (max 200,000)',
        'INVALID_CLAUDE_MAX_TOKENS'
      );
    }

    // Validate temperature
    if (typeof claude.temperature !== 'number') {
      throw new SparkError('ai.claude.temperature must be a number', 'INVALID_CLAUDE_TEMPERATURE');
    }

    if (claude.temperature < 0 || claude.temperature > 1) {
      throw new SparkError(
        'ai.claude.temperature must be between 0 and 1',
        'INVALID_CLAUDE_TEMPERATURE'
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
