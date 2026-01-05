/**
 * Stop Command
 * Stop the Spark daemon
 */

import path from 'node:path';
import type { Command } from 'commander';
import { cleanupDaemon, cleanupPidFile, stopSingleDaemonFromRegistry } from '../helpers.js';
import { print, printError } from '../output.js';
import { findDaemon, getActiveDaemons } from '../registry.js';

type StopOptions = { force: boolean; all: boolean };

function runStopCommand(vaultPath: string, options: StopOptions): void {
  if (options.all) {
    stopAllDaemons(options.force);
    return;
  }

  stopDaemonForVault(vaultPath, options.force);
}

function stopAllDaemons(force: boolean): void {
  const daemons = getActiveDaemons();
  if (daemons.length === 0) {
    print('No daemons are currently running');
    process.exit(0);
  }

  print(`Stopping ${daemons.length} daemon(s)...`);
  let stopped = 0;
  let failed = 0;

  daemons.forEach((daemon) => {
    if (stopSingleDaemonFromRegistry(daemon, force)) {
      stopped++;
    } else {
      failed++;
    }
  });

  print('');
  print(`✅ Stopped ${stopped} daemon(s)${failed > 0 ? `, ${failed} failed` : ''}`);
  process.exit(failed > 0 ? 1 : 0);
}

function stopDaemonForVault(vaultPath: string, force: boolean): void {
  const absolutePath = path.resolve(vaultPath);

  const daemon = findDaemon(absolutePath);
  if (!daemon) {
    print('Daemon is not running for this vault');
    cleanupPidFile(absolutePath);
    process.exit(0);
  }

  const pid = daemon.pid;
  const signal = force ? 'SIGKILL' : 'SIGTERM';
  print(`Stopping daemon (PID ${pid})...`);

  try {
    process.kill(pid, signal);

    if (force) {
      cleanupDaemon(absolutePath);
      print('✅ Daemon force stopped');
      return;
    }

    waitForGracefulStop(
      pid,
      10,
      100,
      () => {
        cleanupDaemon(absolutePath);
        print('✅ Daemon stopped successfully');
        process.exit(0);
      },
      () => {
        print('⚠️  Daemon did not stop gracefully, use --force to kill');
        process.exit(1);
      }
    );
  } catch (error) {
    printError('❌ Error stopping daemon:', error);
    process.exit(1);
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function waitForGracefulStop(
  pid: number,
  maxAttempts: number,
  intervalMs: number,
  onStopped: () => void,
  onTimeout: () => void
): void {
  let attempts = 0;
  const checkInterval = setInterval(() => {
    attempts++;

    if (!isProcessRunning(pid)) {
      clearInterval(checkInterval);
      onStopped();
      return;
    }

    if (attempts > maxAttempts) {
      clearInterval(checkInterval);
      onTimeout();
    }
  }, intervalMs);
}

export function registerStopCommand(program: Command): void {
  program
    .command('stop')
    .description('Stop the daemon')
    .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
    .option('-f, --force', 'Force stop (SIGKILL)', false)
    .option('-a, --all', 'Stop all running daemons', false)
    .action(runStopCommand);
}
