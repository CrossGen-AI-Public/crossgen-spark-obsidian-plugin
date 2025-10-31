/**
 * Claude Direct Provider
 * Wraps ClaudeClient to implement IAIProvider interface
 * Uses direct Anthropic SDK (not Agent SDK)
 */

import type { IAIProvider, ProviderConfig, ProviderCompletionOptions } from '../types/provider.js';
import type { AICompletionResult } from '../types/ai.js';
import { ClaudeClient } from '../ai/ClaudeClient.js';
import { Logger } from '../logger/Logger.js';
import { SparkError } from '../types/index.js';
import { ProviderType } from '../types/provider.js';

export class ClaudeDirectProvider implements IAIProvider {
  readonly name: string;
  readonly type = ProviderType.ANTHROPIC;

  private client: ClaudeClient;
  private config: ProviderConfig;
  private logger: Logger;
  private fallbackProviderName: string | null;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.config = config;
    this.logger = Logger.getInstance();
    this.fallbackProviderName = config.fallbackProvider || null;

    // Get API key from environment
    const apiKeyEnv = config.apiKeyEnv || 'ANTHROPIC_API_KEY';
    const apiKey = process.env[apiKeyEnv];

    if (!apiKey) {
      throw new SparkError(
        `API key not set in environment variable: ${apiKeyEnv}`,
        'API_KEY_NOT_SET',
        {
          apiKeyEnv,
        }
      );
    }

    // Create ClaudeClient with config
    this.client = new ClaudeClient(apiKey, {
      model: config.model,
      api_key_env: apiKeyEnv,
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature ?? 0.7,
    });

    this.logger.debug('ClaudeDirectProvider initialized', {
      provider: this.name,
      model: config.model,
    });
  }

  /**
   * Complete a prompt using Claude API
   */
  async complete(options: ProviderCompletionOptions): Promise<AICompletionResult> {
    // Build the full prompt with system prompt and context
    const fullPrompt = this.buildPrompt(options);

    // Call underlying Claude client
    const result = await this.client.complete(fullPrompt, {
      model: options.model || this.config.model,
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
    });

    return result;
  }

  /**
   * Build full prompt from options
   */
  // eslint-disable-next-line complexity
  private buildPrompt(options: ProviderCompletionOptions): string {
    const sections: string[] = [];

    // System prompt
    if (options.systemPrompt || this.config.systemPrompt) {
      const systemPrompt =
        typeof this.config.systemPrompt === 'string'
          ? this.config.systemPrompt
          : options.systemPrompt || '';
      if (systemPrompt) {
        sections.push('<system>', systemPrompt, '</system>', '');
      }
    }

    // Agent persona
    if (options.context?.agentPersona) {
      sections.push('<agent_persona>', options.context.agentPersona, '</agent_persona>', '');
    }

    // Additional instructions
    if (options.context?.additionalInstructions) {
      sections.push(
        '<additional_instructions>',
        options.context.additionalInstructions,
        '</additional_instructions>',
        ''
      );
    }

    // Files context
    if (options.context?.files && options.context.files.length > 0) {
      const filesByPriority = {
        high: options.context.files.filter((f) => f.priority === 'high'),
        medium: options.context.files.filter((f) => f.priority === 'medium'),
        low: options.context.files.filter((f) => f.priority === 'low'),
      };

      // High priority files
      if (filesByPriority.high.length > 0) {
        sections.push('<context priority="high">');
        filesByPriority.high.forEach((file) => {
          sections.push(
            `<file path="${file.path}"${file.note ? ` note="${file.note}"` : ''}>`,
            file.content,
            '</file>',
            ''
          );
        });
        sections.push('</context>', '');
      }

      // Medium priority files
      if (filesByPriority.medium.length > 0) {
        sections.push('<context priority="medium">');
        filesByPriority.medium.forEach((file) => {
          sections.push(
            `<file path="${file.path}"${file.note ? ` note="${file.note}"` : ''}>`,
            file.content,
            '</file>',
            ''
          );
        });
        sections.push('</context>', '');
      }

      // Low priority files
      if (filesByPriority.low.length > 0) {
        sections.push('<context priority="low">');
        filesByPriority.low.forEach((file) => {
          sections.push(
            `<file path="${file.path}"${file.note ? ` note="${file.note}"` : ''}>`,
            file.content,
            '</file>',
            ''
          );
        });
        sections.push('</context>', '');
      }
    }

    // Main prompt/instructions
    sections.push(options.prompt);

    return sections.join('\n');
  }

  /**
   * Check if provider supports tools (MCP, function calling)
   * Direct provider doesn't support tools
   */
  supportsTools(): boolean {
    return false;
  }

  /**
   * Check if provider supports file operations
   * Direct provider doesn't support advanced file operations
   */
  supportsFileOperations(): boolean {
    return false;
  }

  /**
   * Get available Claude models
   */
  getAvailableModels(): string[] {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }

  /**
   * Check if fallback is configured
   */
  supportsFallback(): boolean {
    return this.fallbackProviderName !== null;
  }

  /**
   * Get fallback provider name
   */
  getFallbackProvider(): string | null {
    return this.fallbackProviderName;
  }

  /**
   * Check if provider is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Simple health check - try to get a minimal completion
      await this.client.complete('Test', {
        model: this.config.model,
        max_tokens: 10,
        temperature: 0,
      });
      return true;
    } catch (error) {
      this.logger.error('Health check failed', { provider: this.name, error });
      return false;
    }
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return this.config;
  }
}
