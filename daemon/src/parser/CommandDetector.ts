/**
 * Command Detector
 * Detects Spark commands in markdown files
 */

import type { ICommandDetector, ParsedCommand, ParsedMention } from '../types/parser.js';
import { MentionParser } from './MentionParser.js';

export class CommandDetector implements ICommandDetector {
  private mentionParser: MentionParser;

  constructor() {
    this.mentionParser = new MentionParser();
  }

  public detectInFile(content: string): ParsedCommand[] {
    const lines = content.split('\n');
    const commands: ParsedCommand[] = [];
    let inCodeBlock = false;
    let inSparkResult = false; // Track if we're inside an AI response
    let inInlineChat = false; // Track if we're inside an inline chat marker

    lines.forEach((line, index) => {
      // Skip AI responses to prevent feedback loop
      if (line.trim() === '<!-- spark-result-start -->') {
        inSparkResult = true;
        return;
      }
      if (line.trim() === '<!-- spark-result-end -->') {
        inSparkResult = false;
        return;
      }
      if (inSparkResult) {
        return; // Skip lines inside AI responses
      }

      // Skip inline chat markers to prevent conflict with inline chat system
      if (line.trim().match(/<!--\s*spark-inline-chat:/)) {
        inInlineChat = true;
        return;
      }
      if (line.trim().match(/<!--\s*\/spark-inline-chat\s*-->/)) {
        inInlineChat = false;
        return;
      }
      if (inInlineChat) {
        return; // Skip lines inside inline chat markers
      }
      // Track code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        return;
      }

      // Skip lines inside code blocks
      if (inCodeBlock) {
        return;
      }
      // Skip empty lines
      if (!line.trim()) {
        return;
      }

      // Check if line has Spark syntax
      if (!this.mentionParser.hasSparkSyntax(line)) {
        return;
      }

      // Parse mentions in this line
      const mentions = this.mentionParser.parseLine(line);

      if (mentions.length === 0) {
        return;
      }

      // Determine command type
      const commandMention = mentions.find((m) => m.type === 'command');

      // Only process slash commands (not bare agent mentions)
      // Agent mentions should use the inline chat system
      if (!commandMention) {
        return;
      }

      // Check if line is already processed (has status emoji)
      const trimmed = line.trim();
      // Match [x] first before individual characters
      const emojiMatch = trimmed.match(/^(\[x\]|✅|✓|❌|✗|⏳|🔄)/);
      const hasEmoji = emojiMatch !== null;

      if (hasEmoji) {
        // Extract the actual command by removing the emoji
        const emoji = emojiMatch[0];
        const cleanLine = trimmed.replace(/^(\[x\]|✅|✓|❌|✗|⏳|🔄)\s*/, '');
        const status = this.getStatusFromEmoji(emoji);

        commands.push(this.createCommand(index + 1, cleanLine, mentions, status, emoji));
      } else {
        commands.push(this.createCommand(index + 1, line, mentions, 'pending'));
      }
    });

    return commands;
  }

  private createCommand(
    lineNumber: number,
    raw: string,
    mentions: ParsedMention[],
    status: ParsedCommand['status'],
    statusEmoji?: string
  ): ParsedCommand {
    const commandMention = mentions.find((m) => m.type === 'command');
    const isComplete = this.isCommandComplete(raw);

    // Only slash commands are supported
    // Agent mentions should use the inline chat system
    return {
      line: lineNumber,
      raw,
      type: 'slash',
      command: commandMention?.value,
      args: this.extractArgs(raw, commandMention?.raw ?? ''),
      mentions,
      status,
      statusEmoji,
      isComplete,
    };
  }

  /**
   * Check if a command appears complete (ready to execute)
   */
  private isCommandComplete(commandText: string): boolean {
    const trimmed = commandText.trim();

    // Empty command is incomplete
    if (!trimmed) {
      return false;
    }

    // Ends with trailing spaces (user likely still typing)
    if (commandText !== trimmed) {
      return false;
    }

    // Must end with sentence-ending punctuation
    const lastChar = trimmed.charAt(trimmed.length - 1);
    const sentenceEnders = ['.', '?', '!'];

    return sentenceEnders.includes(lastChar);
  }

  private extractArgs(line: string, commandText: string): string | undefined {
    const commandIndex = line.indexOf(commandText);
    if (commandIndex === -1) return undefined;

    const afterCommand = line.substring(commandIndex + commandText.length).trim();
    return afterCommand || undefined;
  }

  private getStatusFromEmoji(emoji: string): ParsedCommand['status'] {
    switch (emoji) {
      case '✅':
      case '✓':
      case '[x]':
        return 'completed';
      case '❌':
      case '✗':
        return 'failed';
      case '⏳':
      case '🔄':
        return 'in_progress';
      default:
        return 'pending';
    }
  }
}
