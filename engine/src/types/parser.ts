/**
 * Parser type definitions
 */

/**
 * Mention types
 */
export type MentionType = 'agent' | 'file' | 'folder' | 'service' | 'command' | 'tag';

/**
 * Parsed mention
 */
export interface ParsedMention {
  type: MentionType;
  raw: string;
  value: string;
  position: number;
}

/**
 * Parsed command
 */
export interface ParsedCommand {
  line: number;
  raw: string;
  type: 'slash' | 'mention-chain';
  command?: string;
  args?: string;
  mentions?: ParsedMention[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  statusEmoji?: string;
  isComplete: boolean; // Whether command appears complete (ends with punctuation)
}

/**
 * Parsed file structure
 */
export interface ParsedFile {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  commands: ParsedCommand[];
  mentions: ParsedMention[];
  triggeredSOPs: string[];
  inlineChats: ParsedInlineChat[];
}

/**
 * Frontmatter change
 * Note: Also exported from watcher.ts to avoid circular dependencies
 */
export interface FrontmatterChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Interface for mention parsers
 */
export interface IMentionParser {
  parse(content: string): ParsedMention[];
  hasSparkSyntax(line: string): boolean;
}

/**
 * Interface for command detectors
 */
export interface ICommandDetector {
  detectInFile(content: string): ParsedCommand[];
}

/**
 * Interface for frontmatter parsers
 */
export interface IFrontmatterParser {
  detectChanges(filePath: string, content: string): FrontmatterChange[];
  extractFrontmatter(content: string): Record<string, unknown>;
}

/**
 * Inline chat marker status
 */
export type InlineChatStatus = 'pending' | 'processing' | 'complete' | 'error';

/**
 * Parsed inline chat marker
 */
export interface ParsedInlineChat {
  /** Line number where marker starts */
  startLine: number;
  /** Line number where marker ends */
  endLine: number;
  /** Unique ID from marker */
  id: string;
  /** Status of inline chat */
  status: InlineChatStatus;
  /** User's message */
  userMessage: string;
  /** AI response (if status is 'complete') */
  aiResponse?: string;
  /** Raw marker text */
  raw: string;
  /** Parsed mentions from user message (@agent, @file, etc.) */
  mentions?: ParsedMention[];
}

/**
 * Interface for inline chat detectors
 */
export interface IInlineChatDetector {
  detectInFile(content: string): ParsedInlineChat[];
}
