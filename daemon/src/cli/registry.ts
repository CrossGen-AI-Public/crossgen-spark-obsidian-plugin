/**
 * Daemon Registry
 * Tracks all running Spark daemons globally
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface DaemonEntry {
  pid: number;
  vaultPath: string;
  startTime: number;
}

export interface DaemonRegistry {
  daemons: DaemonEntry[];
}

const REGISTRY_DIR = join(homedir(), '.spark');
const REGISTRY_FILE = join(REGISTRY_DIR, 'registry.json');

/**
 * Get the global registry
 */
export function getRegistry(): DaemonRegistry {
  try {
    if (!existsSync(REGISTRY_FILE)) {
      return { daemons: [] };
    }
    const content = readFileSync(REGISTRY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { daemons: [] };
  }
}

/**
 * Save the registry
 */
export function saveRegistry(registry: DaemonRegistry): void {
  try {
    mkdirSync(REGISTRY_DIR, { recursive: true });
    writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  } catch (error) {
    // Registry write failure is not critical - daemon can still run
    // Log with console since Logger may not be available in CLI context
    console.error(
      'Warning: Could not save daemon registry:',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Add a daemon to the registry
 */
export function registerDaemon(pid: number, vaultPath: string): void {
  const registry = getRegistry();

  // Remove any existing entry for this vault
  registry.daemons = registry.daemons.filter((d) => d.vaultPath !== vaultPath);

  // Add new entry
  registry.daemons.push({
    pid,
    vaultPath,
    startTime: Date.now(),
  });

  saveRegistry(registry);
}

/**
 * Remove a daemon from the registry
 */
export function unregisterDaemon(vaultPath: string): void {
  const registry = getRegistry();
  registry.daemons = registry.daemons.filter((d) => d.vaultPath !== vaultPath);
  saveRegistry(registry);
}

/**
 * Check if a process is running
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all active daemons (removes stale entries)
 */
export function getActiveDaemons(): DaemonEntry[] {
  const registry = getRegistry();
  const active: DaemonEntry[] = [];
  let needsCleanup = false;

  for (const daemon of registry.daemons) {
    if (isProcessRunning(daemon.pid)) {
      active.push(daemon);
    } else {
      needsCleanup = true;
    }
  }

  // Clean up stale entries
  if (needsCleanup) {
    saveRegistry({ daemons: active });
  }

  return active;
}

/**
 * Find daemon for a specific vault
 */
export function findDaemon(vaultPath: string): DaemonEntry | null {
  const active = getActiveDaemons();
  return active.find((d) => d.vaultPath === vaultPath) || null;
}
