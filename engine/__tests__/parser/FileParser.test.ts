import { FileParser } from '../../src/parser/FileParser.js';

describe('FileParser', () => {
    let parser: FileParser;

    beforeEach(() => {
        parser = new FileParser();
    });

    describe('parseFile', () => {
        it('should parse a file with commands', () => {
            const content = `
# My Document

/summarize this document

Some content here.
`;
            const filePath = '/vault/test.md';

            const result = parser.parseFile(filePath, content);

            expect(result.commands).toHaveLength(1);
            expect(result.commands[0]!.command).toBe('summarize');
            expect(result.commands[0]!.status).toBe('pending');
        });

        it('should parse a file with frontmatter', () => {
            const content = `---
title: Test Document
tags: [test, sample]
---

# Content
`;
            const filePath = '/vault/test.md';

            const result = parser.parseFile(filePath, content);

            expect(result.frontmatter.title).toBe('Test Document');
            expect(result.frontmatter.tags).toEqual(['test', 'sample']);
        });

        it('should parse a file with both commands and frontmatter', () => {
            const content = `---
status: draft
---

/review @document.md
`;
            const filePath = '/vault/test.md';

            const result = parser.parseFile(filePath, content);

            expect(result.frontmatter.status).toBe('draft');
            expect(result.commands).toHaveLength(1);
            expect(result.commands[0]!.command).toBe('review');
        });

        it('should return empty arrays for file without commands', () => {
            const content = `# Simple Document\n\nJust some text.`;
            const filePath = '/vault/test.md';

            const result = parser.parseFile(filePath, content);

            expect(result.commands).toHaveLength(0);
            expect(Object.keys(result.frontmatter)).toHaveLength(0);
        });

        it('should handle empty content', () => {
            const content = '';
            const filePath = '/vault/test.md';

            const result = parser.parseFile(filePath, content);

            expect(result.commands).toHaveLength(0);
            expect(Object.keys(result.frontmatter)).toHaveLength(0);
        });
    });

    describe('getFrontmatterParser', () => {
        it('should return the frontmatter parser instance', () => {
            const frontmatterParser = parser.getFrontmatterParser();

            expect(frontmatterParser).toBeDefined();
            expect(typeof frontmatterParser.extractFrontmatter).toBe('function');
            expect(typeof frontmatterParser.detectChanges).toBe('function');
        });
    });

    describe('getInlineChatDetector', () => {
        it('should return the inline chat detector instance', () => {
            const detector = parser.getInlineChatDetector();

            expect(detector).toBeDefined();
            expect(typeof detector.detectInFile).toBe('function');
        });
    });

    describe('hasPendingCommands', () => {
        it('should return true when file has pending commands', () => {
            const content = '/summarize this document';
            const parsedFile = parser.parseFile('/vault/test.md', content);

            expect(parser.hasPendingCommands(parsedFile)).toBe(true);
        });

        it('should return false when file has no commands', () => {
            const content = '# Simple document\n\nNo commands here.';
            const parsedFile = parser.parseFile('/vault/test.md', content);

            expect(parser.hasPendingCommands(parsedFile)).toBe(false);
        });

        it('should return false when all commands are completed', () => {
            const content = '# Document\n\nSome content.';
            const parsedFile = parser.parseFile('/vault/test.md', content);
            // Simulate all commands being completed
            parsedFile.commands.forEach(cmd => cmd.status = 'completed');

            expect(parser.hasPendingCommands(parsedFile)).toBe(false);
        });
    });

    describe('hasPendingInlineChats', () => {
        it('should return true when file has pending inline chats', () => {
            const content = `<!-- spark-inline-chat:pending:test-id:betty:How do I calculate burn rate? -->
Some response here
<!-- /spark-inline-chat -->`;
            const parsedFile = parser.parseFile('/vault/test.md', content);

            expect(parser.hasPendingInlineChats(parsedFile)).toBe(true);
        });

        it('should return false when file has no inline chats', () => {
            const content = '# Simple document\n\nNo inline chats here.';
            const parsedFile = parser.parseFile('/vault/test.md', content);

            expect(parser.hasPendingInlineChats(parsedFile)).toBe(false);
        });

        it('should return false when all inline chats are complete', () => {
            const content = `<!-- spark-inline-chat:complete:test-id:betty:How do I calculate burn rate? -->
Some response here
<!-- /spark-inline-chat -->`;
            const parsedFile = parser.parseFile('/vault/test.md', content);

            expect(parser.hasPendingInlineChats(parsedFile)).toBe(false);
        });
    });
});

