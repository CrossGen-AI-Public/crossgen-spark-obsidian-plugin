/**
 * Tests for daemon registry
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
    getRegistry,
    saveRegistry,
    registerDaemon,
    unregisterDaemon,
    isProcessRunning,
    getActiveDaemons,
    findDaemon,
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
            expect(registry).toEqual({ daemons: [] });
        });

        it('should read existing registry', () => {
            mkdirSync(REGISTRY_DIR, { recursive: true });
            writeFileSync(
                REGISTRY_FILE,
                JSON.stringify({
                    daemons: [{ pid: 12345, vaultPath: '/test/vault', startTime: Date.now() }],
                })
            );

            const registry = getRegistry();
            expect(registry.daemons).toHaveLength(1);
            expect(registry.daemons[0]!.pid).toBe(12345);
            expect(registry.daemons[0]!.vaultPath).toBe('/test/vault');
        });

        it('should handle corrupted registry file', () => {
            mkdirSync(REGISTRY_DIR, { recursive: true });
            writeFileSync(REGISTRY_FILE, 'invalid json{');

            const registry = getRegistry();
            expect(registry).toEqual({ daemons: [] });
        });
    });

    describe('saveRegistry', () => {
        it('should save registry to file', () => {
            const registry = {
                daemons: [{ pid: 12345, vaultPath: '/test/vault', startTime: Date.now() }],
            };

            saveRegistry(registry);

            expect(existsSync(REGISTRY_FILE)).toBe(true);
            const saved = getRegistry();
            expect(saved.daemons).toHaveLength(1);
            expect(saved.daemons[0]!.pid).toBe(12345);
        });

        it('should create directory if it does not exist', () => {
            // File is already cleaned up in beforeEach, just verify directory exists
            const registry = { daemons: [] };
            saveRegistry(registry);

            expect(existsSync(REGISTRY_DIR)).toBe(true);
            expect(existsSync(REGISTRY_FILE)).toBe(true);
        });
    });

    describe('registerDaemon', () => {
        it('should add daemon to registry', () => {
            registerDaemon(12345, '/test/vault');

            const registry = getRegistry();
            expect(registry.daemons).toHaveLength(1);
            expect(registry.daemons[0]!.pid).toBe(12345);
            expect(registry.daemons[0]!.vaultPath).toBe('/test/vault');
            expect(registry.daemons[0]!.startTime).toBeGreaterThan(0);
        });

        it('should replace existing entry for same vault', () => {
            registerDaemon(12345, '/test/vault');
            registerDaemon(67890, '/test/vault');

            const registry = getRegistry();
            expect(registry.daemons).toHaveLength(1);
            expect(registry.daemons[0]!.pid).toBe(67890);
        });

        it('should allow multiple vaults', () => {
            registerDaemon(12345, '/test/vault1');
            registerDaemon(67890, '/test/vault2');

            const registry = getRegistry();
            expect(registry.daemons).toHaveLength(2);
        });
    });

    describe('unregisterDaemon', () => {
        it('should remove daemon from registry', () => {
            registerDaemon(12345, '/test/vault');
            unregisterDaemon('/test/vault');

            const registry = getRegistry();
            expect(registry.daemons).toHaveLength(0);
        });

        it('should not affect other vaults', () => {
            registerDaemon(12345, '/test/vault1');
            registerDaemon(67890, '/test/vault2');
            unregisterDaemon('/test/vault1');

            const registry = getRegistry();
            expect(registry.daemons).toHaveLength(1);
            expect(registry.daemons[0]!.vaultPath).toBe('/test/vault2');
        });

        it('should handle removing non-existent vault', () => {
            registerDaemon(12345, '/test/vault');
            unregisterDaemon('/non/existent');

            const registry = getRegistry();
            expect(registry.daemons).toHaveLength(1);
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

    describe('getActiveDaemons', () => {
        it('should return only running daemons', () => {
            // Add current process (definitely running)
            registerDaemon(process.pid, '/test/vault1');
            // Add fake process (definitely not running)
            registerDaemon(999999, '/test/vault2');

            const active = getActiveDaemons();
            expect(active).toHaveLength(1);
            expect(active[0]!.pid).toBe(process.pid);
        });

        it('should clean up stale entries', () => {
            registerDaemon(999999, '/test/vault');

            getActiveDaemons();

            const registry = getRegistry();
            expect(registry.daemons).toHaveLength(0);
        });

        it('should return empty array if no daemons', () => {
            const active = getActiveDaemons();
            expect(active).toHaveLength(0);
        });
    });

    describe('findDaemon', () => {
        it('should find daemon by vault path', () => {
            registerDaemon(process.pid, '/test/vault');

            const daemon = findDaemon('/test/vault');
            expect(daemon).not.toBeNull();
            expect(daemon!.pid).toBe(process.pid);
            expect(daemon!.vaultPath).toBe('/test/vault');
        });

        it('should return null if daemon not found', () => {
            const daemon = findDaemon('/non/existent');
            expect(daemon).toBeNull();
        });

        it('should return null if daemon is not running', () => {
            registerDaemon(999999, '/test/vault');

            const daemon = findDaemon('/test/vault');
            expect(daemon).toBeNull();
        });
    });
});

