/**
 * File Parser
 * Combines all parsers to analyze a complete file
 */

import { readFileSync } from 'fs';
import type { ParsedFile } from '../types/parser.js';
import { MentionParser } from './MentionParser.js';
import { CommandDetector } from './CommandDetector.js';
import { FrontmatterParser } from './FrontmatterParser.js';
import { SparkError } from '../types/index.js';

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
