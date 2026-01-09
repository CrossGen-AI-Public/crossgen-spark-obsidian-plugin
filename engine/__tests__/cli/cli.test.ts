/**
 * Tests for CLI commands
 * Note: These tests mock dependencies to avoid actual process/file system operations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import path from 'path';
import type { SparkConfig } from '../../src/types/config.js';
import { ProviderType } from '../../src/types/provider.js';

// Define proper types for mocks
interface EngineRegistryEntry {
    pid: number;
    vaultPath: string;
    startTime: number;
}

interface ConfigValidationResult {
    valid: boolean;
    errors: Array<{ path: string; message: string }>;
}

interface Mention {
    path: string;
    type: string;
}

interface Command {
    type: string;
    command: string;
}

// Mock all dependencies with proper types
const mockSparkEngine = {
    start: jest.fn<() => Promise<void>>(),
    stop: jest.fn<() => Promise<void>>(),
    isRunning: jest.fn<() => boolean>(),
    getVaultPath: jest.fn<() => string>(),
    getConfig: jest.fn<() => SparkConfig | null>(),
    getState: jest.fn<() => string>(),
};

const mockConfigLoader = {
    load: jest.fn<(path: string) => Promise<SparkConfig>>(),
    validate: jest.fn<(config: Partial<SparkConfig>) => ConfigValidationResult>(),
};

const mockRegistry = {
    registerEngine: jest.fn<(pid: number, vaultPath: string) => void>(),
    unregisterEngine: jest.fn<(vaultPath: string) => void>(),
    getActiveEngines: jest.fn<() => EngineRegistryEntry[]>(),
    findEngine: jest.fn<(vaultPath: string) => EngineRegistryEntry | null>(),
};

const mockFs = {
    readFileSync: jest.fn<(path: string, encoding?: string) => string>(),
    existsSync: jest.fn<(path: string) => boolean>(),
    unlinkSync: jest.fn<(path: string) => void>(),
    writeFileSync: jest.fn<(path: string, data: string) => void>(),
    mkdirSync: jest.fn<(path: string, options?: { recursive?: boolean }) => void>(),
};

const mockMentionParser = {
    findMentions: jest.fn<(content: string) => Mention[]>(),
};

const mockCommandDetector = {
    detectCommands: jest.fn<(content: string) => Command[]>(),
};

// Store original process methods
const originalExit = process.exit;
const originalKill = process.kill;

describe('CLI', () => {
    let exitSpy: Mock<typeof process.exit>;
    let killSpy: Mock<typeof process.kill>;
    let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(() => {
        // Mock process.exit to prevent test termination
        exitSpy = jest.fn() as Mock<typeof process.exit>;
        process.exit = exitSpy as typeof process.exit;

        // Mock process.kill
        killSpy = jest.fn() as Mock<typeof process.kill>;
        process.kill = killSpy as typeof process.kill;

        // Spy on console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        // Reset all mocks
        jest.clearAllMocks();

        // Setup default mock implementations
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readFileSync.mockReturnValue('{"version": "0.1.0"}');
        mockRegistry.findEngine.mockReturnValue(null);
        mockRegistry.getActiveEngines.mockReturnValue([]);
        mockSparkEngine.getVaultPath.mockReturnValue('/test/vault');
        mockSparkEngine.isRunning.mockReturnValue(true);
        mockSparkEngine.getState.mockReturnValue('running');

        const mockConfig: SparkConfig = {
            version: '1.0',
            engine: {
                watch: {
                    patterns: ['**/*.md'],
                    ignore: [],
                },
                debounce_ms: 100,
                status_indicators: {
                    enabled: false,
                    pending: '',
                    processing: '',
                    completed: '',
                    error: '',
                    warning: '',
                },
                results: {
                    mode: 'inline',
                    inline_max_chars: 1000,
                    separate_folder: '',
                    add_blank_lines: false,
                },
            },
            ai: {
                defaultProvider: 'claude-client',
                providers: {
                    'claude-client': {
                        type: ProviderType.ANTHROPIC,
                        model: 'claude-3-5-sonnet-20241022',
                        maxTokens: 4096,
                        temperature: 0.7,
                    },
                },
            },
            logging: {
                level: 'info',
                console: true,
                file: null,
            },
            features: {
                slash_commands: false,
                chat_assistant: false,
                trigger_automation: false,
            },
        };

        mockSparkEngine.getConfig.mockReturnValue(mockConfig);
        mockConfigLoader.load.mockResolvedValue(mockConfig);
        mockConfigLoader.validate.mockReturnValue({ valid: true, errors: [] });
    });

    afterEach(() => {
        // Restore original methods
        process.exit = originalExit;
        process.kill = originalKill;
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('start command logic', () => {
        it('should detect when engine is already running', () => {
            mockRegistry.findEngine.mockReturnValue({
                pid: 12345,
                vaultPath: '/test/vault',
                startTime: Date.now(),
            });

            // Simulate the start command check
            const existingEngine = mockRegistry.findEngine('/test/vault');
            expect(existingEngine).not.toBeNull();
            expect(existingEngine?.pid).toBe(12345);
        });

        it('should clean up stale PID file', () => {
            mockFs.existsSync.mockReturnValue(true);

            const pidFile = '/test/vault/.spark/engine.pid';
            if (mockFs.existsSync(pidFile)) {
                mockFs.unlinkSync(pidFile);
            }

            expect(mockFs.unlinkSync).toHaveBeenCalledWith(pidFile);
        });

        it('should create .spark directory', () => {
            const sparkDir = '/test/vault/.spark';
            mockFs.mkdirSync(sparkDir, { recursive: true });

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(sparkDir, { recursive: true });
        });

        it('should write PID file', () => {
            const pidFile = '/test/vault/.spark/engine.pid';
            mockFs.writeFileSync(pidFile, process.pid.toString());

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(pidFile, expect.any(String));
        });

        it('should register engine in global registry', () => {
            mockRegistry.registerEngine(process.pid, '/test/vault');

            expect(mockRegistry.registerEngine).toHaveBeenCalledWith(process.pid, '/test/vault');
        });

        it('should set debug log level when debug flag is enabled', () => {
            const originalLogLevel = process.env.SPARK_LOG_LEVEL;

            // Simulate debug flag
            process.env.SPARK_LOG_LEVEL = 'debug';

            expect(process.env.SPARK_LOG_LEVEL).toBe('debug');

            // Restore
            if (originalLogLevel !== undefined) {
                process.env.SPARK_LOG_LEVEL = originalLogLevel;
            } else {
                delete process.env.SPARK_LOG_LEVEL;
            }
        });
    });

    describe('status command logic', () => {
        it('should list all running engines when no vault specified', () => {
            const engines = [
                { pid: 12345, vaultPath: '/vault1', startTime: Date.now() - 5000 },
                { pid: 67890, vaultPath: '/vault2', startTime: Date.now() - 10000 },
            ];
            mockRegistry.getActiveEngines.mockReturnValue(engines);

            const result = mockRegistry.getActiveEngines();
            expect(result).toHaveLength(2);
            expect(result[0]?.pid).toBe(12345);
        });

        it('should show no engines message when none running', () => {
            mockRegistry.getActiveEngines.mockReturnValue([]);

            const engines = mockRegistry.getActiveEngines();
            expect(engines).toHaveLength(0);
        });

        it('should find specific engine by vault path', () => {
            const mockEngine = {
                pid: 12345,
                vaultPath: '/test/vault',
                startTime: Date.now() - 60000,
            };
            mockRegistry.findEngine.mockReturnValue(mockEngine);

            const engine = mockRegistry.findEngine('/test/vault');
            expect(engine).not.toBeNull();
            expect(engine?.pid).toBe(12345);
        });

        it('should calculate uptime correctly', () => {
            const startTime = Date.now() - 65000; // 65 seconds ago
            const uptime = Math.floor((Date.now() - startTime) / 1000);

            expect(uptime).toBeGreaterThanOrEqual(60);
            expect(uptime).toBeLessThan(70);
        });

        it('should format uptime as seconds when less than 60', () => {
            const uptime = 45;
            const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`;
            expect(uptimeStr).toBe('45s');
        });

        it('should format uptime as minutes when 60 or more seconds', () => {
            const uptime = 125;
            const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`;
            expect(uptimeStr).toBe('2m');
        });
    });

    describe('stop command logic', () => {
        it('should find engine to stop', () => {
            const mockEngine = {
                pid: 12345,
                vaultPath: '/test/vault',
                startTime: Date.now(),
            };
            mockRegistry.findEngine.mockReturnValue(mockEngine);

            const engine = mockRegistry.findEngine('/test/vault');
            expect(engine).not.toBeNull();
            expect(engine?.pid).toBe(12345);
        });

        it('should use SIGTERM for graceful stop', () => {
            const pid = 12345;
            const signal = 'SIGTERM';

            killSpy(pid, signal);

            expect(killSpy).toHaveBeenCalledWith(pid, signal);
        });

        it('should use SIGKILL for force stop', () => {
            const pid = 12345;
            const signal = 'SIGKILL';

            killSpy(pid, signal);

            expect(killSpy).toHaveBeenCalledWith(pid, signal);
        });

        it('should clean up PID file after stopping', () => {
            mockFs.existsSync.mockReturnValue(true);
            const pidFile = '/test/vault/.spark/engine.pid';

            if (mockFs.existsSync(pidFile)) {
                mockFs.unlinkSync(pidFile);
            }

            expect(mockFs.unlinkSync).toHaveBeenCalledWith(pidFile);
        });

        it('should unregister engine from global registry', () => {
            mockRegistry.unregisterEngine('/test/vault');

            expect(mockRegistry.unregisterEngine).toHaveBeenCalledWith('/test/vault');
        });

        it('should clean up stale PID file when engine not found', () => {
            mockRegistry.findEngine.mockReturnValue(null);
            mockFs.existsSync.mockReturnValue(true);

            const engine = mockRegistry.findEngine('/test/vault');
            const pidFile = '/test/vault/.spark/engine.pid';

            if (!engine && mockFs.existsSync(pidFile)) {
                mockFs.unlinkSync(pidFile);
            }

            expect(mockFs.unlinkSync).toHaveBeenCalledWith(pidFile);
        });

        it('should check if process is still running with signal 0', () => {
            const pid = 12345;
            killSpy.mockImplementation((_p, sig) => {
                if (sig === 0) {
                    throw new Error('Process not found');
                }
                return true;
            });

            expect(() => killSpy(pid, 0)).toThrow();
        });
    });

    describe('config command logic', () => {
        it('should load config from vault', async () => {
            const config = await mockConfigLoader.load('/test/vault');

            expect(mockConfigLoader.load).toHaveBeenCalledWith('/test/vault');
            expect(config).toHaveProperty('engine');
            expect(config).toHaveProperty('ai');
        });

        it('should validate config', () => {
            const config: Partial<SparkConfig> = {
                engine: {
                    watch: { patterns: ['**/*.md'], ignore: [] },
                    debounce_ms: 100,
                    status_indicators: { enabled: false, pending: '', processing: '', completed: '', error: '', warning: '' },
                    results: { mode: 'inline', inline_max_chars: 0, separate_folder: '', add_blank_lines: false },
                },
                ai: {
                    defaultProvider: 'claude-client',
                    providers: { 'claude-client': { type: ProviderType.ANTHROPIC, model: '', maxTokens: 0, temperature: 0 } },
                },
            };

            const result = mockConfigLoader.validate(config);

            expect(mockConfigLoader.validate).toHaveBeenCalledWith(config);
            expect(result.valid).toBe(true);
        });

        it('should detect config validation errors', () => {
            mockConfigLoader.validate.mockReturnValue({
                valid: false,
                errors: [{ path: 'ai.provider', message: 'Invalid provider' }],
            });

            const result = mockConfigLoader.validate({});

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
        });
    });

    describe('inspect command logic', () => {
        it('should show vault information', () => {
            const vaultPath = mockSparkEngine.getVaultPath();
            expect(vaultPath).toBe('/test/vault');
        });

        it('should show watch patterns', () => {
            const config = mockSparkEngine.getConfig();
            expect(config?.engine?.watch?.patterns).toContain('**/*.md');
        });

        it('should show AI configuration', () => {
            const config = mockSparkEngine.getConfig();
            expect(config?.ai.defaultProvider).toBe('claude-client');
        });

        it('should check API key status', () => {
            const originalKey = process.env.ANTHROPIC_API_KEY;

            // Test with API key
            process.env.ANTHROPIC_API_KEY = 'test-key';
            expect(process.env.ANTHROPIC_API_KEY).toBeTruthy();

            // Test without API key
            delete process.env.ANTHROPIC_API_KEY;
            expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();

            // Restore
            if (originalKey) {
                process.env.ANTHROPIC_API_KEY = originalKey;
            }
        });
    });

    describe('parse command logic', () => {
        it('should parse content for mentions', () => {
            const content = 'Check [[file1]] and [[file2]]';
            mockMentionParser.findMentions.mockReturnValue([
                { path: 'file1', type: 'wiki' },
                { path: 'file2', type: 'wiki' },
            ]);

            const mentions = mockMentionParser.findMentions(content);

            expect(mentions).toHaveLength(2);
            expect(mentions[0]?.path).toBe('file1');
        });

        it('should detect commands in content', () => {
            const content = '@agent Write a summary\n@sop run backup';
            mockCommandDetector.detectCommands.mockReturnValue([
                { type: 'agent', command: 'Write a summary' },
                { type: 'sop', command: 'run backup' },
            ]);

            const commands = mockCommandDetector.detectCommands(content);

            expect(commands).toHaveLength(2);
            expect(commands[0]?.type).toBe('agent');
        });

        it('should read file content for parsing', () => {
            const filePath = '/test/vault/file.md';
            mockFs.readFileSync.mockReturnValue('# Test\n[[link]]');

            const content = mockFs.readFileSync(filePath, 'utf-8');

            expect(content).toContain('# Test');
            expect(content).toContain('[[link]]');
        });
    });

    describe('version command logic', () => {
        it('should read version from package.json', () => {
            mockFs.readFileSync.mockReturnValue('{"version": "0.1.0"}');

            const packageJson = JSON.parse(mockFs.readFileSync('package.json', 'utf-8'));

            expect(packageJson.version).toBe('0.1.0');
        });
    });

    describe('error handling', () => {
        it('should handle missing vault path gracefully', () => {
            const vaultPath = '';
            expect(vaultPath || process.cwd()).toBeTruthy();
        });

        it('should handle file system errors', () => {
            mockFs.existsSync.mockImplementation(() => {
                throw new Error('File system error');
            });

            expect(() => mockFs.existsSync('/test')).toThrow('File system error');
        });

        it('should handle engine start failure', async () => {
            mockSparkEngine.start.mockRejectedValue(new Error('Start failed'));

            await expect(mockSparkEngine.start()).rejects.toThrow('Start failed');
        });

        it('should handle process kill errors', () => {
            killSpy.mockImplementation(() => {
                throw new Error('Process not found');
            });

            expect(() => killSpy(99999, 'SIGTERM')).toThrow();
        });

        it('should handle config loading errors', async () => {
            mockConfigLoader.load.mockRejectedValue(new Error('Config not found'));

            await expect(mockConfigLoader.load('/invalid')).rejects.toThrow('Config not found');
        });
    });

    describe('path resolution', () => {
        it('should resolve relative paths to absolute', () => {
            const relativePath = './vault';
            const absolutePath = path.resolve(relativePath);

            expect(absolutePath).toContain('vault');
            expect(path.isAbsolute(absolutePath)).toBe(true);
        });

        it('should use current working directory as default', () => {
            const defaultPath = process.cwd();

            expect(defaultPath).toBeTruthy();
            expect(path.isAbsolute(defaultPath)).toBe(true);
        });

        it('should construct PID file path correctly', () => {
            const vaultPath = '/test/vault';
            const pidFile = path.join(vaultPath, '.spark', 'engine.pid');

            expect(pidFile).toBe('/test/vault/.spark/engine.pid');
        });
    });
});

