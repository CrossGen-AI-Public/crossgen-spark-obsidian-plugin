/**
 * Start Command
 * Start the Spark daemon
 */

import type { Command } from 'commander';
import path from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { SparkDaemon } from '../../main.js';
import { registerDaemon, findDaemon } from '../registry.js';
import { handleCliError } from '../../errors/ErrorHandler.js';
import { validateVault, cleanupPidFile, cleanupDaemon } from '../helpers.js';

export function registerStartCommand(program: Command): void {
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
        handleCliError(error, 'Starting daemon', absolutePath);
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
}
