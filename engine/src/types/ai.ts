/**
 * AI integration type definitions
 */

import type { LoadedContext } from './context.js';
import type { ParsedCommand } from './parser.js';

/**
 * AI completion options
 */
export interface AICompletionOptions {
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

/**
 * AI completion result
 */
export interface AICompletionResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Interface for AI clients
 */
export interface IAIClient {
  complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult>;
}

/**
 * Prompt structure
 */
export interface PromptStructure {
  agentPersona?: string;
  instructions: string;
  context: ContextSection[];
}

/**
 * Context section in prompt
 */
export interface ContextSection {
  priority: 'high' | 'medium' | 'low';
  files: ContextFile[];
}

/**
 * File in context
 */
export interface ContextFile {
  path: string;
  content: string;
  note?: string;
}

/**
 * Interface for prompt builders
 */
export interface IPromptBuilder {
  build(command: ParsedCommand, context: LoadedContext): string;
}
