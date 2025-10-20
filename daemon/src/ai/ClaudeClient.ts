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
    } catch (error: unknown) {
      // Server errors are retryable, client errors are not
      const err = error as { status?: number; message?: string };
      const isServerError = err.status ? err.status >= 500 : false;
      const errorMessage = err.message || 'Unknown error';

      this.logger.error('Claude API error', {
        error,
        retryable: isServerError,
      });

      throw new SparkError(
        `Claude API error: ${errorMessage}`,
        isServerError ? 'AI_SERVER_ERROR' : 'AI_CLIENT_ERROR',
        { originalError: error }
      );
    }
  }
}
