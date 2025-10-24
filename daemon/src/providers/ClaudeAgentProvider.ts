/**
 * Claude Agent Provider
 * Uses @anthropic-ai/claude-agent-sdk for advanced AI capabilities
 *
 * The Agent SDK provides built-in file operations (read, write, edit)
 * with sandboxing via the `cwd` option.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { IAIProvider, ProviderCompletionOptions, ProviderConfig } from '../types/provider.js';
import type { AICompletionResult } from '../types/ai.js';
import type { ProviderConfiguration } from '../types/config.js';
import { Logger } from '../logger/Logger.js';
import { SparkError } from '../types/index.js';

export class ClaudeAgentProvider implements IAIProvider {
  public readonly name: string;
  public readonly type: 'claude' | 'openai' | 'local' | 'other' = 'claude';
  private config: ProviderConfiguration;
  private logger: Logger;
  private vaultPath: string;

  constructor(config: ProviderConfiguration) {
    if (!config.apiKeyEnv) {
      throw new SparkError(
        'API key environment variable not specified for ClaudeAgentProvider',
        'PROVIDER_INIT_FAILED'
      );
    }

    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      throw new SparkError(
        `${config.apiKeyEnv} environment variable not set for ClaudeAgentProvider`,
        'API_KEY_NOT_SET',
        { apiKeyEnv: config.apiKeyEnv }
      );
    }

    this.name = 'claude-agent';
    this.config = config;
    // Get vaultPath from config.options if available
    this.vaultPath = (config.options?.vaultPath as string) || process.cwd();
    this.logger = Logger.getInstance();
    this.logger.info(`ClaudeAgentProvider (${this.name}) initialized`, {
      vaultPath: this.vaultPath,
    });
  }

  async complete(options: ProviderCompletionOptions): Promise<AICompletionResult> {
    const apiKey = process.env[this.config.apiKeyEnv!];
    if (!apiKey) {
      throw new SparkError(
        `${this.config.apiKeyEnv} environment variable not set`,
        'API_KEY_NOT_SET'
      );
    }

    this.logger.debug('Claude Agent SDK call', {
      model: this.config.model,
      promptLength: options.prompt.length,
      contextFiles: options.context?.files?.length || 0,
    });

    // Build system prompt with context
    const systemPrompt = this.buildSystemPrompt(options);

    this.logger.debug('System prompt built', {
      systemPromptLength: systemPrompt.length,
      // In debug mode, show first 1000 chars instead of 500 for better visibility
      systemPromptPreview:
        systemPrompt.substring(0, 1000) + (systemPrompt.length > 1000 ? '...' : ''),
    });

    try {
      // Set API key in environment for SDK to use
      const originalApiKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = apiKey;

      try {
        // Call Claude Agent SDK
        // The SDK returns an async generator that yields messages
        // The SDK has built-in file operations - we just set cwd for sandboxing
        const resultGenerator = query({
          prompt: options.prompt,
          options: {
            model: this.config.model,
            systemPrompt,
            maxTurns: 15, // Allow more turns for complex multi-file operations
            cwd: this.vaultPath, // SDK's built-in file operations will use this as base
            mcpServers: {}, // Explicitly disable MCP servers - we don't need them
            // Explicitly allow file operation tools (capitalized names per SDK docs)
            allowedTools: ['Read', 'Write', 'Edit'],
            // Auto-approve all file operations (we're already sandboxed via cwd)
            canUseTool: async () => ({
              behavior: 'allow' as const,
              updatedInput: {},
            }),
            // Hooks for logging tool usage
            hooks: {
              PreToolUse: [
                {
                  hooks: [
                    async (input) => {
                      const hookInput = input as {
                        tool_name: string;
                        tool_input: Record<string, unknown>;
                      };
                      this.logger.info(`🔧 Tool: ${hookInput.tool_name}`, {
                        tool: hookInput.tool_name,
                        input: hookInput.tool_input,
                      });
                      return {};
                    },
                  ],
                },
              ],
              PostToolUse: [
                {
                  hooks: [
                    async (input) => {
                      const hookInput = input as {
                        tool_name: string;
                        tool_input: Record<string, unknown>;
                        tool_response: Record<string, unknown>;
                      };
                      this.logger.debug(`✅ Tool result: ${hookInput.tool_name}`, {
                        tool: hookInput.tool_name,
                        result: hookInput.tool_response,
                      });
                      return {};
                    },
                  ],
                },
              ],
            },
          },
        });

        return await this.processQueryResults(resultGenerator);
      } finally {
        // Restore original API key
        if (originalApiKey !== undefined) {
          process.env.ANTHROPIC_API_KEY = originalApiKey;
        } else {
          delete process.env.ANTHROPIC_API_KEY;
        }
      }
    } catch (error) {
      this.logger.error('Claude Agent SDK error', { error });
      throw new SparkError(
        `Claude Agent SDK error: ${error instanceof Error ? error.message : String(error)}`,
        'PROVIDER_CALL_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Process the query results from the SDK's async generator
   */
  private async processQueryResults(
    resultGenerator: AsyncGenerator<unknown, void>
  ): Promise<AICompletionResult> {
    // Iterate through messages to get the final result
    let resultText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const message of resultGenerator) {
      const msg = message as Record<string, unknown>;

      // Log all message types in debug mode to understand SDK responses
      this.logger.debug('SDK message received', {
        type: msg.type,
        subtype: msg.subtype,
        hasUsage: !!msg.usage,
        hasResult: !!msg.result,
      });

      // Look for result messages
      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          resultText = msg.result as string;
          const usage = msg.usage as Record<string, unknown>;
          inputTokens = (usage?.input_tokens as number) || 0;
          outputTokens = (usage?.output_tokens as number) || 0;

          this.logger.debug('SDK usage data', {
            usage,
            inputTokens,
            outputTokens,
          });
        } else {
          // Error during execution
          throw new SparkError(`Agent SDK execution error: ${msg.subtype}`, 'PROVIDER_CALL_FAILED');
        }
      }
      // Accumulate usage from assistant messages as well
      if (msg.type === 'assistant' && msg.usage) {
        const usage = msg.usage as Record<string, unknown>;
        const msgInputTokens = (usage?.input_tokens as number) || 0;
        const msgOutputTokens = (usage?.output_tokens as number) || 0;
        inputTokens += msgInputTokens;
        outputTokens += msgOutputTokens;
      }
    }

    this.logger.debug('Claude Agent SDK response received', {
      resultLength: resultText.length,
      inputTokens,
      outputTokens,
    });

    return {
      content: resultText,
      usage: {
        inputTokens,
        outputTokens,
      },
    };
  }

  supportsTools(): boolean {
    return true;
  }

  supportsFileOperations(): boolean {
    return true;
  }

  getAvailableModels(): string[] {
    return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
  }

  canFallbackTo(providerName: string): boolean {
    // Can fallback to claude-client (the direct SDK provider)
    return providerName === 'claude-client';
  }

  supportsFallback(): boolean {
    return this.config.fallbackProvider !== undefined;
  }

  getFallbackProvider(): string | null {
    return this.config.fallbackProvider || null;
  }

  async isHealthy(): Promise<boolean> {
    // Check if API key is set
    const apiKey = process.env[this.config.apiKeyEnv!];
    if (!apiKey) {
      return false;
    }

    // Simple health check - we could ping the API but that's expensive
    // For now, just check API key existence
    return true;
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

    // Add file operations instructions for Agent SDK
    parts.push(
      'You have access to file operation tools: Read, Write, and Edit. ' +
        'When asked to create or edit files, USE THESE TOOLS IMMEDIATELY instead of describing what you would do. ' +
        'For multi-file operations: plan all files first, then create them all at once without re-thinking between each file. ' +
        'ACTION BIAS: Prefer doing over thinking. Use tools early and often.'
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
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return {
      name: this.name,
      type: this.type as 'claude' | 'openai' | 'local',
      model: this.config.model,
      apiKeyEnv: this.config.apiKeyEnv,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      fallbackProvider: this.config.fallbackProvider,
      options: this.config.options,
    };
  }
}
