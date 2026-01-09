/**
 * Configuration loader
 * Loads and validates Spark configuration from vault
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYAML } from 'yaml';
import type { IConfigLoader, SparkConfig } from '../types/config.js';
import { SparkError } from '../types/index.js';
import { getDefaults, mergeConfig } from './ConfigDefaults.js';
import { ConfigValidator } from './ConfigValidator.js';

export class ConfigLoader implements IConfigLoader {
  private validator: ConfigValidator;

  constructor() {
    this.validator = new ConfigValidator();
  }

  /**
   * Load and validate configuration with retry logic for mid-edit scenarios
   *
   * Use this for hot reload where config file might be temporarily invalid
   * while user is editing (e.g., deleted a field before typing new value).
   *
   * Retries with exponential backoff: 200ms, 400ms, 800ms (total ~1.6s window)
   *
   * @param vaultPath - Path to vault root
   * @param attempt - Current attempt number (internal, don't set manually)
   * @param maxAttempts - Maximum retry attempts (default: 4)
   * @throws SparkError if all attempts fail
   */
  public async loadWithRetry(
    vaultPath: string,
    attempt: number = 1,
    maxAttempts: number = 4
  ): Promise<SparkConfig> {
    try {
      return await this.load(vaultPath);
    } catch (error) {
      if (attempt < maxAttempts) {
        // Exponential backoff: 200ms, 400ms, 800ms
        const delay = 200 * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return await this.loadWithRetry(vaultPath, attempt + 1, maxAttempts);
      }
      throw error;
    }
  }

  /**
   * Load and validate configuration from vault (fail-fast)
   *
   * Use this for:
   * - Initial engine startup
   * - CLI config validation commands
   * - Any scenario where immediate validation feedback is needed
   *
   * @param vaultPath - Path to vault root
   * @throws SparkError if config is invalid
   */
  public load(vaultPath: string): Promise<SparkConfig> {
    try {
      const configPath = join(vaultPath, '.spark', 'config.yaml');

      // If no config file, return defaults
      if (!existsSync(configPath)) {
        return Promise.resolve(getDefaults());
      }

      const content = readFileSync(configPath, 'utf-8');

      // Handle empty file or only comments
      if (!content.trim() || !content.trim().replace(/#.*/g, '').trim()) {
        return Promise.resolve(getDefaults());
      }

      const userConfig = parseYAML(content);

      // Handle empty YAML
      if (!userConfig || Object.keys(userConfig).length === 0) {
        return Promise.resolve(getDefaults());
      }

      // Merge with defaults
      const config = mergeConfig(userConfig as Partial<SparkConfig>);

      // Validate
      const validated = this.validator.validate(config);

      return Promise.resolve(validated);
    } catch (error) {
      if (error instanceof SparkError) {
        return Promise.reject(error);
      }

      return Promise.reject(
        new SparkError(
          `Failed to load configuration: ${(error as Error).message}`,
          'CONFIG_LOAD_FAILED',
          { originalError: error }
        )
      );
    }
  }

  public getConfigPath(vaultPath: string): string {
    return join(vaultPath, '.spark', 'config.yaml');
  }
}
