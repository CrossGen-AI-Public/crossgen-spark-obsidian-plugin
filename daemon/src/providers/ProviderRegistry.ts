/**
 * Provider Registry
 * Singleton registry for AI providers
 * Manages provider registration and lookup
 */

import type {
  IAIProvider,
  ProviderRegistration,
  ProviderFactoryFunction,
  ProviderConfig,
} from '../types/provider.js';
import type { ProviderType } from '../types/provider.js';
import { SparkError } from '../types/index.js';
import { Logger } from '../logger/Logger.js';

export class ProviderRegistry {
  private static instance: ProviderRegistry | null = null;
  private providers: Map<string, ProviderRegistration> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    ProviderRegistry.instance = null;
  }

  /**
   * Register a provider
   */
  register(registration: ProviderRegistration): void {
    if (this.providers.has(registration.name)) {
      this.logger.warn('Overwriting existing provider registration', {
        provider: registration.name,
      });
    }

    this.providers.set(registration.name, registration);
    this.logger.debug('Provider registered', {
      provider: registration.name,
      type: registration.type,
    });
  }

  /**
   * Register a provider with simplified parameters
   */
  registerProvider(
    name: string,
    type: ProviderType,
    factory: ProviderFactoryFunction,
    defaultConfig?: Partial<ProviderConfig>
  ): void {
    this.register({
      name,
      type,
      factory,
      defaultConfig,
    });
  }

  /**
   * Get provider registration
   */
  get(name: string): ProviderRegistration | null {
    return this.providers.get(name) || null;
  }

  /**
   * Check if provider is registered
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all providers of a specific type
   */
  getProvidersByType(type: ProviderType): ProviderRegistration[] {
    return Array.from(this.providers.values()).filter((reg) => reg.type === type);
  }

  /**
   * Create provider instance
   */
  createProvider(name: string, config: ProviderConfig): IAIProvider {
    const registration = this.get(name);
    if (!registration) {
      throw new SparkError(`Provider '${name}' not registered`, 'PROVIDER_NOT_FOUND', {
        availableProviders: this.getProviderNames(),
      });
    }

    try {
      // Merge default config with provided config
      const fullConfig: ProviderConfig = {
        ...registration.defaultConfig,
        ...config,
        name,
        type: registration.type,
      };

      const provider = registration.factory(fullConfig);
      this.logger.info('Provider created', { provider: name, type: registration.type });
      return provider;
    } catch (error) {
      this.logger.error('Failed to create provider', { provider: name, error });

      // If it's already a SparkError, re-throw it to preserve the specific error message
      if (error instanceof SparkError) {
        throw error;
      }

      // Otherwise wrap it
      throw new SparkError(`Failed to create provider '${name}'`, 'PROVIDER_INIT_FAILED', {
        originalError: error,
      });
    }
  }

  /**
   * Unregister a provider
   */
  unregister(name: string): boolean {
    const deleted = this.providers.delete(name);
    if (deleted) {
      this.logger.debug('Provider unregistered', { provider: name });
    }
    return deleted;
  }

  /**
   * Clear all registrations (for testing)
   */
  clear(): void {
    this.providers.clear();
    this.logger.debug('All providers unregistered');
  }
}
