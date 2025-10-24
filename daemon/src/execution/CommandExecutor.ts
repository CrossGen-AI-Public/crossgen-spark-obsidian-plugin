/**
 * Command Executor
 * Orchestrates command execution: context loading, prompt building, AI calls, result writing
 */

import type { ParsedCommand } from '../types/parser.js';
import type { SparkConfig } from '../types/config.js';
import type {
  IAIProvider,
  ProviderCompletionOptions,
  ProviderContextFile,
} from '../types/provider.js';
import type { ContextLoader } from '../context/ContextLoader.js';
import type { ResultWriter } from '../results/ResultWriter.js';
import { AIProviderFactory } from '../providers/index.js';
import { Logger } from '../logger/Logger.js';
import { ErrorWriter } from '../results/ErrorWriter.js';

export class CommandExecutor {
  private logger: Logger;
  private errorWriter: ErrorWriter;
  private providerFactory: AIProviderFactory;

  constructor(
    private contextLoader: ContextLoader,
    private resultWriter: ResultWriter,
    private config: SparkConfig,
    vaultPath: string
  ) {
    this.logger = Logger.getInstance();
    this.errorWriter = new ErrorWriter(vaultPath);
    this.providerFactory = new AIProviderFactory(vaultPath);
  }

  /**
   * Execute a command using AI
   */
  // eslint-disable-next-line complexity
  async execute(command: ParsedCommand, filePath: string): Promise<void> {
    this.logger.info('Executing command', {
      command: command.raw.substring(0, 100),
      file: filePath,
    });

    let context = null;
    let provider: IAIProvider | null = null;

    try {
      // Update status to processing
      await this.resultWriter.updateStatus({
        filePath,
        commandLine: command.line,
        commandText: command.raw,
        status: '⏳',
      });

      // Load context including mentioned files and nearby files ranked by proximity
      context = await this.contextLoader.load(filePath, command.mentions || []);

      this.logger.debug('Context loaded', {
        mentionedFiles: context.mentionedFiles.map((f) => f.path),
        nearbyFiles: context.nearbyFiles.map((f) => ({ path: f.path, distance: f.distance })),
        hasAgent: !!context.agent,
        agentPath: context.agent?.path,
        agentPersonaLength: context.agent?.persona?.length,
      });

      // Get appropriate AI provider (with agent-specific overrides if applicable)
      provider = this.providerFactory.createWithAgentConfig(
        this.config.ai,
        context.agent?.aiConfig
      );

      this.logger.debug('Provider selected', {
        provider: provider.name,
        type: provider.type,
        model: provider.getConfig().model,
        hasAgentOverrides: !!context.agent?.aiConfig,
        agentProvider: context.agent?.aiConfig?.provider,
        agentModel: context.agent?.aiConfig?.model,
      });

      // Build provider completion options
      const providerOptions: ProviderCompletionOptions = {
        prompt: command.raw,
        systemPrompt: this.buildSystemPrompt(),
        context: {
          files: this.buildContextFiles(context),
          agentPersona: context.agent?.persona,
        },
      };

      this.logger.debug('Calling AI provider', {
        provider: provider.name,
        promptLength: providerOptions.prompt.length,
        filesCount: providerOptions.context?.files?.length || 0,
        contextFiles:
          providerOptions.context?.files?.map((f) => ({ path: f.path, priority: f.priority })) ||
          [],
      });

      // Log full prompt in debug mode (for troubleshooting)
      this.logger.debug('Full prompt being sent', {
        userPrompt: providerOptions.prompt,
        systemPrompt: providerOptions.systemPrompt,
        contextFileContents:
          providerOptions.context?.files?.map((f) => ({
            path: f.path,
            priority: f.priority,
            contentLength: f.content.length,
            contentPreview: f.content.substring(0, 200) + (f.content.length > 200 ? '...' : ''),
          })) || [],
      });

      // Call AI provider
      const result = await provider.complete(providerOptions);

      this.logger.info('Command executed', {
        provider: provider.name,
        outputTokens: result.usage.outputTokens,
        inputTokens: result.usage.inputTokens,
      });

      this.logger.debug('AI response', { response: result.content });

      // Write result back to file
      await this.resultWriter.writeInline({
        filePath,
        commandLine: command.line,
        commandText: command.raw,
        result: result.content,
        addBlankLines: this.config.daemon.results.add_blank_lines,
      });

      this.logger.info('Result written to file', { filePath });
    } catch (error) {
      this.logger.error('Command execution failed', error);

      // Write error status
      await this.resultWriter.updateStatus({
        filePath,
        commandLine: command.line,
        commandText: command.raw,
        status: '❌',
      });

      // Write detailed error log and notification
      await this.errorWriter.writeError({
        error,
        filePath,
        commandLine: command.line,
        commandText: command.raw,
        context: {
          provider: provider?.name,
          hasAgent: context?.agent ? true : false,
          mentionedFilesCount: context?.mentionedFiles?.length || 0,
          nearbyFilesCount: context?.nearbyFiles?.length || 0,
        },
      });

      throw error;
    }
  }

  /**
   * Build system prompt with Spark conventions
   */
  private buildSystemPrompt(): string {
    const sections: string[] = [];

    sections.push('When referencing files and folders in your response:');
    sections.push(
      '- Reference files by basename only (no extension): @filename (not @folder/filename, not @folder/filename.md)'
    );
    sections.push('- Reference folders with trailing slash: @folder/');
    sections.push('- This ensures proper decoration and clickability in the UI');
    sections.push('Examples: @review-q4-finances, @tasks/, @invoices/');

    return sections.join('\n');
  }

  /**
   * Build context files array from loaded context
   */
  private buildContextFiles(context: {
    mentionedFiles: { path: string; content: string }[];
    currentFile: { path: string; content: string };
    nearbyFiles: { path: string; summary: string; distance: number }[];
  }): ProviderContextFile[] {
    const files: ProviderContextFile[] = [];

    // High priority: Explicitly mentioned files
    for (const file of context.mentionedFiles) {
      files.push({
        path: file.path,
        content: file.content,
        priority: 'high',
      });
    }

    // Medium priority: Current file where command was typed
    files.push({
      path: context.currentFile.path,
      content: context.currentFile.content,
      priority: 'medium',
      note: 'Command was typed here',
    });

    // Low priority: Nearby files (summaries only)
    for (const file of context.nearbyFiles) {
      files.push({
        path: file.path,
        content: file.summary,
        priority: 'low',
        note: `Distance: ${file.distance}`,
      });
    }

    return files;
  }

  /**
   * Check if a command should be executed (not incomplete)
   */
  shouldExecute(command: ParsedCommand): boolean {
    if (!command.isComplete) {
      this.logger.debug('Skipping incomplete command', {
        command: command.raw.substring(0, 50),
        reason: 'missing sentence-ending punctuation',
      });
      return false;
    }
    return true;
  }
}
