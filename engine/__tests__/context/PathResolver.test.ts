import { PathResolver } from '../../src/context/PathResolver.js';
import { TestVault } from '../utils/TestVault.js';

describe('PathResolver', () => {
    let vault: TestVault;
    let resolver: PathResolver;

    beforeEach(async () => {
        vault = new TestVault();
        await vault.create();
        resolver = new PathResolver(vault.root);

        // Create test file structure
        await vault.writeFile('notes/meeting.md', '# Meeting Notes');
        await vault.writeFile('notes/todo.md', '# TODO');
        await vault.writeFile('projects/alpha/overview.md', '# Project Alpha');
        await vault.writeFile('projects/alpha/tasks.md', '# Tasks');
        await vault.writeFile('projects/beta/overview.md', '# Project Beta');
        await vault.writeFile('.spark/agents/betty.md', '# Betty Agent');
        await vault.writeFile('.spark/agents/analyst.md', '# Analyst Agent');
    });

    afterEach(async () => {
        await vault.cleanup();
    });

    describe('resolveAgent', () => {
        it('should resolve agent name to agent file', async () => {
            const result = await resolver.resolveAgent('betty');

            expect(result).not.toBeNull();
            expect(result).toContain('.spark/agents/betty.md');
        });

        it('should return null for non-existent agent', async () => {
            const result = await resolver.resolveAgent('unknown');

            expect(result).toBeNull();
        });

        it('should resolve agent regardless of case (macOS)', async () => {
            // Skip on Linux (case-sensitive file system)
            if (process.platform !== 'darwin') {
                return;
            }

            const result = await resolver.resolveAgent('Betty');

            // On macOS, file system is case-insensitive
            expect(result).not.toBeNull();
            expect(result).toContain('.spark/agents/');
        });

        it('should handle analyst agent', async () => {
            const result = await resolver.resolveAgent('analyst');

            expect(result).not.toBeNull();
            expect(result).toContain('.spark/agents/analyst.md');
        });
    });

    describe('resolveFile', () => {
        it('should resolve exact file path', async () => {
            const result = await resolver.resolveFile('notes/meeting.md');

            expect(result).not.toBeNull();
            expect(result).toContain('notes/meeting.md');
        });

        it('should resolve file by basename when not in root', async () => {
            const result = await resolver.resolveFile('meeting.md');

            expect(result).not.toBeNull();
            expect(result).toContain('notes/meeting.md');
        });

        it('should return null for non-existent file', async () => {
            const result = await resolver.resolveFile('nonexistent.md');

            expect(result).toBeNull();
        });

        it('should handle nested file paths', async () => {
            const result = await resolver.resolveFile('projects/alpha/tasks.md');

            expect(result).not.toBeNull();
            expect(result).toContain('projects/alpha/tasks.md');
        });

        it('should prioritize exact path over search', async () => {
            await vault.writeFile('overview.md', '# Root Overview');

            const result = await resolver.resolveFile('overview.md');

            expect(result).not.toBeNull();
            expect(result).toContain('overview.md');
            expect(result).not.toContain('projects');
        });
    });

    describe('resolveFolder', () => {
        it('should resolve folder path', async () => {
            const result = await resolver.resolveFolder('notes');

            expect(result).not.toBeNull();
            expect(result).toContain('notes');
        });

        it('should resolve nested folder', async () => {
            const result = await resolver.resolveFolder('projects/alpha');

            expect(result).not.toBeNull();
            expect(result).toContain('projects/alpha');
        });

        it('should return null for non-existent folder', async () => {
            const result = await resolver.resolveFolder('nonexistent');

            expect(result).toBeNull();
        });

        it('should handle folder path with trailing slash', async () => {
            const result = await resolver.resolveFolder('notes/');

            expect(result).not.toBeNull();
            expect(result).toContain('notes');
        });
    });

    describe('resolveCommand', () => {
        it('should resolve command name to command file', async () => {
            await vault.writeFile('.spark/commands/summarize.md', '# Summarize');

            const result = await resolver.resolveCommand('summarize');

            expect(result).not.toBeNull();
            expect(result).toContain('.spark/commands/summarize.md');
        });

        it('should return null for non-existent command', async () => {
            const result = await resolver.resolveCommand('unknown');

            expect(result).toBeNull();
        });

        it('should handle command names with hyphens', async () => {
            await vault.writeFile('.spark/commands/email-draft.md', '# Email Draft');

            const result = await resolver.resolveCommand('email-draft');

            expect(result).not.toBeNull();
            expect(result).toContain('.spark/commands/email-draft.md');
        });
    });

    describe('resolveService', () => {
        it('should resolve service name to integration folder', async () => {
            await vault.writeFile('.spark/integrations/gmail/config.yaml', 'service: gmail');

            const result = await resolver.resolveService('gmail');

            expect(result).not.toBeNull();
            expect(result).toContain('.spark/integrations/gmail');
        });

        it('should return null for non-existent service', async () => {
            const result = await resolver.resolveService('unknown');

            expect(result).toBeNull();
        });

        it('should handle service names with hyphens', async () => {
            await vault.writeFile('.spark/integrations/google-drive/config.yaml', 'service: google-drive');

            const result = await resolver.resolveService('google-drive');

            expect(result).not.toBeNull();
            expect(result).toContain('.spark/integrations/google-drive');
        });
    });

    describe('edge cases', () => {
        it('should handle paths with dots', async () => {
            await vault.writeFile('.config/settings.md', '# Settings');

            const result = await resolver.resolveFile('.config/settings.md');

            expect(result).not.toBeNull();
            expect(result).toContain('.config/settings.md');
        });

        it('should handle paths with spaces', async () => {
            await vault.writeFile('my notes/meeting notes.md', '# Meeting');

            const result = await resolver.resolveFile('my notes/meeting notes.md');

            expect(result).not.toBeNull();
            expect(result).toContain('my notes/meeting notes.md');
        });

        it('should handle deeply nested paths', async () => {
            await vault.writeFile('a/b/c/d/deep.md', '# Deep');

            const result = await resolver.resolveFile('a/b/c/d/deep.md');

            expect(result).not.toBeNull();
            expect(result).toContain('a/b/c/d/deep.md');
        });

        it('should return absolute paths', async () => {
            const result = await resolver.resolveFile('notes/meeting.md');

            expect(result).not.toBeNull();
            expect(result).toContain(vault.root);
        });
    });
});
