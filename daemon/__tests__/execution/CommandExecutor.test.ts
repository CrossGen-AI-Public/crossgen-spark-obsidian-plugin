import { jest } from '@jest/globals';
import { CommandExecutor } from '../../src/execution/CommandExecutor.js';
import { Logger } from '../../src/logger/Logger.js';
import type { SparkConfig } from '../../src/types/config.js';
import type { ParsedCommand } from '../../src/types/parser.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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

        // Create temp directory
        testDir = mkdtempSync(join(tmpdir(), 'spark-executor-test-'));
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
                provider: 'claude',
                claude: {
                    model: 'claude-3-5-sonnet-20241022',
                    api_key_env: 'ANTHROPIC_API_KEY',
                    max_tokens: 4096,
                    temperature: 0.7,
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
            mockClaudeClient,
            mockPromptBuilder,
            mockContextLoader,
            mockResultWriter,
            config
        );
    });

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    describe('execute', () => {
        it('should execute command successfully', async () => {
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

        it('should handle command with mentions', async () => {
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

        it('should update status to error on failure', async () => {
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
        });

        it('should use add_blank_lines config setting', async () => {
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

