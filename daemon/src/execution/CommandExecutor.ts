/**
 * Command Executor
 * Orchestrates command execution: context loading, prompt building, AI calls, result writing
 */

import type { ContextLoader } from '../context/ContextLoader.js';
import { Logger } from '../logger/Logger.js';
import { AIProviderFactory } from '../providers/index.js';
import { ErrorWriter } from '../results/ErrorWriter.js';
import type { ResultWriter } from '../results/ResultWriter.js';
import type { SparkConfig } from '../types/config.js';
import type { ParsedCommand, ParsedInlineChat } from '../types/parser.js';
import type { ProviderCompletionOptions, ProviderContextFile } from '../types/provider.js';
import { PromptRunner } from '../workflows/PromptRunner.js';
import type { WorkflowPromptRequest } from '../workflows/types.js';

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
   * Get provider factory (for ChatNameGenerator and other services)
   */
  getProviderFactory(): AIProviderFactory {
    return this.providerFactory;
  }

  /**
   * Core AI execution - returns AI response without writing to files
   */
  private async executeAI(command: ParsedCommand, filePath: string): Promise<string> {
    this.logger.info('Executing command', {
      command: command.raw.substring(0, 100),
      file: filePath,
    });

    // Load context including mentioned files and nearby files ranked by proximity
    const context = await this.contextLoader.load(filePath, command.mentions || []);

    this.logger.debug('Context loaded', {
      mentionedFiles: context.mentionedFiles.map((f) => f.path),
      nearbyFiles: context.nearbyFiles.map((f) => ({ path: f.path, distance: f.distance })),
      hasAgent: !!context.agent,
      agentPath: context.agent?.path,
      agentPersonaLength: context.agent?.persona?.length,
    });

    // Get appropriate AI provider (with agent-specific overrides if applicable)
    const provider = this.providerFactory.createWithAgentConfig(
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
        providerOptions.context?.files?.map((f) => ({ path: f.path, priority: f.priority })) || [],
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

    return result.content;
  }

  /**
   * Execute command and return AI response without writing to file
   * Used for chat and other cases where custom result handling is needed
   */
  async executeAndReturn(command: ParsedCommand, filePath: string): Promise<string> {
    return await this.executeAI(command, filePath);
  }

  /**
   * Execute command with inline result writing (standard file-based workflow)
   */

  async execute(command: ParsedCommand, filePath: string): Promise<void> {
    try {
      // Update status to processing
      await this.resultWriter.updateStatus({
        filePath,
        commandLine: command.line,
        commandText: command.raw,
        status: '⏳',
      });

      // Execute AI
      const aiResponse = await this.executeAI(command, filePath);

      // Write result back to file
      await this.resultWriter.writeInline({
        filePath,
        commandLine: command.line,
        commandText: command.raw,
        result: aiResponse,
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
   * Build system prompt specifically for inline chat
   * Different from regular commands - focuses on direct content generation
   */
  private buildInlineChatSystemPrompt(): string {
    const sections: string[] = [];

    sections.push('INLINE CHAT MODE:');
    sections.push(
      'You are responding to an inline request. Your response will be inserted directly into the document at the location where the user asked the question.'
    );
    sections.push('');

    sections.push('CRITICAL INSTRUCTIONS:');
    sections.push(
      '1. DO NOT use file operation tools (Read, Write, Edit). The file context has already been provided to you.'
    );
    sections.push(
      '2. DO NOT write meta-commentary like "I\'ve added..." or "Here is...". Respond with direct content only.'
    );
    sections.push(
      '3. Your response should be the actual content that belongs in the document, not a description of what you did.'
    );
    sections.push('4. Be concise and context-aware based on the surrounding document content.');
    sections.push('');

    sections.push('EXAMPLES:');
    sections.push('❌ Bad: "I\'ve added a paragraph about burn rate. Here it is: Burn rate is..."');
    sections.push('✅ Good: "Burn rate is the monthly rate at which..."');
    sections.push('');
    sections.push(
      '❌ Bad: "I\'ll help you with that. Let me create a summary. The summary is: ..."'
    );
    sections.push('✅ Good: "Q4 revenue exceeded projections by 15%..."');
    sections.push('');

    sections.push('When referencing files and folders:');
    sections.push('- Reference files by basename only: @filename (not @folder/filename.md)');
    sections.push('- Reference folders with trailing slash: @folder/');
    sections.push('- Examples: @review-q4-finances, @tasks/, @invoices/');

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

  /**
   * Execute inline chat - similar to command execution but updates marker instead
   */
  async executeInlineChat(chat: ParsedInlineChat, filePath: string): Promise<void> {
    this.logger.info('Executing inline chat', {
      id: chat.id,
      file: filePath,
      userMessage: chat.userMessage.substring(0, 100),
    });

    try {
      // Execute AI call using user message as prompt
      // No status update to "processing" - it causes feedback loops
      const aiResponse = await this.executeAIForInlineChat(chat, filePath);

      // Write AI response to file (replaces entire chat block with clean response)
      await this.resultWriter.writeInlineChatResponse({
        filePath,
        chatId: chat.id,
        startLine: chat.startLine,
        endLine: chat.endLine,
        response: aiResponse,
      });

      this.logger.info('Inline chat response written to file', {
        filePath,
        chatId: chat.id,
        responseLength: aiResponse.length,
      });
    } catch (error) {
      this.logger.error('Inline chat execution failed', error);

      // On error, replace chat block with error message (no markers)
      await this.resultWriter.writeInlineChatResponse({
        filePath,
        chatId: chat.id,
        startLine: chat.startLine,
        endLine: chat.endLine,
        response: `*Error processing inline chat: ${error instanceof Error ? error.message : String(error)}*`,
      });

      throw error;
    }
  }

  /**
   * Execute AI for inline chat - similar to executeAI but with inline-specific system prompt
   */
  private async executeAIForInlineChat(chat: ParsedInlineChat, filePath: string): Promise<string> {
    this.logger.debug('Executing AI for inline chat', {
      chatId: chat.id,
      file: filePath,
      userMessage: chat.userMessage,
      mentionsCount: chat.mentions?.length || 0,
      mentions: chat.mentions?.map((m) => ({ type: m.type, value: m.value })),
    });

    // Load context including mentioned files and nearby files
    // Mentions were already parsed by InlineChatDetector
    const context = await this.contextLoader.load(filePath, chat.mentions || []);

    this.logger.debug('Context loaded for inline chat', {
      mentionedFiles: context.mentionedFiles.map((f) => f.path),
      nearbyFiles: context.nearbyFiles.map((f) => ({ path: f.path, distance: f.distance })),
      hasAgent: !!context.agent,
      agentPath: context.agent?.path,
      agentPersonaLength: context.agent?.persona?.length,
    });

    // Get appropriate AI provider (with agent-specific overrides if applicable)
    const provider = this.providerFactory.createWithAgentConfig(
      this.config.ai,
      context.agent?.aiConfig
    );

    // Build context files for provider
    const contextFiles: ProviderContextFile[] = [];

    // Add current file first (highest priority)
    contextFiles.push({
      path: context.currentFile.path,
      content: context.currentFile.content,
      priority: 'high',
      note: 'Current file context - your response will be inserted inline',
    });

    // Add mentioned files
    for (const file of context.mentionedFiles) {
      contextFiles.push({
        path: file.path,
        content: file.content,
        priority: 'high',
        note: 'Mentioned file',
      });
    }

    // Add nearby files (use summary instead of full content)
    for (const file of context.nearbyFiles) {
      contextFiles.push({
        path: file.path,
        content: file.summary,
        priority: 'low',
        note: `Nearby file (distance: ${file.distance})`,
      });
    }

    // Build provider completion options with inline chat specific system prompt
    // Include agent persona in the system prompt
    let systemPrompt = this.buildInlineChatSystemPrompt();
    if (context.agent?.persona) {
      systemPrompt = `${context.agent.persona}\n\n${systemPrompt}`;
    }

    const providerOptions: ProviderCompletionOptions = {
      prompt: chat.userMessage,
      systemPrompt,
      context: {
        files: contextFiles,
      },
    };

    this.logger.debug('Calling AI provider for inline chat', {
      provider: provider.name,
      promptLength: providerOptions.prompt.length,
      contextFiles: contextFiles.length,
      hasAgentPersona: !!context.agent?.persona,
    });

    // Call AI
    const response = await provider.complete(providerOptions);

    this.logger.debug('AI response received for inline chat', {
      responseLength: response.content.length,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });

    return response.content;
  }

  /**
   * Execute a workflow prompt step
   * Uses proper separation: system prompt (persona + role) vs user message (context + task)
   */
  async executeWorkflowPrompt(request: WorkflowPromptRequest): Promise<unknown> {
    this.logger.info('Executing workflow prompt', {
      workflowId: request.workflowId,
      nodeId: request.nodeId,
      agentId: request.agentId || 'none',
      stepLabel: request.stepLabel,
    });

    // Load agent context if specified via @agent mention
    let agentConfig:
      | {
          provider?: string;
          model?: string;
          temperature?: number;
          maxTokens?: number;
        }
      | undefined;
    let agentPersona: string | undefined;

    if (request.agentId) {
      // Load agent file to get persona and config
      const agentContext = await this.contextLoader.loadAgentByName(request.agentId);
      if (agentContext) {
        agentConfig = agentContext.aiConfig;
        agentPersona = agentContext.persona;
      }
    }

    // Get appropriate AI provider
    const provider = this.providerFactory.createWithAgentConfig(this.config.ai, agentConfig);

    // Build system prompt (minimal: persona + workflow role)
    const systemPrompt = this.buildWorkflowSystemPrompt(agentPersona, request);

    // Build user message (structured: input context + task + output format)
    const userMessage = this.buildWorkflowUserMessage(request);

    // Build provider options
    const providerOptions: ProviderCompletionOptions = {
      prompt: userMessage,
      systemPrompt,
    };

    this.logger.debug('Calling AI provider for workflow prompt', {
      provider: provider.name,
      userMessageLength: userMessage.length,
      systemPromptLength: systemPrompt.length,
      hasAgentPersona: !!agentPersona,
    });

    // Call AI
    const response = await provider.complete(providerOptions);

    this.logger.debug('Workflow prompt response received', {
      responseLength: response.content.length,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });

    // Always wrap response in consistent structure
    return { content: response.content };
  }

  /**
   * Build system prompt for workflow execution
   * Minimal: agent persona + workflow role addon
   */
  private buildWorkflowSystemPrompt(
    agentPersona: string | undefined,
    request: WorkflowPromptRequest
  ): string {
    const parts: string[] = [];

    // Agent persona first (if any)
    if (agentPersona) {
      parts.push(agentPersona);
      parts.push('');
    }

    // Workflow role addon (minimal)
    parts.push('## Workflow Context');
    parts.push(`You are executing step "${request.stepLabel}" in an automated workflow.`);
    if (request.stepDescription) {
      parts.push(`Purpose: ${request.stepDescription}`);
    }
    parts.push('');

    // Behavior guidelines
    parts.push('## Guidelines');
    parts.push('- Be concise and direct. No preamble or pleasantries.');
    parts.push('- Your output feeds into the next workflow step.');
    parts.push('- Focus on completing the task exactly as specified.');
    parts.push(
      '- Only write to files when explicitly asked (e.g., "save to file", "create a file"). Otherwise, return content directly.'
    );

    return parts.join('\n');
  }

  /**
   * Build user message for workflow execution
   * Structured: Input (primary + context) + Task + Output Format
   */
  private buildWorkflowUserMessage(request: WorkflowPromptRequest): string {
    const parts: string[] = [];

    // Get the primary input value for variable substitution
    const primaryOutput = request.inputContext.primary?.output;

    // Primary input
    if (request.inputContext.primary) {
      parts.push('## Input');
      parts.push(`From step "${request.inputContext.primary.label}":`);
      parts.push('');
      parts.push(PromptRunner.formatOutput(request.inputContext.primary.output));
      parts.push('');
    } else if (request.inputContext.workflowInput !== undefined) {
      parts.push('## Input');
      parts.push('Workflow input:');
      parts.push('');
      parts.push(PromptRunner.formatOutput(request.inputContext.workflowInput));
      parts.push('');
    }

    // Additional context (other inputs)
    if (request.inputContext.context.length > 0) {
      parts.push('## Additional Context');
      for (const ctx of request.inputContext.context) {
        parts.push(`### From "${ctx.label}":`);
        parts.push(PromptRunner.formatOutput(ctx.output));
        parts.push('');
      }
    }

    // The actual task - with variable substitution
    const task = this.substituteVariables(request.task, primaryOutput);
    parts.push('## Task');
    parts.push(task);
    parts.push('');

    // Output format requirements
    if (request.structuredOutput && request.outputSchema) {
      parts.push('## Required Output Format');
      parts.push(
        'CRITICAL: Your ENTIRE response must be valid JSON matching this exact structure:'
      );
      parts.push(request.outputSchema);
      parts.push('');
      parts.push('Rules:');
      parts.push('- Start your response with { and end with }');
      parts.push('- No text before or after the JSON');
      parts.push('- No markdown code fences');
      parts.push('- No explanations or commentary');
    }

    return parts.join('\n');
  }

  /**
   * Substitute $input and $input.fieldname variables in text
   * Supports: $input, $input.field, $context
   */
  private substituteVariables(text: string, input: unknown): string {
    let result = text;

    // Replace $input.fieldname with specific field values (do this first, more specific)
    result = result.replace(/\$input\.(\w+)/g, (_match, fieldName) => {
      if (input && typeof input === 'object' && fieldName in input) {
        const value = (input as Record<string, unknown>)[fieldName];
        return PromptRunner.formatOutput(value);
      }
      // If field doesn't exist, leave the placeholder (will be visible in output)
      return `$input.${fieldName}`;
    });

    // Replace $input with the full input (after field replacements)
    const inputStr = PromptRunner.formatOutput(input);
    result = result.replace(/\$input(?!\.)/g, inputStr);

    // Replace $context with workflow context (minimal info)
    result = result.replace(/\$context/g, '(workflow context)');

    return result;
  }
}
