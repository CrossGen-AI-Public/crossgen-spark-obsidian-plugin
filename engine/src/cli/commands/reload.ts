/**
 * Reload Command
 * Reload configuration without restarting engine
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { validateVault } from '../helpers.js';
import { print, printError } from '../output.js';
import { findEngine } from '../registry.js';

type ReloadStatus = { status: 'success' | 'error'; message?: string };

async function runReloadCommand(vaultPath: string): Promise<void> {
  const absolutePath = path.resolve(vaultPath);

  // Validate that this is an Obsidian vault
  validateVault(absolutePath, 'start');

  const engine = findEngine(absolutePath);
  if (!engine) {
    printError('❌ No engine running for this vault');
    printError(`   Run: spark start ${absolutePath}`);
    process.exit(1);
  }

  const statusFile = path.join(absolutePath, '.spark', 'reload-status.json');

  try {
    clearStatusFile(statusFile);
    process.kill(engine.pid, 'SIGUSR1');
    print('Reloading configuration...');

    const status = await waitForReloadStatus(statusFile, 2000, 100);
    print('');
    printReloadOutcome(status, engine.pid);
  } catch (error) {
    printError('❌ Failed to send reload signal:', error);
    printError('   The engine process may have terminated');
    printError('');
    printError('   Check engine status: spark status');
    process.exit(1);
  }
}

function clearStatusFile(statusFile: string): void {
  try {
    if (existsSync(statusFile)) {
      unlinkSync(statusFile);
    }
  } catch {
    // Ignore - status file might not exist or might be locked briefly
  }
}

async function waitForReloadStatus(
  statusFile: string,
  maxWaitMs: number,
  checkIntervalMs: number
): Promise<ReloadStatus | null> {
  let waited = 0;
  while (waited < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    waited += checkIntervalMs;

    const status = tryReadStatusFile(statusFile);
    if (status) {
      return status;
    }
  }
  return null;
}

function tryReadStatusFile(statusFile: string): ReloadStatus | null {
  if (!existsSync(statusFile)) return null;

  try {
    const content = readFileSync(statusFile, 'utf-8');
    return JSON.parse(content) as ReloadStatus;
  } catch {
    // File might be mid-write, try again
    return null;
  }
}

function printReloadOutcome(status: ReloadStatus | null, pid: number): void {
  if (status) {
    if (status.status === 'success') {
      print('✅ Configuration reloaded successfully');
      print('   All settings have been updated');
      return;
    }

    print('❌ Configuration reload failed');
    print(`   Error: ${status.message}`);
    print('');
    print('   The engine is still running with the previous configuration.');
    print('   Fix the config file and try again: spark reload');
    process.exit(1);
  }

  print('⚠️  Reload signal sent, but status unclear');
  print(`   PID: ${pid}`);
  print('');
  print('   The engine may still be processing the reload.');
  print('   Check engine logs to confirm:');
  print('   - Foreground: check console output');
  print('   - Background: tail -f ~/.spark/engine.log');
}

export function registerReloadCommand(program: Command): void {
  program
    .command('reload')
    .description('Reload configuration without restarting engine')
    .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
    .action(runReloadCommand);
}
