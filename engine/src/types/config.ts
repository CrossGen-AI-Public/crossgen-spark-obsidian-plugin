/**
 * Configuration type definitions
 */

import type { ProviderType } from './provider.js';

/**
 * Main Spark configuration structure
 */
export interface SparkConfig {
  version: string;
  engine: EngineConfig;
  ai: AIConfig;
  mcp?: MCPConfig;
  logging: LoggingConfig;
  features: FeaturesConfig;
}

/**
 * Engine-specific configuration
 */
export interface EngineConfig {
  watch: WatchConfig;
  debounce_ms: number;
  status_indicators: StatusIndicatorsConfig;
  results: ResultsConfig;
}

/**
 * File watching configuration
 */
export interface WatchConfig {
  patterns: string[];
  ignore: string[];
}

/**
 * Status indicator configuration
 */
export interface StatusIndicatorsConfig {
  enabled: boolean;
  pending: string;
  processing: string;
  completed: string;
  error: string;
  warning: string;
}

/**
 * Result writing configuration
 */
export interface ResultsConfig {
  mode: 'auto' | 'inline' | 'separate';
  inline_max_chars: number;
  separate_folder: string;
  add_blank_lines: boolean;
}

/**
 * AI provider configuration
 */
export interface AIConfig {
  /**
   * Default provider to use
   */
  defaultProvider: string;

  /**
   * Provider configurations by name
   */
  providers: Record<string, ProviderConfiguration>;

  /**
   * Legacy support (deprecated)
   */
  provider?: ProviderType;
  claude?: ClaudeConfig;
  openai?: OpenAIConfig;
  fallback?: FallbackConfig;
}

/**
 * Individual provider configuration
 */
export interface ProviderConfiguration {
  type: ProviderType;
  model: string;
  apiKey?: string; // API key (loaded from ~/.spark/secrets.yaml)
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string | SystemPromptConfiguration;
  fallbackProvider?: string;
  options?: Record<string, unknown>;
}

/**
 * System prompt configuration
 */
export interface SystemPromptConfiguration {
  type: 'custom' | 'preset' | 'hybrid';
  preset?: string;
  customPrompt?: string;
  sparkExtensions?: boolean;
}

/**
 * Claude-specific configuration
 */
export interface ClaudeConfig {
  model: string;
  max_tokens: number;
  temperature: number;
}

/**
 * OpenAI configuration
 */
export interface OpenAIConfig {
  model: string;
  api_key_env: string;
  max_tokens: number;
  temperature: number;
}

/**
 * Fallback provider configuration
 */
export interface FallbackConfig {
  enabled: boolean;
  provider: ProviderType;
}

/**
 * MCP (Model Context Protocol) configuration
 */
export interface MCPConfig {
  servers: Record<string, MCPServerConfig>;
  timeout_ms: number;
  retry: RetryConfig;
}

/**
 * Individual MCP server configuration
 */
export interface MCPServerConfig {
  command: string;
  args?: string[];
  enabled: boolean;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  enabled: boolean;
  max_attempts: number;
  backoff_ms: number;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file?: string | null;
  console: boolean;
  max_size?: string;
  max_files?: number;
}

/**
 * Feature flags configuration
 */
export interface FeaturesConfig {
  slash_commands: boolean;
  chat_assistant: boolean;
  trigger_automation: boolean;
}

/**
 * Interface for configuration loaders
 */
export interface IConfigLoader {
  load(vaultPath: string): Promise<SparkConfig>;
}

/**
 * Interface for configuration validators
 */
export interface IConfigValidator {
  validate(config: unknown): SparkConfig;
}
