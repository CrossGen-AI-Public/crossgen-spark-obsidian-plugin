/**
 * Tests for engine registry
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
    getRegistry,
    saveRegistry,
    registerEngine,
    unregisterEngine,
    isProcessRunning,
    getActiveEngines,
    findEngine,
} from '../../src/cli/registry.js';
import { existsSync, unlinkSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const REGISTRY_DIR = join(homedir(), '.spark');
const REGISTRY_FILE = join(REGISTRY_DIR, 'registry.json');
const TEST_BACKUP = REGISTRY_FILE + '.test-backup';

describe('registry', () => {
    beforeEach(() => {
        // Backup existing registry if it exists
        if (existsSync(REGISTRY_FILE)) {
            if (existsSync(TEST_BACKUP)) {
                unlinkSync(TEST_BACKUP);
            }
            writeFileSync(TEST_BACKUP, readFileSync(REGISTRY_FILE));
        }
        // Clean registry for tests
        if (existsSync(REGISTRY_FILE)) {
            unlinkSync(REGISTRY_FILE);
        }
    });

    afterEach(() => {
        // Restore backup if it exists
        if (existsSync(TEST_BACKUP)) {
            writeFileSync(REGISTRY_FILE, readFileSync(TEST_BACKUP));
            unlinkSync(TEST_BACKUP);
        } else if (existsSync(REGISTRY_FILE)) {
            unlinkSync(REGISTRY_FILE);
        }
    });

    describe('getRegistry', () => {
        it('should return empty registry if file does not exist', () => {
            const registry = getRegistry();
            expect(registry).toEqual({ engines: [] });
        });

        it('should read existing registry', () => {
            mkdirSync(REGISTRY_DIR, { recursive: true });
            writeFileSync(
                REGISTRY_FILE,
                JSON.stringify({
                    engines: [{ pid: 12345, vaultPath: '/test/vault', startTime: Date.now() }],
                })
            );

            const registry = getRegistry();
            expect(registry.engines).toHaveLength(1);
            expect(registry.engines[0]!.pid).toBe(12345);
            expect(registry.engines[0]!.vaultPath).toBe('/test/vault');
        });

        it('should normalize registries stored under a different top-level key', () => {
            mkdirSync(REGISTRY_DIR, { recursive: true });
            writeFileSync(
                REGISTRY_FILE,
                JSON.stringify({
                    legacyEntries: [{ pid: 12345, vaultPath: '/test/vault', startTime: Date.now() }],
                })
            );

            const registry = getRegistry();
            expect(registry.engines).toHaveLength(1);
            expect(registry.engines[0]!.pid).toBe(12345);
            expect(registry.engines[0]!.vaultPath).toBe('/test/vault');
        });

        it('should handle corrupted registry file', () => {
            mkdirSync(REGISTRY_DIR, { recursive: true });
            writeFileSync(REGISTRY_FILE, 'invalid json{');

            const registry = getRegistry();
            expect(registry).toEqual({ engines: [] });
        });
    });

    describe('saveRegistry', () => {
        it('should save registry to file', () => {
            const registry = {
                engines: [{ pid: 12345, vaultPath: '/test/vault', startTime: Date.now() }],
            };

            saveRegistry(registry);

            expect(existsSync(REGISTRY_FILE)).toBe(true);
            const saved = getRegistry();
            expect(saved.engines).toHaveLength(1);
            expect(saved.engines[0]!.pid).toBe(12345);
        });

        it('should create directory if it does not exist', () => {
            // File is already cleaned up in beforeEach, just verify directory exists
            const registry = { engines: [] };
            saveRegistry(registry);

            expect(existsSync(REGISTRY_DIR)).toBe(true);
            expect(existsSync(REGISTRY_FILE)).toBe(true);
        });
    });

    describe('registerEngine', () => {
        it('should add engine to registry', () => {
            registerEngine(12345, '/test/vault');

            const registry = getRegistry();
            expect(registry.engines).toHaveLength(1);
            expect(registry.engines[0]!.pid).toBe(12345);
            expect(registry.engines[0]!.vaultPath).toBe('/test/vault');
            expect(registry.engines[0]!.startTime).toBeGreaterThan(0);
        });

        it('should replace existing entry for same vault', () => {
            registerEngine(12345, '/test/vault');
            registerEngine(67890, '/test/vault');

            const registry = getRegistry();
            expect(registry.engines).toHaveLength(1);
            expect(registry.engines[0]!.pid).toBe(67890);
        });

        it('should allow multiple vaults', () => {
            registerEngine(12345, '/test/vault1');
            registerEngine(67890, '/test/vault2');

            const registry = getRegistry();
            expect(registry.engines).toHaveLength(2);
        });
    });

    describe('unregisterEngine', () => {
        it('should remove engine from registry', () => {
            registerEngine(12345, '/test/vault');
            unregisterEngine('/test/vault');

            const registry = getRegistry();
            expect(registry.engines).toHaveLength(0);
        });

        it('should not affect other vaults', () => {
            registerEngine(12345, '/test/vault1');
            registerEngine(67890, '/test/vault2');
            unregisterEngine('/test/vault1');

            const registry = getRegistry();
            expect(registry.engines).toHaveLength(1);
            expect(registry.engines[0]!.vaultPath).toBe('/test/vault2');
        });

        it('should handle removing non-existent vault', () => {
            registerEngine(12345, '/test/vault');
            unregisterEngine('/non/existent');

            const registry = getRegistry();
            expect(registry.engines).toHaveLength(1);
        });
    });

    describe('isProcessRunning', () => {
        it('should return true for current process', () => {
            expect(isProcessRunning(process.pid)).toBe(true);
        });

        it('should return false for non-existent process', () => {
            // Use a very high PID that's unlikely to exist
            expect(isProcessRunning(999999)).toBe(false);
        });
    });

    describe('getActiveEngines', () => {
        it('should return only running engines', () => {
            // Add current process (definitely running)
            registerEngine(process.pid, '/test/vault1');
            // Add fake process (definitely not running)
            registerEngine(999999, '/test/vault2');

            const active = getActiveEngines();
            expect(active).toHaveLength(1);
            expect(active[0]!.pid).toBe(process.pid);
        });

        it('should clean up stale entries', () => {
            registerEngine(999999, '/test/vault');

            getActiveEngines();

            const registry = getRegistry();
            expect(registry.engines).toHaveLength(0);
        });

        it('should return empty array if no engines', () => {
            const active = getActiveEngines();
            expect(active).toHaveLength(0);
        });
    });

    describe('findEngine', () => {
        it('should find engine by vault path', () => {
            registerEngine(process.pid, '/test/vault');

            const engine = findEngine('/test/vault');
            expect(engine).not.toBeNull();
            expect(engine!.pid).toBe(process.pid);
            expect(engine!.vaultPath).toBe('/test/vault');
        });

        it('should return null if engine not found', () => {
            const engine = findEngine('/non/existent');
            expect(engine).toBeNull();
        });

        it('should return null if engine is not running', () => {
            registerEngine(999999, '/test/vault');

            const engine = findEngine('/test/vault');
            expect(engine).toBeNull();
        });
    });
});

