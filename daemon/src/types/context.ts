/**
 * Context loading type definitions
 */

import type { ParsedMention } from './parser.js';

/**
 * Loaded context for command execution
 */
export interface LoadedContext {
  currentFile: CurrentFileContext;
  mentionedFiles: MentionedFile[];
  agent?: AgentContext;
  nearbyFiles: NearbyFile[];
  serviceConnections: ServiceConnection[];
}

/**
 * Current file context
 */
export interface CurrentFileContext {
  path: string;
  content: string;
}

/**
 * Mentioned file context
 */
export interface MentionedFile {
  path: string;
  content: string;
  priority: number;
}

/**
 * Agent context
 */
export interface AgentContext {
  path: string;
  persona: string;
  aiConfig?: AgentAIConfig;
}

/**
 * Agent AI configuration (from frontmatter)
 */
export interface AgentAIConfig {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Nearby file context
 */
export interface NearbyFile {
  path: string;
  summary: string;
  distance: number;
}

/**
 * Service connection reference
 */
export interface ServiceConnection {
  name: string;
  mcpServer: string;
}

/**
 * Interface for path resolvers
 */
export interface IPathResolver {
  resolveAgent(name: string): Promise<string | null>;
  resolveFile(filename: string): Promise<string | null>;
  resolveFolder(folderPath: string): Promise<string | null>;
  resolveCommand(name: string): Promise<string | null>;
}

/**
 * Interface for proximity calculators
 */
export interface IProximityCalculator {
  calculateDistance(file1: string, file2: string): number;
  rankFilesByProximity(currentFile: string, allFiles: string[]): string[];
}

/**
 * Interface for context loaders
 */
export interface IContextLoader {
  load(currentFile: string, mentions: ParsedMention[]): Promise<LoadedContext>;
}
