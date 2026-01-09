import { ProximityCalculator } from '../../src/context/ProximityCalculator.js';

describe('ProximityCalculator', () => {
    let calculator: ProximityCalculator;

    beforeEach(() => {
        calculator = new ProximityCalculator();
    });

    describe('calculateDistance', () => {
        it('should return 0 for identical paths', () => {
            const distance = calculator.calculateDistance(
                '/vault/root/notes/meeting.md',
                '/vault/root/notes/meeting.md'
            );

            expect(distance).toBe(0);
        });

        it('should return 0 for files in same directory', () => {
            const distance = calculator.calculateDistance(
                '/vault/root/notes/meeting.md',
                '/vault/root/notes/todo.md'
            );

            expect(distance).toBe(0);
        });

        it('should calculate distance for files in different directories', () => {
            const distance = calculator.calculateDistance(
                '/vault/root/notes/meeting.md',
                '/vault/root/projects/alpha/tasks.md'
            );

            // Up 1 level (notes) + down 2 levels (projects/alpha) = 3
            expect(distance).toBe(3);
        });

        it('should calculate distance for nested paths', () => {
            const distance = calculator.calculateDistance(
                '/vault/root/projects/alpha/docs/overview.md',
                '/vault/root/projects/beta/tasks.md'
            );

            // Up 2 levels (alpha/docs) + down 1 level (beta) = 3
            expect(distance).toBe(3);
        });

        it('should handle root-level files', () => {
            const distance = calculator.calculateDistance('/vault/root/readme.md', '/vault/root/notes/todo.md');

            // Down 1 level (notes) = 1
            expect(distance).toBe(1);
        });

        it('should handle deeply nested paths', () => {
            const distance = calculator.calculateDistance(
                '/vault/root/a/b/c/d/file1.md',
                '/vault/root/x/y/z/file2.md'
            );

            // Up 4 levels (a/b/c/d) + down 3 levels (x/y/z) = 7
            expect(distance).toBe(7);
        });

        it('should handle paths with similar prefixes', () => {
            const distance = calculator.calculateDistance(
                '/vault/root/projects/alpha/tasks.md',
                '/vault/root/projects/alpha-backup/tasks.md'
            );

            // Up 1 level (alpha) + down 1 level (alpha-backup) = 2
            expect(distance).toBe(2);
        });
    });

    describe('rankFilesByProximity', () => {
        it('should rank files by distance from current file', () => {
            const currentFile = '/vault/root/notes/meeting.md';
            const files = [
                '/vault/root/projects/alpha/tasks.md', // distance: 3
                '/vault/root/notes/todo.md', // distance: 0
                '/vault/root/notes/ideas/brainstorm.md', // distance: 1
                '/vault/root/readme.md', // distance: 1
            ];

            const ranked = calculator.rankFilesByProximity(currentFile, files);

            // Closest: same directory (distance 0)
            expect(ranked[0]).toContain('todo.md');
            // Next: one level away (distance 1)
            expect(ranked[1]).toMatch(/readme\.md|brainstorm\.md/);
            expect(ranked[2]).toMatch(/readme\.md|brainstorm\.md/);
            // Furthest (distance 3)
            expect(ranked[3]).toContain('projects/alpha/tasks.md');
        });

        it('should return empty array for empty input', () => {
            const ranked = calculator.rankFilesByProximity('/vault/root/notes/meeting.md', []);

            expect(ranked).toEqual([]);
        });

        it('should handle single file', () => {
            const ranked = calculator.rankFilesByProximity('/vault/root/notes/meeting.md', [
                '/vault/root/notes/todo.md',
            ]);

            expect(ranked).toHaveLength(1);
            expect(ranked[0]).toContain('todo.md');
        });

        it('should handle all files at same distance', () => {
            const currentFile = '/vault/root/notes/meeting.md';
            const files = [
                '/vault/root/notes/todo.md',
                '/vault/root/notes/ideas.md',
                '/vault/root/notes/tasks.md',
            ];

            const ranked = calculator.rankFilesByProximity(currentFile, files);

            expect(ranked).toHaveLength(3);
            // All files in same directory as current file = distance 0
            ranked.forEach(file => {
                const distance = calculator.calculateDistance(currentFile, file);
                expect(distance).toBe(0);
            });
        });

        it('should preserve file paths in ranked results', () => {
            const currentFile = '/vault/root/notes/meeting.md';
            const files = ['/vault/root/projects/alpha/tasks.md', '/vault/root/notes/todo.md'];

            const ranked = calculator.rankFilesByProximity(currentFile, files);

            expect(ranked).toHaveLength(2);
            expect(ranked.some((file) => file.includes('projects/alpha/tasks.md'))).toBe(true);
            expect(ranked.some((file) => file.includes('notes/todo.md'))).toBe(true);
        });

        it('should sort by distance ascending', () => {
            const currentFile = '/vault/root/level1/level2/current.md';
            const files = [
                '/vault/root/far/away/deep/file1.md', // distance: 5
                '/vault/root/level1/sibling.md', // distance: 1
                '/vault/root/level1/level2/neighbor.md', // distance: 0
                '/vault/root/medium/distance/file2.md', // distance: 4
            ];

            const ranked = calculator.rankFilesByProximity(currentFile, files);

            // Check distances are ascending
            expect(calculator.calculateDistance(currentFile, ranked[0]!)).toBe(0);
            expect(calculator.calculateDistance(currentFile, ranked[1]!)).toBe(1);
            expect(calculator.calculateDistance(currentFile, ranked[2]!)).toBe(4);
            expect(calculator.calculateDistance(currentFile, ranked[3]!)).toBe(5);
        });

        it('should handle files from different directory structures', () => {
            const currentFile = '/vault/root/work/projects/current.md';
            const files = [
                '/vault/root/work/projects/project1/doc.md',
                '/vault/root/work/archived/old.md',
                '/vault/root/personal/notes/note.md',
                '/vault/root/work/projects/overview.md',
            ];

            const ranked = calculator.rankFilesByProximity(currentFile, files);

            // Closest: same directory (distance 0)
            expect(ranked[0]).toContain('overview.md');
            expect(calculator.calculateDistance(currentFile, ranked[0]!)).toBe(0);

            // Next: one level deeper (distance 1)
            expect(ranked[1]).toContain('project1/doc.md');
            expect(calculator.calculateDistance(currentFile, ranked[1]!)).toBe(1);
        });

        it('should handle current file in root', () => {
            const currentFile = '/vault/root/readme.md';
            const files = [
                '/vault/root/notes/meeting.md',
                '/vault/root/todo.md',
                '/vault/root/projects/alpha/tasks.md',
            ];

            const ranked = calculator.rankFilesByProximity(currentFile, files);

            expect(ranked[0]).toContain('todo.md');
            expect(calculator.calculateDistance(currentFile, ranked[0]!)).toBe(0);
            expect(calculator.calculateDistance(currentFile, ranked[1]!)).toBe(1);
            expect(calculator.calculateDistance(currentFile, ranked[2]!)).toBe(2);
        });
    });

    describe('edge cases', () => {
        it('should handle paths with trailing slashes', () => {
            const distance = calculator.calculateDistance(
                '/vault/root/notes/meeting.md',
                '/vault/root/notes/todo.md'
            );

            expect(distance).toBe(0);
        });

        it('should handle paths with dots', () => {
            const distance = calculator.calculateDistance(
                '/vault/root/.config/settings.md',
                '/vault/root/.config/advanced.md'
            );

            expect(distance).toBe(0);
        });

        it('should handle paths with special characters', () => {
            const distance = calculator.calculateDistance(
                '/vault/root/notes (archived)/old.md',
                '/vault/root/notes (archived)/backup.md'
            );

            expect(distance).toBe(0);
        });

        it('should handle very long paths', () => {
            const longPath1 = '/vault/root/a/b/c/d/e/f/g/h/i/j/file1.md';
            const longPath2 = '/vault/root/a/b/c/d/e/f/g/h/i/j/file2.md';

            const distance = calculator.calculateDistance(longPath1, longPath2);

            expect(distance).toBe(0);
        });
    });
});

