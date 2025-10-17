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
});

