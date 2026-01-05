/**
 * CLI Helper Functions
 * Shared utilities for CLI commands
 */

import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { print, printError } from './output.js';
import { unregisterDaemon } from './registry.js';

function hasObsidianConfigDir(vaultPath: string): boolean {
  try {
    const entries = readdirSync(vaultPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidateDir = path.join(vaultPath, entry.name);
      const appJson = path.join(candidateDir, 'app.json');
      const pluginsDir = path.join(candidateDir, 'plugins');
      if (existsSync(appJson) && existsSync(pluginsDir)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Validate that a path is an Obsidian vault
 */
export function validateVault(absolutePath: string, context: 'start' | 'dev' = 'start'): void {
  if (!hasObsidianConfigDir(absolutePath)) {
    printError('❌ Not an Obsidian vault: configuration folder not found');
    printError(`   Path: ${absolutePath}`);
    printError('');
    if (context === 'dev') {
      printError('   Dev mode must be run from an Obsidian vault directory.');
    } else {
      printError('   An Obsidian vault must contain a configuration folder.');
    }
    printError('   Please provide the path to your Obsidian vault.');
    printError('');
    printError(`   Example: spark ${context} ~/Documents/MyVault`);
    process.exit(1);
  }
}

/**
 * Clean up PID file
 */
export function cleanupPidFile(vaultPath: string): void {
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
 * Clean up daemon (PID file + registry)
 */
export function cleanupDaemon(vaultPath: string): void {
  cleanupPidFile(vaultPath);
  unregisterDaemon(vaultPath);
}

/**
 * Wait for process to stop
 */
export function waitForProcessStop(pid: number, maxAttempts = 10): void {
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
 * Stop a single daemon from registry
 */
export function stopSingleDaemonFromRegistry(
  daemon: { pid: number; vaultPath: string },
  force: boolean
): boolean {
  try {
    print(`  Stopping daemon for ${daemon.vaultPath} (PID ${daemon.pid})...`);
    const signal = force ? 'SIGKILL' : 'SIGTERM';
    process.kill(daemon.pid, signal);

    // For graceful shutdown, wait a bit
    if (!force) {
      waitForProcessStop(daemon.pid);
    }

    // Clean up
    cleanupDaemon(daemon.vaultPath);
    print(`  ✅ Stopped ${daemon.vaultPath}`);
    return true;
  } catch (error) {
    printError(`  ❌ Failed to stop ${daemon.vaultPath}:`, error);
    return false;
  }
}
