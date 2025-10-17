/**
 * Default configuration values
 */

import type { SparkConfig } from '../types/config.js';

export class ConfigDefaults {
  public static getDefaults(): SparkConfig {
    return {
      version: '1.0',
      daemon: {
        watch: {
          patterns: ['**/*.md'],
          ignore: ['.git/**', '.obsidian/**', 'node_modules/**', '.spark/logs/**'],
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
        provider: 'claude',
        claude: {
          model: 'claude-3-5-sonnet-20241022',
          api_key_env: 'ANTHROPIC_API_KEY',
          max_tokens: 4096,
          temperature: 0.7,
        },
      },
      logging: {
        level: 'info',
        console: true,
      },
    };
  }

  public static merge(userConfig: Partial<SparkConfig>): SparkConfig {
    const defaults = this.getDefaults();
    return this.deepMerge(
      defaults as unknown as Record<string, unknown>,
      userConfig as unknown as Record<string, unknown>
    ) as unknown as SparkConfig;
  }

  private static deepMerge(
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
        output[key] = this.deepMerge(
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
}
