/**
 * Claude API client
 * Adapter pattern - wraps @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk';
import type { IAIClient, AICompletionOptions, AICompletionResult } from '../types/ai.js';
import type { ClaudeConfig } from '../types/config.js';
import { Logger } from '../logger/Logger.js';
import { SparkError } from '../types/index.js';

export class ClaudeClient implements IAIClient {
  private client: Anthropic;
  private logger: Logger;
  private config: ClaudeConfig;

  constructor(apiKey: string, config: ClaudeConfig) {
    this.client = new Anthropic({ apiKey });
    this.config = config;
    this.logger = Logger.getInstance();
    this.logger.info('ClaudeClient initialized', {
      model: config.model,
      maxTokens: config.max_tokens,
      temperature: config.temperature,
    });
  }

  async complete(prompt: string, options: AICompletionOptions = {}): Promise<AICompletionResult> {
    // Use config values, allow options to override
    const model = options.model || this.config.model;
    const maxTokens = options.max_tokens || this.config.max_tokens;
    const temperature = options.temperature ?? this.config.temperature;

    this.logger.debug('Claude API call', {
      promptLength: prompt.length,
      model,
      maxTokens,
      temperature,
    });

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      });

      return this.processResponse(response);
    } catch (error: unknown) {
      this.handleAPIError(error);
    }
  }

  /**
   * Process and validate Claude API response
   */
  private processResponse(response: Anthropic.Messages.Message): AICompletionResult {
    if (!response.content || response.content.length === 0) {
      throw new SparkError('Empty response from Claude API', 'AI_ERROR');
    }

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new SparkError('Unexpected response type', 'AI_ERROR');
    }

    const textContent = 'text' in content ? content.text : '';

    this.logger.debug('Claude API response', {
      outputLength: textContent.length,
      stopReason: response.stop_reason,
    });

    return {
      content: textContent,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  /**
   * Handle API errors with proper classification and logging
   */
  private handleAPIError(error: unknown): never {
    const err = error as { status?: number; message?: string; cause?: { code?: string } };
    const errorMessage = err.message || 'Unknown error';
    const errorCode = this.classifyError(err);
    const retryable = errorCode !== 'AI_CLIENT_ERROR';

    this.logger.error('Claude API error', {
      error,
      errorCode,
      retryable,
    });

    throw new SparkError(`Claude API error: ${errorMessage}`, errorCode, {
      originalError: error,
      apiKeyEnv: this.config.api_key_env,
    });
  }

  /**
   * Classify error type based on error details
   */
  private classifyError(err: { status?: number; cause?: { code?: string } }): string {
    // Check for network errors (DNS, connection, timeout)
    if (this.isNetworkError(err)) {
      return 'AI_NETWORK_ERROR';
    }

    // Server errors (5xx) are retryable
    if (err.status && err.status >= 500) {
      return 'AI_SERVER_ERROR';
    }

    // Client errors (4xx, invalid input, etc.)
    return 'AI_CLIENT_ERROR';
  }

  /**
   * Check if error is a network connectivity issue
   */
  private isNetworkError(err: { cause?: { code?: string } }): boolean {
    const networkErrorCodes = ['ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN'];
    return !!(err.cause?.code && networkErrorCodes.includes(err.cause.code));
  }
}
