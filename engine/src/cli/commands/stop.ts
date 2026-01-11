/**
 * Stop Command
 * Stop the Spark engine
 */

import path from 'node:path';
import type { Command } from 'commander';
import { cleanupEngine, cleanupPidFile, stopSingleEngineFromRegistry } from '../helpers.js';
import { print, printError } from '../output.js';
import { findEngine, getActiveEngines } from '../registry.js';

type StopOptions = { force: boolean; all: boolean };

function runStopCommand(vaultPath: string, options: StopOptions): void {
  if (options.all) {
    stopAllEngines(options.force);
    return;
  }

  stopEngineForVault(vaultPath, options.force);
}

function stopAllEngines(force: boolean): void {
  const engines = getActiveEngines();
  if (engines.length === 0) {
    print('No engines are currently running');
    process.exit(0);
  }

  print(`Stopping ${engines.length} engine(s)...`);
  let stopped = 0;
  let failed = 0;

  engines.forEach((engine) => {
    if (stopSingleEngineFromRegistry(engine, force)) {
      stopped++;
    } else {
      failed++;
    }
  });

  print('');
  print(`✅ Stopped ${stopped} engine(s)${failed > 0 ? `, ${failed} failed` : ''}`);
  process.exit(failed > 0 ? 1 : 0);
}

function stopEngineForVault(vaultPath: string, force: boolean): void {
  const absolutePath = path.resolve(vaultPath);

  const engine = findEngine(absolutePath);
  if (!engine) {
    print('Engine is not running for this vault');
    cleanupPidFile(absolutePath);
    process.exit(0);
  }

  const pid = engine.pid;
  const signal = force ? 'SIGKILL' : 'SIGTERM';
  print(`Stopping engine (PID ${pid})...`);

  try {
    process.kill(pid, signal);

    if (force) {
      cleanupEngine(absolutePath);
      print('✅ Engine force stopped');
      return;
    }

    waitForGracefulStop(
      pid,
      10,
      100,
      () => {
        cleanupEngine(absolutePath);
        print('✅ Engine stopped successfully');
        process.exit(0);
      },
      () => {
        print('⚠️  Engine did not stop gracefully, use --force to kill');
        process.exit(1);
      }
    );
  } catch (error) {
    printError('❌ Error stopping engine:', error);
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
    .description('Stop the engine')
    .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
    .option('-f, --force', 'Force stop (SIGKILL)', false)
    .option('-a, --all', 'Stop all running engines', false)
    .action(runStopCommand);
}
