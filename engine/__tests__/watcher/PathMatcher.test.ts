import { PathMatcher } from '../../src/watcher/PathMatcher.js';

describe('PathMatcher', () => {
    let matcher: PathMatcher;

    beforeEach(() => {
        matcher = new PathMatcher();
    });

    describe('matches', () => {
        describe('simple patterns', () => {
            it('should match exact file extension', () => {
                expect(matcher.matches('/vault/test.md', ['**/*.md'])).toBe(true);
                expect(matcher.matches('/vault/test.txt', ['**/*.md'])).toBe(false);
            });

            it('should match files in any directory', () => {
                expect(matcher.matches('/vault/notes/meeting.md', ['**/*.md'])).toBe(true);
                expect(matcher.matches('/vault/projects/alpha/tasks.md', ['**/*.md'])).toBe(true);
                expect(matcher.matches('/vault/deep/nested/path/file.md', ['**/*.md'])).toBe(true);
            });

            it('should match specific directory', () => {
                expect(matcher.matches('/vault/notes/test.md', ['**/notes/*.md'])).toBe(true);
                expect(matcher.matches('/vault/projects/test.md', ['**/notes/*.md'])).toBe(false);
            });

            it('should match any file in directory', () => {
                expect(matcher.matches('/vault/notes/meeting.md', ['**/notes/*'])).toBe(true);
                expect(matcher.matches('/vault/notes/todo.txt', ['**/notes/*'])).toBe(true);
                expect(matcher.matches('/vault/projects/tasks.md', ['**/notes/*'])).toBe(false);
            });
        });

        describe('complex patterns', () => {
            it('should match nested directory patterns', () => {
                expect(matcher.matches('/vault/projects/alpha/docs/readme.md', ['**/projects/*/docs/*.md'])).toBe(
                    true
                );
                expect(matcher.matches('/vault/projects/beta/docs/overview.md', ['**/projects/*/docs/*.md'])).toBe(
                    true
                );
                expect(matcher.matches('/vault/projects/alpha/tasks.md', ['**/projects/*/docs/*.md'])).toBe(false);
            });

            it('should match multiple levels with **', () => {
                expect(matcher.matches('/vault/a/b/c/d/file.md', ['**/a/**/file.md'])).toBe(true);
                expect(matcher.matches('/vault/a/file.md', ['**/a/**/file.md'])).toBe(true);
                expect(matcher.matches('/vault/x/b/c/file.md', ['**/a/**/file.md'])).toBe(false);
            });

            it('should handle multiple wildcards', () => {
                expect(matcher.matches('/vault/notes/2024-01-15-meeting.md', ['**/notes/*-*-*-*.md'])).toBe(true);
                expect(matcher.matches('/vault/notes/meeting.md', ['**/notes/*-*-*-*.md'])).toBe(false);
            });
        });

        describe('multiple patterns', () => {
            it('should match if any pattern matches', () => {
                const patterns = ['**/*.md', '**/*.txt'];

                expect(matcher.matches('/vault/test.md', patterns)).toBe(true);
                expect(matcher.matches('/vault/test.txt', patterns)).toBe(true);
                expect(matcher.matches('/vault/test.json', patterns)).toBe(false);
            });

            it('should handle mixed patterns', () => {
                const patterns = ['**/notes/*.md', '**/projects/**/*.md', '**/readme.md'];

                expect(matcher.matches('/vault/notes/todo.md', patterns)).toBe(true);
                expect(matcher.matches('/vault/projects/alpha/tasks.md', patterns)).toBe(true);
                expect(matcher.matches('/vault/readme.md', patterns)).toBe(true);
                expect(matcher.matches('/vault/other/file.md', patterns)).toBe(false);
            });
        });

        describe('ignore patterns', () => {
            it('should exclude files matching ignore patterns', () => {
                const includes = ['**/*.md'];
                const ignores = ['**/.git/**', '**/node_modules/**'];

                expect(matcher.matches('/vault/notes/test.md', includes, ignores)).toBe(true);
                expect(matcher.matches('/vault/.git/config.md', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/node_modules/package.md', includes, ignores)).toBe(false);
            });

            it('should prioritize ignore over include', () => {
                const includes = ['**/*.md'];
                const ignores = ['**/drafts/**'];

                expect(matcher.matches('/vault/drafts/todo.md', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/published/todo.md', includes, ignores)).toBe(true);
            });

            it('should handle multiple ignore patterns', () => {
                const includes = ['**/*.md'];
                const ignores = ['**/.git/**', '**/.obsidian/**', '**/node_modules/**', '**/drafts/**'];

                expect(matcher.matches('/vault/.git/HEAD.md', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/.obsidian/workspace.md', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/node_modules/lib.md', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/drafts/wip.md', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/notes/final.md', includes, ignores)).toBe(true);
            });

            it('should handle specific file ignore patterns', () => {
                const includes = ['**/*.md'];
                const ignores = ['**/draft-*.md'];

                expect(matcher.matches('/vault/notes/draft-meeting.md', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/notes/final-meeting.md', includes, ignores)).toBe(true);
            });
        });

        describe('edge cases', () => {
            it('should handle empty pattern array', () => {
                expect(matcher.matches('/vault/test.md', [])).toBe(false);
            });

            it('should handle no ignore patterns', () => {
                expect(matcher.matches('/vault/test.md', ['**/*.md'])).toBe(true);
                expect(matcher.matches('/vault/test.md', ['**/*.md'], [])).toBe(true);
            });

            it('should handle paths with dots in directory names', () => {
                expect(matcher.matches('/vault/.config/settings.md', ['**/*.md'])).toBe(true);
                expect(matcher.matches('/vault/node.js/test.md', ['**/*.md'])).toBe(true);
            });

            it('should handle paths with special characters', () => {
                expect(matcher.matches('/vault/notes (archived)/old.md', ['**/*.md'])).toBe(true);
                expect(matcher.matches('/vault/notes-2024/file.md', ['**/*.md'])).toBe(true);
                expect(matcher.matches('/vault/notes_backup/file.md', ['**/*.md'])).toBe(true);
            });

            it('should handle paths with spaces', () => {
                expect(matcher.matches('/vault/my notes/meeting notes.md', ['**/*.md'])).toBe(true);
            });

            it('should handle very long paths', () => {
                const longPath = '/vault/' + 'a/'.repeat(50) + 'test.md';
                expect(matcher.matches(longPath, ['**/*.md'])).toBe(true);
            });

            it('should be case-sensitive by default', () => {
                expect(matcher.matches('/vault/Test.MD', ['**/*.md'])).toBe(false);
                expect(matcher.matches('/vault/test.md', ['**/*.MD'])).toBe(false);
                expect(matcher.matches('/vault/test.md', ['**/*.md'])).toBe(true);
            });

            it('should handle patterns without wildcards', () => {
                expect(matcher.matches('/vault/readme.md', ['**/readme.md'])).toBe(true);
                expect(matcher.matches('/vault/notes/readme.md', ['**/readme.md'])).toBe(true);
            });

            it('should handle root-level files', () => {
                expect(matcher.matches('/vault/readme.md', ['/vault/*.md'])).toBe(true);
                expect(matcher.matches('/vault/notes/readme.md', ['/vault/*.md'])).toBe(false);
            });
        });

        describe('real-world scenarios', () => {
            it('should match typical vault structure', () => {
                const includes = ['**/*.md'];
                const ignores = ['**/.git/**', '**/.obsidian/**', '**/node_modules/**'];

                expect(matcher.matches('/vault/daily/2024-01-15.md', includes, ignores)).toBe(true);
                expect(matcher.matches('/vault/projects/alpha/tasks.md', includes, ignores)).toBe(true);
                expect(matcher.matches('/vault/.obsidian/workspace', includes, ignores)).toBe(false);
            });

            it('should handle Obsidian-specific patterns', () => {
                const includes = ['**/*.md'];
                const ignores = ['**/.obsidian/**', '**/.trash/**', '**/templates/**'];

                expect(matcher.matches('/vault/.obsidian/app.json', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/.trash/deleted.md', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/templates/meeting-template.md', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/notes/meeting.md', includes, ignores)).toBe(true);
            });

            it('should handle .spark directory', () => {
                const includes = ['**/*.md'];
                const ignores = ['**/.spark/**'];

                expect(matcher.matches('/vault/.spark/config.yaml', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/.spark/agents/betty.md', includes, ignores)).toBe(false);
                expect(matcher.matches('/vault/notes/work.md', includes, ignores)).toBe(true);
            });

            it('should match multiple file types', () => {
                const includes = ['**/*.md', '**/*.txt', '**/*.pdf'];
                const ignores = ['**/.git/**'];

                expect(matcher.matches('/vault/notes/doc.md', includes, ignores)).toBe(true);
                expect(matcher.matches('/vault/notes/readme.txt', includes, ignores)).toBe(true);
                expect(matcher.matches('/vault/reports/annual.pdf', includes, ignores)).toBe(true);
                expect(matcher.matches('/vault/data/config.json', includes, ignores)).toBe(false);
            });
        });
    });

    describe('matchesAny', () => {
        it('should return true if path matches any pattern', () => {
            expect(matcher.matchesAny('/vault/test.md', ['**/*.md', '**/*.txt'])).toBe(true);
        });

        it('should return false if path matches no patterns', () => {
            expect(matcher.matchesAny('/vault/test.json', ['**/*.md', '**/*.txt'])).toBe(false);
        });

        it('should handle empty pattern array', () => {
            expect(matcher.matchesAny('/vault/test.md', [])).toBe(false);
        });
    });
});

