/**
 * Stop Command
 * Stop the Spark daemon
 */

import type { Command } from 'commander';
import path from 'node:path';
import { getActiveDaemons, findDaemon } from '../registry.js';
import { cleanupPidFile, cleanupDaemon, stopSingleDaemonFromRegistry } from '../helpers.js';

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
}
