import { FrontmatterParser } from '../../src/parser/FrontmatterParser.js';

describe('FrontmatterParser', () => {
    let parser: FrontmatterParser;

    beforeEach(() => {
        parser = new FrontmatterParser();
    });

    describe('Basic Parsing', () => {
        it('should parse YAML frontmatter', () => {
            const content = `---
title: Test Document
status: pending
---

Content here`;

            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter).toEqual({
                title: 'Test Document',
                status: 'pending',
            });
        });

        it('should return empty object for no frontmatter', () => {
            const content = 'Just content, no frontmatter';
            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter).toEqual({});
        });

        it('should handle empty frontmatter', () => {
            const content = `---
---

Content here`;

            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter).toEqual({});
        });
    });

    describe('Complex Frontmatter', () => {
        it('should parse nested objects', () => {
            const content = `---
metadata:
  author: John Doe
  date: 2024-01-15
tags: [project, important]
---

Content`;

            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter).toEqual({
                metadata: {
                    author: 'John Doe',
                    date: '2024-01-15',
                },
                tags: ['project', 'important'],
            });
        });

        it('should parse arrays', () => {
            const content = `---
tags:
  - project
  - important
  - urgent
---

Content`;

            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter.tags).toEqual(['project', 'important', 'urgent']);
        });

        it('should parse numbers', () => {
            const content = `---
priority: 1
score: 9.5
---

Content`;

            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter.priority).toBe(1);
            expect(frontmatter.score).toBe(9.5);
        });

        it('should parse booleans', () => {
            const content = `---
published: true
draft: false
---

Content`;

            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter.published).toBe(true);
            expect(frontmatter.draft).toBe(false);
        });
    });

    describe('Change Detection', () => {
        it('should detect field change', () => {
            const filePath = 'test.md';
            const content1 = `---
status: pending
---
Content`;

            const content2 = `---
status: done
---
Content`;

            parser.detectChanges(filePath, content1);
            const changes = parser.detectChanges(filePath, content2);

            expect(changes).toHaveLength(1);
            expect(changes[0]).toMatchObject({
                field: 'status',
                oldValue: 'pending',
                newValue: 'done',
            });
        });

        it('should detect added field', () => {
            const filePath = 'test.md';
            const content1 = `---
title: Test
---
Content`;

            const content2 = `---
title: Test
status: new
---
Content`;

            parser.detectChanges(filePath, content1);
            const changes = parser.detectChanges(filePath, content2);

            expect(changes).toHaveLength(1);
            expect(changes[0]).toMatchObject({
                field: 'status',
                oldValue: undefined,
                newValue: 'new',
            });
        });

        it('should detect removed field', () => {
            const filePath = 'test.md';
            const content1 = `---
title: Test
status: done
---
Content`;

            const content2 = `---
title: Test
---
Content`;

            parser.detectChanges(filePath, content1);
            const changes = parser.detectChanges(filePath, content2);

            expect(changes).toHaveLength(1);
            expect(changes[0]).toMatchObject({
                field: 'status',
                oldValue: 'done',
                newValue: undefined,
            });
        });

        it('should detect multiple changes', () => {
            const filePath = 'test.md';
            const content1 = `---
status: pending
priority: 1
---
Content`;

            const content2 = `---
status: done
priority: 5
---
Content`;

            parser.detectChanges(filePath, content1);
            const changes = parser.detectChanges(filePath, content2);

            expect(changes).toHaveLength(2);
            expect(changes.map(c => c.field)).toContain('status');
            expect(changes.map(c => c.field)).toContain('priority');
        });

        it('should not detect changes when fields unchanged', () => {
            const filePath = 'test.md';
            const content1 = `---
status: pending
---
Content v1`;

            const content2 = `---
status: pending
---
Content v2`;

            parser.detectChanges(filePath, content1);
            const changes = parser.detectChanges(filePath, content2);

            expect(changes).toHaveLength(0);
        });

        it('should handle first parse (no previous value)', () => {
            const filePath = 'test.md';
            const content = `---
status: pending
---
Content`;

            const changes = parser.detectChanges(filePath, content);

            // No changes on first parse since there's no previous state
            expect(changes).toHaveLength(0);
        });
    });

    describe('Cache Management', () => {
        it('should maintain separate cache per file', () => {
            const content1 = `---
status: pending
---
Content`;

            const content2 = `---
status: done
---
Content`;

            parser.detectChanges('file1.md', content1);
            parser.detectChanges('file2.md', content2);

            // Update file1
            const updatedContent1 = `---
status: in-progress
---
Content`;

            const changes = parser.detectChanges('file1.md', updatedContent1);

            expect(changes).toHaveLength(1);
            expect(changes[0]).toMatchObject({
                field: 'status',
                oldValue: 'pending',
                newValue: 'in-progress',
            });
        });

        it('should clear cache for specific file', () => {
            const filePath = 'test.md';
            const content = `---
status: pending
---
Content`;

            parser.detectChanges(filePath, content);
            parser.clearCache(filePath);

            // After clearing, next parse should act like first parse
            const changes = parser.detectChanges(filePath, content);

            expect(changes).toHaveLength(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle malformed YAML gracefully', () => {
            const content = `---
invalid yaml: [unclosed
---
Content`;

            expect(() => {
                parser.extractFrontmatter(content);
            }).not.toThrow();
        });

        it('should handle empty file', () => {
            const content = '';
            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter).toEqual({});
        });

        it('should handle file with only frontmatter', () => {
            const content = `---
title: Only Frontmatter
---`;

            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter).toEqual({
                title: 'Only Frontmatter',
            });
        });

        it('should handle content with --- but not as frontmatter', () => {
            const content = `Some content
---
Not frontmatter
---
More content`;

            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter).toEqual({});
        });

        it('should handle special characters in values', () => {
            const content = `---
title: "Test: With Colon"
description: "Line 1\\nLine 2"
---
Content`;

            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter.title).toBe('Test: With Colon');
            expect(frontmatter.description).toBe('Line 1\nLine 2');
        });
    });

    describe('Realistic Examples', () => {
        it('should parse Obsidian-style frontmatter', () => {
            const content = `---
aliases: [report, financial-report]
tags: [finance, Q4, 2024]
created: 2024-01-15
modified: 2024-01-20
status: in-review
---

# Financial Report Q4 2024

Content here...`;

            const frontmatter = parser.extractFrontmatter(content);

            expect(frontmatter).toMatchObject({
                aliases: ['report', 'financial-report'],
                tags: ['finance', 'Q4', 2024], // YAML parses 2024 as number
                status: 'in-review',
            });
        });

        it('should detect status changes for triggers', () => {
            const filePath = 'task.md';

            // Initial state
            const initial = `---
status: todo
assignee: john
---
Task content`;

            parser.detectChanges(filePath, initial);

            // Status changed to done
            const updated = `---
status: done
assignee: john
completed_at: 2024-01-15
---
Task content`;

            const changes = parser.detectChanges(filePath, updated);

            // Should detect status change and completed_at addition
            expect(changes.length).toBeGreaterThan(0);
            expect(changes.find(c => c.field === 'status')).toMatchObject({
                field: 'status',
                oldValue: 'todo',
                newValue: 'done',
            });
        });
    });
});
