/**
 * Handles chat queue file processing
 * Reuses existing CommandExecutor, MentionParser, and other components
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ErrorHandler } from '../errors/ErrorHandler.js';
import type { CommandExecutor } from '../execution/CommandExecutor.js';
import type { Logger } from '../logger/Logger.js';
import type { MentionParser } from '../parser/MentionParser.js';
import { ErrorWriter } from '../results/ErrorWriter.js';
import type { ParsedCommand, ParsedMention } from '../types/parser.js';
import { normalizePath } from '../utils/path.js';
import type { ChatNameGenerator } from './ChatNameGenerator.js';

export class ChatQueueHandler {
  private errorWriter: ErrorWriter;
  private processingFiles: Set<string> = new Set();
  private recentlyProcessed: Set<string> = new Set();

  constructor(
    private vaultPath: string,
    private commandExecutor: CommandExecutor,
    private mentionParser: MentionParser,
    private logger: Logger,
    private chatNameGenerator?: ChatNameGenerator
  ) {
    this.errorWriter = new ErrorWriter(vaultPath);
  }

  /**
   * Check if a path is a chat queue file
   */
  isChatQueueFile(path: string): boolean {
    const normalized = normalizePath(path);
    return normalized.startsWith('.spark/chat-queue/') && normalized.endsWith('.md');
  }

  /**
   * Process a chat queue file
   */
  async process(relativePath: string): Promise<void> {
    if (this.shouldSkipProcessing(relativePath)) return;

    this.processingFiles.add(relativePath);
    const fullPath = join(this.vaultPath, relativePath);
    const queueId = basename(relativePath, '.md');

    try {
      const content = this.readQueueFileOrNull(fullPath, relativePath);
      if (content === null) return;

      const parsed = this.parseQueueFile(content);
      this.logger.debug('Parsed chat message', {
        conversationId: parsed.conversationId,
        queueId: parsed.queueId,
      });

      const mentions = this.buildMentions(parsed.userMessage, parsed.primaryAgent);
      const fullPrompt = this.buildFullPrompt(parsed.userMessage, parsed.context);
      const command = this.buildCommand(fullPrompt, mentions);
      const contextPath = this.getContextPath(parsed.activeFile);

      this.logger.debug('Using context path for chat', {
        activeFile: parsed.activeFile,
        contextPath,
      });

      const namePromise = this.startNameGenerationIfFirstMessage(parsed);
      this.handleNameGenerationResult(
        namePromise,
        parsed.conversationId,
        parsed.queueId,
        mentions,
        parsed
      );

      const aiResponse = await this.commandExecutor.executeAndReturn(command, contextPath);
      this.writeFinalResult(
        parsed.conversationId,
        parsed.queueId,
        mentions,
        parsed.primaryAgent,
        aiResponse
      );

      this.deleteQueueFileIfExists(fullPath, relativePath);
      this.logger.debug('Queue file processed', { path: relativePath });
    } catch (error) {
      await this.handleProcessingError(error, fullPath, relativePath, queueId);
    } finally {
      this.processingFiles.delete(relativePath);
      this.markRecentlyProcessed(relativePath);
    }
  }

  private shouldSkipProcessing(relativePath: string): boolean {
    if (this.processingFiles.has(relativePath)) {
      this.logger.debug('File already being processed, skipping', { path: relativePath });
      return true;
    }

    if (this.recentlyProcessed.has(relativePath)) {
      this.logger.debug('File recently processed, skipping', { path: relativePath });
      return true;
    }

    return false;
  }

  private readQueueFileOrNull(fullPath: string, relativePath: string): string | null {
    try {
      return readFileSync(fullPath, 'utf-8');
    } catch (readError) {
      if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.debug('Queue file not found (already processed)', { path: relativePath });
        return null;
      }
      throw readError;
    }
  }

  private buildMentions(userMessage: string, primaryAgent?: string): ParsedMention[] {
    const mentions = this.mentionParser.parse(userMessage);
    if (this.hasExplicitAgentMention(mentions) || !primaryAgent) {
      return mentions;
    }

    mentions.unshift({
      type: 'agent',
      value: primaryAgent,
      raw: `@${primaryAgent}`,
      position: 0,
    });

    this.logger.debug('Injected primary agent into mentions', { primaryAgent });
    return mentions;
  }

  private hasExplicitAgentMention(mentions: ParsedMention[]): boolean {
    return mentions.some((m) => m.type === 'agent');
  }

  private buildFullPrompt(userMessage: string, context: string): string {
    if (!context) return userMessage;
    return `Context from previous messages:\n${context}\n\n${userMessage}`;
  }

  private buildCommand(raw: string, mentions: ParsedMention[]): ParsedCommand {
    return {
      line: 0,
      raw,
      status: 'pending',
      isComplete: true,
      type: 'mention-chain',
      mentions,
    };
  }

  private getContextPath(activeFile?: string): string {
    return activeFile ? join(this.vaultPath, activeFile) : this.vaultPath;
  }

  private startNameGenerationIfFirstMessage(parsed: {
    conversationId: string;
    userMessage: string;
    context: string;
  }): Promise<string | null> {
    const isFirstMessage = !parsed.context || parsed.context.trim().length === 0;
    if (!isFirstMessage || !this.chatNameGenerator) {
      return Promise.resolve(null);
    }

    this.logger.debug('Starting parallel chat name generation', {
      conversationId: parsed.conversationId,
    });

    return this.chatNameGenerator.generate(parsed.userMessage);
  }

  private handleNameGenerationResult(
    namePromise: Promise<string | null>,
    conversationId: string,
    queueId: string,
    mentions: ParsedMention[],
    parsed: { primaryAgent?: string }
  ): void {
    void namePromise.then((name) => {
      if (!name) return;

      this.logger.debug('Chat name generated (parallel)', { conversationId, name });
      this.writeResult({
        conversationId,
        queueId,
        timestamp: Date.now(),
        agent: this.extractAgentName(mentions, parsed.primaryAgent),
        content: '',
        conversationName: name,
      });
    });
  }

  private writeFinalResult(
    conversationId: string,
    queueId: string,
    mentions: ParsedMention[],
    primaryAgent: string | undefined,
    aiResponse: string
  ): void {
    this.writeResult({
      conversationId,
      queueId,
      timestamp: Date.now(),
      agent: this.extractAgentName(mentions, primaryAgent),
      content: aiResponse,
    });
  }

  private deleteQueueFileIfExists(fullPath: string, relativePath: string): void {
    try {
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
      }
    } catch (unlinkError) {
      this.logger.debug('Failed to unlink queue file (might be gone)', {
        path: relativePath,
        error: unlinkError,
      });
    }
  }

  private async handleProcessingError(
    error: unknown,
    fullPath: string,
    relativePath: string,
    queueId: string
  ): Promise<void> {
    this.logger.error('Chat queue processing failed', {
      path: relativePath,
      error: error instanceof Error ? error.message : String(error),
    });

    const conversationId = this.extractConversationIdForError(fullPath, queueId);

    try {
      await this.errorWriter.writeError({
        error,
        filePath: relativePath,
        commandLine: 0,
      });
    } catch (writeError) {
      this.logger.error('Failed to write error log', { writeError });
    }

    this.writeResult({
      conversationId,
      queueId,
      timestamp: Date.now(),
      agent: 'System',
      content: '',
      error: this.formatErrorForChat(error),
    });

    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  private extractConversationIdForError(fullPath: string, queueId: string): string {
    const fallback = this.extractConversationIdFromQueueId(queueId);

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const match = content.match(/conversation_id:\s*(.+)/);
      return match?.[1] ? match[1].trim() : fallback;
    } catch {
      return fallback;
    }
  }

  private extractConversationIdFromQueueId(queueId: string): string {
    const parts = queueId.split('-');
    if (parts.length >= 2) {
      return parts.slice(0, -1).join('-');
    }
    return 'unknown';
  }

  private markRecentlyProcessed(relativePath: string): void {
    this.recentlyProcessed.add(relativePath);
    setTimeout(() => {
      this.recentlyProcessed.delete(relativePath);
    }, 2000);
  }

  private parseQueueFile(content: string): {
    conversationId: string;
    queueId: string;
    userMessage: string;
    context: string;
    activeFile?: string;
    primaryAgent?: string;
  } {
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch || !frontmatterMatch[1]) {
      throw new Error('Invalid queue file: missing frontmatter');
    }

    const frontmatter = frontmatterMatch[1];
    const conversationIdMatch = frontmatter.match(/conversation_id:\s*(.+)/);
    const queueIdMatch = frontmatter.match(/queue_id:\s*(.+)/);
    const activeFileMatch = frontmatter.match(/active_file:\s*(.+)/);
    const primaryAgentMatch = frontmatter.match(/primary_agent:\s*(.+)/);

    if (!conversationIdMatch || !conversationIdMatch[1] || !queueIdMatch || !queueIdMatch[1]) {
      throw new Error('Invalid queue file: missing required frontmatter');
    }

    const messageMatch = content.match(
      /<!-- spark-chat-message -->\r?\n([\s\S]*?)\r?\n<!-- \/spark-chat-message -->/
    );
    if (!messageMatch || !messageMatch[1]) {
      throw new Error('Invalid queue file: missing chat message');
    }

    const contextMatch = content.match(
      /<!-- spark-chat-context -->\r?\n([\s\S]*?)\r?\n<!-- \/spark-chat-context -->/
    );

    return {
      conversationId: conversationIdMatch[1].trim(),
      queueId: queueIdMatch[1].trim(),
      userMessage: messageMatch[1].trim(),
      context: contextMatch?.[1] ? contextMatch[1].trim() : '',
      activeFile: activeFileMatch?.[1] ? activeFileMatch[1].trim() : undefined,
      primaryAgent: primaryAgentMatch?.[1] ? primaryAgentMatch[1].trim() : undefined,
    };
  }

  private writeResult(result: {
    conversationId: string;
    queueId: string;
    timestamp: number;
    agent: string;
    content: string;
    filesModified?: string[];
    error?: string;
    conversationName?: string;
  }): void {
    const resultsDir = join(this.vaultPath, '.spark', 'chat-results');

    if (!existsSync(resultsDir)) {
      mkdirSync(resultsDir, { recursive: true });
    }

    const resultFile = join(resultsDir, `${result.conversationId}.jsonl`);
    writeFileSync(resultFile, `${JSON.stringify(result)}\n`, { flag: 'a' });

    this.logger.debug('Chat result written', { conversationId: result.conversationId });
  }

  private extractAgentName(mentions: ParsedMention[], primaryAgent?: string): string {
    const agentMention = mentions.find((m) => m.type === 'agent');
    // Use explicit mention if present, fallback to primary agent, then "Assistant"
    return agentMention ? agentMention.value : primaryAgent || 'Assistant';
  }

  /**
   * Format error for chat display (user-friendly message)
   */
  private formatErrorForChat(error: unknown): string {
    // Get base error message
    let message = error instanceof Error ? error.message : String(error);

    // For Claude API errors with embedded JSON, extract the clean message
    // Match: Claude API error: 400 {"type":"error","error":{"message":"..."}}
    const jsonMatch = message.match(/\{.*?"message"\s*:\s*"([^"]+)"/);
    if (jsonMatch?.[1]) {
      message = jsonMatch[1];
    } else {
      // Clean up common error prefixes
      message = message
        .replace(/^Claude Agent SDK error:\s*/, '')
        .replace(/^Claude API error:\s*\d+\s*/, '');
    }

    // Add helpful suggestions for SparkErrors (reuse ErrorHandler logic)
    if (error instanceof Error && 'code' in error) {
      const sparkError = error as { code: string; context?: Record<string, unknown> };
      const suggestions = ErrorHandler.getSuggestions(sparkError.code, error);
      if (suggestions.length > 0) {
        message += `\n\n💡 **Suggestions:**\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
      }
    }

    return message || 'An unexpected error occurred';
  }
}
