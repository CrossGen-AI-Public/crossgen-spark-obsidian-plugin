/**
 * Engine Registry
 * Tracks all running Spark engines globally
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface EngineEntry {
  pid: number;
  vaultPath: string;
  startTime: number;
}

export interface EngineRegistry {
  engines: EngineEntry[];
}

const REGISTRY_DIR = join(homedir(), '.spark');
const REGISTRY_FILE = join(REGISTRY_DIR, 'registry.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEngineEntry(value: unknown): value is EngineEntry {
  if (!isRecord(value)) return false;
  const pid = value.pid;
  const vaultPath = value.vaultPath;
  const startTime = value.startTime;
  return (
    typeof pid === 'number' &&
    Number.isFinite(pid) &&
    typeof vaultPath === 'string' &&
    vaultPath.length > 0 &&
    typeof startTime === 'number' &&
    Number.isFinite(startTime)
  );
}

function normalizeEngineEntries(value: unknown): EngineEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: EngineEntry[] = [];
  for (const item of value) {
    if (isEngineEntry(item)) {
      entries.push(item);
    }
  }
  return entries;
}

function normalizeRegistry(parsed: unknown): { registry: EngineRegistry; needsMigration: boolean } {
  // Support registries that might be:
  // - { engines: [...] }
  // - { <otherKey>: [...] } where the array contains EngineEntry-like objects
  // - [...] (legacy flat array of entries)
  if (Array.isArray(parsed)) {
    const engines = normalizeEngineEntries(parsed);
    return { registry: { engines }, needsMigration: engines.length > 0 };
  }

  if (!isRecord(parsed)) {
    return { registry: { engines: [] }, needsMigration: false };
  }

  const direct = normalizeEngineEntries(parsed.engines);
  if (Array.isArray(parsed.engines)) {
    // If some entries were invalid and got filtered, rewrite to clean.
    const needsMigration = direct.length !== parsed.engines.length;
    return { registry: { engines: direct }, needsMigration };
  }

  // No engines array; try to find any array-valued property that looks like a registry entry list.
  for (const value of Object.values(parsed)) {
    if (!Array.isArray(value)) continue;
    const engines = normalizeEngineEntries(value);
    if (engines.length > 0) {
      return { registry: { engines }, needsMigration: true };
    }
  }

  return { registry: { engines: [] }, needsMigration: false };
}

/**
 * Get the global registry
 */
export function getRegistry(): EngineRegistry {
  try {
    if (!existsSync(REGISTRY_FILE)) {
      return { engines: [] };
    }
    const content = readFileSync(REGISTRY_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    const { registry, needsMigration } = normalizeRegistry(parsed);
    if (needsMigration) {
      // Best-effort migration to canonical shape.
      // If this fails (permissions, etc.), we still return the normalized in-memory version.
      try {
        saveRegistry(registry);
      } catch {
        // ignore
      }
    }
    return registry;
  } catch {
    return { engines: [] };
  }
}

/**
 * Save the registry
 */
export function saveRegistry(registry: EngineRegistry): void {
  try {
    mkdirSync(REGISTRY_DIR, { recursive: true });
    writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  } catch (error) {
    // Registry write failure is not critical - engine can still run
    // Log with console since Logger may not be available in CLI context
    console.error(
      'Warning: Could not save engine registry:',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Add a engine to the registry
 */
export function registerEngine(pid: number, vaultPath: string): void {
  const registry = getRegistry();

  // Remove any existing entry for this vault
  registry.engines = registry.engines.filter((d) => d.vaultPath !== vaultPath);

  // Add new entry
  registry.engines.push({
    pid,
    vaultPath,
    startTime: Date.now(),
  });

  saveRegistry(registry);
}

/**
 * Remove a engine from the registry
 */
export function unregisterEngine(vaultPath: string): void {
  const registry = getRegistry();
  registry.engines = registry.engines.filter((d) => d.vaultPath !== vaultPath);
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
 * Get all active engines (removes stale entries)
 */
export function getActiveEngines(): EngineEntry[] {
  const registry = getRegistry();
  const active: EngineEntry[] = [];
  let needsCleanup = false;

  for (const engine of registry.engines) {
    if (isProcessRunning(engine.pid)) {
      active.push(engine);
    } else {
      needsCleanup = true;
    }
  }

  // Clean up stale entries
  if (needsCleanup) {
    saveRegistry({ engines: active });
  }

  return active;
}

/**
 * Find engine for a specific vault
 */
export function findEngine(vaultPath: string): EngineEntry | null {
  const active = getActiveEngines();
  return active.find((d) => d.vaultPath === vaultPath) || null;
}
