/**
 * HotReloadManager
 * Manages hot reload during development for rapid iteration
 */

import chokidar, { type FSWatcher } from 'chokidar';
import { SparkDaemon } from '../SparkDaemon.js';
import { DevLogger } from '../logger/DevLogger.js';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

export interface HotReloadOptions {
  /**
   * Whether to auto-restart daemon on source changes
   * @default false
   */
  autoRestart?: boolean;

  /**
   * Whether to auto-reload config on config changes
   * @default true
   */
  autoReloadConfig?: boolean;

  /**
   * Whether to run tests on changes
   * @default false
   */
  runTests?: boolean;

  /**
   * Debounce delay in ms for rebuild operations
   * @default 300
   */
  debounceDelay?: number;

  /**
   * Enable debug logging
   * @default true
   */
  debug?: boolean;
}

interface WatchStats {
  rebuilds: number;
  restarts: number;
  configReloads: number;
  lastRebuild?: Date;
  lastRestart?: Date;
  lastConfigReload?: Date;
}

/**
 * Hot reload manager for development workflow
 *
 * Features:
 * - Watch source files and auto-rebuild
 * - Watch config files and auto-reload
 * - Optional daemon auto-restart
 * - Optional test execution on changes
 * - Debounced operations to avoid rebuild storms
 *
 * @example
 * ```typescript
 * const manager = new HotReloadManager(daemon, {
 *   autoRestart: true,
 *   autoReloadConfig: true,
 *   runTests: false
 * });
 *
 * await manager.start();
 * // Make changes to src files...
 * // Auto-rebuild and restart happens automatically
 * ```
 */
export class HotReloadManager {
  private sourceWatcher?: FSWatcher;
  private configWatcher?: FSWatcher;
  private testWatcher?: FSWatcher;
  private logger: DevLogger;
  private rebuildTimeout?: NodeJS.Timeout;
  private stats: WatchStats = {
    rebuilds: 0,
    restarts: 0,
    configReloads: 0,
  };

  constructor(
    private daemon: SparkDaemon | null,
    private options: HotReloadOptions = {}
  ) {
    // Set defaults
    this.options = {
      autoRestart: true, // Changed default to true for dev mode
      autoReloadConfig: true,
      runTests: false,
      debounceDelay: 300,
      debug: true,
      ...options,
    };

    this.logger = new DevLogger('HotReload', {
      level: this.options.debug ? 'debug' : 'info',
      console: true,
    });
  }

  /**
   * Start watching for changes
   */
  public async start(): Promise<void> {
    const daemonDir = this.getDaemonDirectory();

    this.logger.info('🔥 Hot reload enabled');
    this.logger.info(`   Daemon directory: ${daemonDir}`);
    this.logger.info(`   Auto-restart: ${this.options.autoRestart ? 'enabled' : 'disabled'}`);
    this.logger.info('   Watching source files, config, and tests...');
    this.logger.info('');

    // Watch source files
    this.watchSourceFiles();

    // Watch config files
    if (this.options.autoReloadConfig && this.daemon) {
      this.watchConfigFiles();
    }

    // Watch test files
    if (this.options.runTests) {
      this.watchTestFiles();
    }

    this.logWatchInfo();
  }

  /**
   * Stop watching for changes
   */
  public async stop(): Promise<void> {
    this.logger.info('Stopping hot reload...');

    if (this.rebuildTimeout) {
      clearTimeout(this.rebuildTimeout);
    }

    await this.sourceWatcher?.close();
    await this.configWatcher?.close();
    await this.testWatcher?.close();

    this.logger.info('✓ Hot reload stopped');
  }

  /**
   * Get hot reload statistics
   */
  public getStats(): Readonly<WatchStats> {
    return { ...this.stats };
  }

  /**
   * Get the daemon directory (where we should watch and build)
   */
  private getDaemonDirectory(): string {
    // The compiled file is at: daemon/dist/cli/HotReloadManager.js
    // Go up 2 levels: cli -> dist -> daemon
    const currentFile = fileURLToPath(import.meta.url);
    return path.resolve(path.dirname(currentFile), '../..');
  }

  /**
   * Watch source files for changes
   */
  private watchSourceFiles(): void {
    // Get daemon directory (where package.json is)
    const daemonDir = this.getDaemonDirectory();
    const srcPath = path.join(daemonDir, 'src');

    this.logger.info(`   Setting up file watcher for: ${srcPath}`);

    // Create a function to ignore non-source files (like FileWatcher does)
    const shouldIgnore = (filePath: string): boolean => {
      const relativePath = path.relative(srcPath, filePath);
      // Ignore test files and non-TypeScript files
      return (
        relativePath.includes('__tests__') ||
        relativePath.endsWith('.test.ts') ||
        (!relativePath.endsWith('.ts') && relativePath !== '')
      );
    };

    this.sourceWatcher = chokidar.watch(srcPath, {
      ignored: shouldIgnore,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.sourceWatcher.on('ready', () => {
      this.logger.info('✓ Source file watcher ready');
    });

    this.sourceWatcher.on('error', (error) => {
      this.logger.error('❌ Source watcher error:', { error });
    });

    this.sourceWatcher.on('change', (filePath: string) => {
      const relativePath = path.relative(daemonDir, filePath);
      this.logger.info(`📝 Source changed: ${relativePath}`);
      this.scheduleRebuild();
    });

    this.sourceWatcher.on('add', (filePath: string) => {
      const relativePath = path.relative(daemonDir, filePath);
      this.logger.info(`📝 Source added: ${relativePath}`);
      this.scheduleRebuild();
    });

    this.sourceWatcher.on('unlink', (filePath: string) => {
      const relativePath = path.relative(daemonDir, filePath);
      this.logger.info(`📝 Source deleted: ${relativePath}`);
      this.scheduleRebuild();
    });
  }

  /**
   * Watch config files for changes
   */
  private watchConfigFiles(): void {
    if (!this.daemon) return;

    const vaultPath = this.daemon.getVaultPath();
    const configPath = path.join(vaultPath, '.spark', 'config.yaml');

    this.configWatcher = chokidar.watch(configPath, {
      ignoreInitial: true,
      persistent: true,
    });

    this.configWatcher.on('change', async () => {
      this.logger.info('⚙️  Config changed, reloading...');
      await this.reloadConfig();
    });
  }

  /**
   * Watch test files for changes
   */
  private watchTestFiles(): void {
    const daemonDir = this.getDaemonDirectory();

    const shouldIgnore = (filePath: string): boolean => {
      // Only watch .test.ts files
      return !filePath.endsWith('.test.ts');
    };

    this.testWatcher = chokidar.watch(daemonDir, {
      ignored: shouldIgnore,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.testWatcher.on('change', (filePath: string) => {
      const relativePath = path.relative(daemonDir, filePath);
      this.logger.info(`🧪 Test changed: ${relativePath}`);
      this.runTests();
    });
  }

  /**
   * Schedule a rebuild (debounced)
   */
  private scheduleRebuild(): void {
    if (this.rebuildTimeout) {
      clearTimeout(this.rebuildTimeout);
    }

    this.rebuildTimeout = setTimeout(() => {
      this.rebuild();
    }, this.options.debounceDelay);
  }

  /**
   * Rebuild the project
   */
  private rebuild(): void {
    this.logger.info('🔨 Rebuilding...');
    const startTime = Date.now();

    try {
      const daemonDir = this.getDaemonDirectory();

      // Run build in daemon directory
      execSync('npm run build', {
        cwd: daemonDir,
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      const duration = Date.now() - startTime;
      this.stats.rebuilds++;
      this.stats.lastRebuild = new Date();

      this.logger.info(`✓ Rebuild complete (${duration}ms)`);

      // Auto-restart daemon if enabled
      if (this.options.autoRestart && this.daemon) {
        void this.restartDaemon();
      } else if (this.daemon) {
        this.logger.info('💡 Restart daemon to apply changes: spark restart');
      }

      this.logger.info('');
    } catch (error) {
      this.logger.error('❌ Build failed:', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Restart the daemon
   *
   * Automatically rebuilds and restarts the daemon when source files change.
   * This works for most changes, especially to SparkDaemon and main files.
   *
   * Note: ES modules are cached by Node. For changes to deeply nested modules,
   * you may need to manually restart: Ctrl+C and run `spark dev` again (~1 sec).
   */
  private async restartDaemon(): Promise<void> {
    if (!this.daemon) return;

    this.logger.info('🔄 Restarting daemon...');

    try {
      // Stop and restart the daemon
      await this.daemon.stop();

      // Reset singletons to ensure fresh state
      const { Logger } = await import('../logger/Logger.js');
      Logger.resetInstance();

      await this.daemon.start();

      this.stats.restarts++;
      this.stats.lastRestart = new Date();

      this.logger.info('✓ Daemon restarted');
      this.logger.info('');
    } catch (error) {
      this.logger.error('❌ Restart failed:', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Reload config without restarting
   */
  private async reloadConfig(): Promise<void> {
    if (!this.daemon) return;

    try {
      await this.daemon.reloadConfig();

      this.stats.configReloads++;
      this.stats.lastConfigReload = new Date();

      this.logger.info('✓ Config reloaded');
      this.logger.info('');
    } catch (error) {
      this.logger.error('❌ Config reload failed:', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Run tests
   */
  private runTests(): void {
    this.logger.info('🧪 Running tests...');

    try {
      const daemonDir = this.getDaemonDirectory();

      const output = execSync('npm test', {
        cwd: daemonDir,
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      this.logger.info('✓ Tests passed');
      this.logger.debug('Test output:', { output });
      this.logger.info('');
    } catch (error) {
      this.logger.error('❌ Tests failed:', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Log watch information
   */
  private logWatchInfo(): void {
    const features: string[] = [];

    features.push('✓ Source files');
    if (this.options.autoReloadConfig) features.push('✓ Config files');
    if (this.options.runTests) features.push('✓ Test files');
    if (this.options.autoRestart) features.push('✓ Auto-restart');

    this.logger.info('Watching:');
    features.forEach((feature) => this.logger.info(`   ${feature}`));
    this.logger.info('');
    this.logger.info('Ready for changes! 🚀');
    this.logger.info('');
  }

  /**
   * Log current stats
   */
  public logStats(): void {
    this.logger.info('📊 Hot Reload Stats:');
    this.logger.info(`   Rebuilds: ${this.stats.rebuilds}`);
    this.logger.info(`   Restarts: ${this.stats.restarts}`);
    this.logger.info(`   Config Reloads: ${this.stats.configReloads}`);

    if (this.stats.lastRebuild) {
      this.logger.info(`   Last Rebuild: ${this.stats.lastRebuild.toLocaleTimeString()}`);
    }
    if (this.stats.lastRestart) {
      this.logger.info(`   Last Restart: ${this.stats.lastRestart.toLocaleTimeString()}`);
    }
    if (this.stats.lastConfigReload) {
      this.logger.info(
        `   Last Config Reload: ${this.stats.lastConfigReload.toLocaleTimeString()}`
      );
    }
  }
}
