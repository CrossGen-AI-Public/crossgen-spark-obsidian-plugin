import { FileWatcher } from '../../src/watcher/FileWatcher.js';
import type { FileChange } from '../../src/types/watcher.js';
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

        it('should stop watching', async () => {
            watcher.start();
            await watcher.stop();
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

        it('should handle stop when not watching', async () => {
            await expect(watcher.stop()).resolves.not.toThrow();
            expect(watcher.isWatching()).toBe(false);
        });

        it('should support start-stop-start cycle', async () => {
            watcher.start();
            expect(watcher.isWatching()).toBe(true);

            await watcher.stop();
            expect(watcher.isWatching()).toBe(false);

            watcher.start();
            expect(watcher.isWatching()).toBe(true);

            await watcher.stop();
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

        it('should return false after stop', async () => {
            watcher.start();
            await watcher.stop();
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

    describe('file detection integration', () => {
        it('should actually detect file changes', async () => {
            const changeListener = jest.fn();
            watcher.on('change', changeListener);

            // Wait for the ready event before creating files
            const readyPromise = new Promise<void>((resolve) => {
                watcher.once('ready', () => resolve());
            });

            watcher.start();
            await readyPromise;

            // Add a small delay after ready to ensure watcher is fully initialized
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Create a file
            await vault.writeFile('test.md', '# Test file');

            // Wait for debounce + processing
            await new Promise((resolve) => setTimeout(resolve, 400));

            // Verify the change was detected
            expect(changeListener).toHaveBeenCalled();
            const firstCall = changeListener.mock.calls[0]?.[0];
            expect(firstCall).toBeDefined();
            expect(firstCall).toMatchObject({
                path: 'test.md',
                type: 'add',
            });

            await watcher.stop();
        });

        it('should detect file modifications', async () => {
            const changeListener = jest.fn();
            watcher.on('change', changeListener);

            // Wait for the ready event before creating files
            const readyPromise = new Promise<void>((resolve) => {
                watcher.once('ready', () => resolve());
            });

            watcher.start();
            await readyPromise;

            // Add a small delay after ready to ensure watcher is fully initialized
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Create initial file
            await vault.writeFile('test.md', '# Initial');

            // Wait longer for file to be fully added and stabilized
            await new Promise((resolve) => setTimeout(resolve, 400));

            // Clear previous calls (from the add event)
            changeListener.mockClear();

            // Modify the file with different content
            await vault.writeFile('test.md', '# Modified content that is definitely different');

            // Wait for debounce + processing
            await new Promise((resolve) => setTimeout(resolve, 400));

            // Verify the change was detected
            expect(changeListener).toHaveBeenCalled();
            const modifyCall = changeListener.mock.calls[0]?.[0];
            expect(modifyCall).toBeDefined();
            expect(modifyCall).toMatchObject({
                path: 'test.md',
                type: 'change',
            });

            await watcher.stop();
        });

        it('should only detect files matching patterns', async () => {
            const changeListener = jest.fn<(change: FileChange) => void>();
            watcher.on('change', changeListener);

            // Wait for the ready event before creating files
            const readyPromise = new Promise<void>((resolve) => {
                watcher.once('ready', () => resolve());
            });

            watcher.start();
            await readyPromise;

            // Add a small delay after ready to ensure watcher is fully initialized
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Create a .md file (should be detected)
            await vault.writeFile('test.md', '# Test');

            // Wait a bit before creating the second file
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Create a .txt file (should NOT be detected)
            await vault.writeFile('test.txt', 'Plain text');

            // Wait for debounce + processing
            await new Promise((resolve) => setTimeout(resolve, 400));

            // Should only have detected the .md file
            expect(changeListener).toHaveBeenCalledTimes(1);
            const patternCall = changeListener.mock.calls[0]?.[0];
            expect(patternCall).toBeDefined();
            if (patternCall) {
                expect(patternCall.path).toBe('test.md');
            }

            await watcher.stop();
        });
    });
});
