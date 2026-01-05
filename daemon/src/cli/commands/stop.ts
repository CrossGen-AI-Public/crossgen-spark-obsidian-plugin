/**
 * Stop Command
 * Stop the Spark daemon
 */

import path from 'node:path';
import type { Command } from 'commander';
import { cleanupDaemon, cleanupPidFile, stopSingleDaemonFromRegistry } from '../helpers.js';
import { print, printError } from '../output.js';
import { findDaemon, getActiveDaemons } from '../registry.js';

export function registerStopCommand(program: Command): void {
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
          print('No daemons are currently running');
          process.exit(0);
        }

        print(`Stopping ${daemons.length} daemon(s)...`);
        let stopped = 0;
        let failed = 0;

        daemons.forEach((daemon) => {
          if (stopSingleDaemonFromRegistry(daemon, options.force)) {
            stopped++;
          } else {
            failed++;
          }
        });

        print('');
        print(`✅ Stopped ${stopped} daemon(s)${failed > 0 ? `, ${failed} failed` : ''}`);
        process.exit(failed > 0 ? 1 : 0);
      }

      // Single daemon stop
      const absolutePath = path.resolve(vaultPath);

      // Check registry first
      const daemon = findDaemon(absolutePath);
      if (!daemon) {
        print('Daemon is not running for this vault');
        // Clean up stale PID file if it exists
        cleanupPidFile(absolutePath);
        process.exit(0);
      }

      const pid = daemon.pid;

      // Stop the daemon
      const signal = options.force ? 'SIGKILL' : 'SIGTERM';
      print(`Stopping daemon (PID ${pid})...`);

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
                print('⚠️  Daemon did not stop gracefully, use --force to kill');
                process.exit(1);
              }
            } catch {
              clearInterval(checkInterval);
              cleanupDaemon(absolutePath);
              print('✅ Daemon stopped successfully');
              process.exit(0);
            }
          }, 100);
        } else {
          cleanupDaemon(absolutePath);
          print('✅ Daemon force stopped');
        }
      } catch (error) {
        printError('❌ Error stopping daemon:', error);
        process.exit(1);
      }
    });
}
