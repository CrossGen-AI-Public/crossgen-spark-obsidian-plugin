/**
 * Start Command
 * Start the Spark engine
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { handleCliError } from '../../errors/ErrorHandler.js';
import { SparkEngine } from '../../main.js';
import { cleanupEngine, cleanupPidFile, validateVault } from '../helpers.js';
import { print, printError } from '../output.js';
import { findEngine, registerEngine } from '../registry.js';

/**
 * Detect LM Studio SDK auto-connect rejections (harmless when server isn't running).
 */
function isLMStudioConnectionError(reason: unknown): boolean {
  if (reason instanceof Error) {
    const msg = reason.message;
    return msg.includes('Failed to connect to LM Studio') || msg.includes('LMStudioClient');
  }
  return false;
}

export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description('Start the Spark engine')
    .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
    .option('-d, --debug', 'Enable debug logging', false)
    .action(async (vaultPath: string, options: { debug: boolean }) => {
      const absolutePath = path.resolve(vaultPath);

      // Check if engine is already running for this vault
      const existingEngine = findEngine(absolutePath);
      if (existingEngine) {
        printError('❌ Engine is already running for this vault');
        printError(`   PID: ${existingEngine.pid}`);
        printError('   Run "spark stop" first to stop the existing engine');
        process.exit(1);
      }

      // Clean up stale PID file if it exists
      cleanupPidFile(absolutePath);

      // Validate that this is an Obsidian vault
      validateVault(absolutePath, 'start');

      print(`Starting Spark engine for vault: ${absolutePath}`);
      if (options.debug) {
        print('Debug mode enabled');
      }

      // Create engine
      const engine = new SparkEngine(absolutePath);

      // Write PID file and register engine
      try {
        const sparkDir = path.join(absolutePath, '.spark');
        mkdirSync(sparkDir, { recursive: true });
        const pidFile = path.join(sparkDir, 'engine.pid');
        writeFileSync(pidFile, process.pid.toString());
        registerEngine(process.pid, absolutePath);
      } catch (error) {
        printError('Warning: Could not write PID file:', error);
      }

      // Override log level if debug flag is set
      if (options.debug) {
        process.env.SPARK_LOG_LEVEL = 'debug';
      }

      try {
        await engine.start();
      } catch (error) {
        handleCliError(error, 'Starting engine', absolutePath);
      }

      // Graceful shutdown handlers
      const shutdown = async (signal: string): Promise<void> => {
        print(`\nReceived ${signal}, shutting down gracefully...`);
        try {
          await engine.stop();
          cleanupEngine(absolutePath);
          print('Engine stopped successfully');
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
        engine
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
                const code = (error as Error & { code: unknown }).code;
                printError(`   Code: ${String(code)}`);
              }
            } else {
              printError(`   Error: ${String(error)}`);
            }
            printError('');
            printError('   The engine is still running with the previous configuration.');
            printError('   Fix the config file and try again: spark reload');
          });
      });

      // Handle uncaught errors
      process.on('uncaughtException', (error) => {
        printError('Uncaught exception:', error);
        void shutdown('UNCAUGHT_EXCEPTION');
      });

      process.on('unhandledRejection', (reason) => {
        // The @lmstudio/sdk fires internal auto-connect rejections when the
        // server isn't running. These are harmless — ignore them.
        if (isLMStudioConnectionError(reason)) return;

        printError('Unhandled rejection:', reason);
        void shutdown('UNHANDLED_REJECTION');
      });
    });
}
