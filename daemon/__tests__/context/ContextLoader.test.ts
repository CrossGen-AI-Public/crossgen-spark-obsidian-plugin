import { ContextLoader } from '../../src/context/ContextLoader.js';
import { TestVault } from '../utils/TestVault.js';
import type { ParsedMention } from '../../src/types/parser.js';

describe('ContextLoader', () => {
    let vault: TestVault;
    let loader: ContextLoader;

    beforeEach(async () => {
        vault = new TestVault();
        await vault.create();
        loader = new ContextLoader(vault.root);

        // Create test file structure
        await vault.writeFile('.spark/agents/betty.md', '# Betty Agent');
        await vault.writeFile('notes/meeting.md', '# Meeting Notes');
        await vault.writeFile('notes/todo.md', '# TODO');
        await vault.writeFile('projects/alpha/overview.md', '# Project Alpha');
    });

    afterEach(async () => {
        await vault.cleanup();
    });

    describe('constructor', () => {
        it('should create instance with vault path', () => {
            expect(loader).toBeInstanceOf(ContextLoader);
        });
    });

    describe('load', () => {
        it('should load context with current file', async () => {
            const mentions: ParsedMention[] = [];

            const context = await loader.load(vault.getAbsolutePath('notes/meeting.md'), mentions);

            expect(context.currentFile).toBeDefined();
            expect(context.currentFile.path).toContain('meeting.md');
            expect(context.currentFile.content).toContain('Meeting Notes');
        });

        it('should load context for agent mention', async () => {
            const mentions: ParsedMention[] = [
                { type: 'agent', raw: '@betty', value: 'betty', position: 0 },
            ];

            const context = await loader.load(vault.getAbsolutePath('notes/meeting.md'), mentions);

            expect(context.agent).toBeDefined();
            expect(context.agent!.path).toContain('betty.md');
        });

        it('should load context for file mention', async () => {
            const mentions: ParsedMention[] = [
                { type: 'file', raw: '@meeting.md', value: 'meeting.md', position: 0 },
            ];

            const context = await loader.load(vault.getAbsolutePath('notes/todo.md'), mentions);

            expect(context.mentionedFiles.length).toBeGreaterThan(0);
        });

        it('should include nearby files', async () => {
            const mentions: ParsedMention[] = [];

            const context = await loader.load(vault.getAbsolutePath('notes/meeting.md'), mentions);

            expect(context.nearbyFiles).toBeDefined();
            expect(Array.isArray(context.nearbyFiles)).toBe(true);
        });

        it('should handle no mentions', async () => {
            const mentions: ParsedMention[] = [];

            const context = await loader.load(vault.getAbsolutePath('notes/meeting.md'), mentions);

            expect(context.currentFile.path).toContain('meeting.md');
            expect(context.agent).toBeUndefined();
        });

        it('should return service connections array', async () => {
            const mentions: ParsedMention[] = [];

            const context = await loader.load(vault.getAbsolutePath('notes/meeting.md'), mentions);

            expect(context.serviceConnections).toBeDefined();
            expect(Array.isArray(context.serviceConnections)).toBe(true);
        });
    });
});
