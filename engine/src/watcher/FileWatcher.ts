/**
 * File watcher
 * Watches vault files for changes using chokidar
 */

import { EventEmitter } from 'node:events';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { Logger } from '../logger/Logger.js';
import type { FileChange, FileWatcherConfig, IFileWatcher } from '../types/watcher.js';
import { ChangeDebouncer } from './ChangeDebouncer.js';
import { PathMatcher } from './PathMatcher.js';
import { normalizePath } from '../utils/path.js';

export class FileWatcher extends EventEmitter implements IFileWatcher {
  private watcher?: FSWatcher;
  private debouncer: ChangeDebouncer;
  private pathMatcher: PathMatcher;
  private config: FileWatcherConfig;
  private logger: Logger;
  private watching: boolean;

  constructor(config: FileWatcherConfig) {
    super();
    this.config = config;
    this.watcher = undefined;
    this.watching = false;
    this.debouncer = new ChangeDebouncer(config.debounceMs);
    this.pathMatcher = new PathMatcher();
    this.logger = Logger.getInstance();
  }

  public start(): void {
    if (this.watching) {
      this.logger.warn('FileWatcher is already running');
      return;
    }

    this.logger.info('Starting file watcher', {
      vaultPath: this.config.vaultPath,
      patterns: this.config.patterns,
    });
    this.logger.debug('File watcher configuration', {
      ignoreCount: this.config.ignore.length,
      debounceMs: this.config.debounceMs,
    });

    this.logger.debug('Initializing file watcher', {
      vaultPath: this.config.vaultPath,
      patterns: this.config.patterns,
      ignored: this.config.ignore,
    });

    // Create a function to properly ignore directories and files.
    // IMPORTANT: internal queue files must NEVER be ignored at the chokidar layer,
    // otherwise we won't receive FS events and processing will only happen on startup scan.
    const shouldIgnore = (filePath: string): boolean => {
      const relativePath = path.relative(this.config.vaultPath, filePath);
      if (this.isInternalQueueFile(relativePath)) {
        return false;
      }
      return this.pathMatcher.shouldIgnore(relativePath, this.config.ignore);
    };

    this.watcher = chokidar.watch(this.config.vaultPath, {
      ignored: shouldIgnore,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('ready', () => {
      const watched = this.watcher?.getWatched();
      this.logger.debug('File watcher ready - monitoring vault for changes', {
        watchedDirs: watched ? Object.keys(watched).length : 0,
      });
      this.emit('ready');
    });

    this.watcher.on('add', (filePath: string) => {
      this.logger.debug('FS event: add', { path: filePath });
      this.handleChange(filePath, 'add');
    });
    this.watcher.on('change', (filePath: string) => {
      this.logger.debug('FS event: change', { path: filePath });
      this.handleChange(filePath, 'change');
    });
    this.watcher.on('unlink', (filePath: string) => {
      this.logger.debug('FS event: unlink', { path: filePath });
      this.handleChange(filePath, 'unlink');
    });

    this.watcher.on('error', (error: unknown) => {
      // Handle EMFILE/ENFILE (too many open files) error
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error.code === 'EMFILE' || error.code === 'ENFILE')
      ) {
        this.logger.error(
          'File watcher error: System limit reached for watching files/directories.',
          {
            code: error.code,
            message:
              'The directory contains too many files or subdirectories to watch. ' +
              'This typically happens when watching a large directory structure.',
            suggestion:
              'Ensure you are watching an Obsidian vault. ' +
              'Check that your vault does not contain large nested directories like node_modules, .git archives, or backup folders.',
          }
        );
        // Emit a fatal error that the engine can handle
        this.emit('fatal-error', error);
      } else {
        this.logger.error('File watcher error', error);
      }
    });

    this.watching = true;
    this.logger.info('File watcher started');
  }

  public async stop(): Promise<void> {
    if (!this.watching) {
      return;
    }

    this.logger.info('Stopping file watcher');

    this.debouncer.cancelAll();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }

    this.watching = false;
    this.logger.info('File watcher stopped');
  }

  public isWatching(): boolean {
    return this.watching;
  }

  /**
   * Check if path is an internal queue file that should always be processed
   * These bypass the normal watch patterns since they're internal engine files
   */
  private isInternalQueueFile(relativePath: string): boolean {
    const normalized = normalizePath(relativePath);
    // Workflow queue files (.spark/workflow-queue/*.json)
    if (normalized.startsWith('.spark/workflow-queue/') && normalized.endsWith('.json')) {
      return true;
    }
    // Workflow generation queue files (.spark/workflow-generate-queue/*.json)
    if (normalized.startsWith('.spark/workflow-generate-queue/') && normalized.endsWith('.json')) {
      return true;
    }
    // Workflow edit queue files (.spark/workflow-edit-queue/*.json)
    if (relativePath.startsWith('.spark/workflow-edit-queue/') && relativePath.endsWith('.json')) {
      return true;
    }
    // Chat queue files are .md and match normal patterns, but listed for completeness
    // if (relativePath.startsWith('.spark/chat-queue/') && relativePath.endsWith('.md')) {
    //   return true;
    // }
    return false;
  }

  private handleChange(filePath: string, type: FileChange['type']): void {
    // Convert absolute path to relative path within vault
    const relativePath = path.relative(this.config.vaultPath, filePath);

    // Internal queue files bypass pattern matching - they're engine-internal
    const isQueueFile = this.isInternalQueueFile(relativePath);

    // Check if path matches any of the watch patterns (skip for queue files)
    if (!isQueueFile) {
      const matchesPattern = this.pathMatcher.matchesAny(relativePath, this.config.patterns);
      if (!matchesPattern) {
        this.logger.debug('File does not match watch patterns', { path: relativePath });
        return;
      }
    }

    // Check if path should be ignored (queue files are never ignored)
    if (!isQueueFile && this.pathMatcher.shouldIgnore(relativePath, this.config.ignore)) {
      this.logger.debug('File ignored by pattern matcher', { path: relativePath });
      return;
    }

    this.logger.debug(`File ${type}: ${relativePath}`, { isQueueFile });

    // Debounce the change
    this.debouncer.debounce(relativePath, () => {
      const change: FileChange = {
        path: relativePath,
        type,
        timestamp: Date.now(),
      };

      this.emit('change', change);
    });
  }
}
