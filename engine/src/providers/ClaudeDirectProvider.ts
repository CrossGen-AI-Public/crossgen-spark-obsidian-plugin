/**
 * Claude Direct Provider
 * Wraps ClaudeClient to implement IAIProvider interface
 * Uses direct Anthropic SDK (not Agent SDK)
 */

import { ClaudeClient } from '../ai/ClaudeClient.js';
import { Logger } from '../logger/Logger.js';
import type { AICompletionResult } from '../types/ai.js';
import { SparkError } from '../types/index.js';
import type {
  IAIProvider,
  ProviderCompletionOptions,
  ProviderConfig,
  ProviderContextFile,
} from '../types/provider.js';
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

    // Get API key from config (populated from secrets)
    const apiKey = config.apiKey;

    if (!apiKey) {
      throw new SparkError(
        'API key not provided. Add your API key in the Spark plugin settings.',
        'API_KEY_NOT_SET'
      );
    }

    // Create ClaudeClient with config
    this.client = new ClaudeClient(apiKey, {
      model: config.model,
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
  private buildPrompt(options: ProviderCompletionOptions): string {
    const sections: string[] = [];

    this.appendSystemPrompt(sections, options);
    this.appendOptionalTag(sections, 'agent_persona', options.context?.agentPersona);
    this.appendOptionalTag(
      sections,
      'additional_instructions',
      options.context?.additionalInstructions
    );
    this.appendFilesContext(sections, options.context?.files);

    // Main prompt/instructions
    sections.push(options.prompt);

    return sections.join('\n');
  }

  private appendSystemPrompt(sections: string[], options: ProviderCompletionOptions): void {
    const systemPrompt = this.getSystemPrompt(options);
    if (!systemPrompt) return;
    sections.push('<system>', systemPrompt, '</system>', '');
  }

  private getSystemPrompt(options: ProviderCompletionOptions): string {
    const configPrompt =
      typeof this.config.systemPrompt === 'string' ? this.config.systemPrompt : '';
    return configPrompt || options.systemPrompt || '';
  }

  private appendOptionalTag(sections: string[], tagName: string, value: string | undefined): void {
    if (!value) return;
    sections.push(`<${tagName}>`, value, `</${tagName}>`, '');
  }

  private appendFilesContext(sections: string[], files: ProviderContextFile[] | undefined): void {
    if (!files || files.length === 0) return;

    this.appendFilesContextForPriority(sections, files, 'high');
    this.appendFilesContextForPriority(sections, files, 'medium');
    this.appendFilesContextForPriority(sections, files, 'low');
  }

  private appendFilesContextForPriority(
    sections: string[],
    files: ProviderContextFile[],
    priority: 'high' | 'medium' | 'low'
  ): void {
    const priorityFiles = files.filter((f) => f.priority === priority);
    if (priorityFiles.length === 0) return;

    sections.push(`<context priority="${priority}">`);
    priorityFiles.forEach((file) => {
      sections.push(this.buildFileOpenTag(file), file.content, '</file>', '');
    });
    sections.push('</context>', '');
  }

  private buildFileOpenTag(file: { path: string; note?: string }): string {
    const noteAttr = file.note ? ` note="${file.note}"` : '';
    return `<file path="${file.path}"${noteAttr}>`;
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
      // Active 4.x models (recommended)
      'claude-sonnet-4-5-20250929',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-1-20250805',
      // Active 3.x models
      'claude-3-5-haiku-20241022',
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
