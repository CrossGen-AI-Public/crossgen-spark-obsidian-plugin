/**
 * CLI Helper Functions
 * Shared utilities for CLI commands
 */

import path from 'path';
import { existsSync, unlinkSync } from 'fs';
import { unregisterDaemon } from './registry.js';

/**
 * Validate that a path is an Obsidian vault
 */
export function validateVault(absolutePath: string, context: 'start' | 'dev' = 'start'): void {
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
