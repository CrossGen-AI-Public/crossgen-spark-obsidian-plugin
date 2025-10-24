/**
 * Core type definitions for Spark Daemon
 * All interfaces and types used across the daemon
 */

// Re-export all types from domain-specific files
export * from './config.js';
export * from './events.js';
export * from './ai.js';
export * from './provider.js';
export * from './notification.js';
export * from './result.js';

// Export from watcher (without FrontmatterChange to avoid duplication)
export type {
  FileChange,
  FileChangeType,
  FileWatcherConfig,
  IFileWatcher,
  IChangeDebouncer,
  IPathMatcher,
} from './watcher.js';

// Export from parser (includes FrontmatterChange)
export * from './parser.js';

// Export from context and trigger after parser
export * from './context.js';
export * from './trigger.js';

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
