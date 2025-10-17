import { FileWatcher } from '../../src/watcher/FileWatcher.js';
import { Logger } from '../../src/logger/Logger.js';
import { TestVault } from '../utils/TestVault.js';
import { jest } from '@jest/globals';

describe('FileWatcher', () => {
    let vault: TestVault;
    let watcher: FileWatcher;

    beforeEach(async () => {
        // Initialize logger
        Logger.getInstance({ level: 'error', console: false });

        vault = new TestVault();
        await vault.create();

        watcher = new FileWatcher({
            vaultPath: vault.root,
            patterns: ['**/*.md'],
            ignore: ['.git/**', 'node_modules/**'],
            debounceMs: 50,
        });
    });

    afterEach(async () => {
        if (watcher.isWatching()) {
            watcher.stop();
        }
        await vault.cleanup();
    });

    describe('constructor', () => {
        it('should create instance with config', () => {
            expect(watcher).toBeInstanceOf(FileWatcher);
            expect(watcher.isWatching()).toBe(false);
        });
    });

    describe('lifecycle', () => {
        it('should start watching', () => {
            watcher.start();
            expect(watcher.isWatching()).toBe(true);
        });

        it('should stop watching', () => {
            watcher.start();
            watcher.stop();
            expect(watcher.isWatching()).toBe(false);
        });

        it('should not start if already watching', () => {
            watcher.start();
            const firstState = watcher.isWatching();

            watcher.start(); // Try to start again
            const secondState = watcher.isWatching();

            expect(firstState).toBe(true);
            expect(secondState).toBe(true);
        });

        it('should handle stop when not watching', () => {
            expect(() => watcher.stop()).not.toThrow();
            expect(watcher.isWatching()).toBe(false);
        });

        it('should support start-stop-start cycle', () => {
            watcher.start();
            expect(watcher.isWatching()).toBe(true);

            watcher.stop();
            expect(watcher.isWatching()).toBe(false);

            watcher.start();
            expect(watcher.isWatching()).toBe(true);

            watcher.stop();
        });
    });

    describe('isWatching', () => {
        it('should return false initially', () => {
            expect(watcher.isWatching()).toBe(false);
        });

        it('should return true after start', () => {
            watcher.start();
            expect(watcher.isWatching()).toBe(true);
        });

        it('should return false after stop', () => {
            watcher.start();
            watcher.stop();
            expect(watcher.isWatching()).toBe(false);
        });
    });

    describe('event emitter interface', () => {
        it('should extend EventEmitter', () => {
            expect(typeof watcher.on).toBe('function');
            expect(typeof watcher.emit).toBe('function');
        });

        it('should allow registering event listeners', () => {
            const listener = jest.fn();

            expect(() => {
                watcher.on('change', listener);
            }).not.toThrow();
        });
    });
});
