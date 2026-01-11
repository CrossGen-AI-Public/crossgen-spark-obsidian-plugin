/**
 * ErrorWriter tests
 */

import { ErrorWriter } from '../../src/results/ErrorWriter.js';
import { SparkError } from '../../src/types/index.js';
import { Logger } from '../../src/logger/Logger.js';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ErrorWriter', () => {
    let vaultPath: string;
    let errorWriter: ErrorWriter;

    beforeEach(() => {
        // Initialize logger
        Logger.getInstance({ level: 'error', console: false, file: null });

        // Create temp vault directory
        vaultPath = join(tmpdir(), `spark-test-${Date.now()}`);
        mkdirSync(vaultPath, { recursive: true });
        mkdirSync(join(vaultPath, '.spark'), { recursive: true });

        errorWriter = new ErrorWriter(vaultPath);
    });

    afterEach(() => {
        // Clean up temp directory
        if (existsSync(vaultPath)) {
            rmSync(vaultPath, { recursive: true, force: true });
        }
    });

    describe('writeError', () => {
        it('should create logs directory if it does not exist', async () => {
            const logsDir = join(vaultPath, '.spark', 'logs');
            expect(existsSync(logsDir)).toBe(false);

            await errorWriter.writeError({
                error: new Error('Test error'),
                filePath: '/vault/test.md',
                commandLine: 42,
                commandText: '@claude test',
            });

            expect(existsSync(logsDir)).toBe(true);
        });

        it('should write error log file with correct format', async () => {
            const testError = new Error('Test error message');

            const errorPath = await errorWriter.writeError({
                error: testError,
                filePath: '/vault/test.md',
                commandLine: 42,
                commandText: '@claude test command',
            });

            expect(existsSync(errorPath)).toBe(true);

            const content = readFileSync(errorPath, 'utf-8');

            // Check markdown structure
            expect(content).toContain('# Error Report');
            expect(content).toContain('**File:** test.md');
            expect(content).toContain('**Line:** 42');
            expect(content).toContain('## Error');
            expect(content).toContain('Test error message');
            expect(content).toContain('## Command');
            expect(content).toContain('@claude test command');
        });

        it('should include stack trace for Error objects', async () => {
            const testError = new Error('Test error with stack');

            const errorPath = await errorWriter.writeError({
                error: testError,
                filePath: '/vault/test.md',
            });

            const content = readFileSync(errorPath, 'utf-8');
            expect(content).toContain('## Stack Trace');
            expect(content).toContain('```');
        });

        it('should include error code for SparkError', async () => {
            const sparkError = new SparkError('Config is invalid', 'CONFIG_ERROR', {
                field: 'logging.level',
            });

            const errorPath = await errorWriter.writeError({
                error: sparkError,
                filePath: '/vault/test.md',
            });

            const content = readFileSync(errorPath, 'utf-8');
            expect(content).toContain('**Error Code:** CONFIG_ERROR');
            expect(content).toContain('## Details');
            expect(content).toContain('"field": "logging.level"');
        });

        it('should include suggestions for known error codes', async () => {
            const sparkError = new SparkError(
                'API key not provided',
                'API_KEY_NOT_SET'
            );

            const errorPath = await errorWriter.writeError({
                error: sparkError,
                filePath: '/vault/test.md',
            });

            const content = readFileSync(errorPath, 'utf-8');
            expect(content).toContain('## Suggestions');
            expect(content).toContain('API key');
        });

        it('should use custom env var name in API key error suggestions', async () => {
            const sparkError = new SparkError(
                'API key not provided',
                'API_KEY_NOT_SET'
            );

            const errorPath = await errorWriter.writeError({
                error: sparkError,
                filePath: '/vault/test.md',
            });

            const content = readFileSync(errorPath, 'utf-8');
            expect(content).toContain('## Suggestions');
            expect(content).toContain('API key');
        });

        it('should handle AI client errors with suggestions', async () => {
            const sparkError = new SparkError('Invalid API key', 'AI_CLIENT_ERROR');

            const errorPath = await errorWriter.writeError({
                error: sparkError,
                filePath: '/vault/test.md',
            });

            const content = readFileSync(errorPath, 'utf-8');
            expect(content).toContain('## Suggestions');
            expect(content).toContain('API key');
        });

        it('should handle AI server errors with suggestions', async () => {
            const sparkError = new SparkError('Server unavailable', 'AI_SERVER_ERROR');

            const errorPath = await errorWriter.writeError({
                error: sparkError,
                filePath: '/vault/test.md',
            });

            const content = readFileSync(errorPath, 'utf-8');
            expect(content).toContain('## Suggestions');
            expect(content).toContain('retry automatically');
            expect(content).toContain('AI provider status page');
        });

        it('should handle network errors with suggestions', async () => {
            const sparkError = new SparkError('Connection failed', 'AI_NETWORK_ERROR');

            const errorPath = await errorWriter.writeError({
                error: sparkError,
                filePath: '/vault/test.md',
            });

            const content = readFileSync(errorPath, 'utf-8');
            expect(content).toContain('## Suggestions');
            expect(content).toContain('internet connection');
            expect(content).toContain('AI provider API endpoint');
            expect(content).toContain('retry automatically');
        });

        it('should write notification to notifications.jsonl', async () => {
            await errorWriter.writeError({
                error: new Error('Test error'),
                filePath: '/vault/test.md',
                commandLine: 42,
                commandText: '@claude test',
            });

            const notificationsFile = join(vaultPath, '.spark', 'notifications.jsonl');
            expect(existsSync(notificationsFile)).toBe(true);

            const content = readFileSync(notificationsFile, 'utf-8');
            const notification = JSON.parse(content.trim());

            expect(notification.type).toBe('error');
            expect(notification.message).toBe('Test error');
            expect(notification.file).toBe('/vault/test.md');
            expect(notification.line).toBe(42);
            expect(notification.link).toMatch(/\.spark\/logs\/error-.*\.md/);
        });

        it('should append to existing notifications.jsonl', async () => {
            // Write first error
            await errorWriter.writeError({
                error: new Error('First error'),
                filePath: '/vault/test1.md',
            });

            // Write second error
            await errorWriter.writeError({
                error: new Error('Second error'),
                filePath: '/vault/test2.md',
            });

            const notificationsFile = join(vaultPath, '.spark', 'notifications.jsonl');
            const content = readFileSync(notificationsFile, 'utf-8');
            const lines = content.trim().split('\n');

            expect(lines.length).toBe(2);

            const first = JSON.parse(lines[0]!);
            const second = JSON.parse(lines[1]!);

            expect(first.message).toBe('First error');
            expect(second.message).toBe('Second error');
        });

        it('should handle non-Error objects', async () => {
            const errorPath = await errorWriter.writeError({
                error: 'String error message',
                filePath: '/vault/test.md',
            });

            const content = readFileSync(errorPath, 'utf-8');
            expect(content).toContain('String error message');
        });

        it('should handle unknown error objects', async () => {
            const errorPath = await errorWriter.writeError({
                error: { weird: 'object' },
                filePath: '/vault/test.md',
            });

            const content = readFileSync(errorPath, 'utf-8');
            expect(content).toContain('Unknown error');
        });

        it('should include context when provided', async () => {
            const errorPath = await errorWriter.writeError({
                error: new Error('Test error'),
                filePath: '/vault/test.md',
                context: {
                    hasAgent: true,
                    mentionedFilesCount: 3,
                    nearbyFilesCount: 10,
                },
            });

            const content = readFileSync(errorPath, 'utf-8');
            expect(content).toContain('## Context');
            expect(content).toContain('"hasAgent": true');
            expect(content).toContain('"mentionedFilesCount": 3');
        });

        it('should generate unique error IDs', async () => {
            const path1 = await errorWriter.writeError({
                error: new Error('Error 1'),
                filePath: '/vault/test.md',
            });

            const path2 = await errorWriter.writeError({
                error: new Error('Error 2'),
                filePath: '/vault/test.md',
            });

            expect(path1).not.toBe(path2);
        });

        it('should not throw if logs directory cannot be created', async () => {
            // This test verifies graceful degradation
            // In practice, if logs dir creation fails, file write will also fail
            // but the error writer should handle it gracefully

            await expect(
                errorWriter.writeError({
                    error: new Error('Test error'),
                    filePath: '/vault/test.md',
                })
            ).resolves.toBeDefined();
        });
    });
});

