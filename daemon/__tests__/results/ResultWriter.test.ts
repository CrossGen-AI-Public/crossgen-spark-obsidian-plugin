import { ResultWriter } from '../../src/results/ResultWriter.js';
import { Logger } from '../../src/logger/Logger.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SparkError } from '../../src/types/index.js';

describe('ResultWriter', () => {
    let testDir: string;
    let testFile: string;
    let resultWriter: ResultWriter;

    beforeEach(() => {
        // Initialize logger for tests
        Logger.getInstance({ level: 'error', console: false, file: null });

        // Create temp directory for tests
        testDir = mkdtempSync(join(tmpdir(), 'spark-test-'));
        testFile = join(testDir, 'test.md');
        resultWriter = new ResultWriter();
    });

    afterEach(() => {
        // Clean up
        rmSync(testDir, { recursive: true, force: true });
    });

    describe('writeInline', () => {
        it('should write result inline with success emoji', async () => {
            const content = [
                '# Test File',
                '',
                '/summarize this content',
                '',
                'Some other content',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.writeInline({
                filePath: testFile,
                commandLine: 3,
                commandText: '/summarize this content',
                result: 'This is a summary of the content.',
                addBlankLines: true,
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            expect(lines[2]).toBe('✅ /summarize this content');
            expect(lines[3]).toBe('');
            expect(lines[4]).toBe('This is a summary of the content.');
            expect(lines[5]).toBe('');
            expect(lines[6]).toBe('Some other content');
        });

        it('should write result inline without blank lines', async () => {
            const content = [
                '# Test File',
                '',
                '/summarize this content',
                '',
                'Some other content',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.writeInline({
                filePath: testFile,
                commandLine: 3,
                commandText: '/summarize this content',
                result: 'This is a summary.',
                addBlankLines: false,
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            expect(lines[2]).toBe('✅ /summarize this content');
            expect(lines[3]).toBe('This is a summary.');
            expect(lines[4]).toBe('');
            expect(lines[5]).toBe('Some other content');
        });

        it('should replace existing status emoji', async () => {
            const content = [
                '# Test File',
                '',
                '⏳ /summarize this content',
                '',
                'Some other content',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.writeInline({
                filePath: testFile,
                commandLine: 3,
                commandText: '/summarize this content',
                result: 'Done!',
                addBlankLines: true,
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            expect(lines[2]).toBe('✅ /summarize this content');
            expect(lines[3]).toBe('');
            expect(lines[4]).toBe('Done!');
        });

        it('should throw error for invalid line number', async () => {
            const content = ['Line 1', 'Line 2', 'Line 3'].join('\n');
            writeFileSync(testFile, content);

            await expect(
                resultWriter.writeInline({
                    filePath: testFile,
                    commandLine: 10,
                    commandText: 'test',
                    result: 'result',
                    addBlankLines: true,
                })
            ).rejects.toThrow(SparkError);
        });

        it('should throw error for line number 0', async () => {
            const content = ['Line 1', 'Line 2'].join('\n');
            writeFileSync(testFile, content);

            await expect(
                resultWriter.writeInline({
                    filePath: testFile,
                    commandLine: 0,
                    commandText: 'test',
                    result: 'result',
                    addBlankLines: true,
                })
            ).rejects.toThrow(SparkError);
        });

        it('should throw error if file does not exist', async () => {
            await expect(
                resultWriter.writeInline({
                    filePath: join(testDir, 'nonexistent.md'),
                    commandLine: 1,
                    commandText: 'test',
                    result: 'result',
                    addBlankLines: true,
                })
            ).rejects.toThrow(SparkError);
        });
    });

    describe('updateStatus', () => {
        it('should update status to processing', async () => {
            const content = [
                '# Test File',
                '',
                '/summarize this content',
                '',
                'Some content',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.updateStatus({
                filePath: testFile,
                commandLine: 3,
                commandText: '/summarize this content',
                status: '⏳',
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            expect(lines[2]).toBe('⏳ /summarize this content');
        });

        it('should update status to error', async () => {
            const content = [
                '# Test File',
                '',
                '⏳ /summarize this content',
                '',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.updateStatus({
                filePath: testFile,
                commandLine: 3,
                commandText: '/summarize this content',
                status: '❌',
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            expect(lines[2]).toBe('❌ /summarize this content');
        });

        it('should replace existing status emoji when updating', async () => {
            const content = ['# Test', '', '✅ /summarize'].join('\n');
            writeFileSync(testFile, content);

            await resultWriter.updateStatus({
                filePath: testFile,
                commandLine: 3,
                commandText: '/summarize',
                status: '⏳',
            });

            const result = readFileSync(testFile, 'utf-8');
            expect(result.split('\n')[2]).toBe('⏳ /summarize');
        });

        it('should not throw error for invalid line number (non-critical)', async () => {
            const content = ['Line 1', 'Line 2'].join('\n');
            writeFileSync(testFile, content);

            // Should not throw - status update is non-critical
            await expect(
                resultWriter.updateStatus({
                    filePath: testFile,
                    commandLine: 10,
                    commandText: 'test',
                    status: '⏳',
                })
            ).resolves.toBeUndefined();
        });

        it('should not throw error if file does not exist (non-critical)', async () => {
            // Should not throw - status update is non-critical
            await expect(
                resultWriter.updateStatus({
                    filePath: join(testDir, 'nonexistent.md'),
                    commandLine: 1,
                    commandText: 'test',
                    status: '⏳',
                })
            ).resolves.toBeUndefined();
        });
    });
});

