/**
 * Command Detector
 * Detects Spark commands in markdown files
 */

import type { ICommandDetector, ParsedCommand, ParsedMention } from '../types/parser.js';
import { MentionParser } from './MentionParser.js';

export class CommandDetector implements ICommandDetector {
  private mentionParser: MentionParser;

  private state = {
    inCodeBlock: false,
    inSparkResult: false,
    inInlineChat: false,
  };

  constructor() {
    this.mentionParser = new MentionParser();
  }

  public detectInFile(content: string): ParsedCommand[] {
    const lines = content.split('\n');
    const commands: ParsedCommand[] = [];
    // Reset state for this file
    this.state.inCodeBlock = false;
    this.state.inSparkResult = false;
    this.state.inInlineChat = false;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] as string;
      const trimmed = line.trim();

      if (this.updateStateFromMarkers(trimmed)) {
        continue;
      }

      if (this.shouldSkipLine(line, trimmed)) {
        continue;
      }

      const mentions = this.mentionParser.parseLine(line);
      const commandMention = mentions.find((m) => m.type === 'command');
      if (!commandMention) {
        continue;
      }

      this.pushCommand(commands, index + 1, line, trimmed, mentions);
    }

    return commands;
  }

  private updateStateFromMarkers(trimmed: string): boolean {
    if (this.updateSparkResultState(trimmed)) return true;
    if (this.updateInlineChatState(trimmed)) return true;
    if (this.updateCodeBlockState(trimmed)) return true;
    return false;
  }

  private updateSparkResultState(trimmed: string): boolean {
    if (trimmed === '<!-- spark-result-start -->') {
      this.state.inSparkResult = true;
      return true;
    }
    if (trimmed === '<!-- spark-result-end -->') {
      this.state.inSparkResult = false;
      return true;
    }
    return false;
  }

  private updateInlineChatState(trimmed: string): boolean {
    if (trimmed.match(/<!--\s*spark-inline-chat:/)) {
      this.state.inInlineChat = true;
      return true;
    }
    if (trimmed.match(/<!--\s*\/spark-inline-chat\s*-->/)) {
      this.state.inInlineChat = false;
      return true;
    }
    return false;
  }

  private updateCodeBlockState(trimmed: string): boolean {
    if (!trimmed.startsWith('```')) return false;
    this.state.inCodeBlock = !this.state.inCodeBlock;
    return true;
  }

  private shouldSkipLine(line: string, trimmed: string): boolean {
    if (this.state.inSparkResult) return true;
    if (this.state.inInlineChat) return true;
    if (this.state.inCodeBlock) return true;
    if (!trimmed) return true;
    return !this.mentionParser.hasSparkSyntax(line);
  }

  private pushCommand(
    commands: ParsedCommand[],
    lineNumber: number,
    rawLine: string,
    trimmedLine: string,
    mentions: ParsedMention[]
  ): void {
    const emojiMatch = trimmedLine.match(/^(\[x\]|✅|✓|❌|✗|⏳|🔄)/);
    if (!emojiMatch) {
      commands.push(this.createCommand(lineNumber, rawLine, mentions, 'pending'));
      return;
    }

    const emoji = emojiMatch[0];
    const cleanLine = trimmedLine.replace(/^(\[x\]|✅|✓|❌|✗|⏳|🔄)\s*/, '');
    const status = this.getStatusFromEmoji(emoji);
    commands.push(this.createCommand(lineNumber, cleanLine, mentions, status, emoji));
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
