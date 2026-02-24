/**
 * Claude Code CLI Provider
 * Uses the claude-code CLI for API calls to leverage Max subscriptions
 *
 * This provider enables users with Claude Code Max subscriptions to use
 * their existing subscription instead of paying separately for API keys.
 * We still control context loading and proximity ranking - Claude Code CLI
 * is just used for making the API call.
 */

import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import { Logger } from '../logger/Logger.js';
import type { AICompletionResult } from '../types/ai.js';
import { SparkError } from '../types/index.js';
import type { IAIProvider, ProviderCompletionOptions, ProviderConfig } from '../types/provider.js';
import { ProviderType } from '../types/provider.js';

const execAsync = promisify(exec);

export class ClaudeCodeProvider implements IAIProvider {
  public readonly name: string;
  public readonly type = ProviderType.ANTHROPIC;
  private config: ProviderConfig;
  private logger: Logger;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.config = config;
    this.logger = Logger.getInstance();
    this.logger.info(`ClaudeCodeProvider (${this.name}) initialized`);
  }

  /**
   * Check if running on Windows
   */
  private isWindows(): boolean {
    return platform() === 'win32';
  }

  async complete(options: ProviderCompletionOptions): Promise<AICompletionResult> {
    // Check if claude-code CLI is available
    await this.checkCliAvailable();

    this.logger.debug('Claude Code CLI call', {
      model: options.model || this.config.model,
      promptLength: options.prompt.length,
      contextFiles: options.context?.files?.length || 0,
    });

    // Build system prompt with context
    const systemPrompt = this.buildSystemPrompt(options);

    this.logger.debug('System prompt built', {
      systemPromptLength: systemPrompt.length,
      systemPromptPreview:
        systemPrompt.substring(0, 1000) + (systemPrompt.length > 1000 ? '...' : ''),
    });

    try {
      // Build the full prompt
      const fullPrompt = `${systemPrompt}\n\n${options.prompt}`;

      // Call claude CLI (Claude Code)
      // Using --model flag to specify model, and piping prompt via stdin
      const model = options.model || this.config.model;

      // Build command differently for Windows vs Unix
      const command = this.isWindows()
        ? `echo ${this.escapeForShellWindows(fullPrompt)} | claude --model ${model}`
        : `echo ${this.escapeForShellUnix(fullPrompt)} | claude --model ${model}`;

      this.logger.debug('Executing claude CLI', { model, command: command.substring(0, 100) });

      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large responses
        timeout: 300000, // 5 minute timeout
        windowsHide: true,
        ...(this.isWindows() && { shell: 'powershell.exe' }),
      });

      if (stderr) {
        this.logger.warn('Claude Code CLI stderr', { stderr });
      }

      // Parse the response
      // The CLI outputs just the text response, not JSON
      const content = stdout.trim();

      if (!content) {
        throw new SparkError('Claude Code CLI returned empty response', 'PROVIDER_CALL_FAILED', {
          stdout,
          stderr,
        });
      }

      this.logger.debug('Claude Code CLI response received', {
        contentLength: content.length,
        contentPreview: content.substring(0, 200),
      });

      // Note: CLI doesn't provide token usage, so we estimate
      // Rough estimate: ~4 chars per token
      const estimatedInputTokens = Math.ceil(fullPrompt.length / 4);
      const estimatedOutputTokens = Math.ceil(content.length / 4);

      return {
        content,
        usage: {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
        },
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Check if claude CLI is available
   */
  private async checkCliAvailable(): Promise<void> {
    try {
      const command = this.isWindows() ? 'where.exe claude' : 'which claude';
      await execAsync(command, { windowsHide: true });
    } catch (error) {
      throw new SparkError(
        'Claude CLI not found. Please install it: npm install -g @anthropic-ai/claude-code',
        'PROVIDER_INIT_FAILED',
        {
          hint: 'Or authenticate with: claude auth',
          originalError: error,
        }
      );
    }
  }

  /**
   * Escape string for Unix shell (bash)
   */
  private escapeForShellUnix(str: string): string {
    // Replace single quotes with '\'' and wrap in single quotes
    return `'${str.replace(/'/g, "'\\''")}'`;
  }

  /**
   * Escape string for Windows PowerShell
   */
  private escapeForShellWindows(str: string): string {
    // Backtick pass must come first so later substitutions don't re-introduce bare backticks
    return `"${str.replace(/`/g, '``').replace(/"/g, '`"').replace(/\$/g, '`$')}"`;
  }

  /**
   * Build system prompt with context
   */
  private buildSystemPrompt(options: ProviderCompletionOptions): string {
    const parts: string[] = [];

    // Add Spark syntax rules for file/folder mentions in responses
    parts.push(
      '# Spark Syntax Rules',
      'When referencing files and folders in your response:',
      '- Reference files by basename only (no extension): @filename (not @folder/filename, not @folder/filename.md)',
      '- Reference folders with trailing slash: @folder/',
      '- This ensures proper decoration and clickability in the UI',
      'Examples: @review-q4-finances, @tasks/, @invoices/',
      ''
    );

    // Add base system prompt if provided
    if (options.systemPrompt) {
      parts.push(options.systemPrompt);
    }

    // Add agent persona from context
    if (options.context?.agentPersona) {
      parts.push(`\nAgent Persona: ${options.context.agentPersona}`);
    }

    // Add additional instructions
    if (options.context?.additionalInstructions) {
      parts.push(`\n${options.context.additionalInstructions}`);
    }

    // Add context files as reference
    if (options.context?.files && options.context.files.length > 0) {
      parts.push('\n# Context Files\n');
      parts.push('The following files are provided for context:\n');
      options.context.files.forEach((file) => {
        parts.push(`\n## ${file.path}`);
        if (file.note) {
          parts.push(`Note: ${file.note}`);
        }
        parts.push(`\`\`\`\n${file.content}\n\`\`\``);
      });
    }

    return parts.join('\n');
  }

  /**
   * Handle errors from Claude Code CLI
   */
  private handleError(error: unknown): never {
    const errorObj = error as { code?: string; message?: string; stderr?: string };

    this.logger.error('Claude Code CLI error', {
      error,
      code: errorObj.code,
      message: errorObj.message,
      stderr: errorObj.stderr,
    });

    // Check for specific error types
    if (errorObj.code === 'ENOENT') {
      throw new SparkError(
        'Claude CLI not found. Please install it: npm install -g @anthropic-ai/claude-code',
        'PROVIDER_INIT_FAILED',
        { originalError: error }
      );
    }

    if (errorObj.message?.includes('not authenticated')) {
      throw new SparkError(
        'Claude CLI not authenticated. Please run: claude auth',
        'API_KEY_NOT_SET',
        { originalError: error }
      );
    }

    if (errorObj.message?.includes('timeout')) {
      throw new SparkError(
        'Claude Code CLI timed out. The request may be too large or the service may be slow.',
        'PROVIDER_CALL_FAILED',
        { originalError: error }
      );
    }

    // Generic error
    const message = errorObj.message || String(error);
    throw new SparkError(`Claude Code CLI error: ${message}`, 'PROVIDER_CALL_FAILED', {
      originalError: error,
    });
  }

  supportsTools(): boolean {
    // Claude Code CLI doesn't expose tools/MCP to external callers
    return false;
  }

  supportsFileOperations(): boolean {
    // Claude Code CLI doesn't support file operations for external callers
    return false;
  }

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

  supportsFallback(): boolean {
    return this.config.fallbackProvider !== undefined;
  }

  getFallbackProvider(): string | null {
    return this.config.fallbackProvider || null;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const command = this.isWindows() ? 'where.exe claude' : 'which claude';
      // Check if CLI is available
      await execAsync(command);
      return true;
    } catch (error) {
      this.logger.error('Health check failed', { provider: this.name, error });
      return false;
    }
  }

  getConfig(): ProviderConfig {
    return {
      name: this.name,
      type: this.type,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      fallbackProvider: this.config.fallbackProvider,
      options: this.config.options,
    };
  }
}
