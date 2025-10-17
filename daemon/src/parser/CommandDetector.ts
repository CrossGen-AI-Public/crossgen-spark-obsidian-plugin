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

    lines.forEach((line, index) => {
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
      const agentMention = mentions.find((m) => m.type === 'agent');

      // Must have either a command or an agent to be executable
      if (!commandMention && !agentMention) {
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

    if (commandMention) {
      // Slash command
      return {
        line: lineNumber,
        raw,
        fullText: raw, // Alias for backwards compatibility
        type: 'slash',
        command: commandMention.value,
        args: this.extractArgs(raw, commandMention.raw),
        mentions,
        status,
        statusEmoji,
      };
    } else {
      // Mention chain (contains agent and other mentions)
      return {
        line: lineNumber,
        raw,
        fullText: raw, // Alias for backwards compatibility
        type: 'mention-chain',
        mentions,
        finalCommand: this.extractFinalCommand(mentions),
        status,
        statusEmoji,
      };
    }
  }

  private extractArgs(line: string, commandText: string): string | undefined {
    const commandIndex = line.indexOf(commandText);
    if (commandIndex === -1) return undefined;

    const afterCommand = line.substring(commandIndex + commandText.length).trim();
    return afterCommand || undefined;
  }

  private extractFinalCommand(mentions: ParsedMention[]): string | undefined {
    // Last command mention in the chain is the final action
    const commandMentions = mentions.filter((m) => m.type === 'command');
    if (commandMentions.length > 0) {
      return commandMentions[commandMentions.length - 1]?.value;
    }
    return undefined;
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
