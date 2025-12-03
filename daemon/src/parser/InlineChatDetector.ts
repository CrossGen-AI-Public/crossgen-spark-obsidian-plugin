/**
 * Inline Chat Detector
 * Detects inline chat markers in markdown files
 */

import type {
  IInlineChatDetector,
  ParsedInlineChat,
  InlineChatStatus,
  IMentionParser,
} from '../types/parser.js';
import { MentionParser } from './MentionParser.js';

export class InlineChatDetector implements IInlineChatDetector {
  private mentionParser: IMentionParser;
  // Opening marker pattern: <!-- spark-inline-chat:status:id --> or <!-- spark-inline-chat:status:id:agent:message -->
  // Captures: status, id, agent (optional), message (optional)
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
      const line = lines[i];

      // Check for opening marker (do this before empty check)
      const openingMatch = line?.match(this.OPENING_MARKER_REGEX);
      if (!openingMatch) {
        i++;
        continue;
      }

      // Extract status, ID, agent, and optional message from opening marker
      // Format: <!-- spark-inline-chat:status:id:agent:message -->
      const status = openingMatch[1] as InlineChatStatus;
      const id = openingMatch[2] ?? '';
      const agentInComment = openingMatch[3]; // Agent name (new format)
      const messageInComment = openingMatch[4]; // Message embedded in comment (new format)
      const startLine = i + 1; // Line numbers are 1-indexed

      // Find closing marker
      let endLine = -1;
      const contentLines: string[] = [];

      for (let j = i + 1; j < lines.length; j++) {
        const currentLine = lines[j];
        if (!currentLine) {
          contentLines.push('');
          continue;
        }

        // Check if this is the closing marker
        if (this.CLOSING_MARKER_REGEX.test(currentLine)) {
          endLine = j + 1; // Line numbers are 1-indexed
          break;
        }

        // Otherwise it's content
        contentLines.push(currentLine);
      }

      // If no closing marker found, skip this opening marker
      if (endLine === -1) {
        i++;
        continue;
      }

      // Parse content based on status
      let userMessage = '';
      let aiResponse: string | undefined;

      if (status === 'complete') {
        // For complete status, content is the AI response
        aiResponse = contentLines.join('\n').trim();
      } else {
        // For pending/processing/error, check for user message
        // New format: message in comment (<!-- spark-inline-chat:pending:id:agent:message -->)
        // Old format: separate line with "User: [message]"
        if (messageInComment) {
          // Unescape newlines that were escaped in the marker
          userMessage = messageInComment.replace(/\\n/g, '\n');
        } else {
          // Fall back to old format for backward compatibility
          const firstLine = contentLines[0] || '';
          const userMatch = firstLine.match(/^User:\s*(.*)$/);
          if (userMatch) {
            userMessage = userMatch[1] || '';
          } else {
            // Fallback: treat entire content as user message
            userMessage = contentLines.join('\n').trim();
          }
        }
      }

      // If agent is in the comment and not already in the message, prepend it
      // Format: "@agentName message" so mentions can be parsed correctly
      if (agentInComment && userMessage && !userMessage.startsWith('@')) {
        userMessage = `@${agentInComment} ${userMessage}`;
      } else if (agentInComment && !userMessage) {
        userMessage = `@${agentInComment}`;
      }

      // Create parsed inline chat
      const raw = lines.slice(i, endLine).join('\n');

      // Parse mentions from user message (for pending/processing chats)
      const mentions = userMessage ? this.mentionParser.parse(userMessage) : undefined;

      inlineChats.push({
        startLine,
        endLine,
        id,
        status,
        userMessage,
        aiResponse,
        raw,
        mentions,
      });

      // Continue from the line after the closing marker
      // endLine is 1-indexed line number, convert to 0-indexed for next iteration
      i = endLine; // This sets i to the 0-indexed position of the line after closing marker
    }

    return inlineChats;
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
