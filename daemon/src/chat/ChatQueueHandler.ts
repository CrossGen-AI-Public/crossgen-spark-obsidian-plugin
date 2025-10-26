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

export class ChatQueueHandler {
  constructor(
    private vaultPath: string,
    private commandExecutor: CommandExecutor,
    private mentionParser: MentionParser,
    private logger: Logger
  ) {}

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

      this.writeResult({
        conversationId: queueId.split('-')[0] || 'unknown',
        queueId,
        timestamp: Date.now(),
        agent: 'System',
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error',
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
}
