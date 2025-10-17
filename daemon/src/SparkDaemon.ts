/**
 * Main Spark Daemon class
 * Orchestrates all daemon components
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { ISparkDaemon, DaemonState } from './types/index.js';
import type { SparkConfig } from './types/config.js';
import type { FileChange } from './types/watcher.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import { FileWatcher } from './watcher/FileWatcher.js';
import { Logger } from './logger/Logger.js';
import { SparkError } from './types/index.js';
import { FileParser } from './parser/FileParser.js';

export class SparkDaemon implements ISparkDaemon {
  private vaultPath: string;
  private config: SparkConfig | null;
  private watcher: FileWatcher | null;
  private logger: Logger | null;
  private fileParser: FileParser | null;
  private state: DaemonState;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.config = null;
    this.watcher = null;
    this.logger = null;
    this.fileParser = null;
    this.state = 'stopped';
  }

  public async start(): Promise<void> {
    if (this.state === 'running') {
      throw new SparkError('Daemon is already running', 'ALREADY_RUNNING');
    }

    try {
      this.state = 'starting';

      // Load configuration
      const configLoader = new ConfigLoader();
      this.config = await configLoader.load(this.vaultPath);

      // Initialize logger
      this.logger = Logger.getInstance(this.config.logging);
      this.logger.info('Starting Spark daemon', { vaultPath: this.vaultPath });

      // Initialize file parser
      this.fileParser = new FileParser();

      // Create file watcher
      this.watcher = new FileWatcher({
        vaultPath: this.vaultPath,
        patterns: this.config.daemon.watch.patterns,
        ignore: this.config.daemon.watch.ignore,
        debounceMs: this.config.daemon.debounce_ms,
      });

      // Subscribe to file changes
      this.watcher.on('change', (change: FileChange) => {
        void this.handleFileChange(change);
      });

      // Start watching
      this.watcher.start();

      this.state = 'running';
      this.logger.info('Spark daemon started successfully');
    } catch (error) {
      this.state = 'error';
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new SparkError(`Failed to start daemon: ${message}`, 'START_FAILED', {
        originalError: error,
      });
    }
  }

  public async stop(): Promise<void> {
    if (this.state === 'stopped') {
      return;
    }

    this.state = 'stopping';

    if (this.logger) {
      this.logger.info('Stopping Spark daemon');
    }

    // Stop file watcher
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }

    this.state = 'stopped';

    if (this.logger) {
      this.logger.info('Spark daemon stopped');
    }
  }

  public isRunning(): boolean {
    return this.state === 'running';
  }

  private async handleFileChange(change: FileChange): Promise<void> {
    if (!this.logger || !this.fileParser) {
      return;
    }

    this.logger.info('File changed', {
      path: change.path,
      type: change.type,
    });

    // Skip if file was deleted
    if (change.type === 'unlink') {
      this.logger.debug('File deleted, skipping processing', { path: change.path });
      return;
    }

    try {
      // Read file content
      const fullPath = join(this.vaultPath, change.path);
      const content = readFileSync(fullPath, 'utf-8');

      // Parse the file
      const parsed = this.fileParser.parseFile(fullPath, content);

      // Check for pending commands
      const pendingCommands = parsed.commands.filter((cmd) => cmd.status === 'pending');

      if (pendingCommands.length > 0) {
        this.logger.info(`Found ${pendingCommands.length} pending command(s)`, {
          file: change.path,
          commands: pendingCommands.map((c) => c.raw),
        });

        // TODO: Execute commands (Phase 4 - Claude Integration)
        for (const command of pendingCommands) {
          this.logger.debug('Command detected', {
            line: command.line,
            type: command.type,
            command: command.command || 'mention-chain',
            mentions: command.mentions?.map((m) => m.raw),
          });
        }
      }

      // Check for frontmatter changes
      const frontmatterChanges = this.fileParser
        .getFrontmatterParser()
        .detectChanges(fullPath, content);

      if (frontmatterChanges.length > 0) {
        this.logger.info(`Found ${frontmatterChanges.length} frontmatter change(s)`, {
          file: change.path,
          changes: frontmatterChanges.map((c) => ({
            field: c.field,
            from: c.oldValue,
            to: c.newValue,
          })),
        });

        // TODO: Match triggers (Phase 5 - Trigger System)
      }
    } catch (error) {
      this.logger.error('Error processing file', {
        path: change.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
