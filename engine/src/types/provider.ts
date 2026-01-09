/**
 * AI Provider abstraction types
 * Model-agnostic interfaces for AI providers
 */

import type { AICompletionResult } from './ai.js';

/**
 * Supported AI provider types
 */
export enum ProviderType {
  ANTHROPIC = 'anthropic',
}

/**
 * Options for provider completion requests
 */
export interface ProviderCompletionOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  context?: ProviderContext;
}

/**
 * Context provided to AI provider
 */
export interface ProviderContext {
  files?: ProviderContextFile[];
  agentPersona?: string;
  additionalInstructions?: string;
}

/**
 * File in provider context
 */
export interface ProviderContextFile {
  path: string;
  content: string;
  priority?: 'high' | 'medium' | 'low';
  note?: string;
}

/**
 * Main AI Provider interface
 * All providers must implement this interface
 */
export interface IAIProvider {
  /**
   * Provider name (e.g., 'claude-agent', 'claude-direct', 'openai')
   */
  readonly name: string;

  /**
   * Provider type/category
   */
  readonly type: ProviderType | 'other';

  /**
   * Complete a prompt with AI
   */
  complete(options: ProviderCompletionOptions): Promise<AICompletionResult>;

  /**
   * Check if this provider supports tool use (MCP, function calling)
   */
  supportsTools(): boolean;

  /**
   * Check if this provider supports file operations (create, edit, delete)
   */
  supportsFileOperations(): boolean;

  /**
   * Get available models for this provider
   */
  getAvailableModels(): string[];

  /**
   * Check if this provider can fallback to another provider
   * Returns true if fallback is supported, false otherwise
   */
  supportsFallback(): boolean;

  /**
   * Get the fallback provider name if available
   * Returns null if no fallback configured
   */
  getFallbackProvider(): string | null;

  /**
   * Check if provider is healthy and ready
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get the provider's configuration
   */
  getConfig(): ProviderConfig;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /**
   * Provider name
   */
  name: string;

  /**
   * Provider type
   */
  type: ProviderType;

  /**
   * Model to use
   */
  model: string;

  /**
   * API key (loaded from ~/.spark/secrets.yaml)
   */
  apiKey?: string;

  /**
   * Max tokens for completions
   */
  maxTokens?: number;

  /**
   * Temperature (0-1)
   */
  temperature?: number;

  /**
   * System prompt configuration
   */
  systemPrompt?: string | SystemPromptConfig;

  /**
   * Fallback provider name
   */
  fallbackProvider?: string;

  /**
   * Provider-specific options
   */
  options?: Record<string, unknown>;
}

/**
 * System prompt configuration
 */
export interface SystemPromptConfig {
  type: 'custom' | 'preset' | 'hybrid';
  preset?: string;
  customPrompt?: string;
  sparkExtensions?: boolean;
}

/**
 * Provider factory function type
 */
export type ProviderFactoryFunction = (config: ProviderConfig) => IAIProvider;

/**
 * Provider registration info
 */
export interface ProviderRegistration {
  name: string;
  type: ProviderType;
  factory: ProviderFactoryFunction;
  defaultConfig?: Partial<ProviderConfig>;
}
