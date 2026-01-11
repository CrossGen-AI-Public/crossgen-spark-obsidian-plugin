/**
 * File Parser
 * Combines all parsers to analyze a complete file
 */

import { readFileSync } from 'node:fs';
import { SparkError } from '../types/index.js';
import type { ParsedFile } from '../types/parser.js';
import { CommandDetector } from './CommandDetector.js';
import { FrontmatterParser } from './FrontmatterParser.js';
import { InlineChatDetector } from './InlineChatDetector.js';
import { MentionParser } from './MentionParser.js';

export class FileParser {
  private mentionParser: MentionParser;
  private commandDetector: CommandDetector;
  private frontmatterParser: FrontmatterParser;
  private inlineChatDetector: InlineChatDetector;

  constructor() {
    this.mentionParser = new MentionParser();
    this.commandDetector = new CommandDetector();
    this.frontmatterParser = new FrontmatterParser();
    this.inlineChatDetector = new InlineChatDetector();
  }

  /**
   * Read and parse a file from disk
   * @param filePath - Absolute path to file
   * @returns Parsed file structure
   */
  public parseFromFile(filePath: string): ParsedFile {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return this.parseFile(filePath, content);
    } catch (error) {
      throw new SparkError(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        'FILE_READ_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Parse file content (content already loaded)
   * @param filePath - File path for reference
   * @param content - File content
   * @returns Parsed file structure
   */
  public parseFile(filePath: string, content: string): ParsedFile {
    // Extract frontmatter
    const frontmatter = this.frontmatterParser.extractFrontmatter(content);

    // Get content without frontmatter
    const contentWithoutFrontmatter = this.frontmatterParser.getContent(content);

    // Detect commands
    const commands = this.commandDetector.detectInFile(content);

    // Parse all mentions in the file
    const mentions = this.mentionParser.parse(contentWithoutFrontmatter);

    // Detect inline chats
    const inlineChats = this.inlineChatDetector.detectInFile(content);

    return {
      path: filePath,
      content,
      frontmatter,
      commands,
      mentions,
      triggeredSOPs: [], // Will be populated by trigger matcher
      inlineChats,
    };
  }

  /**
   * Check if file has any pending commands
   */
  public hasPendingCommands(parsedFile: ParsedFile): boolean {
    return parsedFile.commands.some((cmd) => cmd.status === 'pending');
  }

  /**
   * Check if file has any pending inline chats
   */
  public hasPendingInlineChats(parsedFile: ParsedFile): boolean {
    return parsedFile.inlineChats.some((chat) => chat.status === 'pending');
  }

  /**
   * Get frontmatter parser for external use
   */
  public getFrontmatterParser(): FrontmatterParser {
    return this.frontmatterParser;
  }

  /**
   * Get inline chat detector for external use
   */
  public getInlineChatDetector(): InlineChatDetector {
    return this.inlineChatDetector;
  }
}
