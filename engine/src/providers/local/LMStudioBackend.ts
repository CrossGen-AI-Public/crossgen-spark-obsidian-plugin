/**
 * LM Studio Backend
 * Implements LocalBackend using @lmstudio/sdk
 */

import { Chat, LMStudioClient } from '@lmstudio/sdk';
import { Logger } from '../../logger/Logger.js';
import { SparkError } from '../../types/index.js';
import type {
  LocalBackend,
  LocalCompletionOptions,
  LocalCompletionResult,
  LocalMessage,
  LocalModelInfo,
} from './LocalBackend.js';

/**
 * Minimal interface for the parts of LMStudioClient we use.
 * Enables constructor injection for testing.
 */
export interface LMStudioClientLike {
  llm: {
    model: (name: string) => Promise<{
      respond: (
        chat: unknown,
        opts: unknown
      ) => { result: () => Promise<{ content: string; stats?: { predictedTokensCount: number } }> };
    }>;
  };
  system: {
    listDownloadedModels: () => Promise<
      Array<{
        path: string;
        displayName: string;
        paramsString?: string;
        sizeBytes: number;
        trainedForToolUse: boolean;
        maxContextLength: number;
        type: string;
      }>
    >;
  };
}

/** How long to wait for the LM Studio server before giving up (ms). */
const CONNECTION_TIMEOUT_MS = 15_000;

export class LMStudioBackend implements LocalBackend {
  readonly name = 'lmstudio';
  private _client: LMStudioClientLike | null;
  private logger: Logger;

  constructor(client?: LMStudioClientLike) {
    // If an explicit client is provided (tests), use it directly.
    // Otherwise, defer creation to avoid an unhandled rejection when LM Studio isn't running.
    this._client = client ?? null;
    this.logger = Logger.getInstance();
  }

  private getClient(): LMStudioClientLike {
    if (!this._client) {
      // The @lmstudio/sdk fires many internal auto-connect promises that reject
      // when the server isn't running. Temporarily intercept unhandled rejections
      // from LMStudioClient so they don't crash the process. Real connection
      // errors are caught by the calling method's try/catch.
      const handler = (reason: unknown) => {
        if (reason instanceof Error && reason.message.includes('Failed to connect to LM Studio')) {
          return; // swallow
        }
      };
      process.on('unhandledRejection', handler);
      setTimeout(() => process.removeListener('unhandledRejection', handler), 10_000);

      this._client = new LMStudioClient() as unknown as LMStudioClientLike;
    }
    return this._client;
  }

  async complete(
    messages: LocalMessage[],
    options: LocalCompletionOptions
  ): Promise<LocalCompletionResult> {
    this.logger.debug('LMStudio complete', {
      model: options.model,
      messageCount: messages.length,
    });

    try {
      // Model lookup can hang forever if LM Studio isn't running (SDK retries internally).
      // Race against a timeout so the user gets a clear error instead of infinite loading.
      const model = await this.withTimeout(
        this.getClient().llm.model(options.model),
        CONNECTION_TIMEOUT_MS,
        options.model
      );
      const chat = Chat.from(messages);
      const prediction = model.respond(chat, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });
      const result = await prediction.result();

      return {
        content: result.content,
        usage: {
          inputTokens: 0, // SDK doesn't expose input token count
          outputTokens: result.stats?.predictedTokensCount ?? 0,
        },
      };
    } catch (error) {
      throw this.wrapError(error, options.model);
    }
  }

  async listModels(): Promise<LocalModelInfo[]> {
    const models = await this.getClient().system.listDownloadedModels();
    return models
      .filter((m) => m.type === 'llm')
      .map((m) => ({
        path: m.path,
        displayName: m.displayName,
        paramsString: m.paramsString ?? '',
        sizeBytes: m.sizeBytes,
        trainedForToolUse: m.trainedForToolUse,
        maxContextLength: m.maxContextLength,
      }));
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.getClient().system.listDownloadedModels();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Race a promise against a timeout. Rejects with a SparkError on timeout.
   */
  private withTimeout<T>(promise: Promise<T>, ms: number, model: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(
            new SparkError(
              'Cannot connect to LM Studio. Is it running?',
              'LOCAL_CONNECTION_ERROR',
              { model, timeout: ms }
            )
          );
        }, ms);
      }),
    ]);
  }

  /**
   * Strip ANSI escape codes and extract clean error message from LM Studio SDK errors.
   */
  private wrapError(error: unknown, model: string): SparkError {
    // Already a SparkError (e.g. from withTimeout) — pass through
    if (error instanceof SparkError) return error;

    const raw = error instanceof Error ? error.message : String(error);
    // Strip ANSI escape codes (ESC [ ... m sequences)
    const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
    const clean = raw.replace(ansiPattern, '').trim();

    // Context length exceeded
    if (clean.includes('n_keep') && clean.includes('n_ctx')) {
      return new SparkError(
        `Prompt too long for local model "${model}". The conversation + context exceeds the model's context window. Try a shorter message or clear conversation history.`,
        'LOCAL_CONTEXT_LENGTH',
        { model, originalError: clean }
      );
    }

    // Model not found
    if (clean.includes('Cannot find a model') || clean.includes('Failed to find the model')) {
      return new SparkError(
        `Model "${model}" not found in LM Studio. Make sure it's downloaded.`,
        'LOCAL_MODEL_NOT_FOUND',
        { model, originalError: clean }
      );
    }

    // Connection error
    if (clean.includes('ECONNREFUSED') || clean.includes('connect')) {
      return new SparkError(
        'Cannot connect to LM Studio. Is it running?',
        'LOCAL_CONNECTION_ERROR',
        {
          model,
          originalError: clean,
        }
      );
    }

    // Generic fallback — still clean the ANSI codes
    return new SparkError(
      `Local model error: ${clean.split('\n').find((l) => l.trim().length > 0 && !l.includes('STACK TRACE') && !l.includes('┌') && !l.includes('└') && !l.includes('│')) || clean.substring(0, 200)}`,
      'LOCAL_MODEL_ERROR',
      { model, originalError: clean }
    );
  }
}
