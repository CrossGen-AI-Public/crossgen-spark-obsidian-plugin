/**
 * Mention Parser
 * Parses Spark syntax: @agent, @file.md, @folder/, /command, $service
 */

import type { IMentionParser, ParsedMention, MentionType } from '../types/parser.js';

interface MentionPattern {
  type: MentionType;
  regex: RegExp;
  priority: number; // Higher priority patterns checked first
}

export class MentionParser implements IMentionParser {
  private patterns: MentionPattern[];

  constructor() {
    // Define patterns in priority order (higher priority checked first)
    this.patterns = [
      // Command: /command-name (must be preceded by whitespace, start of line, or @)
      {
        type: 'command',
        regex: /(?:^|[\s@])\/([a-z][a-z0-9-]*)/gim,
        priority: 6,
      },
      // Service: $service-name
      {
        type: 'service',
        regex: /\$([a-z][a-z0-9-]*)/gi,
        priority: 5,
      },
      // Quoted File: @"path/to/file name.ext" (handles spaces)
      {
        type: 'file',
        regex: /@"([^"]+\.(md|txt|pdf|docx|xlsx|csv|json|html|xml))"/gi,
        priority: 4,
      },
      // File with extension: @path/to/filename.ext
      {
        type: 'file',
        regex: /@([\w-]+(?:\/[\w-]+)*\.(md|txt|pdf|docx|xlsx|csv|json|html|xml))/gi,
        priority: 3,
      },
      // Folder: @path/to/folder/ (ends with /)
      {
        type: 'folder',
        regex: /@([\w-]+(?:\/[\w-]+)*\/)/g,
        priority: 2,
      },
      // Agent/File: @name (no extension, no trailing slash)
      // Could be agent or file - ContextLoader will resolve by checking existence
      // - First tries .spark/agents/{name}.md
      // - If not found, tries to find {name}.md in vault
      {
        type: 'agent',
        regex: /@([a-z][a-z0-9_-]*)(?![/\w.])/gi,
        priority: 1,
      },
    ];
  }

  public parse(content: string): ParsedMention[] {
    const mentions: ParsedMention[] = [];
    const seenRanges: Array<{ start: number; end: number }> = [];

    // Sort patterns by priority (highest first)
    const sortedPatterns = [...this.patterns].sort((a, b) => b.priority - a.priority);

    // Process each pattern in priority order
    for (const pattern of sortedPatterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match: RegExpExecArray | null = null;

      while ((match = regex.exec(content)) !== null) {
        const position = match.index;
        const endPosition = position + match[0].length;

        // Skip if this range overlaps with an already-found mention
        const overlaps = seenRanges.some(
          (range) =>
            (position >= range.start && position < range.end) ||
            (endPosition > range.start && endPosition <= range.end) ||
            (position <= range.start && endPosition >= range.end)
        );

        if (overlaps) {
          continue;
        }

        // For command pattern, adjust position if we matched whitespace/@ prefix
        const actualPosition =
          pattern.type === 'command' && match[0].match(/^[\s@]/) ? position + 1 : position;
        const actualRaw =
          pattern.type === 'command' && match[0].match(/^[\s@]/) ? match[0].substring(1) : match[0];

        mentions.push({
          type: pattern.type,
          raw: actualRaw,
          value: match[1] || '',
          position: actualPosition,
        });

        seenRanges.push({ start: position, end: endPosition });
      }
    }

    // Sort by position
    mentions.sort((a, b) => a.position - b.position);

    return mentions;
  }

  public hasSparkSyntax(line: string): boolean {
    // Quick check for any Spark syntax
    return /[@/$][a-z0-9-]/i.test(line);
  }

  /**
   * Parse a single line and return mentions found
   */
  public parseLine(line: string): ParsedMention[] {
    return this.parse(line);
  }

  /**
   * Check if a line is a command line (starts with / or has @agent)
   */
  public isCommandLine(line: string): boolean {
    const trimmed = line.trim();

    // Starts with /command
    if (/^\/[a-z][a-z0-9-]*/i.test(trimmed)) {
      return true;
    }

    // Contains @agent mention
    if (/@[a-z][a-z0-9_-]*(?![/\w.])/i.test(trimmed)) {
      return true;
    }

    return false;
  }
}
