import { jest } from '@jest/globals';
import { SparkEngine } from '../src/main.js';
import { TestVault } from './utils/TestVault.js';
import { Logger } from '../src/logger/Logger.js';

// Mock Anthropic SDK to prevent actual API calls
jest.mock('@anthropic-ai/sdk');

// Mock the Claude Agent SDK (used by ClaudeAgentProvider registered by SparkEngine)
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
    query: jest.fn(),
}));

describe('SparkEngine', () => {
    let vault: TestVault;
    let engine: SparkEngine;
    let originalApiKey: string | undefined;

    beforeEach(async () => {
        // Reset logger singleton
        Logger.resetInstance();

        // Set test API key
        originalApiKey = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'test-api-key-for-tests';

        vault = new TestVault();
        await vault.create();

        // Create basic config with minimal debounce for fast tests
        await vault.writeConfig(`
version: "1.0"
engine:
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

        engine = new SparkEngine(vault.root);
    });

    afterEach(async () => {
        try {
            if (engine.isRunning()) {
                await engine.stop();
            }
        } catch (_error) {
            // Ignore cleanup errors
        }
        await vault.cleanup();

        // Restore original API key
        if (originalApiKey !== undefined) {
            process.env.ANTHROPIC_API_KEY = originalApiKey;
        } else {
            delete process.env.ANTHROPIC_API_KEY;
        }
    });

    describe('constructor', () => {
        it('should create engine instance', () => {
            expect(engine).toBeInstanceOf(SparkEngine);
        });

        it('should initialize in stopped state', () => {
            expect(engine.isRunning()).toBe(false);
        });
    });

    describe('lifecycle', () => {
        it('should start and stop engine', async () => {
            await engine.start();
            expect(engine.isRunning()).toBe(true);

            await engine.stop();
            expect(engine.isRunning()).toBe(false);
        });

        it('should throw error if starting when already running', async () => {
            await engine.start();
            await expect(engine.start()).rejects.toThrow('already running');
            await engine.stop();
        });

        it('should handle stop when not running', async () => {
            await expect(engine.stop()).resolves.not.toThrow();
            expect(engine.isRunning()).toBe(false);
        });
    });

    describe('isRunning', () => {
        it('should return false initially', () => {
            expect(engine.isRunning()).toBe(false);
        });

        it('should return correct state after start/stop', async () => {
            expect(engine.isRunning()).toBe(false);

            await engine.start();
            expect(engine.isRunning()).toBe(true);

            await engine.stop();
            expect(engine.isRunning()).toBe(false);
        });
    });

    describe('configuration', () => {
        it('should handle missing config file with defaults', async () => {
            const vault2 = new TestVault();
            await vault2.create();

            const engine2 = new SparkEngine(vault2.root);

            await engine2.start();
            expect(engine2.isRunning()).toBe(true);

            await engine2.stop();
            await vault2.cleanup();
        });
    });

    describe('getters', () => {
        it('should return vault path', () => {
            expect(engine.getVaultPath()).toBe(vault.root);
        });

        it('should return null config before starting', () => {
            expect(engine.getConfig()).toBeNull();
        });

        it('should return config after starting', async () => {
            await engine.start();
            const config = engine.getConfig();
            expect(config).not.toBeNull();
            expect(config?.engine?.watch.patterns).toContain('**/*.md');
            await engine.stop();
        });

        it('should return engine state', async () => {
            expect(engine.getState()).toBe('stopped');
            await engine.start();
            expect(engine.getState()).toBe('running');
            await engine.stop();
            expect(engine.getState()).toBe('stopped');
        });

        it('should return null watcher before starting', () => {
            expect(engine.getWatcher()).toBeNull();
        });

        it('should return watcher after starting', async () => {
            await engine.start();
            expect(engine.getWatcher()).not.toBeNull();
            await engine.stop();
        });

        it('should return file parser immediately (initialized in constructor)', () => {
            // fileParser is always available - initialized eagerly
            expect(engine.getFileParser()).not.toBeNull();
        });
    });

    describe('file change handling', () => {
        it('should handle file addition', async () => {
            await engine.start();

            // Create a new file
            await vault.writeFile('new-file.md', '# New File\nSome content');

            // Wait for file to be processed (minimal wait with 10ms debounce)
            await new Promise(resolve => setTimeout(resolve, 50));

            await engine.stop();
        });

        it('should handle file modification', async () => {
            // Create initial file
            await vault.writeFile('test.md', '# Test\nInitial content');

            await engine.start();

            // Modify the file
            await vault.writeFile('test.md', '# Test\nModified content');

            // Wait for file to be processed
            await new Promise(resolve => setTimeout(resolve, 50));

            await engine.stop();
        });

        it('should handle file deletion', async () => {
            // Create initial file
            await vault.writeFile('to-delete.md', '# Will be deleted');

            await engine.start();

            // Delete the file
            await vault.deleteFile('to-delete.md');

            // Wait for deletion to be processed
            await new Promise(resolve => setTimeout(resolve, 50));

            await engine.stop();
        });

        it('should detect commands in files', async () => {
            await engine.start();

            // Create file with command
            await vault.writeFile('with-command.md', `# Task
@agent Write a summary of this file

Some content here.
`);

            // Wait for file to be processed
            await new Promise(resolve => setTimeout(resolve, 50));

            await engine.stop();
        });

        it('should detect mention chains in files', async () => {
            await engine.start();

            // Create files with mentions
            await vault.writeFile('note1.md', '# Note 1\nSee [[note2]]');
            await vault.writeFile('note2.md', '# Note 2\nRefers to [[note3]]');
            await vault.writeFile('note3.md', '# Note 3\nContent here');

            // Wait for files to be processed
            await new Promise(resolve => setTimeout(resolve, 100));

            await engine.stop();
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

            await engine.start();

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

            await engine.stop();
        });

        it('should handle files with multiple commands', async () => {
            await engine.start();

            await vault.writeFile('multi-command.md', `# Multiple Commands

@agent Analyze this section
Some content

@sop Run backup procedure
More content

@agent Generate summary
`);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            await engine.stop();
        });

        it('should handle files with no commands', async () => {
            await engine.start();

            await vault.writeFile('plain.md', `# Plain File
Just regular content with no commands or mentions.
`);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            await engine.stop();
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

            const engine2 = new SparkEngine(vault2.root);

            // Should still start with defaults (ConfigLoader handles missing config)
            await engine2.start();
            expect(engine2.isRunning()).toBe(true);

            await engine2.stop();
            await vault2.cleanup();
        });

        it('should handle large files', async () => {
            await engine.start();

            // Create a large file
            const largeContent = '# Large File\n' + 'Line of content\n'.repeat(1000);
            await vault.writeFile('large.md', largeContent);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(engine.isRunning()).toBe(true);

            await engine.stop();
        });

        it('should handle files with special characters', async () => {
            await engine.start();

            await vault.writeFile('special-chars.md', `# Special Characters
Unicode: 你好世界 🎉
Symbols: @#$%^&*()
Quotes: "test" 'test'
`);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(engine.isRunning()).toBe(true);

            await engine.stop();
        });
    });

    describe('integration scenarios', () => {
        it('should handle rapid file changes', async () => {
            await engine.start();

            // Create multiple files quickly
            await vault.writeFile('rapid1.md', '# File 1');
            await vault.writeFile('rapid2.md', '# File 2');
            await vault.writeFile('rapid3.md', '# File 3');

            // Wait for debouncing and processing
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(engine.isRunning()).toBe(true);

            await engine.stop();
        });

        it('should handle concurrent file operations', async () => {
            await engine.start();

            // Perform multiple operations concurrently
            await Promise.all([
                vault.writeFile('concurrent1.md', '# File 1'),
                vault.writeFile('concurrent2.md', '# File 2'),
                vault.writeFile('concurrent3.md', '# File 3'),
            ]);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(engine.isRunning()).toBe(true);

            await engine.stop();
        });

        it('should maintain state through multiple stop/start cycles', async () => {
            // First cycle
            await engine.start();
            expect(engine.isRunning()).toBe(true);
            await engine.stop();
            expect(engine.isRunning()).toBe(false);

            // Second cycle
            await engine.start();
            expect(engine.isRunning()).toBe(true);
            await engine.stop();
            expect(engine.isRunning()).toBe(false);
        });
    });

    describe('inspector integration', () => {
        it('should initialize inspector on start', async () => {
            await engine.start();
            const inspector = engine.getInspector();

            expect(inspector).not.toBeNull();
            expect(engine.isRunning()).toBe(true);

            await engine.stop();
        });
    });
});
