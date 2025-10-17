/**
 * File watcher type definitions
 */

/**
 * File change event types
 */
export type FileChangeType = 'add' | 'change' | 'unlink';

/**
 * File change event
 */
export interface FileChange {
  path: string;
  type: FileChangeType;
  timestamp: number;
}

/**
 * Frontmatter change (also exported for triggers)
 */
export interface FrontmatterChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * File watcher configuration
 */
export interface FileWatcherConfig {
  vaultPath: string;
  patterns: string[];
  ignore: string[];
  debounceMs: number;
}

/**
 * Interface for file watchers
 */
export interface IFileWatcher {
  start(): void;
  stop(): void;
  isWatching(): boolean;
  on(event: 'change', listener: (change: FileChange) => void): void;
  off(event: 'change', listener: (change: FileChange) => void): void;
}

/**
 * Interface for debouncing file changes
 */
export interface IChangeDebouncer {
  debounce(path: string, callback: () => void): void;
  cancel(path: string): void;
  cancelAll(): void;
}

/**
 * Interface for path matching
 */
export interface IPathMatcher {
  matches(path: string, patterns: string[]): boolean;
  shouldIgnore(path: string, ignorePatterns: string[]): boolean;
}
