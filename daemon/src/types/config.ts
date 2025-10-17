/**
 * Configuration type definitions
 */

/**
 * Main Spark configuration structure
 */
export interface SparkConfig {
  version: string;
  daemon: DaemonConfig;
  ai: AIConfig;
  mcp?: MCPConfig;
  logging: LoggingConfig;
  features: FeaturesConfig;
}

/**
 * Daemon-specific configuration
 */
export interface DaemonConfig {
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
  provider: 'claude' | 'openai' | 'local';
  claude?: ClaudeConfig;
  openai?: OpenAIConfig;
  fallback?: FallbackConfig;
}

/**
 * Claude-specific configuration
 */
export interface ClaudeConfig {
  model: string;
  api_key_env: string;
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
  provider: 'claude' | 'openai';
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
