import { Logger } from '../../src/logger/Logger.js';
import { jest } from '@jest/globals';
import type { LoggingConfig } from '../../src/types/config.js';

describe('Logger', () => {
    let consoleLogSpy: ReturnType<typeof jest.spyOn>;
    let consoleErrorSpy: ReturnType<typeof jest.spyOn>;
    let consoleWarnSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        // Reset singleton instance
        (Logger as any).instance = null;

        // Spy on console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    describe('singleton pattern', () => {
        it('should return the same instance', () => {
            const config: LoggingConfig = { level: 'info', console: true };
            const logger1 = Logger.getInstance(config);
            const logger2 = Logger.getInstance(config);

            expect(logger1).toBe(logger2);
        });

        it('should work after initialization', () => {
            const config: LoggingConfig = { level: 'info', console: true };
            Logger.getInstance(config);

            // Second call without config should work
            const logger = Logger.getInstance();
            expect(logger).toBeDefined();
        });
    });

    describe('log levels', () => {
        it('should log debug messages when level is debug', () => {
            const config: LoggingConfig = { level: 'debug', console: true };
            const logger = Logger.getInstance(config);

            logger.debug('Debug message');

            expect(consoleLogSpy).toHaveBeenCalled();
        });

        it('should log info messages', () => {
            const config: LoggingConfig = { level: 'info', console: true };
            const logger = Logger.getInstance(config);

            logger.info('Info message');

            expect(consoleLogSpy).toHaveBeenCalled();
        });

        it('should log warn messages', () => {
            const config: LoggingConfig = { level: 'warn', console: true };
            const logger = Logger.getInstance(config);

            logger.warn('Warning message');

            expect(consoleWarnSpy).toHaveBeenCalled();
        });

        it('should log error messages', () => {
            const config: LoggingConfig = { level: 'error', console: true };
            const logger = Logger.getInstance(config);

            logger.error('Error message');

            expect(consoleErrorSpy).toHaveBeenCalled();
        });

        it('should not log debug when level is info', () => {
            const config: LoggingConfig = { level: 'info', console: true };
            const logger = Logger.getInstance(config);

            logger.debug('Debug message');

            expect(consoleLogSpy).not.toHaveBeenCalled();
        });

        it('should not log info when level is warn', () => {
            const config: LoggingConfig = { level: 'warn', console: true };
            const logger = Logger.getInstance(config);

            logger.info('Info message');

            expect(consoleLogSpy).not.toHaveBeenCalled();
        });

        it('should not log warn when level is error', () => {
            const config: LoggingConfig = { level: 'error', console: true };
            const logger = Logger.getInstance(config);

            logger.warn('Warning message');

            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });
    });

    describe('console option', () => {
        it('should not log to console when console is false', () => {
            const config: LoggingConfig = { level: 'info', console: false };
            const logger = Logger.getInstance(config);

            logger.info('Info message');
            logger.error('Error message');
            logger.warn('Warning message');

            expect(consoleLogSpy).not.toHaveBeenCalled();
            expect(consoleErrorSpy).not.toHaveBeenCalled();
            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });
    });

    describe('with context data', () => {
        it('should accept context parameters', () => {
            const config: LoggingConfig = { level: 'info', console: true };
            const logger = Logger.getInstance(config);

            // Should not throw
            expect(() => {
                logger.info('Test message', { userId: 123, action: 'test' });
            }).not.toThrow();

            expect(consoleLogSpy).toHaveBeenCalled();
        });
    });

    describe('updateConfig', () => {
        it('should update log level dynamically', () => {
            const config: LoggingConfig = { level: 'info', console: true };
            const logger = Logger.getInstance(config);

            // Debug should not log with info level
            logger.debug('Debug message');
            expect(consoleLogSpy).not.toHaveBeenCalled();

            // Update to debug level
            logger.updateConfig({ level: 'debug', console: true });

            // Now debug should log
            logger.debug('Debug message after update');
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('[DEBUG] Debug message after update')
            );
        });

        it('should update console setting dynamically', () => {
            const config: LoggingConfig = { level: 'info', console: true };
            const logger = Logger.getInstance(config);

            logger.info('Message 1');
            expect(consoleLogSpy).toHaveBeenCalled();

            consoleLogSpy.mockClear();

            // Disable console logging
            logger.updateConfig({ level: 'info', console: false });

            logger.info('Message 2');
            expect(consoleLogSpy).not.toHaveBeenCalled();
        });
    });
});
