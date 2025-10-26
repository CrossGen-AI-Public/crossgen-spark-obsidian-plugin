/**
 * Main Spark Daemon class
 * Orchestrates all daemon components
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { ISparkDaemon, DaemonState } from './types/index.js';
import type { SparkConfig } from './types/config.js';
import type { FileChange } from './types/watcher.js';
import type { ParsedCommand, ParsedMention } from './types/parser.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import { FileWatcher } from './watcher/FileWatcher.js';
import { Logger } from './logger/Logger.js';
import { SparkError } from './types/index.js';
import { FileParser } from './parser/FileParser.js';
import { MentionParser } from './parser/MentionParser.js';
import { DaemonInspector } from './cli/DaemonInspector.js';
import { ContextLoader } from './context/ContextLoader.js';
import { ResultWriter } from './results/ResultWriter.js';
import { CommandExecutor } from './execution/CommandExecutor.js';
import { ChatQueueHandler } from './chat/ChatQueueHandler.js';
import { ProviderRegistry, ClaudeDirectProvider, ClaudeAgentProvider } from './providers/index.js';

export class SparkDaemon implements ISparkDaemon {
  private vaultPath: string;
  private config: SparkConfig | null;
  private watcher: FileWatcher | null;
  private configWatcher: FSWatcher | null;
  private logger: Logger | null;
  private fileParser: FileParser | null;
  private inspector: DaemonInspector | null;
  private contextLoader: ContextLoader | null;
  private resultWriter: ResultWriter | null;
  private commandExecutor: CommandExecutor | null;
  private mentionParser: MentionParser | null;
  private chatQueueHandler: ChatQueueHandler | null;
  private state: DaemonState;
  private providersRegistered: boolean;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.config = null;
    this.watcher = null;
    this.configWatcher = null;
    this.logger = null;
    this.fileParser = null;
    this.inspector = null;
    this.contextLoader = null;
    this.resultWriter = null;
    this.commandExecutor = null;
    this.mentionParser = null;
    this.chatQueueHandler = null;
    this.state = 'stopped';
    this.providersRegistered = false;
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

      // Initialize parsers
      this.fileParser = new FileParser();
      this.mentionParser = new MentionParser();
      this.logger.debug('Parsers initialized');

      // Register AI providers (only once)
      if (!this.providersRegistered) {
        this.registerProviders();
        this.providersRegistered = true;
      }

      // Initialize AI components
      this.contextLoader = new ContextLoader(this.vaultPath);
      this.resultWriter = new ResultWriter();
      this.commandExecutor = new CommandExecutor(
        this.contextLoader,
        this.resultWriter,
        this.config,
        this.vaultPath
      );
      this.chatQueueHandler = new ChatQueueHandler(
        this.vaultPath,
        this.commandExecutor,
        this.mentionParser,
        this.logger
      );
      this.logger.debug('AI components initialized');

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

      // Watch config file for changes
      this.startConfigWatcher();

      // Initialize inspector
      this.inspector = new DaemonInspector(this);
      this.inspector.recordStart();

      this.state = 'running';
      this.logger.info('Spark daemon started successfully');
    } catch (error) {
      this.state = 'error';
      // Re-throw SparkErrors as-is to preserve error codes and context
      if (error instanceof SparkError) {
        throw error;
      }
      // Wrap other errors
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

    // Stop config watcher
    if (this.configWatcher) {
      await this.configWatcher.close();
      this.configWatcher = null;
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

  /**
   * Register AI providers
   * Called once during daemon initialization
   */
  private registerProviders(): void {
    const registry = ProviderRegistry.getInstance();

    // Register Claude Client Provider (Anthropic SDK - direct)
    registry.registerProvider('claude-client', 'claude', (config) => {
      return new ClaudeDirectProvider(config);
    });

    // Register Claude Agent Provider (Claude Agent SDK - with tools/file operations)
    registry.registerProvider('claude-agent', 'claude', (config) => {
      return new ClaudeAgentProvider(config);
    });

    if (this.logger) {
      this.logger.debug('AI providers registered', {
        providers: registry.getProviderNames(),
      });
    }
  }

  /**
   * Reload configuration without restarting daemon
   * Useful for development and config changes
   */
  public async reloadConfig(): Promise<void> {
    if (this.state !== 'running') {
      throw new SparkError('Cannot reload config: daemon is not running', 'NOT_RUNNING');
    }

    if (this.logger) {
      this.logger.info('Reloading configuration...');
    }

    try {
      // Load new configuration with retry logic
      const configLoader = new ConfigLoader();
      const newConfig = await configLoader.loadWithRetry(this.vaultPath);

      // Update config
      this.config = newConfig;

      // Clear AI provider cache so new config is used
      if (this.commandExecutor) {
        // Note: We can't directly access providerFactory, but recreating CommandExecutor
        // will create a new factory with the new config
        this.contextLoader = new ContextLoader(this.vaultPath);
        this.resultWriter = new ResultWriter();
        this.commandExecutor = new CommandExecutor(
          this.contextLoader,
          this.resultWriter,
          this.config,
          this.vaultPath
        );
        if (this.logger) {
          this.logger.info('AI components reinitialized with new config');
        }
      }

      // Update logger with new config (singleton pattern - don't recreate)
      if (this.logger) {
        this.logger.updateConfig(newConfig.logging);
        this.logger.info('Configuration reloaded successfully', {
          logLevel: newConfig.logging.level,
        });
      }

      // Write success status for CLI feedback
      this.writeReloadStatus('success', 'Configuration reloaded successfully');

      // Restart watcher with new configuration
      if (this.watcher && this.logger) {
        this.logger.info('Restarting file watcher with new configuration...');
        await this.watcher.stop();

        this.watcher = new FileWatcher({
          vaultPath: this.vaultPath,
          patterns: newConfig.daemon.watch.patterns,
          ignore: newConfig.daemon.watch.ignore,
          debounceMs: newConfig.daemon.debounce_ms,
        });

        this.watcher.on('change', (change) => {
          void this.handleFileChange(change);
        });

        await this.watcher.start();
        this.logger.info('File watcher restarted successfully');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Write error status for CLI feedback
      this.writeReloadStatus('error', message);

      // Log warning but don't crash - keep using current config
      if (this.logger) {
        this.logger.warn('Config reload failed after retries, keeping current config', {
          error: message,
        });
      }

      // Don't throw - just keep current config
      return;
    }
  }

  /**
   * Write reload status to file for CLI feedback
   */
  private writeReloadStatus(status: 'success' | 'error', message: string): void {
    try {
      const statusFile = join(this.vaultPath, '.spark', 'reload-status.json');
      const statusData = {
        status,
        message,
        timestamp: Date.now(),
      };
      writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
    } catch (error) {
      // Reload still works, just no CLI feedback - log at debug level
      if (this.logger) {
        this.logger.debug('Failed to write reload status file for CLI feedback', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Start watching config file for automatic reloads
   */
  private startConfigWatcher(): void {
    const configPath = join(this.vaultPath, '.spark', 'config.yaml');

    this.configWatcher = chokidar.watch(configPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200, // Initial wait before first attempt
        pollInterval: 50,
      },
    });

    this.configWatcher.on('change', () => {
      if (this.logger) {
        this.logger.info('Config file changed, reloading...');
      }
      void this.reloadConfig();
    });

    this.configWatcher.on('error', (error) => {
      if (this.logger) {
        this.logger.error('Config watcher error:', { error });
      }
    });

    if (this.logger) {
      this.logger.debug('Watching config file for changes', { configPath });
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

    // Check if this is a chat queue file
    if (this.chatQueueHandler?.isChatQueueFile(change.path)) {
      this.logger.debug('Chat queue file detected', { path: change.path });
      await this.chatQueueHandler.process(change.path);
      return;
    }

    // Regular file processing
    try {
      const fullPath = join(this.vaultPath, change.path);
      const parsed = this.fileParser.parseFromFile(fullPath);

      this.logger.debug('File parsed', {
        path: change.path,
        commands: parsed.commands.length,
        frontmatter: parsed.frontmatter ? 'present' : 'none',
      });

      // Process commands
      this.processCommands(change.path, fullPath, parsed.commands);

      // Process frontmatter changes
      this.processFrontmatterChanges(fullPath, change.path, parsed.content);
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

  private processCommands(relativePath: string, fullPath: string, commands: ParsedCommand[]): void {
    const pendingCommands = commands.filter((cmd) => cmd.status === 'pending');

    if (pendingCommands.length === 0) {
      return;
    }

    this.logger!.info(`Found ${pendingCommands.length} pending command(s)`, {
      file: relativePath,
      commands: pendingCommands.map((c) => c.raw),
    });

    // Execute commands
    for (const command of pendingCommands) {
      // Check if command should be executed
      if (!this.commandExecutor!.shouldExecute(command)) {
        continue;
      }

      this.logger!.debug('Command detected', {
        line: command.line,
        type: command.type,
        command: command.command || 'mention-chain',
        mentions: command.mentions?.map((m: ParsedMention) => m.raw),
      });

      if (this.inspector) {
        this.inspector.recordCommandDetected(relativePath, command.command || 'mention-chain', {
          line: command.line,
          type: command.type,
          mentions: command.mentions?.length || 0,
        });
      }

      void this.commandExecutor!.execute(command, fullPath).catch((error) => {
        this.logger!.error('Command execution failed', {
          error: error instanceof Error ? error.message : String(error),
          command: command.raw,
        });
      });
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
  }
}
