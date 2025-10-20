/**
 * Main Spark Daemon class
 * Orchestrates all daemon components
 */

import { readFileSync, writeFileSync } from 'fs';
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
import { DaemonInspector } from './cli/DaemonInspector.js';
import { ClaudeClient } from './ai/ClaudeClient.js';
import { PromptBuilder } from './ai/PromptBuilder.js';
import { ContextLoader } from './context/ContextLoader.js';

export class SparkDaemon implements ISparkDaemon {
  private vaultPath: string;
  private config: SparkConfig | null;
  private watcher: FileWatcher | null;
  private configWatcher: FSWatcher | null;
  private logger: Logger | null;
  private fileParser: FileParser | null;
  private inspector: DaemonInspector | null;
  private claudeClient: ClaudeClient | null;
  private promptBuilder: PromptBuilder | null;
  private contextLoader: ContextLoader | null;
  private state: DaemonState;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.config = null;
    this.watcher = null;
    this.configWatcher = null;
    this.logger = null;
    this.fileParser = null;
    this.inspector = null;
    this.claudeClient = null;
    this.promptBuilder = null;
    this.contextLoader = null;
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

      // Initialize AI components
      if (!this.config.ai.claude) {
        throw new SparkError('Claude configuration missing in config.yaml', 'CONFIG_ERROR');
      }

      const apiKey = process.env[this.config.ai.claude.api_key_env];
      if (!apiKey) {
        throw new SparkError(
          `${this.config.ai.claude.api_key_env} environment variable not set`,
          'CONFIG_ERROR'
        );
      }

      this.claudeClient = new ClaudeClient(apiKey, this.config.ai.claude);
      this.promptBuilder = new PromptBuilder();
      this.contextLoader = new ContextLoader(this.vaultPath);
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
      // Load new configuration
      const configLoader = new ConfigLoader();
      const newConfig = await configLoader.load(this.vaultPath);

      // Update config
      this.config = newConfig;

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

      throw new SparkError(`Failed to reload config: ${message}`, 'CONFIG_RELOAD_FAILED', {
        originalError: error,
      });
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
    } catch {
      // Ignore write errors - reload still works, just no CLI feedback
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
        stabilityThreshold: 100,
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

    // Execute commands (Phase 4 - Claude Integration)
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

      // Execute command with Claude
      void this.executeCommand(command, join(this.vaultPath, filePath)).catch((error) => {
        this.logger!.error('Command execution failed', {
          error: error instanceof Error ? error.message : String(error),
          command: command.raw,
        });
      });
    }
  }

  /**
   * Execute a command using Claude AI
   * Phase 4 - Claude Integration
   */
  private async executeCommand(command: ParsedCommand, fullPath: string): Promise<void> {
    if (!this.claudeClient || !this.promptBuilder || !this.contextLoader) {
      throw new SparkError('AI components not initialized', 'NOT_INITIALIZED');
    }

    this.logger!.info('Executing command', {
      command: command.raw.substring(0, 100),
      file: fullPath,
    });

    try {
      // 1. Load context (Phase 3 - already implemented!)
      //    ContextLoader internally:
      //    - Uses PathResolver to resolve mentions
      //    - Uses ProximityCalculator.rankFilesByProximity() to find nearby files
      //    - Returns top 10 nearest files with summaries
      const context = await this.contextLoader.load(fullPath, command.mentions || []);

      this.logger!.debug('Context loaded', {
        mentionedFiles: context.mentionedFiles.length,
        nearbyFiles: context.nearbyFiles.length, // Ranked by proximity!
        hasAgent: !!context.agent,
      });

      // 2. Build prompt
      const prompt = this.promptBuilder.build(command, context);

      this.logger!.debug('Prompt built', {
        length: prompt.length,
        estimatedTokens: this.promptBuilder.estimateTokens(prompt),
      });

      // Log full prompt for debugging
      console.log('\n=== FULL PROMPT TO CLAUDE ===');
      console.log(prompt);
      console.log('=== END PROMPT ===\n');

      // 3. Call Claude
      const result = await this.claudeClient.complete(prompt);

      this.logger!.info('Command executed', {
        outputTokens: result.usage.outputTokens,
        inputTokens: result.usage.inputTokens,
      });

      // 4. Log response (Phase 4B will write to file)
      console.log('\n=== CLAUDE RESPONSE ===');
      console.log(result.content);
      console.log('=======================\n');
    } catch (error) {
      this.logger!.error('Command execution failed', error);
      throw error;
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
