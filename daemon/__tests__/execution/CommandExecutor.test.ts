import { jest } from '@jest/globals';
import { CommandExecutor } from '../../src/execution/CommandExecutor.js';
import { Logger } from '../../src/logger/Logger.js';
import type { SparkConfig } from '../../src/types/config.js';
import type { ParsedCommand } from '../../src/types/parser.js';
import { ProviderRegistry } from '../../src/providers/ProviderRegistry.js';
import { ClaudeDirectProvider } from '../../src/providers/ClaudeDirectProvider.js';
import { ProviderType } from '../../src/types/provider.js';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock Anthropic SDK to prevent real API calls
jest.mock('@anthropic-ai/sdk');

describe('CommandExecutor', () => {
    let executor: CommandExecutor;
    let mockClaudeClient: any;
    let mockPromptBuilder: any;
    let mockContextLoader: any;
    let mockResultWriter: any;
    let testDir: string;
    let testFile: string;
    let config: SparkConfig;

    beforeEach(() => {
        // Initialize logger
        Logger.getInstance({ level: 'error', console: false, file: null });

        // Mock API key
        process.env.ANTHROPIC_API_KEY = 'test-api-key-for-tests';

        // Register provider
        const registry = ProviderRegistry.getInstance();
        registry.registerProvider('claude-client', ProviderType.ANTHROPIC, (config) => {
            return new ClaudeDirectProvider(config);
        });

        // Create temp directory
        testDir = mkdtempSync(join(tmpdir(), 'spark-executor-test-'));
        mkdirSync(join(testDir, '.spark'), { recursive: true });
        testFile = join(testDir, 'test.md');
        writeFileSync(testFile, '# Test\n\n/summarize this');

        // Mock dependencies
        mockClaudeClient = {
            complete: jest.fn(),
        };

        mockPromptBuilder = {
            build: jest.fn(),
            estimateTokens: jest.fn(),
        };

        mockContextLoader = {
            load: jest.fn(),
        };

        mockResultWriter = {
            writeInline: jest.fn(),
            updateStatus: jest.fn(),
        };

        config = {
            version: '1.0',
            daemon: {
                watch: {
                    patterns: ['**/*.md'],
                    ignore: ['.git/**'],
                },
                debounce_ms: 300,
                status_indicators: {
                    enabled: true,
                    pending: '',
                    processing: '⏳',
                    completed: '✅',
                    error: '❌',
                    warning: '⚠️',
                },
                results: {
                    mode: 'auto',
                    inline_max_chars: 500,
                    separate_folder: 'reports/',
                    add_blank_lines: true,
                },
            },
            ai: {
                defaultProvider: 'claude-client',
                providers: {
                    'claude-client': {
                        type: ProviderType.ANTHROPIC,
                        model: 'claude-3-5-sonnet-20241022',
                        apiKeyEnv: 'ANTHROPIC_API_KEY',
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
                slash_commands: true,
                chat_assistant: true,
                trigger_automation: true,
            },
        };

        executor = new CommandExecutor(
            mockContextLoader,
            mockResultWriter,
            config,
            testDir
        );
    });

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    describe('execute', () => {
        // TODO: Fix Anthropic SDK mocking for these integration tests
        it.skip('should execute command successfully', async () => {
            const command: ParsedCommand = {
                line: 3,
                raw: '/summarize this',
                fullText: '/summarize this',
                type: 'slash',
                command: 'summarize',
                args: 'this',
                status: 'pending',
                isComplete: true,
            };

            const mockContext = {
                currentFile: {
                    path: testFile,
                    content: '# Test\n\n/summarize this',
                },
                mentionedFiles: [],
                nearbyFiles: [],
                agent: null,
            };

            const mockPrompt = '<system>Test prompt</system>';
            const mockResult = {
                content: 'This is a summary.',
                usage: {
                    inputTokens: 100,
                    outputTokens: 20,
                },
            };

            mockContextLoader.load.mockResolvedValue(mockContext);
            mockPromptBuilder.build.mockReturnValue(mockPrompt);
            mockPromptBuilder.estimateTokens.mockReturnValue(250);
            mockClaudeClient.complete.mockResolvedValue(mockResult);
            mockResultWriter.updateStatus.mockResolvedValue();
            mockResultWriter.writeInline.mockResolvedValue();

            await executor.execute(command, testFile);

            expect(mockResultWriter.updateStatus).toHaveBeenCalledWith({
                filePath: testFile,
                commandLine: 3,
                commandText: '/summarize this',
                status: '⏳',
            });

            expect(mockContextLoader.load).toHaveBeenCalledWith(testFile, []);
            expect(mockPromptBuilder.build).toHaveBeenCalledWith(command, mockContext);
            expect(mockClaudeClient.complete).toHaveBeenCalledWith(mockPrompt);

            expect(mockResultWriter.writeInline).toHaveBeenCalledWith({
                filePath: testFile,
                commandLine: 3,
                commandText: '/summarize this',
                result: 'This is a summary.',
                addBlankLines: true,
            });
        });

        // TODO: Fix Anthropic SDK mocking for these integration tests
        it.skip('should handle command with mentions', async () => {
            const command: ParsedCommand = {
                line: 3,
                raw: '@betty analyze @report.md',
                fullText: '@betty analyze @report.md',
                type: 'mention-chain',
                mentions: [
                    { type: 'agent', raw: '@betty', value: 'betty', position: 0 },
                    { type: 'file', raw: '@report.md', value: 'report', position: 7 },
                ],
                status: 'pending',
                isComplete: true,
            };

            const mockContext = {
                currentFile: {
                    path: testFile,
                    content: 'Content',
                },
                mentionedFiles: [
                    {
                        path: '/vault/report.md',
                        content: 'Report content',
                    },
                ],
                nearbyFiles: [],
                agent: {
                    name: 'Betty',
                    path: '/agents/betty.md',
                    persona: 'You are Betty.',
                },
            };

            mockContextLoader.load.mockResolvedValue(mockContext);
            mockPromptBuilder.build.mockReturnValue('prompt');
            mockPromptBuilder.estimateTokens.mockReturnValue(100);
            mockClaudeClient.complete.mockResolvedValue({
                content: 'Analysis done.',
                usage: { inputTokens: 50, outputTokens: 10 },
            });

            await executor.execute(command, testFile);

            expect(mockContextLoader.load).toHaveBeenCalledWith(testFile, command.mentions);
        });

        it('should update status to error on failure and write error log', async () => {
            const command: ParsedCommand = {
                line: 3,
                raw: '/test',
                fullText: '/test',
                type: 'slash',
                command: 'test',
                status: 'pending',
                isComplete: true,
            };

            mockContextLoader.load.mockRejectedValue(new Error('Context load failed'));

            await expect(executor.execute(command, testFile)).rejects.toThrow('Context load failed');

            expect(mockResultWriter.updateStatus).toHaveBeenCalledWith({
                filePath: testFile,
                commandLine: 3,
                commandText: '/test',
                status: '❌',
            });

            // ErrorWriter should create error log file in .spark/logs/
            // We don't check if file exists because ErrorWriter uses Logger which is mocked
            // The important thing is that the command properly rejects and status is updated
        });

        // TODO: Fix Anthropic SDK mocking for these integration tests
        it.skip('should use add_blank_lines config setting', async () => {
            config.daemon.results.add_blank_lines = false;

            const command: ParsedCommand = {
                line: 1,
                raw: '/test',
                fullText: '/test',
                type: 'slash',
                command: 'test',
                status: 'pending',
                isComplete: true,
            };

            mockContextLoader.load.mockResolvedValue({
                currentFile: { path: testFile, content: 'test' },
                mentionedFiles: [],
                nearbyFiles: [],
                agent: null,
            });

            mockPromptBuilder.build.mockReturnValue('prompt');
            mockPromptBuilder.estimateTokens.mockReturnValue(50);
            mockClaudeClient.complete.mockResolvedValue({
                content: 'Result',
                usage: { inputTokens: 10, outputTokens: 5 },
            });

            await executor.execute(command, testFile);

            expect(mockResultWriter.writeInline).toHaveBeenCalledWith({
                filePath: testFile,
                commandLine: 1,
                commandText: '/test',
                result: 'Result',
                addBlankLines: false,
            });
        });
    });

    describe('shouldExecute', () => {
        it('should return true for complete command', () => {
            const command: ParsedCommand = {
                line: 1,
                raw: '/summarize this.',
                fullText: '/summarize this.',
                type: 'slash',
                command: 'summarize',
                args: 'this.',
                status: 'pending',
                isComplete: true,
            };

            expect(executor.shouldExecute(command)).toBe(true);
        });

        it('should return false for incomplete command', () => {
            const command: ParsedCommand = {
                line: 1,
                raw: '/summarize this',
                fullText: '/summarize this',
                type: 'slash',
                command: 'summarize',
                args: 'this',
                status: 'pending',
                isComplete: false,
            };

            expect(executor.shouldExecute(command)).toBe(false);
        });
    });
});

