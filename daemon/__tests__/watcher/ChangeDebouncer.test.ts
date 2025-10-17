import { ChangeDebouncer } from '../../src/watcher/ChangeDebouncer.js';
import { jest } from '@jest/globals';

/**
 * ChangeDebouncer Tests
 * 
 * Note: These tests verify debouncing behavior with generous timeouts.
 * Exact timing is environment-dependent due to Node.js event loop scheduling.
 */
describe('ChangeDebouncer', () => {
    let debouncer: ChangeDebouncer;

    beforeEach(() => {
        debouncer = new ChangeDebouncer(50);
    });

    afterEach(() => {
        debouncer.cancelAll();
    });

    describe('constructor', () => {
        it('should create debouncer instance', () => {
            const db = new ChangeDebouncer(100);
            expect(db).toBeInstanceOf(ChangeDebouncer);
        });
    });

    describe('debounce behavior', () => {
        it('should call callback after debounce delay', async () => {
            const callback = jest.fn();

            debouncer.debounce('/vault/test.md', callback);
            expect(callback).not.toHaveBeenCalled();

            await new Promise(resolve => setTimeout(resolve, 150));
            expect(callback).toHaveBeenCalledTimes(1);
        }, 500);

        it('should debounce rapid changes to same file', async () => {
            const callback = jest.fn();
            const path = '/vault/test.md';

            // Rapid fire 5 debounces
            for (let i = 0; i < 5; i++) {
                debouncer.debounce(path, callback);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            await new Promise(resolve => setTimeout(resolve, 150));

            // Should only call once (last debounce)
            expect(callback).toHaveBeenCalledTimes(1);
        }, 1000);

        it('should handle multiple files independently', async () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            const callback3 = jest.fn();

            debouncer.debounce('/vault/file1.md', callback1);
            debouncer.debounce('/vault/file2.md', callback2);
            debouncer.debounce('/vault/file3.md', callback3);

            await new Promise(resolve => setTimeout(resolve, 150));

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
            expect(callback3).toHaveBeenCalledTimes(1);
        }, 500);
    });

    describe('cancel', () => {
        it('should cancel pending callback for specific file', async () => {
            const callback = jest.fn();
            const path = '/vault/test.md';

            debouncer.debounce(path, callback);
            debouncer.cancel(path);

            await new Promise(resolve => setTimeout(resolve, 150));
            expect(callback).not.toHaveBeenCalled();
        }, 500);

        it('should not affect other files when cancelling one', async () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            debouncer.debounce('/vault/file1.md', callback1);
            debouncer.debounce('/vault/file2.md', callback2);

            debouncer.cancel('/vault/file1.md');

            await new Promise(resolve => setTimeout(resolve, 150));

            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).toHaveBeenCalledTimes(1);
        }, 500);
    });

    describe('cancelAll', () => {
        it('should cancel all pending callbacks', async () => {
            const callbacks = [jest.fn(), jest.fn(), jest.fn()];

            debouncer.debounce('/vault/file1.md', callbacks[0]!);
            debouncer.debounce('/vault/file2.md', callbacks[1]!);
            debouncer.debounce('/vault/file3.md', callbacks[2]!);

            debouncer.cancelAll();

            await new Promise(resolve => setTimeout(resolve, 150));

            callbacks.forEach(cb => expect(cb).not.toHaveBeenCalled());
        }, 500);

        it('should allow new debounces after cancelAll', async () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            debouncer.debounce('/vault/test.md', callback1);
            debouncer.cancelAll();
            debouncer.debounce('/vault/test.md', callback2);

            await new Promise(resolve => setTimeout(resolve, 150));

            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).toHaveBeenCalledTimes(1);
        }, 500);
    });

    describe('edge cases', () => {
        it('should handle very long file paths', async () => {
            const callback = jest.fn();
            const longPath = '/vault/' + 'a/'.repeat(100) + 'test.md';

            debouncer.debounce(longPath, callback);

            await new Promise(resolve => setTimeout(resolve, 150));
            expect(callback).toHaveBeenCalledTimes(1);
        }, 500);

        it('should handle paths with special characters', async () => {
            const callback = jest.fn();
            const path = '/vault/file (with) [special] {chars}.md';

            debouncer.debounce(path, callback);

            await new Promise(resolve => setTimeout(resolve, 150));
            expect(callback).toHaveBeenCalledTimes(1);
        }, 500);

        it('should handle zero delay', async () => {
            const zeroDebouncer = new ChangeDebouncer(0);
            const callback = jest.fn();

            zeroDebouncer.debounce('/vault/test.md', callback);

            await new Promise(resolve => setTimeout(resolve, 50));
            expect(callback).toHaveBeenCalledTimes(1);

            zeroDebouncer.cancelAll();
        }, 500);
    });
});
