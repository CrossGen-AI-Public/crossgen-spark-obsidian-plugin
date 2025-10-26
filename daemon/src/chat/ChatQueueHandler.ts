/**
 * Handles chat queue file processing
 * Reuses existing CommandExecutor, MentionParser, and other components
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import type { Logger } from '../logger/Logger.js';
import type { CommandExecutor } from '../execution/CommandExecutor.js';
import type { MentionParser } from '../parser/MentionParser.js';
import type { ParsedCommand, ParsedMention } from '../types/parser.js';
import { ErrorWriter } from '../results/ErrorWriter.js';

export class ChatQueueHandler {
  private errorWriter: ErrorWriter;

  constructor(
    private vaultPath: string,
    private commandExecutor: CommandExecutor,
    private mentionParser: MentionParser,
    private logger: Logger
  ) {
    this.errorWriter = new ErrorWriter(vaultPath);
  }

  /**
   * Check if a path is a chat queue file
   */
  isChatQueueFile(path: string): boolean {
    return path.startsWith('.spark/chat-queue/') && path.endsWith('.md');
  }

  /**
   * Process a chat queue file
   */
  async process(relativePath: string): Promise<void> {
    const fullPath = join(this.vaultPath, relativePath);
    const queueId = basename(relativePath, '.md');

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const parsed = this.parseQueueFile(content);

      this.logger.debug('Parsed chat message', {
        conversationId: parsed.conversationId,
        queueId: parsed.queueId,
      });

      // Parse mentions and build command
      const mentions = this.mentionParser.parse(parsed.userMessage);

      // If no agent explicitly mentioned, inject primaryAgent to ensure proper routing
      const agentMention = mentions.find((m) => m.type === 'agent');
      if (!agentMention && parsed.primaryAgent) {
        mentions.unshift({
          type: 'agent',
          value: parsed.primaryAgent,
          raw: `@${parsed.primaryAgent}`,
          position: 0,
        });
        this.logger.debug('Injected primary agent into mentions', {
          primaryAgent: parsed.primaryAgent,
        });
      }

      let fullPrompt = parsed.userMessage;
      if (parsed.context) {
        fullPrompt = `Context from previous messages:\n${parsed.context}\n\n${parsed.userMessage}`;
      }

      const command: ParsedCommand = {
        line: 0,
        raw: fullPrompt,
        fullText: fullPrompt,
        status: 'pending',
        isComplete: true,
        type: 'mention-chain',
        mentions,
      };

      // Use active file for context if available, otherwise use vault root
      const contextPath = parsed.activeFile
        ? join(this.vaultPath, parsed.activeFile)
        : this.vaultPath;

      this.logger.debug('Using context path for chat', {
        activeFile: parsed.activeFile,
        contextPath,
      });

      // Reuse CommandExecutor for AI processing (without writing to queue file)
      const aiResponse = await this.commandExecutor.executeAndReturn(command, contextPath);

      // Write result to JSONL
      this.writeResult({
        conversationId: parsed.conversationId,
        queueId: parsed.queueId,
        timestamp: Date.now(),
        agent: this.extractAgentName(mentions, parsed.primaryAgent),
        content: aiResponse,
      });

      unlinkSync(fullPath);
      this.logger.debug('Queue file processed', { path: relativePath });
    } catch (error) {
      this.logger.error('Chat queue processing failed', {
        path: relativePath,
        error: error instanceof Error ? error.message : String(error),
      });

      // Try to extract conversationId from file content if parse failed
      let conversationId = 'unknown';
      try {
        const content = readFileSync(fullPath, 'utf-8');
        const match = content.match(/conversation_id:\s*(.+)/);
        if (match && match[1]) {
          conversationId = match[1].trim();
        } else {
          // Fallback: extract from queueId (format: conversationId-timestamp)
          // queueId like "chat-1761512613391-1761512618581" should extract "chat-1761512613391"
          const parts = queueId.split('-');
          if (parts.length >= 2) {
            conversationId = parts.slice(0, -1).join('-');
          }
        }
      } catch {
        // If we can't read file, use fallback extraction
        const parts = queueId.split('-');
        if (parts.length >= 2) {
          conversationId = parts.slice(0, -1).join('-');
        }
      }

      // Write error log file and notification
      try {
        await this.errorWriter.writeError({
          error,
          filePath: relativePath,
          commandLine: 0,
        });
      } catch (writeError) {
        // Log but don't fail if error writing fails
        this.logger.error('Failed to write error log', { writeError });
      }

      // Also write error to chat result for UI display
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
  }

  private parseQueueFile(content: string): {
    conversationId: string;
    queueId: string;
    userMessage: string;
    context: string;
    activeFile?: string;
    primaryAgent?: string;
  } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
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
      /<!-- spark-chat-message -->\n([\s\S]*?)\n<!-- \/spark-chat-message -->/
    );
    if (!messageMatch || !messageMatch[1]) {
      throw new Error('Invalid queue file: missing chat message');
    }

    const contextMatch = content.match(
      /<!-- spark-chat-context -->\n([\s\S]*?)\n<!-- \/spark-chat-context -->/
    );

    return {
      conversationId: conversationIdMatch[1].trim(),
      queueId: queueIdMatch[1].trim(),
      userMessage: messageMatch[1].trim(),
      context: contextMatch && contextMatch[1] ? contextMatch[1].trim() : '',
      activeFile: activeFileMatch && activeFileMatch[1] ? activeFileMatch[1].trim() : undefined,
      primaryAgent:
        primaryAgentMatch && primaryAgentMatch[1] ? primaryAgentMatch[1].trim() : undefined,
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
  }): void {
    const resultsDir = join(this.vaultPath, '.spark', 'chat-results');

    if (!existsSync(resultsDir)) {
      mkdirSync(resultsDir, { recursive: true });
    }

    const resultFile = join(resultsDir, `${result.conversationId}.jsonl`);
    writeFileSync(resultFile, JSON.stringify(result) + '\n', { flag: 'a' });

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
    if (jsonMatch && jsonMatch[1]) {
      return jsonMatch[1];
    }

    // Clean up common error prefixes
    message = message
      .replace(/^Claude Agent SDK error:\s*/, '')
      .replace(/^Claude API error:\s*\d+\s*/, '');

    return message || 'An unexpected error occurred';
  }
}
