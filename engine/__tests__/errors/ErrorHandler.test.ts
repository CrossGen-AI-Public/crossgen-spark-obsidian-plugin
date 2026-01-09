import { ErrorHandler } from '../../src/errors/ErrorHandler.js';
import { SparkError } from '../../src/types/index.js';
import { Logger } from '../../src/logger/Logger.js';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

describe('ErrorHandler', () => {
    let testDir: string;

    beforeEach(() => {
        testDir = join(process.cwd(), '__tests__', 'errors', '__test_vault__');
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
        mkdirSync(testDir, { recursive: true });

        // Initialize Logger to prevent undefined errors
        Logger.getInstance({ level: 'error', console: false, file: null });
    });

    afterEach(() => {
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('handle', () => {
        it('should handle SparkError and return exit code 1', async () => {
            const handler = new ErrorHandler({ exitOnError: false });
            const error = new SparkError('Test error', 'CONFIG_ERROR');

            const exitCode = await handler.handle(error, { operation: 'Testing' });

            expect(exitCode).toBe(1);
        });

        it('should normalize regular Error to SparkError', async () => {
            const handler = new ErrorHandler({ exitOnError: false });
            const error = new Error('Regular error');

            const exitCode = await handler.handle(error, { operation: 'Testing' });

            expect(exitCode).toBe(1);
        });

        it('should normalize string error to SparkError', async () => {
            const handler = new ErrorHandler({ exitOnError: false });

            const exitCode = await handler.handle('String error', { operation: 'Testing' });

            expect(exitCode).toBe(1);
        });

        it('should write error to file when vaultPath and logToFile are provided', async () => {
            const handler = new ErrorHandler({
                vaultPath: testDir,
                logToFile: true,
                exitOnError: false,
            });

            const error = new SparkError('Test error', 'CONFIG_ERROR');
            const filePath = join(testDir, 'test.md');

            await handler.handle(error, { filePath, operation: 'Testing' });

            const logsDir = join(testDir, '.spark', 'logs');
            expect(existsSync(logsDir)).toBe(true);

            const logFiles = readdirSync(logsDir);
            expect(logFiles.length).toBeGreaterThan(0);

            const errorLogPath = join(logsDir, logFiles[0]!);
            const logContent = readFileSync(errorLogPath, 'utf-8');
            expect(logContent).toContain('Test error');
            expect(logContent).toContain('CONFIG_ERROR');
        });

        it('should not write to file when logToFile is false', async () => {
            const handler = new ErrorHandler({
                vaultPath: testDir,
                logToFile: false,
                exitOnError: false,
            });

            const error = new SparkError('Test error', 'CONFIG_ERROR');
            const filePath = join(testDir, 'test.md');

            await handler.handle(error, { filePath, operation: 'Testing' });

            const logsDir = join(testDir, '.spark', 'logs');
            expect(existsSync(logsDir)).toBe(false);
        });

        it('should not write to file when vaultPath is not provided', async () => {
            const handler = new ErrorHandler({
                logToFile: true,
                exitOnError: false,
            });

            const error = new SparkError('Test error', 'CONFIG_ERROR');
            const filePath = join(testDir, 'test.md');

            await handler.handle(error, { filePath, operation: 'Testing' });

            const logsDir = join(testDir, '.spark', 'logs');
            expect(existsSync(logsDir)).toBe(false);
        });
    });

    describe('error code suggestions', () => {
        it('should provide suggestions for API_KEY_NOT_SET', async () => {
            const handler = new ErrorHandler({ exitOnError: false });
            const error = new SparkError('API key not set', 'API_KEY_NOT_SET');

            // Capture console.error output
            const consoleErrors: string[] = [];
            const originalError = console.error;
            console.error = (...args: unknown[]) => {
                consoleErrors.push(args.join(' '));
            };

            await handler.handle(error, { operation: 'Testing' });

            console.error = originalError;

            const output = consoleErrors.join('\n');
            expect(output).toContain('API key');
        });

        it('should provide suggestions for CONFIG_ERROR', async () => {
            const handler = new ErrorHandler({ exitOnError: false });
            const error = new SparkError('Config invalid', 'CONFIG_ERROR');

            const consoleErrors: string[] = [];
            const originalError = console.error;
            console.error = (...args: unknown[]) => {
                consoleErrors.push(args.join(' '));
            };

            await handler.handle(error, { operation: 'Testing' });

            console.error = originalError;

            const output = consoleErrors.join('\n');
            expect(output).toContain('.spark/config.yaml');
            expect(output).toContain('spark inspect');
        });

        it('should provide suggestions for AI_NETWORK_ERROR', async () => {
            const handler = new ErrorHandler({ exitOnError: false });
            const error = new SparkError('Network failed', 'AI_NETWORK_ERROR');

            const consoleErrors: string[] = [];
            const originalError = console.error;
            console.error = (...args: unknown[]) => {
                consoleErrors.push(args.join(' '));
            };

            await handler.handle(error, { operation: 'Testing' });

            console.error = originalError;

            const output = consoleErrors.join('\n');
            expect(output).toContain('internet connection');
            expect(output).toContain('AI provider API endpoint');
        });

        it('should provide suggestions for AI_CLIENT_ERROR', async () => {
            const handler = new ErrorHandler({ exitOnError: false });
            const error = new SparkError('Invalid key', 'AI_CLIENT_ERROR');

            const consoleErrors: string[] = [];
            const originalError = console.error;
            console.error = (...args: unknown[]) => {
                consoleErrors.push(args.join(' '));
            };

            await handler.handle(error, { operation: 'Testing' });

            console.error = originalError;

            const output = consoleErrors.join('\n');
            expect(output).toContain('API key');
        });

        it('should provide no suggestions for unknown error codes', async () => {
            const handler = new ErrorHandler({ exitOnError: false });
            const error = new SparkError('Unknown error', 'UNKNOWN_ERROR');

            const consoleErrors: string[] = [];
            const originalError = console.error;
            console.error = () => {
                consoleErrors.push(' ');
            };

            await handler.handle(error, { operation: 'Testing' });

            console.error = originalError;

            // Should not contain "Suggestions:" section
            const output = consoleErrors.join('\n');
            expect(output).not.toContain('💡 Suggestions:');
        });
    });

    describe('error normalization', () => {
        it('should preserve SparkError as-is', async () => {
            const handler = new ErrorHandler({ exitOnError: false });
            const error = new SparkError('Test error', 'CONFIG_ERROR', { field: 'test' });

            const consoleErrors: string[] = [];
            const originalError = console.error;
            console.error = (...args: unknown[]) => {
                consoleErrors.push(args.join(' '));
            };

            await handler.handle(error, { operation: 'Testing' });

            console.error = originalError;

            const output = consoleErrors.join('\n');
            expect(output).toContain('Test error');
        });

        it('should convert Error to SparkError with UNKNOWN_ERROR code', async () => {
            const handler = new ErrorHandler({ exitOnError: false });
            const error = new Error('Regular error');

            const consoleErrors: string[] = [];
            const originalError = console.error;
            console.error = (...args: unknown[]) => {
                consoleErrors.push(args.join(' '));
            };

            await handler.handle(error, { operation: 'Testing' });

            console.error = originalError;

            const output = consoleErrors.join('\n');
            expect(output).toContain('Regular error');
        });
    });
});

