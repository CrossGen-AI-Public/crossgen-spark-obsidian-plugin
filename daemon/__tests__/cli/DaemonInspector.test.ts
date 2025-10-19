/**
 * Tests for DaemonInspector
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DaemonInspector } from '../../src/cli/DaemonInspector.js';
import { SparkDaemon } from '../../src/SparkDaemon.js';
import { TestVault } from '../utils/TestVault.js';

describe('DaemonInspector', () => {
    let vault: TestVault;
    let daemon: SparkDaemon;
    let inspector: DaemonInspector;

    beforeEach(async () => {
        vault = new TestVault();
        await vault.create();
        await vault.writeFile('test.md', '# Test\n[[mentioned-file]]');
        await vault.writeFile('mentioned-file.md', '# Mentioned File');

        daemon = new SparkDaemon(vault.path);
        await daemon.start();
        inspector = new DaemonInspector(daemon);
    });

    afterEach(async () => {
        await daemon.stop();
        await vault.cleanup();
    });

    describe('getState', () => {
        it('should return daemon state', () => {
            const state = inspector.getState();
            expect(state).toHaveProperty('state');
            expect(state).toHaveProperty('vaultPath');
            expect(state).toHaveProperty('config');
            expect(state).toHaveProperty('isRunning');
            expect(state.vaultPath).toBe(vault.path);
            expect(state.isRunning).toBe(true);
        });

        it('should include uptime after recording start', () => {
            inspector.recordStart();
            const state = inspector.getState();
            expect(state.uptime).toBeDefined();
            expect(state.uptime).toBeGreaterThanOrEqual(0);
        });

        it('should not include uptime before recording start', () => {
            const state = inspector.getState();
            expect(state.uptime).toBeUndefined();
        });
    });

    describe('recordStart and recordStop', () => {
        it('should track daemon start time', async () => {
            inspector.recordStart();
            const state1 = inspector.getState();
            expect(state1.uptime).toBeDefined();

            // Wait a bit and check uptime increased
            await new Promise(resolve => setTimeout(resolve, 10));

            const state2 = inspector.getState();
            expect(state2.uptime!).toBeGreaterThan(state1.uptime!);
        });

        it('should reset uptime on stop', () => {
            inspector.recordStart();
            const state1 = inspector.getState();
            expect(state1.uptime).toBeDefined();

            inspector.recordStop();
            const state2 = inspector.getState();
            expect(state2.uptime).toBeUndefined();
        });
    });

    describe('recordFileChange', () => {
        it('should record file change events', () => {
            const change = { path: 'test.md', type: 'change' as const, timestamp: Date.now() };
            inspector.recordFileChange(change);

            const history = inspector.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0]!.type).toBe('file_change');
            expect(history[0]!.path).toBe('test.md');
            expect(history[0]!.details).toHaveProperty('changeType', 'change');
        });

        it('should record multiple changes', () => {
            const now = Date.now();
            inspector.recordFileChange({ path: 'file1.md', type: 'add', timestamp: now });
            inspector.recordFileChange({ path: 'file2.md', type: 'change', timestamp: now });
            inspector.recordFileChange({ path: 'file3.md', type: 'unlink', timestamp: now });

            const history = inspector.getHistory();
            expect(history).toHaveLength(3);
        });
    });

    describe('recordCommandDetected', () => {
        it('should record command detection', () => {
            inspector.recordCommandDetected('/vault/file.md', '@agent Write a summary');

            const history = inspector.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0]!.type).toBe('command_detected');
            expect(history[0]!.path).toBe('/vault/file.md');
            expect(history[0]!.details).toHaveProperty('command', '@agent Write a summary');
        });

        it('should include additional details', () => {
            inspector.recordCommandDetected('/vault/file.md', '@sop run', { sopId: 'sop-123' });

            const history = inspector.getHistory();
            expect(history[0]!.details).toHaveProperty('sopId', 'sop-123');
        });
    });

    describe('recordFrontmatterChange', () => {
        it('should record frontmatter changes', () => {
            inspector.recordFrontmatterChange('/vault/file.md', 'status', 'todo', 'done');

            const history = inspector.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0]!.type).toBe('frontmatter_change');
            expect(history[0]!.path).toBe('/vault/file.md');
            expect(history[0]!.details).toHaveProperty('field', 'status');
            expect(history[0]!.details).toHaveProperty('oldValue', 'todo');
            expect(history[0]!.details).toHaveProperty('newValue', 'done');
        });
    });

    describe('recordError', () => {
        it('should record errors', () => {
            const error = new Error('Test error');
            inspector.recordError(error);

            const history = inspector.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0]!.type).toBe('error');
            expect(history[0]!.details).toHaveProperty('message', 'Test error');
            expect(history[0]!.details).toHaveProperty('stack');
        });

        it('should include context in error records', () => {
            const error = new Error('Processing failed');
            inspector.recordError(error, { filePath: '/vault/file.md', operation: 'parse' });

            const history = inspector.getHistory();
            expect(history[0]!.details).toHaveProperty('filePath', '/vault/file.md');
            expect(history[0]!.details).toHaveProperty('operation', 'parse');
        });
    });

    describe('getHistory', () => {
        beforeEach(() => {
            // Add some test events
            const now = Date.now();
            inspector.recordFileChange({ path: 'file1.md', type: 'add', timestamp: now });
            inspector.recordFileChange({ path: 'file2.md', type: 'change', timestamp: now });
            inspector.recordCommandDetected('file3.md', '@agent test');
            inspector.recordError(new Error('Test'));
        });

        it('should return all events when no limit specified', () => {
            const history = inspector.getHistory();
            expect(history).toHaveLength(4);
        });

        it('should return most recent events first', () => {
            const history = inspector.getHistory();
            expect(history[0]!.type).toBe('error'); // Last added
            expect(history[3]!.type).toBe('file_change'); // First added
        });

        it('should respect limit parameter', () => {
            const history = inspector.getHistory(2);
            expect(history).toHaveLength(2);
            expect(history[0]!.type).toBe('error');
            expect(history[1]!.type).toBe('command_detected');
        });

        it('should return empty array when no events', () => {
            inspector.clearHistory();
            const history = inspector.getHistory();
            expect(history).toHaveLength(0);
        });
    });

    describe('clearHistory', () => {
        it('should remove all events', () => {
            inspector.recordFileChange({ path: 'file.md', type: 'add', timestamp: Date.now() });
            inspector.recordCommandDetected('file.md', '@test');

            expect(inspector.getHistory()).toHaveLength(2);

            inspector.clearHistory();

            expect(inspector.getHistory()).toHaveLength(0);
        });
    });

    describe('getStats', () => {
        beforeEach(() => {
            const now = Date.now();
            inspector.recordFileChange({ path: 'file1.md', type: 'add', timestamp: now });
            inspector.recordFileChange({ path: 'file2.md', type: 'change', timestamp: now });
            inspector.recordCommandDetected('file.md', '@agent test');
            inspector.recordCommandDetected('file.md', '@sop run');
            inspector.recordFrontmatterChange('file.md', 'status', 'todo', 'done');
            inspector.recordError(new Error('Test error'));
        });

        it('should return event counts', () => {
            const stats = inspector.getStats();

            expect(stats).toHaveProperty('totalEvents');
            expect(stats).toHaveProperty('fileChanges');
            expect(stats).toHaveProperty('commandsDetected');
            expect(stats).toHaveProperty('frontmatterChanges');
            expect(stats).toHaveProperty('errors');
        });

        it('should count events correctly', () => {
            const stats = inspector.getStats();

            expect(stats.totalEvents).toBe(6);
            expect(stats.fileChanges).toBe(2);
            expect(stats.commandsDetected).toBe(2);
            expect(stats.frontmatterChanges).toBe(1);
            expect(stats.errors).toBe(1);
        });

        it('should return zero counts when no events', () => {
            inspector.clearHistory();
            const stats = inspector.getStats();

            expect(stats.totalEvents).toBe(0);
            expect(stats.fileChanges).toBe(0);
            expect(stats.commandsDetected).toBe(0);
            expect(stats.frontmatterChanges).toBe(0);
            expect(stats.errors).toBe(0);
        });
    });

    describe('history size limit', () => {
        it('should limit history to max size', () => {
            // Add more than max size (1000 events)
            const now = Date.now();
            for (let i = 0; i < 1100; i++) {
                inspector.recordFileChange({ path: `file${i}.md`, type: 'change', timestamp: now });
            }

            const history = inspector.getHistory();
            expect(history.length).toBeLessThanOrEqual(1000);
        });

        it('should keep most recent events when limit exceeded', () => {
            // Add events with identifiable paths
            const now = Date.now();
            for (let i = 0; i < 1100; i++) {
                inspector.recordFileChange({ path: `file${i}.md`, type: 'change', timestamp: now });
            }

            const history = inspector.getHistory();
            // Should have events from 100 onwards (most recent 1000)
            const firstEvent = history[history.length - 1];
            expect(firstEvent!.path).toContain('file');

            // The most recent should be file1099
            const lastEvent = history[0];
            expect(lastEvent!.path).toBe('file1099.md');
        });
    });
});
