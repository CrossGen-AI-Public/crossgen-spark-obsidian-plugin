#!/usr/bin/env node
/**
 * Spark CLI
 * Command-line interface for the Spark daemon
 */

import { Command } from 'commander';
import { SparkDaemon } from './SparkDaemon.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { registerDaemon, unregisterDaemon, getActiveDaemons, findDaemon } from './cli/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('spark')
  .description('Spark Assistant Daemon - Intelligence layer for Obsidian')
  .version(packageJson.version);

/**
 * Helper to validate that a path is an Obsidian vault
 */
function validateVault(absolutePath: string, context: 'start' | 'dev' = 'start'): void {
  const obsidianDir = path.join(absolutePath, '.obsidian');
  if (!existsSync(obsidianDir)) {
    console.error('❌ Not an Obsidian vault: .obsidian directory not found');
    console.error('   Path: ' + absolutePath);
    console.error('');
    if (context === 'dev') {
      console.error('   Dev mode must be run from an Obsidian vault directory.');
    } else {
      console.error('   An Obsidian vault must contain a .obsidian directory.');
    }
    console.error('   Please provide the path to your Obsidian vault.');
    console.error('');
    console.error(`   Example: spark ${context} ~/Documents/MyVault`);
    process.exit(1);
  }
}

/**
 * Helper to clean up PID file
 */
function cleanupPidFile(vaultPath: string): void {
  try {
    const pidFile = path.join(vaultPath, '.spark', 'daemon.pid');
    if (existsSync(pidFile)) {
      unlinkSync(pidFile);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Helper to clean up daemon (PID file + registry)
 */
function cleanupDaemon(vaultPath: string): void {
  cleanupPidFile(vaultPath);
  unregisterDaemon(vaultPath);
}

/**
 * Start command - Start the daemon
 */
program
  .command('start')
  .description('Start the Spark daemon')
  .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
  .option('-d, --debug', 'Enable debug logging', false)
  .action(async (vaultPath: string, options: { debug: boolean }) => {
    const absolutePath = path.resolve(vaultPath);

    // Check if daemon is already running for this vault
    const existingDaemon = findDaemon(absolutePath);
    if (existingDaemon) {
      console.error('❌ Daemon is already running for this vault');
      console.error(`   PID: ${existingDaemon.pid}`);
      console.error('   Run "spark stop" first to stop the existing daemon');
      process.exit(1);
    }

    // Clean up stale PID file if it exists
    cleanupPidFile(absolutePath);

    // Validate that this is an Obsidian vault
    validateVault(absolutePath, 'start');

    console.log(`Starting Spark daemon for vault: ${absolutePath}`);
    if (options.debug) {
      console.log('Debug mode enabled');
    }

    // Create daemon
    const daemon = new SparkDaemon(absolutePath);

    // Write PID file and register daemon
    try {
      const sparkDir = path.join(absolutePath, '.spark');
      mkdirSync(sparkDir, { recursive: true });
      const pidFile = path.join(sparkDir, 'daemon.pid');
      writeFileSync(pidFile, process.pid.toString());
      registerDaemon(process.pid, absolutePath);
    } catch (error) {
      console.error('Warning: Could not write PID file:', error);
    }

    // Override log level if debug flag is set
    if (options.debug) {
      process.env.SPARK_LOG_LEVEL = 'debug';
    }

    try {
      await daemon.start();
    } catch (error) {
      console.error('Failed to start daemon:', error);
      process.exit(1);
    }

    // Graceful shutdown handlers
    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);
      try {
        await daemon.stop();
        cleanupDaemon(absolutePath);
        console.log('Daemon stopped successfully');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    // Handle config reload signal
    process.on('SIGUSR1', async () => {
      console.log('\nReceived reload signal, reloading configuration...');
      try {
        await daemon.reloadConfig();
        console.log('✓ Configuration reloaded successfully');
        console.log('  All settings have been updated');
      } catch (error) {
        console.error('❌ Failed to reload configuration');
        if (error instanceof Error) {
          console.error(`   Error: ${error.message}`);
          if ('code' in error) {
            console.error(`   Code: ${error.code}`);
          }
        } else {
          console.error(`   Error: ${String(error)}`);
        }
        console.error('');
        console.error('   The daemon is still running with the previous configuration.');
        console.error('   Fix the config file and try again: spark reload');
      }
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      void shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      void shutdown('UNHANDLED_REJECTION');
    });
  });

/**
 * Status command - Check if daemon is running
 */
program
  .command('status')
  .description('Check daemon status')
  .argument('[vault-path]', 'Path to Obsidian vault (shows all if omitted)', '')
  .action((vaultPath: string) => {
    // If no vault specified, show all running daemons
    if (!vaultPath) {
      const daemons = getActiveDaemons();

      if (daemons.length === 0) {
        console.log('No daemons are currently running');
        process.exit(0);
      }

      console.log(`Found ${daemons.length} running daemon(s):\n`);
      daemons.forEach((daemon, index) => {
        const uptime = Math.floor((Date.now() - daemon.startTime) / 1000);
        const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`;
        console.log(`${index + 1}. ${daemon.vaultPath}`);
        console.log(`   PID: ${daemon.pid} | Uptime: ${uptimeStr}`);
      });
      process.exit(0);
    }

    // Check specific vault
    const absolutePath = path.resolve(vaultPath);
    const daemon = findDaemon(absolutePath);

    if (daemon) {
      const uptime = Math.floor((Date.now() - daemon.startTime) / 1000);
      const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`;
      console.log('✅ Daemon is running');
      console.log(`   PID: ${daemon.pid}`);
      console.log(`   Vault: ${daemon.vaultPath}`);
      console.log(`   Uptime: ${uptimeStr}`);
    } else {
      console.log('❌ Daemon is not running for this vault');
      console.log(`   Vault: ${absolutePath}`);
      process.exit(1);
    }
  });

/**
 * Helper to wait for process to stop
 */
function waitForProcessStop(pid: number, maxAttempts = 10): void {
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      process.kill(pid, 0);
      // Still running, wait
      const waitStart = Date.now();
      while (Date.now() - waitStart < 100) {
        // Busy wait
      }
      attempts++;
    } catch {
      // Process stopped
      break;
    }
  }
}

/**
 * Helper function to stop a single daemon
 */
function stopSingleDaemonFromRegistry(
  daemon: { pid: number; vaultPath: string },
  force: boolean
): boolean {
  try {
    console.log(`  Stopping daemon for ${daemon.vaultPath} (PID ${daemon.pid})...`);
    const signal = force ? 'SIGKILL' : 'SIGTERM';
    process.kill(daemon.pid, signal);

    // For graceful shutdown, wait a bit
    if (!force) {
      waitForProcessStop(daemon.pid);
    }

    // Clean up
    cleanupDaemon(daemon.vaultPath);
    console.log(`  ✅ Stopped ${daemon.vaultPath}`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to stop ${daemon.vaultPath}:`, error);
    return false;
  }
}

/**
 * Stop command - Stop the daemon
 */
program
  .command('stop')
  .description('Stop the daemon')
  .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
  .option('-f, --force', 'Force stop (SIGKILL)', false)
  .option('-a, --all', 'Stop all running daemons', false)
  .action((vaultPath: string, options: { force: boolean; all: boolean }) => {
    // Handle --all flag
    if (options.all) {
      const daemons = getActiveDaemons();
      if (daemons.length === 0) {
        console.log('No daemons are currently running');
        process.exit(0);
      }

      console.log(`Stopping ${daemons.length} daemon(s)...`);
      let stopped = 0;
      let failed = 0;

      daemons.forEach((daemon) => {
        if (stopSingleDaemonFromRegistry(daemon, options.force)) {
          stopped++;
        } else {
          failed++;
        }
      });

      console.log('');
      console.log(`✅ Stopped ${stopped} daemon(s)${failed > 0 ? `, ${failed} failed` : ''}`);
      process.exit(failed > 0 ? 1 : 0);
    }

    // Single daemon stop
    const absolutePath = path.resolve(vaultPath);

    // Check registry first
    const daemon = findDaemon(absolutePath);
    if (!daemon) {
      console.log('Daemon is not running for this vault');
      // Clean up stale PID file if it exists
      cleanupPidFile(absolutePath);
      process.exit(0);
    }

    const pid = daemon.pid;

    // Stop the daemon
    const signal = options.force ? 'SIGKILL' : 'SIGTERM';
    console.log(`Stopping daemon (PID ${pid})...`);

    try {
      process.kill(pid, signal);

      if (!options.force) {
        // Wait a bit for graceful shutdown
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          try {
            process.kill(pid, 0);
            if (attempts > 10) {
              clearInterval(checkInterval);
              console.log('⚠️  Daemon did not stop gracefully, use --force to kill');
              process.exit(1);
            }
          } catch {
            clearInterval(checkInterval);
            cleanupDaemon(absolutePath);
            console.log('✅ Daemon stopped successfully');
            process.exit(0);
          }
        }, 100);
      } else {
        cleanupDaemon(absolutePath);
        console.log('✅ Daemon force stopped');
      }
    } catch (error) {
      console.error('❌ Error stopping daemon:', error);
      process.exit(1);
    }
  });

/**
 * Config command - Configuration management
 */
program
  .command('config')
  .description('Validate and inspect configuration')
  .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
  .option('-v, --verbose', 'Show detailed validation results', false)
  .action(async (vaultPath: string, options: { verbose: boolean }) => {
    const absolutePath = path.resolve(vaultPath);

    console.log(`Validating configuration at: ${absolutePath}`);

    try {
      const configLoader = new ConfigLoader();
      const config = await configLoader.load(absolutePath);

      console.log('✓ Configuration is valid');

      if (options.verbose) {
        console.log('\nConfiguration:');
        console.log(JSON.stringify(config, null, 2));
      } else {
        console.log('\nConfiguration summary:');
        console.log(`  Log level: ${config.logging.level}`);
        console.log(`  Console logging: ${config.logging.console ? 'enabled' : 'disabled'}`);
        console.log(`  Watch patterns: ${config.daemon.watch.patterns.join(', ')}`);
        console.log(`  Debounce: ${config.daemon.debounce_ms}ms`);
        console.log(`  AI Provider: ${config.ai.provider}`);
        console.log(`  AI Model: ${config.ai.claude?.model || 'not configured'}`);
      }
    } catch (error) {
      console.error('❌ Configuration validation failed:');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Inspect command - Inspect daemon state
 */
program
  .command('inspect')
  .description('Inspect daemon configuration and state')
  .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
  .action(async (vaultPath: string) => {
    const absolutePath = path.resolve(vaultPath);

    console.log(`Inspecting vault: ${absolutePath}`);
    console.log('');

    try {
      const configLoader = new ConfigLoader();
      const config = await configLoader.load(absolutePath);

      // Show vault info
      console.log('📁 Vault Information:');
      console.log(`  Path: ${absolutePath}`);
      console.log(`  Config file: ${absolutePath}/.spark/config.yaml`);
      console.log('');

      // Show configuration
      console.log('⚙️  Configuration:');
      console.log(`  Log level: ${config.logging.level}`);
      console.log(`  Console logging: ${config.logging.console ? 'enabled' : 'disabled'}`);
      console.log(`  Debounce: ${config.daemon.debounce_ms}ms`);
      console.log('');

      // Show watch patterns
      console.log('👁️  Watch Patterns:');
      config.daemon.watch.patterns.forEach((pattern) => {
        console.log(`  + ${pattern}`);
      });
      console.log('');

      // Show ignore patterns
      console.log('🚫 Ignore Patterns:');
      config.daemon.watch.ignore.forEach((pattern) => {
        console.log(`  - ${pattern}`);
      });
      console.log('');

      // Show AI config
      console.log('🤖 AI Configuration:');
      console.log(`  Provider: ${config.ai.provider}`);
      if (config.ai.claude) {
        console.log(`  Model: ${config.ai.claude.model}`);
        console.log(`  API Key Env: ${config.ai.claude.api_key_env}`);
        const apiKey = process.env[config.ai.claude.api_key_env];
        console.log(`  API Key: ${apiKey ? '✓ configured' : '✗ missing'}`);
        console.log(`  Max tokens: ${config.ai.claude.max_tokens}`);
      }
    } catch (error) {
      console.error('❌ Inspection failed:');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Parse command - Test parsing on content
 */
program
  .command('parse')
  .description('Test parsing on content or file')
  .argument('<content>', 'Content to parse or path to file')
  .option('-f, --file', 'Treat argument as file path', false)
  .action(async (content: string, options: { file: boolean }) => {
    // Dynamic import to avoid circular dependencies
    const { MentionParser } = await import('./parser/MentionParser.js');
    const { CommandDetector } = await import('./parser/CommandDetector.js');
    const { readFileSync } = await import('fs');

    let textToParse = content;

    if (options.file) {
      const filePath = path.resolve(content);
      console.log(`Parsing file: ${filePath}\n`);
      try {
        textToParse = readFileSync(filePath, 'utf-8');
      } catch (error) {
        console.error('❌ Failed to read file:', error);
        process.exit(1);
      }
    } else {
      console.log(`Parsing content: "${content}"\n`);
    }

    // Parse mentions
    const mentionParser = new MentionParser();
    const mentions = mentionParser.parse(textToParse);

    console.log('📝 Parsed Mentions:');
    if (mentions.length === 0) {
      console.log('  (none found)');
    } else {
      mentions.forEach((mention, i) => {
        console.log(`  ${i + 1}. [${mention.type}] ${mention.raw}`);
        console.log(`     value: ${mention.value}`);
        console.log(`     position: ${mention.position}`);
      });
    }
    console.log('');

    // Detect commands
    const commandDetector = new CommandDetector();
    const commands = commandDetector.detectInFile(textToParse);

    console.log('⚡ Detected Commands:');
    if (commands.length === 0) {
      console.log('  (none found)');
    } else {
      commands.forEach((cmd, i) => {
        console.log(`  ${i + 1}. Line ${cmd.line}: ${cmd.raw}`);
        console.log(`     status: ${cmd.status}`);
        console.log(`     type: ${cmd.type}`);
        if (cmd.command) {
          console.log(`     command: ${cmd.command}`);
        }
        if (cmd.mentions && cmd.mentions.length > 0) {
          console.log(`     mentions: ${cmd.mentions.map((m) => m.raw).join(', ')}`);
        }
      });
    }
  });

/**
 * History command - Show processing history
 */
program
  .command('history')
  .description('Show daemon processing history and statistics')
  .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
  .option('-l, --limit <number>', 'Limit number of events shown', '50')
  .option('-s, --stats', 'Show statistics only', false)
  .option('-c, --clear', 'Clear history', false)
  .action(async (vaultPath: string, options: { limit: string; stats: boolean; clear: boolean }) => {
    const absolutePath = path.resolve(vaultPath);
    const historyFile = path.join(absolutePath, '.spark', 'history.json');

    // Clear history if requested
    if (options.clear) {
      try {
        if (existsSync(historyFile)) {
          unlinkSync(historyFile);
          console.log('✅ History cleared');
        } else {
          console.log('ℹ️  No history to clear');
        }
        return;
      } catch (error) {
        console.error('❌ Failed to clear history:', error);
        process.exit(1);
      }
    }

    // Read history file
    let history: Array<{
      timestamp: number;
      type: string;
      path?: string;
      details?: Record<string, unknown>;
    }> = [];

    try {
      if (existsSync(historyFile)) {
        const data = readFileSync(historyFile, 'utf-8');
        history = JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ Failed to read history file:', error);
      process.exit(1);
    }

    if (history.length === 0) {
      console.log('ℹ️  No history available');
      console.log('   Start the daemon to begin recording events:');
      console.log(`   spark start ${absolutePath}`);
      return;
    }

    // Show statistics
    const stats = {
      total: history.length,
      fileChanges: history.filter((e) => e.type === 'file_change').length,
      commandsDetected: history.filter((e) => e.type === 'command_detected').length,
      frontmatterChanges: history.filter((e) => e.type === 'frontmatter_change').length,
      errors: history.filter((e) => e.type === 'error').length,
    };

    console.log('📊 Processing Statistics:');
    console.log(`  Total events: ${stats.total}`);
    console.log(`  File changes: ${stats.fileChanges}`);
    console.log(`  Commands detected: ${stats.commandsDetected}`);
    console.log(`  Frontmatter changes: ${stats.frontmatterChanges}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log('');

    // Show events if not stats-only
    if (!options.stats) {
      const limit = parseInt(options.limit, 10);
      const recentEvents = history.slice(-limit).reverse();

      console.log(`📜 Recent Events (last ${Math.min(limit, history.length)}):`);
      console.log('');

      recentEvents.forEach((event, i) => {
        const date = new Date(event.timestamp);
        const timeStr = date.toLocaleTimeString();
        const typeEmoji =
          {
            file_change: '📝',
            command_detected: '⚡',
            frontmatter_change: '📋',
            error: '❌',
          }[event.type] || '•';

        console.log(`${i + 1}. ${typeEmoji} ${event.type} - ${timeStr}`);
        if (event.path) {
          console.log(`   Path: ${event.path}`);
        }
        if (event.details && Object.keys(event.details).length > 0) {
          console.log(
            `   Details: ${JSON.stringify(event.details, null, 2).replace(/\n/g, '\n   ')}`
          );
        }
        console.log('');
      });
    }
  });

/**
 * Reload command - Reload configuration without restarting
 */
program
  .command('reload')
  .description('Reload configuration without restarting daemon')
  .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
  .action(async (vaultPath: string) => {
    const absolutePath = path.resolve(vaultPath);

    // Find the running daemon
    const daemon = findDaemon(absolutePath);
    if (!daemon) {
      console.error('❌ No daemon running for this vault');
      console.error(`   Run: spark start ${absolutePath}`);
      process.exit(1);
    }

    try {
      // Clear any old status file
      const statusFile = path.join(absolutePath, '.spark', 'reload-status.json');
      try {
        if (existsSync(statusFile)) {
          unlinkSync(statusFile);
        }
      } catch {
        // Ignore - status file might not exist
      }

      // Send SIGUSR1 signal to trigger config reload
      process.kill(daemon.pid, 'SIGUSR1');

      console.log('Reloading configuration...');

      // Wait for daemon to process reload and write status
      const maxWaitMs = 2000; // 2 seconds timeout
      const checkIntervalMs = 100;
      let waited = 0;
      let status = null;

      while (waited < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
        waited += checkIntervalMs;

        if (existsSync(statusFile)) {
          try {
            const content = readFileSync(statusFile, 'utf-8');
            status = JSON.parse(content);
            break;
          } catch {
            // File might be mid-write, try again
          }
        }
      }

      console.log('');

      if (status) {
        if (status.status === 'success') {
          console.log('✅ Configuration reloaded successfully');
          console.log('   All settings have been updated');
        } else {
          console.log('❌ Configuration reload failed');
          console.log(`   Error: ${status.message}`);
          console.log('');
          console.log('   The daemon is still running with the previous configuration.');
          console.log('   Fix the config file and try again: spark reload');
          process.exit(1);
        }
      } else {
        console.log('⚠️  Reload signal sent, but status unclear');
        console.log(`   PID: ${daemon.pid}`);
        console.log('');
        console.log('   The daemon may still be processing the reload.');
        console.log('   Check daemon logs to confirm:');
        console.log('   - Foreground: check console output');
        console.log('   - Background: tail -f ~/.spark/daemon.log');
      }
    } catch (error) {
      console.error('❌ Failed to send reload signal:', error);
      console.error('   The daemon process may have terminated');
      console.error('');
      console.error('   Check daemon status: spark status');
      process.exit(1);
    }
  });

/**
 * Version command (also available via --version)
 */
program
  .command('version')
  .description('Show version information')
  .action(() => {
    console.log(`Spark Daemon v${packageJson.version}`);
    console.log(`Node.js ${process.version}`);
  });

// Parse command line arguments
program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
