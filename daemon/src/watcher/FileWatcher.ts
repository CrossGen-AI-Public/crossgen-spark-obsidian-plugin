/**
 * File watcher
 * Watches vault files for changes using chokidar
 */

import chokidar, { type FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import type { IFileWatcher, FileChange, FileWatcherConfig } from '../types/watcher.js';
import { ChangeDebouncer } from './ChangeDebouncer.js';
import { PathMatcher } from './PathMatcher.js';
import { Logger } from '../logger/Logger.js';

export class FileWatcher extends EventEmitter implements IFileWatcher {
  private watcher: FSWatcher | null;
  private debouncer: ChangeDebouncer;
  private pathMatcher: PathMatcher;
  private config: FileWatcherConfig;
  private logger: Logger;
  private watching: boolean;

  constructor(config: FileWatcherConfig) {
    super();
    this.config = config;
    this.watcher = null;
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

    this.watcher = chokidar.watch(this.config.patterns, {
      cwd: this.config.vaultPath,
      ignored: this.config.ignore,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('add', (path: string) => this.handleChange(path, 'add'));
    this.watcher.on('change', (path: string) => this.handleChange(path, 'change'));
    this.watcher.on('unlink', (path: string) => this.handleChange(path, 'unlink'));

    this.watcher.on('error', (error: unknown) => {
      this.logger.error('File watcher error', error);
    });

    this.watching = true;
    this.logger.info('File watcher started');
  }

  public stop(): void {
    if (!this.watching) {
      return;
    }

    this.logger.info('Stopping file watcher');

    this.debouncer.cancelAll();

    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }

    this.watching = false;
    this.logger.info('File watcher stopped');
  }

  public isWatching(): boolean {
    return this.watching;
  }

  private handleChange(path: string, type: FileChange['type']): void {
    // Check if path should be ignored
    if (this.pathMatcher.shouldIgnore(path, this.config.ignore)) {
      return;
    }

    this.logger.debug(`File ${type}: ${path}`);

    // Debounce the change
    this.debouncer.debounce(path, () => {
      const change: FileChange = {
        path,
        type,
        timestamp: Date.now(),
      };

      this.emit('change', change);
    });
  }
}
