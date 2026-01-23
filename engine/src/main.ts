/**
 * Main Spark Engine class
 * Orchestrates all engine components
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import { ChatNameGenerator } from './chat/ChatNameGenerator.js';
import { ChatQueueHandler } from './chat/ChatQueueHandler.js';
import { EngineInspector } from './cli/EngineInspector.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import { ContextLoader } from './context/ContextLoader.js';
import { CommandExecutor } from './execution/CommandExecutor.js';
import { VaultInitializer } from './init/VaultInitializer.js';
import { Logger } from './logger/Logger.js';
import { FileParser } from './parser/FileParser.js';
import { MentionParser } from './parser/MentionParser.js';
import {
  ClaudeAgentProvider,
  ClaudeCodeProvider,
  ClaudeDirectProvider,
  ProviderRegistry,
} from './providers/index.js';
import { ResultWriter } from './results/ResultWriter.js';
import type { SparkConfig } from './types/config.js';
import type { EngineState, ISparkEngine } from './types/index.js';
import { SparkError } from './types/index.js';
import type { ParsedCommand, ParsedInlineChat, ParsedMention } from './types/parser.js';
import { ProviderType } from './types/provider.js';
import type { FileChange } from './types/watcher.js';
import { FileWatcher } from './watcher/FileWatcher.js';
import { WorkflowGenerateHandler } from './workflows/generation/WorkflowGenerateHandler.js';
import { WorkflowExecutor } from './workflows/WorkflowExecutor.js';

export class SparkEngine implements ISparkEngine {
  private readonly vaultPath: string;
  private state: EngineState = 'stopped';
  private providersRegistered = false;

  // Stateless - initialized eagerly in constructor
  private readonly logger: Logger;
  private readonly fileParser: FileParser;
  private readonly inspector: EngineInspector;
  private readonly contextLoader: ContextLoader;
  private readonly resultWriter: ResultWriter;
  private readonly mentionParser: MentionParser;

  // Config-dependent - initialized in start()
  private config: SparkConfig | null = null;
  private watcher: FileWatcher | null = null;
  private configWatcher = null as FSWatcher | null;
  private commandExecutor: CommandExecutor | null = null;
  private chatQueueHandler: ChatQueueHandler | null = null;
  private workflowExecutor: WorkflowExecutor | null = null;
  private workflowGenerateHandler: WorkflowGenerateHandler | null = null;

  /**
   * Get command executor (only valid after start())
   */
  private get executor(): CommandExecutor {
    if (!this.commandExecutor) {
      throw new Error('CommandExecutor not initialized - engine not started');
    }
    return this.commandExecutor;
  }

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.logger = Logger.getInstance();
    this.fileParser = new FileParser();
    this.inspector = new EngineInspector(this);
    this.contextLoader = new ContextLoader(vaultPath);
    this.resultWriter = new ResultWriter();
    this.mentionParser = new MentionParser();
  }

  public async start(): Promise<void> {
    if (this.state === 'running') {
      throw new SparkError('Engine is already running', 'ALREADY_RUNNING');
    }

    try {
      this.state = 'starting';

      // Initialize vault structure (creates dirs and default files if missing)
      const initializer = new VaultInitializer(this.vaultPath);
      await initializer.initialize();

      // Load configuration
      const configLoader = new ConfigLoader();
      this.config = await configLoader.load(this.vaultPath);

      // Update logger with config (logger was created in constructor with defaults)
      this.logger.updateConfig(this.config.logging);
      this.logger.info('Starting Spark engine', { vaultPath: this.vaultPath });
      this.logger.debug('Configuration loaded', {
        logLevel: this.config.logging.level,
        watchPatterns: this.config.engine.watch.patterns,
        debounceMs: this.config.engine.debounce_ms,
      });

      // Register AI providers (only once)
      if (!this.providersRegistered) {
        this.registerProviders();
        this.providersRegistered = true;
      }

      // Initialize command executor (needs config)
      this.commandExecutor = new CommandExecutor(
        this.contextLoader,
        this.resultWriter,
        this.config,
        this.vaultPath
      );

      // Create chat name generator
      const chatNameGenerator = new ChatNameGenerator(
        this.commandExecutor.getProviderFactory(),
        this.config.ai
      );

      this.chatQueueHandler = new ChatQueueHandler(
        this.vaultPath,
        this.commandExecutor,
        this.mentionParser,
        this.logger,
        chatNameGenerator
      );

      // Initialize workflow executor
      this.workflowExecutor = new WorkflowExecutor(
        this.vaultPath,
        this.logger,
        this.commandExecutor
      );

      // Initialize workflow generation handler (workflow builder: prompt -> workflow definition)
      this.workflowGenerateHandler = new WorkflowGenerateHandler(
        this.vaultPath,
        this.logger,
        this.commandExecutor.getProviderFactory(),
        this.config.ai
      );
      this.logger.debug('AI components initialized');

      // Create file watcher
      this.watcher = new FileWatcher({
        vaultPath: this.vaultPath,
        patterns: this.config.engine.watch.patterns,
        ignore: this.config.engine.watch.ignore,
        debounceMs: this.config.engine.debounce_ms,
      });
      this.logger.debug('File watcher created', {
        patterns: this.config.engine.watch.patterns,
        ignoreCount: this.config.engine.watch.ignore.length,
      });

      // Subscribe to file changes
      this.watcher.on('change', (change: FileChange) => {
        void this.handleFileChange(change);
      });

      // Handle fatal watcher errors (e.g., EMFILE)
      this.watcher.on('fatal-error', (error: unknown) => {
        this.logger.error('Fatal file watcher error - stopping engine', error);
        this.state = 'error';
        void this.stop();
        process.exit(1);
      });

      // Start watching
      this.watcher.start();
      this.logger.debug('File watcher started');

      // Watch config file for changes
      this.startConfigWatcher();

      // Process any pending workflow queue items from before restart
      await this.workflowExecutor.scanQueue();
      this.logger.debug('Workflow queue scanned');

      // Process any pending workflow generation requests from before restart
      await this.workflowGenerateHandler.scanQueue();
      this.logger.debug('Workflow generation queue scanned');

      // Record engine start in inspector
      this.inspector.recordStart();

      this.state = 'running';
      this.logger.info('Spark engine started successfully');
    } catch (error) {
      this.state = 'error';
      // Re-throw SparkErrors as-is to preserve error codes and context
      if (error instanceof SparkError) {
        throw error;
      }
      // Wrap other errors
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new SparkError(`Failed to start engine: ${message}`, 'START_FAILED', {
        originalError: error,
      });
    }
  }

  public async stop(): Promise<void> {
    if (this.state === 'stopped') {
      return;
    }

    this.state = 'stopping';
    this.logger.info('Stopping Spark engine');
    this.inspector.recordStop();

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
    this.logger.info('Spark engine stopped');
  }

  /**
   * Register AI providers
   * Called once during engine initialization
   */
  private registerProviders(): void {
    const registry = ProviderRegistry.getInstance();

    // Register Claude Client Provider (Anthropic SDK - direct)
    registry.registerProvider('claude-client', ProviderType.ANTHROPIC, (config) => {
      return new ClaudeDirectProvider(config);
    });

    // Register Claude Agent Provider (Claude Agent SDK - with tools/file operations)
    registry.registerProvider('claude-agent', ProviderType.ANTHROPIC, (config) => {
      return new ClaudeAgentProvider(config);
    });

    // Register Claude Code Provider (Claude Code CLI - leverages Max subscription)
    registry.registerProvider('claude-code', ProviderType.ANTHROPIC, (config) => {
      return new ClaudeCodeProvider(config);
    });

    this.logger.debug('AI providers registered', {
      providers: registry.getProviderNames(),
    });
  }

  /**
   * Reload configuration without restarting engine
   * Useful for development and config changes
   */
  public async reloadConfig(): Promise<void> {
    if (this.state !== 'running') {
      throw new SparkError('Cannot reload config: engine is not running', 'NOT_RUNNING');
    }

    this.logger.info('Reloading configuration...');

    try {
      // Load new configuration with retry logic
      const configLoader = new ConfigLoader();
      const newConfig = await configLoader.loadWithRetry(this.vaultPath);

      // Update config
      this.config = newConfig;

      // Recreate command executor with new config
      this.commandExecutor = new CommandExecutor(
        this.contextLoader,
        this.resultWriter,
        this.config,
        this.vaultPath
      );

      const chatNameGenerator = new ChatNameGenerator(
        this.commandExecutor.getProviderFactory(),
        this.config.ai
      );

      this.chatQueueHandler = new ChatQueueHandler(
        this.vaultPath,
        this.commandExecutor,
        this.mentionParser,
        this.logger,
        chatNameGenerator
      );

      this.logger.info('AI components reinitialized with new config');

      // Update logger with new config
      this.logger.updateConfig(newConfig.logging);
      this.logger.info('Configuration reloaded successfully', {
        logLevel: newConfig.logging.level,
      });

      // Write success status for CLI feedback
      this.writeReloadStatus('success', 'Configuration reloaded successfully');

      // Restart watcher with new configuration
      this.logger.info('Restarting file watcher with new configuration...');
      await this.watcher?.stop();

      this.watcher = new FileWatcher({
        vaultPath: this.vaultPath,
        patterns: newConfig.engine.watch.patterns,
        ignore: newConfig.engine.watch.ignore,
        debounceMs: newConfig.engine.debounce_ms,
      });

      this.watcher.on('change', (change) => {
        void this.handleFileChange(change);
      });

      this.watcher.start();
      this.logger.info('File watcher restarted successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Write error status for CLI feedback
      this.writeReloadStatus('error', message);

      // Log warning but don't crash - keep using current config
      this.logger.warn('Config reload failed after retries, keeping current config', {
        error: message,
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
    } catch (error) {
      // Reload still works, just no CLI feedback
      this.logger.debug('Failed to write reload status file for CLI feedback', {
        error: error instanceof Error ? error.message : String(error),
      });
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
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    });

    this.configWatcher.on('change', () => {
      this.logger.info('Config file changed, reloading...');
      void this.reloadConfig();
    });

    this.configWatcher.on('error', (error) => {
      this.logger.error('Config watcher error:', { error });
    });

    this.logger.debug('Watching config file for changes', { configPath });
  }

  public isRunning(): boolean {
    return this.state === 'running';
  }

  /**
   * Get current engine state
   */
  public getState(): EngineState {
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
  public getFileParser(): FileParser {
    return this.fileParser;
  }

  /**
   * Get inspector (for inspection/debugging)
   */
  public getInspector(): EngineInspector {
    return this.inspector;
  }

  private async handleFileChange(change: FileChange): Promise<void> {
    // Record file change in inspector
    this.inspector.recordFileChange(change);

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

    // Check if this is a workflow queue file
    if (this.workflowExecutor?.isQueueFile(change.path)) {
      this.logger.debug('Workflow queue file detected', { path: change.path });
      await this.workflowExecutor.processQueueFile(change.path);
      return;
    }

    // Check if this is a workflow generation queue file
    if (this.workflowGenerateHandler?.isQueueFile(change.path)) {
      this.logger.debug('Workflow generation queue file detected', { path: change.path });
      await this.workflowGenerateHandler.processQueueFile(change.path);
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

      // Process inline chats
      this.processInlineChats(change.path, fullPath, parsed.inlineChats);

      // Process frontmatter changes
      this.processFrontmatterChanges(fullPath, change.path, parsed.content);
    } catch (error) {
      this.logger.error('Error processing file', {
        path: change.path,
        error: error instanceof Error ? error.message : String(error),
      });

      // Record error in inspector
      if (error instanceof Error) {
        this.inspector.recordError(error, { path: change.path });
      }
    }
  }

  private processCommands(relativePath: string, fullPath: string, commands: ParsedCommand[]): void {
    const pendingCommands = commands.filter((cmd) => cmd.status === 'pending');

    if (pendingCommands.length === 0) {
      return;
    }

    this.logger.info(`Found ${pendingCommands.length} pending command(s)`, {
      file: relativePath,
      commands: pendingCommands.map((c) => c.raw),
    });

    // Execute commands
    for (const command of pendingCommands) {
      // Check if command should be executed
      if (!this.executor.shouldExecute(command)) {
        continue;
      }

      this.logger.debug('Command detected', {
        line: command.line,
        type: command.type,
        command: command.command || 'mention-chain',
        mentions: command.mentions?.map((m: ParsedMention) => m.raw),
      });

      this.inspector.recordCommandDetected(relativePath, command.command || 'mention-chain', {
        line: command.line,
        type: command.type,
        mentions: command.mentions?.length || 0,
      });

      void this.executor.execute(command, fullPath).catch((error) => {
        this.logger.error('Command execution failed', {
          error: error instanceof Error ? error.message : String(error),
          command: command.raw,
        });
      });
    }
  }

  private processInlineChats(
    relativePath: string,
    fullPath: string,
    inlineChats: ParsedInlineChat[]
  ): void {
    const pendingChats = inlineChats.filter((chat) => chat.status === 'pending');

    if (pendingChats.length === 0) {
      return;
    }

    this.logger.info(`Found ${pendingChats.length} pending inline chat(s)`, {
      file: relativePath,
      chats: pendingChats.map((c) => ({ id: c.id, message: c.userMessage.substring(0, 50) })),
    });

    // Execute inline chats
    for (const chat of pendingChats) {
      this.logger.debug('Inline chat detected', {
        id: chat.id,
        startLine: chat.startLine,
        endLine: chat.endLine,
        userMessage: chat.userMessage.substring(0, 100),
      });

      this.inspector.recordCommandDetected(relativePath, 'inline-chat', {
        line: chat.startLine,
        type: 'inline-chat',
        mentions: 0,
      });

      void this.executor.executeInlineChat(chat, fullPath).catch((error) => {
        this.logger.error('Inline chat execution failed', {
          error: error instanceof Error ? error.message : String(error),
          chatId: chat.id,
        });
      });
    }
  }

  private processFrontmatterChanges(fullPath: string, relativePath: string, content: string): void {
    const frontmatterChanges = this.fileParser
      .getFrontmatterParser()
      .detectChanges(fullPath, content);

    if (frontmatterChanges.length === 0) {
      return;
    }

    this.logger.info(`Found ${frontmatterChanges.length} frontmatter change(s)`, {
      file: relativePath,
      changes: frontmatterChanges.map((c) => ({
        field: c.field,
        from: c.oldValue,
        to: c.newValue,
      })),
    });

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
