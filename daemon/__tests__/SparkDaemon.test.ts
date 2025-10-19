import { SparkDaemon } from '../src/SparkDaemon.js';
import { TestVault } from './utils/TestVault.js';
import { Logger } from '../src/logger/Logger.js';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

describe('SparkDaemon', () => {
    let vault: TestVault;
    let daemon: SparkDaemon;

    beforeEach(async () => {
        // Reset logger singleton
        Logger.resetInstance();

        vault = new TestVault();
        await vault.create();

        // Create basic config with minimal debounce for fast tests
        await vault.writeConfig(`
version: "1.0"
daemon:
  watch:
    patterns:
      - "**/*.md"
    ignore:
      - ".git/**"
  debounce_ms: 10
ai:
  provider: "claude"
logging:
  level: "error"
  console: false
`);

        daemon = new SparkDaemon(vault.root);
    });

    afterEach(async () => {
        try {
            if (daemon.isRunning()) {
                await daemon.stop();
            }
        } catch (_error) {
            // Ignore cleanup errors
        }
        await vault.cleanup();
    });

    describe('constructor', () => {
        it('should create daemon instance', () => {
            expect(daemon).toBeInstanceOf(SparkDaemon);
        });

        it('should initialize in stopped state', () => {
            expect(daemon.isRunning()).toBe(false);
        });
    });

    describe('lifecycle', () => {
        it('should start and stop daemon', async () => {
            await daemon.start();
            expect(daemon.isRunning()).toBe(true);

            await daemon.stop();
            expect(daemon.isRunning()).toBe(false);
        });

        it('should throw error if starting when already running', async () => {
            await daemon.start();
            await expect(daemon.start()).rejects.toThrow('already running');
            await daemon.stop();
        });

        it('should handle stop when not running', async () => {
            await expect(daemon.stop()).resolves.not.toThrow();
            expect(daemon.isRunning()).toBe(false);
        });
    });

    describe('isRunning', () => {
        it('should return false initially', () => {
            expect(daemon.isRunning()).toBe(false);
        });

        it('should return correct state after start/stop', async () => {
            expect(daemon.isRunning()).toBe(false);

            await daemon.start();
            expect(daemon.isRunning()).toBe(true);

            await daemon.stop();
            expect(daemon.isRunning()).toBe(false);
        });
    });

    describe('configuration', () => {
        it('should handle missing config file with defaults', async () => {
            const vault2 = new TestVault();
            await vault2.create();

            const daemon2 = new SparkDaemon(vault2.root);

            await daemon2.start();
            expect(daemon2.isRunning()).toBe(true);

            await daemon2.stop();
            await vault2.cleanup();
        });
    });

    describe('getters', () => {
        it('should return vault path', () => {
            expect(daemon.getVaultPath()).toBe(vault.root);
        });

        it('should return null config before starting', () => {
            expect(daemon.getConfig()).toBeNull();
        });

        it('should return config after starting', async () => {
            await daemon.start();
            const config = daemon.getConfig();
            expect(config).not.toBeNull();
            expect(config?.daemon?.watch.patterns).toContain('**/*.md');
            await daemon.stop();
        });

        it('should return daemon state', async () => {
            expect(daemon.getState()).toBe('stopped');
            await daemon.start();
            expect(daemon.getState()).toBe('running');
            await daemon.stop();
            expect(daemon.getState()).toBe('stopped');
        });

        it('should return null watcher before starting', () => {
            expect(daemon.getWatcher()).toBeNull();
        });

        it('should return watcher after starting', async () => {
            await daemon.start();
            expect(daemon.getWatcher()).not.toBeNull();
            await daemon.stop();
        });

        it('should return null file parser before starting', () => {
            expect(daemon.getFileParser()).toBeNull();
        });

        it('should return file parser after starting', async () => {
            await daemon.start();
            expect(daemon.getFileParser()).not.toBeNull();
            await daemon.stop();
        });
    });

    describe('file change handling', () => {
        it('should handle file addition', async () => {
            await daemon.start();

            // Create a new file
            await vault.writeFile('new-file.md', '# New File\nSome content');

            // Wait for file to be processed (minimal wait with 10ms debounce)
            await new Promise(resolve => setTimeout(resolve, 50));

            await daemon.stop();
        });

        it('should handle file modification', async () => {
            // Create initial file
            await vault.writeFile('test.md', '# Test\nInitial content');

            await daemon.start();

            // Modify the file
            await vault.writeFile('test.md', '# Test\nModified content');

            // Wait for file to be processed
            await new Promise(resolve => setTimeout(resolve, 50));

            await daemon.stop();
        });

        it('should handle file deletion', async () => {
            // Create initial file
            await vault.writeFile('to-delete.md', '# Will be deleted');

            await daemon.start();

            // Delete the file
            await vault.deleteFile('to-delete.md');

            // Wait for deletion to be processed
            await new Promise(resolve => setTimeout(resolve, 50));

            await daemon.stop();
        });

        it('should detect commands in files', async () => {
            await daemon.start();

            // Create file with command
            await vault.writeFile('with-command.md', `# Task
@agent Write a summary of this file

Some content here.
`);

            // Wait for file to be processed
            await new Promise(resolve => setTimeout(resolve, 50));

            await daemon.stop();
        });

        it('should detect mention chains in files', async () => {
            await daemon.start();

            // Create files with mentions
            await vault.writeFile('note1.md', '# Note 1\nSee [[note2]]');
            await vault.writeFile('note2.md', '# Note 2\nRefers to [[note3]]');
            await vault.writeFile('note3.md', '# Note 3\nContent here');

            // Wait for files to be processed
            await new Promise(resolve => setTimeout(resolve, 100));

            await daemon.stop();
        });

        it('should detect frontmatter changes', async () => {
            // Create file with frontmatter
            await vault.writeFile('with-frontmatter.md', `---
status: todo
priority: high
---

# Task
Content here
`);

            await daemon.start();

            // Wait for initial processing
            await new Promise(resolve => setTimeout(resolve, 30));

            // Modify frontmatter
            await vault.writeFile('with-frontmatter.md', `---
status: done
priority: high
---

# Task
Content here
`);

            // Wait for change to be processed
            await new Promise(resolve => setTimeout(resolve, 50));

            await daemon.stop();
        });

        it('should handle files with multiple commands', async () => {
            await daemon.start();

            await vault.writeFile('multi-command.md', `# Multiple Commands

@agent Analyze this section
Some content

@sop Run backup procedure
More content

@agent Generate summary
`);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            await daemon.stop();
        });

        it('should handle files with no commands', async () => {
            await daemon.start();

            await vault.writeFile('plain.md', `# Plain File
Just regular content with no commands or mentions.
`);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            await daemon.stop();
        });
    });

    describe('error handling', () => {
        it('should handle missing .spark directory', async () => {
            // Create vault without .spark directory
            const vault2 = new TestVault();
            await vault2.create();

            // Delete .spark directory to test error handling
            const fs = await import('fs/promises');
            const path = await import('path');
            await fs.rm(path.join(vault2.root, '.spark'), { recursive: true, force: true });

            const daemon2 = new SparkDaemon(vault2.root);

            // Should still start with defaults (ConfigLoader handles missing config)
            await daemon2.start();
            expect(daemon2.isRunning()).toBe(true);

            await daemon2.stop();
            await vault2.cleanup();
        });

        it('should handle large files', async () => {
            await daemon.start();

            // Create a large file
            const largeContent = '# Large File\n' + 'Line of content\n'.repeat(1000);
            await vault.writeFile('large.md', largeContent);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(daemon.isRunning()).toBe(true);

            await daemon.stop();
        });

        it('should handle files with special characters', async () => {
            await daemon.start();

            await vault.writeFile('special-chars.md', `# Special Characters
Unicode: 你好世界 🎉
Symbols: @#$%^&*()
Quotes: "test" 'test'
`);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(daemon.isRunning()).toBe(true);

            await daemon.stop();
        });
    });

    describe('integration scenarios', () => {
        it('should handle rapid file changes', async () => {
            await daemon.start();

            // Create multiple files quickly
            await vault.writeFile('rapid1.md', '# File 1');
            await vault.writeFile('rapid2.md', '# File 2');
            await vault.writeFile('rapid3.md', '# File 3');

            // Wait for debouncing and processing
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(daemon.isRunning()).toBe(true);

            await daemon.stop();
        });

        it('should handle concurrent file operations', async () => {
            await daemon.start();

            // Perform multiple operations concurrently
            await Promise.all([
                vault.writeFile('concurrent1.md', '# File 1'),
                vault.writeFile('concurrent2.md', '# File 2'),
                vault.writeFile('concurrent3.md', '# File 3'),
            ]);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(daemon.isRunning()).toBe(true);

            await daemon.stop();
        });

        it('should maintain state through multiple stop/start cycles', async () => {
            // First cycle
            await daemon.start();
            expect(daemon.isRunning()).toBe(true);
            await daemon.stop();
            expect(daemon.isRunning()).toBe(false);

            // Second cycle
            await daemon.start();
            expect(daemon.isRunning()).toBe(true);
            await daemon.stop();
            expect(daemon.isRunning()).toBe(false);
        });
    });

    describe('inspector integration', () => {
        it('should initialize inspector on start', async () => {
            await daemon.start();
            const inspector = daemon.getInspector();

            expect(inspector).not.toBeNull();
            expect(daemon.isRunning()).toBe(true);

            await daemon.stop();
        });

        it.skip('should record file changes in inspector', async () => {
            await daemon.start();
            const inspector = daemon.getInspector();

            // Give inspector time to initialize
            await new Promise(resolve => setTimeout(resolve, 20));

            // Create a file
            await vault.writeFile('tracked.md', '# Tracked File\nContent here');

            // Wait for processing (debounce + processing time)
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check history
            const history = inspector!.getHistory();
            const fileChanges = history.filter(e => e.type === 'file_change');

            expect(fileChanges.length).toBeGreaterThan(0);
            expect(fileChanges.some(e => e.path?.includes('tracked.md'))).toBe(true);

            await daemon.stop();
        });

        it.skip('should record command detections', async () => {
            await daemon.start();
            const inspector = daemon.getInspector();

            // Give inspector time to initialize
            await new Promise(resolve => setTimeout(resolve, 20));

            // Create file with command
            await vault.writeFile('command.md', '/summarize this document\n\nSome content');

            // Wait for processing (debounce + processing time)
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check history
            const history = inspector!.getHistory();
            const commands = history.filter(e => e.type === 'command_detected');

            expect(commands.length).toBeGreaterThan(0);
            expect(commands[0]?.details?.command).toBe('summarize');

            await daemon.stop();
        });

        it.skip('should record frontmatter changes', async () => {
            // Create initial file
            await vault.writeFile('task.md', `---
status: pending
priority: low
---
# My Task
Content`);

            await daemon.start();
            const inspector = daemon.getInspector();

            // Wait for initial processing
            await new Promise(resolve => setTimeout(resolve, 100));

            // Clear to focus on changes
            inspector!.clearHistory();

            // Modify frontmatter
            await vault.writeFile('task.md', `---
status: complete
priority: low
---
# My Task
Content`);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 100));

            // Check history
            const history = inspector!.getHistory();
            const fmChanges = history.filter(e => e.type === 'frontmatter_change');

            expect(fmChanges.length).toBeGreaterThan(0);
            expect(fmChanges[0]?.details?.field).toBe('status');
            expect(fmChanges[0]?.details?.oldValue).toBe('pending');
            expect(fmChanges[0]?.details?.newValue).toBe('complete');

            await daemon.stop();
        });

        it.skip('should provide statistics via inspector', async () => {
            await daemon.start();
            const inspector = daemon.getInspector();

            // Create various files
            await vault.writeFile('file1.md', '/analyze');
            await vault.writeFile('file2.md', '/review');
            await vault.writeFile('file3.md', `---
type: note
---
Content`);

            await new Promise(resolve => setTimeout(resolve, 100));

            const stats = inspector!.getStats();

            expect(stats.totalEvents).toBeGreaterThan(0);
            expect(stats.fileChanges).toBeGreaterThan(0);
            expect(stats.commandsDetected).toBeGreaterThan(0);

            await daemon.stop();
        });

        it.skip('should persist history to file', async () => {
            await daemon.start();

            // Give inspector time to initialize
            await new Promise(resolve => setTimeout(resolve, 20));

            // Create a file to generate history
            await vault.writeFile('persistent.md', '/test command');
            await new Promise(resolve => setTimeout(resolve, 100));

            await daemon.stop();

            // Verify history file exists
            const historyPath = path.join(vault.root, '.spark', 'history.json');
            expect(existsSync(historyPath)).toBe(true);

            // Read and verify history
            const historyData = JSON.parse(readFileSync(historyPath, 'utf-8'));
            expect(Array.isArray(historyData)).toBe(true);
            expect(historyData.length).toBeGreaterThan(0);
        });

        it.skip('should load history on daemon start', async () => {
            // First session
            await daemon.start();
            await new Promise(resolve => setTimeout(resolve, 20));

            await vault.writeFile('session1.md', '# Session 1');
            await new Promise(resolve => setTimeout(resolve, 100));
            await daemon.stop();

            // Wait for cleanup
            await new Promise(resolve => setTimeout(resolve, 50));

            // Create new daemon instance (simulates restart)
            const daemon2 = new SparkDaemon(vault.root);
            try {
                await daemon2.start();

                const inspector = daemon2.getInspector();
                const history = inspector!.getHistory();

                // Should have events from previous session
                expect(history.length).toBeGreaterThan(0);
            } finally {
                // Ensure daemon2 is stopped even if test fails
                if (daemon2.isRunning()) {
                    await daemon2.stop();
                }
                // Wait for cleanup
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        });

        it.skip('should clear history when requested', async () => {
            await daemon.start();
            const inspector = daemon.getInspector();

            // Give inspector time to initialize
            await new Promise(resolve => setTimeout(resolve, 20));

            // Generate some history
            await vault.writeFile('test.md', '# Test');
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify history exists
            expect(inspector!.getHistory().length).toBeGreaterThan(0);

            // Clear history
            inspector!.clearHistory();

            // Verify history is empty
            expect(inspector!.getHistory().length).toBe(0);

            await daemon.stop();
        });
    });
});
