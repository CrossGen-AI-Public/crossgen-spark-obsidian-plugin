/**
 * File Parser
 * Combines all parsers to analyze a complete file
 */

import type { ParsedFile } from '../types/parser.js';
import { MentionParser } from './MentionParser.js';
import { CommandDetector } from './CommandDetector.js';
import { FrontmatterParser } from './FrontmatterParser.js';

export class FileParser {
  private mentionParser: MentionParser;
  private commandDetector: CommandDetector;
  private frontmatterParser: FrontmatterParser;

  constructor() {
    this.mentionParser = new MentionParser();
    this.commandDetector = new CommandDetector();
    this.frontmatterParser = new FrontmatterParser();
  }

  /**
   * Parse a complete file and return all relevant information
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

    return {
      path: filePath,
      content,
      frontmatter,
      commands,
      mentions,
      triggeredSOPs: [], // Will be populated by trigger matcher
    };
  }

  /**
   * Check if file has any pending commands
   */
  public hasPendingCommands(parsedFile: ParsedFile): boolean {
    return parsedFile.commands.some((cmd) => cmd.status === 'pending');
  }

  /**
   * Get frontmatter parser for external use
   */
  public getFrontmatterParser(): FrontmatterParser {
    return this.frontmatterParser;
  }
}
