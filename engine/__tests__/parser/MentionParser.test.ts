import { MentionParser } from '../../src/parser/MentionParser.js';

describe('MentionParser', () => {
    let parser: MentionParser;

    beforeEach(() => {
        parser = new MentionParser();
    });

    describe('Agent Mentions', () => {
        it('should parse single agent mention', () => {
            const content = '@betty review this';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'agent',
                value: 'betty',
                raw: '@betty',
                position: 0,
            });
        });

        it('should parse multiple agent mentions', () => {
            const content = '@betty and @charlie collaborate';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(2);
            expect(mentions[0]!.value).toBe('betty');
            expect(mentions[1]!.value).toBe('charlie');
        });

        it('should distinguish agent from file mentions', () => {
            const content = '@betty review @report.md';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(2);
            expect(mentions[0]).toMatchObject({
                type: 'agent',
                value: 'betty',
            });
            expect(mentions[1]).toMatchObject({
                type: 'file',
                value: 'report.md',
            });
        });

        it('should handle agent names with hyphens (parser treats as agent)', () => {
            const content = '@betty-bot assist';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'agent', // Parser classifies as agent, ContextLoader will resolve
                value: 'betty-bot',
            });
        });

        it('should handle agent names with underscores', () => {
            const content = '@betty_v2 assist';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'agent',
                value: 'betty_v2',
            });
        });
    });

    describe('File Mentions', () => {
        it('should parse .md file mention', () => {
            const content = 'Review @report.md please';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'file',
                value: 'report.md',
                raw: '@report.md',
            });
        });

        it('should parse file with path', () => {
            const content = 'Check @finance/Q4/report.md';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'file',
                value: 'finance/Q4/report.md',
            });
        });

        it('should parse multiple file extensions', () => {
            const extensions = ['md', 'txt', 'pdf', 'docx', 'xlsx'];

            for (const ext of extensions) {
                const content = `@file.${ext}`;
                const mentions = parser.parse(content);

                expect(mentions).toHaveLength(1);
                expect(mentions[0]).toMatchObject({
                    type: 'file',
                    value: `file.${ext}`,
                });
            }
        });

        it('should handle files with spaces (quoted)', () => {
            const content = '@"monthly report.md"';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'file',
                value: 'monthly report.md',
            });
        });
    });

    describe('Folder Mentions', () => {
        it('should parse folder mention with trailing slash', () => {
            const content = 'Review @finance/';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'folder',
                value: 'finance/',
                raw: '@finance/',
            });
        });

        it('should parse nested folder paths', () => {
            const content = '@projects/2024/Q4/';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'folder',
                value: 'projects/2024/Q4/',
            });
        });

        it('should prioritize folder over file when slash present', () => {
            const content = '@folder/';
            const mentions = parser.parse(content);

            expect(mentions[0]!.type).toBe('folder');
        });
    });

    describe('Command Mentions', () => {
        it('should parse slash command', () => {
            const content = '/summarize this document';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'command',
                value: 'summarize',
                raw: '/summarize',
            });
        });

        it('should parse command with hyphens', () => {
            const content = '/create-summary now';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'command',
                value: 'create-summary',
            });
        });

        it('should handle command at start of line', () => {
            const content = '/help';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]!.position).toBe(0);
        });
    });

    describe('Service Mentions', () => {
        it('should parse service mention', () => {
            const content = 'Connect to $quickbooks';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'service',
                value: 'quickbooks',
                raw: '$quickbooks',
            });
        });

        it('should parse service with hyphens', () => {
            const content = '$google-calendar';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'service',
                value: 'google-calendar',
            });
        });
    });

    describe('Complex Mention Chains', () => {
        it('should parse multiple mention types', () => {
            const content = '@betty review @finance/ using $quickbooks';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(3);
            expect(mentions[0]!.type).toBe('agent');
            expect(mentions[1]!.type).toBe('folder');
            expect(mentions[2]!.type).toBe('service');
        });

        it('should parse command with mentions', () => {
            const content = '/summarize @report.md for @betty';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(3);
            expect(mentions[0]!.type).toBe('command');
            expect(mentions[1]!.type).toBe('file');
            expect(mentions[2]!.type).toBe('agent');
        });

        it('should maintain correct positions', () => {
            const content = 'Hey @betty check @file.md';
            const mentions = parser.parse(content);

            expect(mentions[0]!.position).toBe(4); // @betty starts at position 4
            expect(mentions[1]!.position).toBe(17); // @file.md starts at position 17
        });

        it('should parse realistic command example', () => {
            const content = '@betty /analyze @finance/Q4/ using $quickbooks and generate report';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(4);
            expect(mentions.map(m => m.type)).toEqual([
                'agent',
                'command',
                'folder',
                'service',
            ]);
        });
    });

    describe('Edge Cases', () => {
        it('should return empty array for no mentions', () => {
            const content = 'Just plain text here';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(0);
        });

        it('should handle empty string', () => {
            const content = '';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(0);
        });

        it('should ignore @ in middle of word', () => {
            const content = 'email@example.com';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(0);
        });

        it('should handle mentions in markdown links', () => {
            const content = '[link](@file.md)';
            const mentions = parser.parse(content);

            // Should still detect the mention
            expect(mentions).toHaveLength(1);
            expect(mentions[0]!.type).toBe('file');
        });

        it('should handle mentions in code blocks', () => {
            const content = '```\n@betty\n```';
            const mentions = parser.parse(content);

            // Parser doesn't skip code blocks (that's CommandDetector's job)
            // It just extracts syntax
            expect(mentions).toHaveLength(1);
        });

        it('should handle special characters after mentions', () => {
            const content = '@betty, @charlie! @david?';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(3);
            expect(mentions.map(m => m.value)).toEqual(['betty', 'charlie', 'david']);
        });

        it('should handle newlines between mentions', () => {
            const content = '@betty\n@charlie\n@david';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(3);
        });

        it('should preserve original text for raw field', () => {
            const content = '@betty review @finance/Q4/';
            const mentions = parser.parse(content);

            expect(mentions[0]!.raw).toBe('@betty');
            expect(mentions[1]!.raw).toBe('@finance/Q4/');
        });
    });

    describe('Priority Rules', () => {
        it('should prioritize folder over file when both match', () => {
            // This tests that @path/ is recognized as folder before @path is checked as file
            const content = '@docs/';
            const mentions = parser.parse(content);

            expect(mentions[0]!.type).toBe('folder');
        });

        it('should prioritize command over all other types', () => {
            const content = '/command-name';
            const mentions = parser.parse(content);

            expect(mentions[0]!.type).toBe('command');
        });

        it('should prioritize service over agent', () => {
            const content = '$service-name';
            const mentions = parser.parse(content);

            expect(mentions[0]!.type).toBe('service');
        });
    });

    describe('Ambiguous Mention Resolution', () => {
        it('should parse bare names as agent type (resolution happens in ContextLoader)', () => {
            // Parser classifies all bare @name as 'agent' - ContextLoader resolves actual type
            const content = '@review-q4-finances needs attention';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'agent', // Parser doesn't know if it's agent or file
                value: 'review-q4-finances',
                raw: '@review-q4-finances',
            });
        });

        it('should handle hyphenated names as agent type for parser', () => {
            const content = '@code-assistant help me';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'agent', // Parser classifies as agent, ContextLoader resolves
                value: 'code-assistant',
                raw: '@code-assistant',
            });
        });

        it('should parse simple names as agents', () => {
            const content = '@betty and @quinn collaborate';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(2);
            expect(mentions[0]!.type).toBe('agent');
            expect(mentions[1]!.type).toBe('agent');
        });

        it('should parse all bare mentions as agent type', () => {
            const content = '@betty review @meeting-notes-2024-10-24 and @draft-proposal';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(3);
            // All are parsed as 'agent' type - ContextLoader will resolve based on existence
            expect(mentions[0]).toMatchObject({
                type: 'agent',
                value: 'betty',
            });
            expect(mentions[1]).toMatchObject({
                type: 'agent',
                value: 'meeting-notes-2024-10-24',
            });
            expect(mentions[2]).toMatchObject({
                type: 'agent',
                value: 'draft-proposal',
            });
        });

        it('should prioritize explicit extension (makes it unambiguously a file)', () => {
            const content = '@my-file.md';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'file', // Extension makes it clearly a file
                value: 'my-file.md',
            });
        });

        it('should handle explicit folder syntax', () => {
            const content = '@tasks/';
            const mentions = parser.parse(content);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toMatchObject({
                type: 'folder', // Trailing slash makes it clearly a folder
                value: 'tasks/',
            });
        });
    });
});

