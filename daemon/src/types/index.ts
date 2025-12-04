/**
 * Core type definitions for Spark Daemon
 * All interfaces and types used across the daemon
 */

export * from './ai.js';
// Re-export all types from domain-specific files
export * from './config.js';
// Export from context and trigger after parser
export * from './context.js';
export * from './events.js';
export * from './notification.js';
// Export from parser (includes FrontmatterChange)
export * from './parser.js';
export * from './provider.js';
export * from './result.js';
export * from './trigger.js';
// Export from watcher (without FrontmatterChange to avoid duplication)
export type {
  FileChange,
  FileChangeType,
  FileWatcherConfig,
  IChangeDebouncer,
  IFileWatcher,
  IPathMatcher,
} from './watcher.js';

/**
 * Main Spark Daemon interface
 */
export interface ISparkDaemon {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

/**
 * Status emojis for file indicators
 */
export interface StatusEmojis {
  pending: string;
  processing: string;
  completed: string;
  error: string;
  warning: string;
}

/**
 * Daemon lifecycle states
 */
export type DaemonState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

/**
 * Generic error class for Spark daemon
 */
export class SparkError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SparkError';
  }
}
