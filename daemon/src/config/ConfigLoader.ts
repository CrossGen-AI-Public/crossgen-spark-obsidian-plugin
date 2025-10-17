/**
 * Configuration loader
 * Loads and validates Spark configuration from vault
 */

import { readFileSync, existsSync } from 'fs';
import { parse as parseYAML } from 'yaml';
import { join } from 'path';
import type { IConfigLoader, SparkConfig } from '../types/config.js';
import { ConfigDefaults } from './ConfigDefaults.js';
import { ConfigValidator } from './ConfigValidator.js';
import { SparkError } from '../types/index.js';

export class ConfigLoader implements IConfigLoader {
  private validator: ConfigValidator;

  constructor() {
    this.validator = new ConfigValidator();
  }

  public async load(vaultPath: string): Promise<SparkConfig> {
    const configPath = join(vaultPath, '.spark', 'config.yaml');

    if (!existsSync(configPath)) {
      throw new SparkError(`Configuration file not found at ${configPath}`, 'CONFIG_NOT_FOUND', {
        configPath,
      });
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const userConfig = parseYAML(content);

      // Merge with defaults
      const config = ConfigDefaults.merge(userConfig as Partial<SparkConfig>);

      // Validate
      const validated = this.validator.validate(config);

      return validated;
    } catch (error) {
      if (error instanceof SparkError) {
        throw error;
      }

      throw new SparkError(
        `Failed to load configuration: ${(error as Error).message}`,
        'CONFIG_LOAD_FAILED',
        { originalError: error }
      );
    }
  }
}
