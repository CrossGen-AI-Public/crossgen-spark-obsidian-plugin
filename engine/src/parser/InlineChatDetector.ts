/**
 * Inline Chat Detector
 * Detects inline chat markers in markdown files
 */

import type {
  IInlineChatDetector,
  IMentionParser,
  InlineChatStatus,
  ParsedInlineChat,
} from '../types/parser.js';
import { MentionParser } from './MentionParser.js';

export class InlineChatDetector implements IInlineChatDetector {
  private mentionParser: IMentionParser;
  // Opening marker pattern: <!-- spark-inline-chat:status:id --> or <!-- spark-inline-chat:status:id:agent:message -->
  // With optional model override suffix: :model_override=MODEL_ID
  // Captures: status, id, agent (optional), message (optional), model_override (optional)
  private readonly OPENING_MARKER_REGEX =
    /<!--\s*spark-inline-chat:(pending|processing|complete|error):([a-z0-9-]+)(?::([^:]+?))?(?::(.+?))?\s*-->/;

  // Closing marker pattern: <!-- /spark-inline-chat -->
  private readonly CLOSING_MARKER_REGEX = /<!--\s*\/spark-inline-chat\s*-->/;

  constructor() {
    this.mentionParser = new MentionParser();
  }

  /**
   * Detect all inline chat markers in file content
   */
  public detectInFile(content: string): ParsedInlineChat[] {
    const lines = content.split('\n');
    const inlineChats: ParsedInlineChat[] = [];
    let i = 0;

    while (i < lines.length) {
      const parsed = this.tryParseInlineChat(lines, i);
      if (!parsed) {
        i++;
        continue;
      }

      inlineChats.push(parsed.chat);
      i = parsed.nextIndex;
    }

    return inlineChats;
  }

  private tryParseInlineChat(
    lines: string[],
    startIndex: number
  ): { chat: ParsedInlineChat; nextIndex: number } | null {
    const openingMatch = lines[startIndex]?.match(this.OPENING_MARKER_REGEX);
    if (!openingMatch) return null;

    const status = openingMatch[1] as InlineChatStatus;
    const id = openingMatch[2] ?? '';
    const agentInComment = openingMatch[3];
    let messageInComment = openingMatch[4];

    // Extract model_override suffix from message if present
    // Format: message:model_override=MODEL_ID
    let modelOverride: string | undefined;
    if (messageInComment) {
      const modelMatch = messageInComment.match(/:model_override=(.+)$/);
      if (modelMatch?.[1]) {
        modelOverride = modelMatch[1];
        messageInComment = messageInComment.slice(0, modelMatch.index);
      }
    }

    const closingIndex = this.findClosingMarkerIndex(lines, startIndex + 1);
    if (closingIndex === null) return null;

    const contentLines = lines.slice(startIndex + 1, closingIndex);
    const { userMessage, aiResponse } = this.parseInlineChatContent(
      status,
      contentLines,
      messageInComment
    );
    const resolvedUserMessage = this.applyAgentPrefix(agentInComment, userMessage);

    const startLine = startIndex + 1; // 1-indexed
    const endLine = closingIndex + 1; // 1-indexed
    const raw = lines.slice(startIndex, endLine).join('\n');
    const mentions = resolvedUserMessage
      ? this.mentionParser.parse(resolvedUserMessage)
      : undefined;

    return {
      chat: {
        startLine,
        endLine,
        id,
        status,
        userMessage: resolvedUserMessage,
        aiResponse,
        raw,
        mentions,
        modelOverride,
      },
      nextIndex: endLine, // move to line after closing marker (0-indexed)
    };
  }

  private findClosingMarkerIndex(lines: string[], startIndex: number): number | null {
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (line && this.CLOSING_MARKER_REGEX.test(line)) {
        return i;
      }
    }
    return null;
  }

  private parseInlineChatContent(
    status: InlineChatStatus,
    contentLines: string[],
    messageInComment?: string
  ): { userMessage: string; aiResponse?: string } {
    if (status === 'complete') {
      return { userMessage: '', aiResponse: contentLines.join('\n').trim() };
    }

    if (messageInComment) {
      return { userMessage: messageInComment.replace(/\\n/g, '\n') };
    }

    const firstLine = contentLines[0] || '';
    const userMatch = firstLine.match(/^User:\s*(.*)$/);
    if (userMatch) {
      return { userMessage: userMatch[1] || '' };
    }

    return { userMessage: contentLines.join('\n').trim() };
  }

  private applyAgentPrefix(agentInComment: string | undefined, userMessage: string): string {
    if (!agentInComment) return userMessage;
    if (!userMessage) return `@${agentInComment}`;
    if (userMessage.startsWith('@')) return userMessage;
    return `@${agentInComment} ${userMessage}`;
  }

  /**
   * Check if content has any pending inline chats
   */
  public hasPendingInlineChats(content: string): boolean {
    const inlineChats = this.detectInFile(content);
    return inlineChats.some((chat) => chat.status === 'pending');
  }

  /**
   * Get pending inline chats only
   */
  public getPendingInlineChats(content: string): ParsedInlineChat[] {
    const inlineChats = this.detectInFile(content);
    return inlineChats.filter((chat) => chat.status === 'pending');
  }

  /**
   * Check if a specific line is inside an inline chat marker
   */
  public isInsideInlineChat(content: string, lineNumber: number): boolean {
    const inlineChats = this.detectInFile(content);
    return inlineChats.some((chat) => lineNumber >= chat.startLine && lineNumber <= chat.endLine);
  }
}
