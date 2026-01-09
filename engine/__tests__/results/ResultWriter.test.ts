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
            expect(lines[4]).toBe('<!-- spark-result-start -->');
            expect(lines[5]).toBe('This is a summary of the content.');
            expect(lines[6]).toBe('<!-- spark-result-end -->');
            expect(lines[7]).toBe('');
            expect(lines[8]).toBe('Some other content');
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
            expect(lines[3]).toBe('<!-- spark-result-start -->');
            expect(lines[4]).toBe('This is a summary.');
            expect(lines[5]).toBe('<!-- spark-result-end -->');
            expect(lines[6]).toBe('');
            expect(lines[7]).toBe('Some other content');
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
            expect(lines[4]).toBe('<!-- spark-result-start -->');
            expect(lines[5]).toBe('Done!');
            expect(lines[6]).toBe('<!-- spark-result-end -->');
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

    describe('updateInlineChatStatus', () => {
        it('should update marker status from pending to processing', async () => {
            const content = [
                '# Test File',
                '',
                '<!-- spark-inline-chat:pending:abc-123 -->',
                'User: How do I calculate burn rate?',
                '<!-- /spark-inline-chat -->',
                '',
                'Other content',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.updateInlineChatStatus({
                filePath: testFile,
                chatId: 'abc-123',
                startLine: 3,
                endLine: 5,
                status: 'processing',
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            expect(lines[2]).toBe('<!-- spark-inline-chat:processing:abc-123 -->');
            expect(lines[3]).toBe('User: How do I calculate burn rate?');
            expect(lines[4]).toBe('<!-- /spark-inline-chat -->');
        });

        it('should update marker status from processing to complete', async () => {
            const content = [
                '<!-- spark-inline-chat:processing:def-456 -->',
                'User: What is runway?',
                '<!-- /spark-inline-chat -->',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.updateInlineChatStatus({
                filePath: testFile,
                chatId: 'def-456',
                startLine: 1,
                endLine: 3,
                status: 'complete',
            });

            const result = readFileSync(testFile, 'utf-8');
            expect(result).toContain('<!-- spark-inline-chat:complete:def-456 -->');
        });

        it('should update marker status to error', async () => {
            const content = [
                '<!-- spark-inline-chat:pending:error-123 -->',
                'User: Invalid query',
                '<!-- /spark-inline-chat -->',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.updateInlineChatStatus({
                filePath: testFile,
                chatId: 'error-123',
                startLine: 1,
                endLine: 3,
                status: 'error',
            });

            const result = readFileSync(testFile, 'utf-8');
            expect(result).toContain('<!-- spark-inline-chat:error:error-123 -->');
        });

        it('should preserve UUID in marker when updating status', async () => {
            const content = [
                '<!-- spark-inline-chat:pending:123e4567-e89b-12d3-a456-426614174000 -->',
                'User: Test',
                '<!-- /spark-inline-chat -->',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.updateInlineChatStatus({
                filePath: testFile,
                chatId: '123e4567-e89b-12d3-a456-426614174000',
                startLine: 1,
                endLine: 3,
                status: 'complete',
            });

            const result = readFileSync(testFile, 'utf-8');
            expect(result).toContain(
                '<!-- spark-inline-chat:complete:123e4567-e89b-12d3-a456-426614174000 -->'
            );
        });

        it('should throw error if file does not exist', async () => {
            await expect(
                resultWriter.updateInlineChatStatus({
                    filePath: join(testDir, 'nonexistent.md'),
                    chatId: 'test-123',
                    startLine: 1,
                    endLine: 3,
                    status: 'complete',
                })
            ).rejects.toThrow(SparkError);
        });
    });

    describe('writeInlineChatResponse', () => {
        it('should replace user message with AI response', async () => {
            const content = [
                '# Finance Document',
                '',
                '<!-- spark-inline-chat:pending:abc-123 -->',
                'User: How do I calculate burn rate?',
                '<!-- /spark-inline-chat -->',
                '',
                'Other content below',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.writeInlineChatResponse({
                filePath: testFile,
                chatId: 'abc-123',
                startLine: 3,
                endLine: 5,
                response: 'To calculate burn rate, divide monthly expenses by available cash.',
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            // Markers are removed, only clean content remains
            expect(lines[0]).toBe('# Finance Document');
            expect(lines[1]).toBe('');
            expect(lines[2]).toBe(
                'To calculate burn rate, divide monthly expenses by available cash.'
            );
            expect(lines[3]).toBe('');
            expect(lines[4]).toBe('Other content below');
        });

        it('should handle multi-line AI responses', async () => {
            const content = [
                '<!-- spark-inline-chat:pending:multi-123 -->',
                'User: Explain burn rate',
                '<!-- /spark-inline-chat -->',
            ].join('\n');

            writeFileSync(testFile, content);

            const multiLineResponse = [
                'Burn rate is calculated as follows:',
                '',
                '1. Add up monthly expenses',
                '2. Divide by available cash',
                '3. Result is months of runway',
            ].join('\n');

            await resultWriter.writeInlineChatResponse({
                filePath: testFile,
                chatId: 'multi-123',
                startLine: 1,
                endLine: 3,
                response: multiLineResponse,
            });

            const result = readFileSync(testFile, 'utf-8');

            // Markers are removed, only clean content remains
            expect(result).not.toContain('spark-inline-chat');
            expect(result).toContain('Burn rate is calculated as follows:');
            expect(result).toContain('1. Add up monthly expenses');
            expect(result).toContain('3. Result is months of runway');
        });

        it('should update status to complete in marker', async () => {
            const content = [
                '<!-- spark-inline-chat:processing:status-123 -->',
                'User: Test question',
                '<!-- /spark-inline-chat -->',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.writeInlineChatResponse({
                filePath: testFile,
                chatId: 'status-123',
                startLine: 1,
                endLine: 3,
                response: 'Test answer',
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            // Markers are removed, only clean content remains
            expect(lines[0]).toBe('Test answer');
        });

        it('should handle inline chat at start of file', async () => {
            const content = [
                '<!-- spark-inline-chat:pending:start-123 -->',
                'User: Question',
                '<!-- /spark-inline-chat -->',
                '',
                'Content below',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.writeInlineChatResponse({
                filePath: testFile,
                chatId: 'start-123',
                startLine: 1,
                endLine: 3,
                response: 'Answer here',
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            // Markers are removed, only clean content remains
            expect(lines[0]).toBe('Answer here');
            expect(lines[1]).toBe('');
            expect(lines[2]).toBe('Content below');
        });

        it('should handle inline chat at end of file', async () => {
            const content = [
                'Content above',
                '',
                '<!-- spark-inline-chat:pending:end-123 -->',
                'User: Last question',
                '<!-- /spark-inline-chat -->',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.writeInlineChatResponse({
                filePath: testFile,
                chatId: 'end-123',
                startLine: 3,
                endLine: 5,
                response: 'Final answer',
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            expect(lines[0]).toBe('Content above');
            expect(lines[1]).toBe('');
            expect(lines[2]).toBe('Final answer');
        });

        it('should throw error for invalid line numbers', async () => {
            const content = ['Line 1', 'Line 2', 'Line 3'].join('\n');

            writeFileSync(testFile, content);

            await expect(
                resultWriter.writeInlineChatResponse({
                    filePath: testFile,
                    chatId: 'invalid-123',
                    startLine: 10,
                    endLine: 15,
                    response: 'Test',
                })
            ).rejects.toThrow(SparkError);
        });

        it('should throw error if file does not exist', async () => {
            await expect(
                resultWriter.writeInlineChatResponse({
                    filePath: join(testDir, 'nonexistent.md'),
                    chatId: 'test-123',
                    startLine: 1,
                    endLine: 3,
                    response: 'Test',
                })
            ).rejects.toThrow(SparkError);
        });

        it('should preserve content outside inline chat markers', async () => {
            const content = [
                '# Document Title',
                '',
                'Paragraph 1',
                '',
                '<!-- spark-inline-chat:pending:preserve-123 -->',
                'User: Question',
                '<!-- /spark-inline-chat -->',
                '',
                'Paragraph 2',
                '',
                '## Section',
                'More content',
            ].join('\n');

            writeFileSync(testFile, content);

            await resultWriter.writeInlineChatResponse({
                filePath: testFile,
                chatId: 'preserve-123',
                startLine: 5,
                endLine: 7,
                response: 'AI response',
            });

            const result = readFileSync(testFile, 'utf-8');
            const lines = result.split('\n');

            // Markers are removed, only clean content remains
            expect(lines[0]).toBe('# Document Title');
            expect(lines[2]).toBe('Paragraph 1');
            expect(lines[4]).toBe('AI response');
            expect(lines[6]).toBe('Paragraph 2');
            expect(lines[8]).toBe('## Section');
            expect(lines[9]).toBe('More content');
        });
    });
});

