/**
 * Start Command
 * Start the Spark daemon
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { handleCliError } from '../../errors/ErrorHandler.js';
import { SparkDaemon } from '../../main.js';
import { cleanupDaemon, cleanupPidFile, validateVault } from '../helpers.js';
import { print, printError } from '../output.js';
import { findDaemon, registerDaemon } from '../registry.js';

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
        printError('❌ Daemon is already running for this vault');
        printError(`   PID: ${existingDaemon.pid}`);
        printError('   Run "spark stop" first to stop the existing daemon');
        process.exit(1);
      }

      // Clean up stale PID file if it exists
      cleanupPidFile(absolutePath);

      // Validate that this is an Obsidian vault
      validateVault(absolutePath, 'start');

      print(`Starting Spark daemon for vault: ${absolutePath}`);
      if (options.debug) {
        print('Debug mode enabled');
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
        printError('Warning: Could not write PID file:', error);
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
        print(`\nReceived ${signal}, shutting down gracefully...`);
        try {
          await daemon.stop();
          cleanupDaemon(absolutePath);
          print('Daemon stopped successfully');
          process.exit(0);
        } catch (error) {
          printError('Error during shutdown:', error);
          process.exit(1);
        }
      };

      process.on('SIGINT', () => void shutdown('SIGINT'));
      process.on('SIGTERM', () => void shutdown('SIGTERM'));

      // Handle config reload signal
      process.on('SIGUSR1', () => {
        print('\nReceived reload signal, reloading configuration...');
        daemon
          .reloadConfig()
          .then(() => {
            print('✓ Configuration reloaded successfully');
            print('  All settings have been updated');
          })
          .catch((error: unknown) => {
            printError('❌ Failed to reload configuration');
            if (error instanceof Error) {
              printError(`   Error: ${error.message}`);
              if ('code' in error) {
                printError(`   Code: ${(error as Error & { code: string }).code}`);
              }
            } else {
              printError(`   Error: ${String(error)}`);
            }
            printError('');
            printError('   The daemon is still running with the previous configuration.');
            printError('   Fix the config file and try again: spark reload');
          });
      });

      // Handle uncaught errors
      process.on('uncaughtException', (error) => {
        printError('Uncaught exception:', error);
        void shutdown('UNCAUGHT_EXCEPTION');
      });

      process.on('unhandledRejection', (reason) => {
        printError('Unhandled rejection:', reason);
        void shutdown('UNHANDLED_REJECTION');
      });
    });
}
