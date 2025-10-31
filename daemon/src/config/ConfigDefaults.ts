/**
 * Default configuration values
 */

import type { SparkConfig } from '../types/config.js';
import { ProviderType } from '../types/provider.js';

/**
 * Default Spark configuration
 */
export const DEFAULT_SPARK_CONFIG: SparkConfig = {
  version: '1.0',
  daemon: {
    watch: {
      patterns: ['**/*.md'],
      ignore: [
        '.git/**',
        '.obsidian/**',
        'node_modules/**',
        '.spark/agents/**',
        '.spark/commands/**',
        '.spark/conversations/**',
        '.spark/chat-results/**',
        '.spark/logs/**',
        '.spark/config.yaml',
        // Note: .spark/chat-queue/ is watched for chat message processing
      ],
    },
    debounce_ms: 300,
    status_indicators: {
      enabled: true,
      pending: '',
      processing: '⏳',
      completed: '✅',
      error: '❌',
      warning: '⚠️',
    },
    results: {
      mode: 'auto',
      inline_max_chars: 500,
      separate_folder: 'reports/',
      add_blank_lines: true,
    },
  },
  ai: {
    defaultProvider: 'claude-agent',
    providers: {
      'claude-client': {
        type: ProviderType.ANTHROPIC,
        model: 'claude-sonnet-4-5-20250929', // Latest Claude Sonnet 4.5
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        maxTokens: 4096,
        temperature: 0.7,
      },
      'claude-agent': {
        type: ProviderType.ANTHROPIC,
        model: 'claude-sonnet-4-5-20250929', // Latest Claude Sonnet 4.5
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        maxTokens: 4096,
        temperature: 0.7,
      },
    },
  },
  logging: {
    level: 'info',
    file: null,
    console: true,
  },
  features: {
    slash_commands: true,
    chat_assistant: true,
    trigger_automation: true,
  },
};

/**
 * Deep merge two objects, replacing arrays instead of merging them
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const output = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    // If source value is an array, use it directly (don't merge)
    if (Array.isArray(sourceValue)) {
      output[key] = sourceValue;
    }
    // If source is an object (but not an array) and target has the same key, deep merge
    else if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      output[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    }
    // Otherwise, just use the source value
    else {
      output[key] = sourceValue;
    }
  }

  return output;
}

export class ConfigDefaults {
  public static getDefaults(): SparkConfig {
    return DEFAULT_SPARK_CONFIG;
  }

  public static merge(userConfig: Partial<SparkConfig>): SparkConfig {
    return deepMerge(
      DEFAULT_SPARK_CONFIG as unknown as Record<string, unknown>,
      userConfig as unknown as Record<string, unknown>
    ) as unknown as SparkConfig;
  }
}
