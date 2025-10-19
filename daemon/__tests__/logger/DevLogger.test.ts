/**
 * Tests for DevLogger
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DevLogger } from '../../src/logger/DevLogger.js';
import { Logger } from '../../src/logger/Logger.js';

describe('DevLogger', () => {
    let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
    let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(() => {
        // Reset logger singleton
        Logger.resetInstance();

        // Spy on console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        Logger.resetInstance();
        delete process.env.SPARK_LOG_LEVEL;
    });

    describe('namespace formatting', () => {
        it('should add namespace to log messages', () => {
            const logger = new DevLogger('TestComponent', { level: 'debug', console: true });

            logger.info('Test message');

            expect(consoleLogSpy).toHaveBeenCalled();
            const logMessage = consoleLogSpy.mock.calls[0]?.[0] as string;
            expect(logMessage).toContain('[TestComponent]');
            expect(logMessage).toContain('Test message');
        });

        it('should format namespace for debug logs', () => {
            const logger = new DevLogger('MyModule', { level: 'debug', console: true });

            logger.debug('Debug info');

            expect(consoleLogSpy).toHaveBeenCalled();
            const logMessage = consoleLogSpy.mock.calls[0]?.[0] as string;
            expect(logMessage).toContain('[MyModule]');
            expect(logMessage).toContain('Debug info');
        });

        it('should format namespace for warnings', () => {
            const logger = new DevLogger('WarningModule', { level: 'debug', console: true });

            logger.warn('Warning message');

            expect(consoleWarnSpy).toHaveBeenCalled();
            const logMessage = consoleWarnSpy.mock.calls[0]?.[0] as string;
            expect(logMessage).toContain('[WarningModule]');
            expect(logMessage).toContain('Warning message');
        });

        it('should format namespace for errors', () => {
            const logger = new DevLogger('ErrorModule', { level: 'debug', console: true });

            logger.error('Error message');

            expect(consoleErrorSpy).toHaveBeenCalled();
            const logMessage = consoleErrorSpy.mock.calls[0]?.[0] as string;
            expect(logMessage).toContain('[ErrorModule]');
            expect(logMessage).toContain('Error message');
        });
    });

    describe('context logging', () => {
        it('should include context in debug logs', () => {
            const logger = new DevLogger('TestComponent', { level: 'debug', console: true });

            logger.debug('Processing file', { filename: 'test.md', size: 1024 });

            expect(consoleLogSpy).toHaveBeenCalled();
            const logMessage = consoleLogSpy.mock.calls[0]?.[0] as string;
            expect(logMessage).toContain('filename');
            expect(logMessage).toContain('test.md');
        });

        it('should include context in info logs', () => {
            const logger = new DevLogger('TestComponent', { level: 'info', console: true });

            logger.info('File changed', { path: '/test/file.md' });

            expect(consoleLogSpy).toHaveBeenCalled();
            const logMessage = consoleLogSpy.mock.calls[0]?.[0] as string;
            expect(logMessage).toContain('path');
        });
    });

    describe('performance timing', () => {
        it('should track timer start', () => {
            const logger = new DevLogger('PerfTest', { level: 'debug', console: true });

            logger.time('operation');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('[PerfTest]')
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Timer started: operation')
            );
        });

        it('should track timer end and show duration', () => {
            const logger = new DevLogger('PerfTest', { level: 'debug', console: true });

            logger.time('operation');
            consoleLogSpy.mockClear();

            logger.timeEnd('operation');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Timer ended: operation')
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('duration')
            );
        });

        it('should warn if timer not found', () => {
            const logger = new DevLogger('PerfTest', { level: 'debug', console: true });

            logger.timeEnd('nonexistent');

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Timer not found: nonexistent')
            );
        });

        it('should namespace timers', () => {
            const logger1 = new DevLogger('Component1', { level: 'debug', console: true });
            const logger2 = new DevLogger('Component2', { level: 'debug', console: true });

            logger1.time('load');
            logger2.time('load');

            // Each should have their own timer
            expect(() => logger1.timeEnd('load')).not.toThrow();
            expect(() => logger2.timeEnd('load')).not.toThrow();
        });
    });

    describe('debugWithContext', () => {
        it('should add namespace and timestamp to context', () => {
            const logger = new DevLogger('TestComponent', { level: 'debug', console: true });

            logger.debugWithContext('Complex operation', {
                step: 1,
                data: { count: 42 },
            });

            expect(consoleLogSpy).toHaveBeenCalled();
            const logMessage = consoleLogSpy.mock.calls[0]?.[0] as string;
            expect(logMessage).toContain('[TestComponent]');
            expect(logMessage).toContain('_namespace');
            expect(logMessage).toContain('_timestamp');
        });
    });

    describe('child logger', () => {
        it('should create child logger with sub-namespace', () => {
            const parent = new DevLogger('ParentComponent', { level: 'debug', console: true });
            const child = parent.child('ChildModule');

            child.info('Child message');

            expect(consoleLogSpy).toHaveBeenCalled();
            const logMessage = consoleLogSpy.mock.calls[0]?.[0] as string;
            expect(logMessage).toContain('[ParentComponent:ChildModule]');
            expect(logMessage).toContain('Child message');
        });

        it('should allow nested child loggers', () => {
            const parent = new DevLogger('Parent', { level: 'debug', console: true });
            const child = parent.child('Child');
            const grandchild = child.child('Grandchild');

            grandchild.info('Nested message');

            expect(consoleLogSpy).toHaveBeenCalled();
            const logMessage = consoleLogSpy.mock.calls[0]?.[0] as string;
            expect(logMessage).toContain('[Parent:Child:Grandchild]');
        });
    });

    describe('log level filtering', () => {
        it('should respect info level', () => {
            const logger = new DevLogger('TestComponent', { level: 'info', console: true });

            logger.debug('Debug message');
            logger.info('Info message');

            // Debug should be filtered out
            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            const logMessage = consoleLogSpy.mock.calls[0]?.[0] as string;
            expect(logMessage).toContain('Info message');
        });

        it('should respect warn level', () => {
            const logger = new DevLogger('TestComponent', { level: 'warn', console: true });

            logger.debug('Debug message');
            logger.info('Info message');
            logger.warn('Warning message');

            // Only warn should log
            expect(consoleLogSpy).toHaveBeenCalledTimes(0);
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('console disabled', () => {
        it('should not log when console is disabled', () => {
            const logger = new DevLogger('TestComponent', { level: 'debug', console: false });

            logger.info('Test message');
            logger.debug('Debug message');
            logger.warn('Warning message');
            logger.error('Error message');

            expect(consoleLogSpy).not.toHaveBeenCalled();
            expect(consoleWarnSpy).not.toHaveBeenCalled();
            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });
    });
});

