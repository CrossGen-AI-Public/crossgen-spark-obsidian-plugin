/**
 * Main Spark Daemon class
 * Orchestrates all daemon components
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { ISparkDaemon, DaemonState } from './types/index.js';
import type { SparkConfig } from './types/config.js';
import type { FileChange } from './types/watcher.js';
import type { ParsedCommand, ParsedMention } from './types/parser.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import { FileWatcher } from './watcher/FileWatcher.js';
import { Logger } from './logger/Logger.js';
import { SparkError } from './types/index.js';
import { FileParser } from './parser/FileParser.js';
import { DaemonInspector } from './cli/DaemonInspector.js';

export class SparkDaemon implements ISparkDaemon {
  private vaultPath: string;
  private config: SparkConfig | null;
  private watcher: FileWatcher | null;
  private logger: Logger | null;
  private fileParser: FileParser | null;
  private inspector: DaemonInspector | null;
  private state: DaemonState;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.config = null;
    this.watcher = null;
    this.logger = null;
    this.fileParser = null;
    this.inspector = null;
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
      this.logger.debug('Configuration loaded', {
        logLevel: this.config.logging.level,
        watchPatterns: this.config.daemon.watch.patterns,
        debounceMs: this.config.daemon.debounce_ms,
      });

      // Initialize file parser
      this.fileParser = new FileParser();
      this.logger.debug('File parser initialized');

      // Create file watcher
      this.watcher = new FileWatcher({
        vaultPath: this.vaultPath,
        patterns: this.config.daemon.watch.patterns,
        ignore: this.config.daemon.watch.ignore,
        debounceMs: this.config.daemon.debounce_ms,
      });
      this.logger.debug('File watcher created', {
        patterns: this.config.daemon.watch.patterns,
        ignoreCount: this.config.daemon.watch.ignore.length,
      });

      // Subscribe to file changes
      this.watcher.on('change', (change: FileChange) => {
        void this.handleFileChange(change);
      });

      // Handle fatal watcher errors (e.g., EMFILE)
      this.watcher.on('fatal-error', (error: unknown) => {
        this.logger?.error('Fatal file watcher error - stopping daemon', error);
        this.state = 'error';
        void this.stop();
        process.exit(1);
      });

      // Start watching
      this.watcher.start();
      this.logger.debug('File watcher started');

      // Initialize inspector
      this.inspector = new DaemonInspector(this);
      this.inspector.recordStart();

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

    // Record stop in inspector
    if (this.inspector) {
      this.inspector.recordStop();
    }

    // Stop file watcher
    if (this.watcher) {
      await this.watcher.stop();
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

  /**
   * Get current daemon state
   */
  public getState(): DaemonState {
    return this.state;
  }

  /**
   * Get vault path
   */
  public getVaultPath(): string {
    return this.vaultPath;
  }

  /**
   * Get current configuration
   */
  public getConfig(): SparkConfig | null {
    return this.config;
  }

  /**
   * Get file watcher (for inspection/debugging)
   */
  public getWatcher(): FileWatcher | null {
    return this.watcher;
  }

  /**
   * Get file parser (for inspection/debugging)
   */
  public getFileParser(): FileParser | null {
    return this.fileParser;
  }

  /**
   * Get inspector (for inspection/debugging)
   */
  public getInspector(): DaemonInspector | null {
    return this.inspector;
  }

  private async handleFileChange(change: FileChange): Promise<void> {
    if (!this.logger || !this.fileParser) {
      return;
    }

    // Record file change in inspector
    if (this.inspector) {
      this.inspector.recordFileChange(change);
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
      const fullPath = join(this.vaultPath, change.path);
      const { content, parsed } = this.readAndParseFile(fullPath, change.path);

      // Process commands
      this.processCommands(change.path, parsed.commands);

      // Process frontmatter changes
      this.processFrontmatterChanges(fullPath, change.path, content);
    } catch (error) {
      this.logger.error('Error processing file', {
        path: change.path,
        error: error instanceof Error ? error.message : String(error),
      });

      // Record error in inspector
      if (this.inspector && error instanceof Error) {
        this.inspector.recordError(error, { path: change.path });
      }
    }
  }

  private readAndParseFile(
    fullPath: string,
    relativePath: string
  ): {
    content: string;
    parsed: { commands: ParsedCommand[]; frontmatter: Record<string, unknown> | null };
  } {
    this.logger!.debug('Reading file', { fullPath });
    const content = readFileSync(fullPath, 'utf-8');
    this.logger!.debug('File read', {
      size: content.length,
      lines: content.split('\n').length,
    });

    this.logger!.debug('Parsing file', { path: relativePath });
    const parsed = this.fileParser!.parseFile(fullPath, content);
    this.logger!.debug('File parsed', {
      commands: parsed.commands.length,
      frontmatter: parsed.frontmatter ? 'present' : 'none',
    });

    return { content, parsed };
  }

  private processCommands(filePath: string, commands: ParsedCommand[]): void {
    const pendingCommands = commands.filter((cmd) => cmd.status === 'pending');

    if (pendingCommands.length === 0) {
      return;
    }

    this.logger!.info(`Found ${pendingCommands.length} pending command(s)`, {
      file: filePath,
      commands: pendingCommands.map((c) => c.raw),
    });

    // TODO: Execute commands (Phase 4 - Claude Integration)
    for (const command of pendingCommands) {
      this.logger!.debug('Command detected', {
        line: command.line,
        type: command.type,
        command: command.command || 'mention-chain',
        mentions: command.mentions?.map((m: ParsedMention) => m.raw),
      });

      if (this.inspector) {
        this.inspector.recordCommandDetected(filePath, command.command || 'mention-chain', {
          line: command.line,
          type: command.type,
          mentions: command.mentions?.length || 0,
        });
      }
    }
  }

  private processFrontmatterChanges(fullPath: string, relativePath: string, content: string): void {
    const frontmatterChanges = this.fileParser!.getFrontmatterParser().detectChanges(
      fullPath,
      content
    );

    if (frontmatterChanges.length === 0) {
      return;
    }

    this.logger!.info(`Found ${frontmatterChanges.length} frontmatter change(s)`, {
      file: relativePath,
      changes: frontmatterChanges.map((c) => ({
        field: c.field,
        from: c.oldValue,
        to: c.newValue,
      })),
    });

    if (this.inspector) {
      for (const fmChange of frontmatterChanges) {
        this.inspector.recordFrontmatterChange(
          relativePath,
          fmChange.field,
          fmChange.oldValue,
          fmChange.newValue
        );
      }
    }

    // TODO: Match triggers (Phase 5 - Trigger System)
  }
}
