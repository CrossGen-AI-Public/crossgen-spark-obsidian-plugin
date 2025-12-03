/**
 * Secrets Loader
 * Loads API keys and other secrets from ~/.spark/secrets.yaml (user-level)
 * Supports both encrypted (AES-256-GCM) and plaintext formats for backward compatibility
 */

import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYAML } from 'yaml';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Logger } from '../logger/Logger.js';
import { decryptSecrets, isEncrypted } from '../crypto/index.js';

interface SecretsFile {
  api_keys?: Record<string, string>;
}

export class SecretsLoader {
  private logger: Logger;
  private secretsPath: string;
  private loadedSecrets: Map<string, string> = new Map();

  constructor(_vaultPath: string) {
    // Secrets are stored at user-level, not vault-level
    this.secretsPath = join(homedir(), '.spark', 'secrets.yaml');
    this.logger = Logger.getInstance();
  }

  /**
   * Load secrets from user-level ~/.spark/secrets.yaml
   * Does not modify process.env directly, but provides getApiKey() method
   */
  public load(): void {
    if (!existsSync(this.secretsPath)) {
      this.logger.debug(
        'No secrets file found at ~/.spark/secrets.yaml, using environment variables only'
      );
      return;
    }

    try {
      const content = readFileSync(this.secretsPath, 'utf-8');

      // Handle empty file
      if (!content.trim()) {
        this.logger.debug('Secrets file is empty');
        return;
      }

      // Decrypt if encrypted
      let yamlContent: string;
      if (isEncrypted(content.trim())) {
        this.logger.debug('Secrets file is encrypted, decrypting...');
        try {
          yamlContent = decryptSecrets(content.trim());
          this.logger.debug('Secrets file decrypted successfully');
        } catch (error) {
          this.logger.error('Failed to decrypt secrets file', {
            error: error instanceof Error ? error.message : String(error),
          });
          throw new Error(
            'Failed to decrypt secrets file. The file may be corrupted or from a different machine.'
          );
        }
      } else {
        // Plaintext YAML (backward compatibility)
        this.logger.debug('Secrets file is plaintext');
        yamlContent = content;
      }

      const secrets = parseYAML(yamlContent) as SecretsFile;

      // Load API keys
      if (secrets.api_keys && typeof secrets.api_keys === 'object') {
        Object.entries(secrets.api_keys).forEach(([providerName, apiKey]) => {
          if (apiKey?.trim()) {
            this.loadedSecrets.set(providerName, apiKey.trim());
            this.logger.debug('Loaded API key from ~/.spark/secrets.yaml', {
              provider: providerName,
              keyLength: apiKey.length,
            });
          }
        });
      }

      this.logger.info('Secrets loaded from ~/.spark/secrets.yaml', {
        apiKeysCount: this.loadedSecrets.size,
      });
    } catch (error) {
      this.logger.warn('Failed to load secrets file', {
        path: this.secretsPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get API key for a provider from secrets.yaml
   *
   * @param providerName - Name of the provider (e.g., 'claude', 'openai')
   */
  public getApiKey(providerName: string): string | undefined {
    const secretKey = this.loadedSecrets.get(providerName);
    if (secretKey) {
      this.logger.debug('Using API key from ~/.spark/secrets.yaml', { provider: providerName });
      return secretKey;
    }

    this.logger.debug('No API key found in ~/.spark/secrets.yaml', { provider: providerName });
    return undefined;
  }

  /**
   * Check if an API key is available for a provider
   */
  public hasApiKey(providerName: string): boolean {
    return this.getApiKey(providerName) !== undefined;
  }

  /**
   * Clear loaded secrets (useful for hot reload)
   */
  public clear(): void {
    this.loadedSecrets.clear();
  }

  /**
   * Reload secrets from file
   */
  public reload(): void {
    this.clear();
    this.load();
  }
}
