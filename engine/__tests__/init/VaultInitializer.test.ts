/**
 * Tests for VaultInitializer
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { VaultInitializer } from '../../src/init/VaultInitializer.js';
import { TestVault } from '../utils/TestVault.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('VaultInitializer', () => {
    let vault: TestVault;
    let vaultPath: string;

    beforeEach(async () => {
        vault = new TestVault();
        await vault.create();
        vaultPath = vault.path;
    });

    afterEach(async () => {
        await vault.cleanup();
    });

    describe('initialize', () => {
        it('should create .spark directory', async () => {
            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const sparkDir = join(vaultPath, '.spark');
            expect(existsSync(sparkDir)).toBe(true);
        });

        it('should create all necessary subdirectories', async () => {
            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const sparkDir = join(vaultPath, '.spark');
            const expectedDirs = [
                'agents',
                'commands',
                'conversations',
                'chat-queue',
                'chat-results',
                'logs',
                'triggers',
            ];

            for (const dir of expectedDirs) {
                const dirPath = join(sparkDir, dir);
                expect(existsSync(dirPath)).toBe(true);
            }
        });

        it('should create default config.yaml if missing', async () => {
            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const configPath = join(vaultPath, '.spark', 'config.yaml');
            expect(existsSync(configPath)).toBe(true);

            const content = readFileSync(configPath, 'utf-8');
            expect(content).toContain('version: 1');
            expect(content).toContain('defaultProvider: claude-agent');
            expect(content).toContain('claude-sonnet-4-5-20250929');
        });

        it('should not overwrite existing config.yaml', async () => {
            // Create custom config first
            await vault.writeFile('.spark/config.yaml', 'custom: config');

            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const configPath = join(vaultPath, '.spark', 'config.yaml');
            const content = readFileSync(configPath, 'utf-8');
            expect(content).toBe('custom: config');
        });

        it('should create default agents', async () => {
            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const agentsDir = join(vaultPath, '.spark', 'agents');
            const expectedAgents = ['betty.md', 'alice.md', 'bob.md'];

            for (const agent of expectedAgents) {
                const agentPath = join(agentsDir, agent);
                expect(existsSync(agentPath)).toBe(true);

                const content = readFileSync(agentPath, 'utf-8');
                expect(content).toContain('---'); // Has frontmatter
                expect(content).toContain('name:'); // Has name field
            }
        });

        it('should not overwrite existing agents', async () => {
            // Create custom agent first
            await vault.writeFile('.spark/agents/betty.md', 'custom betty');

            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const bettyPath = join(vaultPath, '.spark', 'agents', 'betty.md');
            const content = readFileSync(bettyPath, 'utf-8');
            expect(content).toBe('custom betty');

            // Other agents should still be created
            const alicePath = join(vaultPath, '.spark', 'agents', 'alice.md');
            expect(existsSync(alicePath)).toBe(true);
        });

        it('should create default commands', async () => {
            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const commandsDir = join(vaultPath, '.spark', 'commands');
            const expectedCommands = ['summarize.md', 'review.md'];

            for (const command of expectedCommands) {
                const commandPath = join(commandsDir, command);
                expect(existsSync(commandPath)).toBe(true);

                const content = readFileSync(commandPath, 'utf-8');
                expect(content).toContain('---'); // Has frontmatter
                expect(content).toContain('id:'); // Has id field
            }
        });

        it('should not overwrite existing commands', async () => {
            // Create custom command first
            await vault.writeFile('.spark/commands/summarize.md', 'custom summarize');

            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const summarizePath = join(vaultPath, '.spark', 'commands', 'summarize.md');
            const content = readFileSync(summarizePath, 'utf-8');
            expect(content).toBe('custom summarize');

            // Other commands should still be created
            const reviewPath = join(vaultPath, '.spark', 'commands', 'review.md');
            expect(existsSync(reviewPath)).toBe(true);
        });

        it('should be idempotent (safe to run multiple times)', async () => {
            const initializer = new VaultInitializer(vaultPath);

            // Run twice
            await initializer.initialize();
            await initializer.initialize();

            // Everything should still exist and be valid
            const sparkDir = join(vaultPath, '.spark');
            expect(existsSync(sparkDir)).toBe(true);

            const configPath = join(sparkDir, 'config.yaml');
            expect(existsSync(configPath)).toBe(true);

            const bettyPath = join(sparkDir, 'agents', 'betty.md');
            expect(existsSync(bettyPath)).toBe(true);
        });

        it('should create complete betty agent with correct content', async () => {
            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const bettyPath = join(vaultPath, '.spark', 'agents', 'betty.md');
            const content = readFileSync(bettyPath, 'utf-8');

            expect(content).toContain('name: Betty');
            expect(content).toContain('role: Senior Accountant & Financial Analyst');
            expect(content).toContain('Financial reporting');
            expect(content).toContain('QuickBooks integration');
            expect(content).toContain('model: claude-sonnet-4-5-20250929');
        });

        it('should create complete alice agent with correct content', async () => {
            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const alicePath = join(vaultPath, '.spark', 'agents', 'alice.md');
            const content = readFileSync(alicePath, 'utf-8');

            expect(content).toContain('name: Alice');
            expect(content).toContain('role: Content Editor & Writing Coach');
            expect(content).toContain('Content editing');
            expect(content).toContain('model: claude-sonnet-4-5-20250929');
        });

        it('should create complete bob agent with correct content', async () => {
            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const bobPath = join(vaultPath, '.spark', 'agents', 'bob.md');
            const content = readFileSync(bobPath, 'utf-8');

            expect(content).toContain('name: Bob');
            expect(content).toContain('role: System Debugger & Context Validator');
            expect(content).toContain('Context analysis and validation');
            expect(content).toContain('model: claude-sonnet-4-5-20250929');
            expect(content).toContain('peak vibe-coding');
        });

        it('should create summarize command with correct content', async () => {
            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const summarizePath = join(vaultPath, '.spark', 'commands', 'summarize.md');
            const content = readFileSync(summarizePath, 'utf-8');

            expect(content).toContain('id: summarize');
            expect(content).toContain('name: Summarize Document');
            expect(content).toContain('context: current_file');
            expect(content).toContain('output: inline');
        });

        it('should create review command with correct content', async () => {
            const initializer = new VaultInitializer(vaultPath);
            await initializer.initialize();

            const reviewPath = join(vaultPath, '.spark', 'commands', 'review.md');
            const content = readFileSync(reviewPath, 'utf-8');

            expect(content).toContain('id: review');
            expect(content).toContain('name: Review Document');
            expect(content).toContain('Content clarity and structure');
            expect(content).toContain('Be specific and actionable');
        });
    });

    describe('setLogger', () => {
        it('should accept logger without error', async () => {
            const initializer = new VaultInitializer(vaultPath);
            const mockLogger = {
                debug: () => { },
                info: () => { },
                warn: () => { },
                error: () => { },
            };

            expect(() => {
                initializer.setLogger(mockLogger as never);
            }).not.toThrow();
        });
    });
});

