import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ChatQueueHandler } from '../../src/chat/ChatQueueHandler.js';
import type { CommandExecutor } from '../../src/execution/CommandExecutor.js';
import type { MentionParser } from '../../src/parser/MentionParser.js';
import type { Logger } from '../../src/logger/Logger.js';
import { TestVault } from '../utils/TestVault.js';
import { join } from 'path';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';

describe('ChatQueueHandler', () => {
    let vault: TestVault;
    let handler: ChatQueueHandler;
    let mockExecutor: jest.Mocked<CommandExecutor>;
    let mockParser: jest.Mocked<MentionParser>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(async () => {
        vault = new TestVault();
        await vault.create();

        mockExecutor = {
            executeAndReturn: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;

        mockParser = {
            parse: jest.fn().mockReturnValue([
                { type: 'agent', value: 'test-agent', raw: '@test-agent', position: 0 },
            ]),
        } as unknown as jest.Mocked<MentionParser>;

        mockLogger = {
            debug: jest.fn(),
            error: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

        handler = new ChatQueueHandler(vault.path, mockExecutor, mockParser, mockLogger);
    });

    afterEach(async () => {
        await vault.cleanup();
    });

    describe('isChatQueueFile', () => {
        it('should identify chat queue files', () => {
            expect(handler.isChatQueueFile('.spark/chat-queue/test.md')).toBe(true);
        });

        it('should reject non-queue files', () => {
            expect(handler.isChatQueueFile('test.md')).toBe(false);
            expect(handler.isChatQueueFile('.spark/other/test.md')).toBe(false);
            expect(handler.isChatQueueFile('.spark/chat-queue/test.txt')).toBe(false);
        });
    });

    describe('process', () => {
        it('should process valid queue file', async () => {
            // Create queue file
            const queueDir = join(vault.path, '.spark', 'chat-queue');
            mkdirSync(queueDir, { recursive: true });

            const queueFile = join(queueDir, 'conv-123-456.md');
            const content = `---
conversation_id: conv-123
queue_id: conv-123-456
---

<!-- spark-chat-message -->
@test-agent help me
<!-- /spark-chat-message -->

<!-- spark-chat-context -->
Previous context here
<!-- /spark-chat-context -->
`;
            writeFileSync(queueFile, content);

            // Mock executor
            mockExecutor.executeAndReturn.mockResolvedValue('AI test response');

            // Process
            await handler.process('.spark/chat-queue/conv-123-456.md');

            // Verify parsing
            expect(mockParser.parse).toHaveBeenCalledWith('@test-agent help me');

            // Verify execution
            expect(mockExecutor.executeAndReturn).toHaveBeenCalled();
            const callArgs = mockExecutor.executeAndReturn.mock.calls[0];
            expect(callArgs).toBeDefined();
            const [command] = callArgs!;
            expect(command.raw).toContain('Previous context here');
            expect(command.raw).toContain('@test-agent help me');
            expect(command.type).toBe('mention-chain');
            expect(command.status).toBe('pending');

            // Verify result written
            const resultFile = join(vault.path, '.spark', 'chat-results', 'conv-123.jsonl');
            expect(existsSync(resultFile)).toBe(true);
            const result = JSON.parse(readFileSync(resultFile, 'utf-8'));
            expect(result.conversationId).toBe('conv-123');
            expect(result.queueId).toBe('conv-123-456');
            expect(result.agent).toBe('test-agent');
            expect(result.content).toBe('AI test response');

            // Verify queue file deleted
            expect(existsSync(queueFile)).toBe(false);
        });

        it('should process queue file without context', async () => {
            const queueDir = join(vault.path, '.spark', 'chat-queue');
            mkdirSync(queueDir, { recursive: true });

            const queueFile = join(queueDir, 'conv-123-789.md');
            const content = `---
conversation_id: conv-123
queue_id: conv-123-789
---

<!-- spark-chat-message -->
@test-agent hello
<!-- /spark-chat-message -->
`;
            writeFileSync(queueFile, content);

            mockExecutor.executeAndReturn.mockResolvedValue('Hello response');

            await handler.process('.spark/chat-queue/conv-123-789.md');

            expect(mockExecutor.executeAndReturn).toHaveBeenCalled();
            const callArgs = mockExecutor.executeAndReturn.mock.calls[0];
            expect(callArgs).toBeDefined();
            const [command] = callArgs!;
            expect(command.raw).toBe('@test-agent hello');
            expect(existsSync(queueFile)).toBe(false);
        });

        it('should handle missing frontmatter', async () => {
            const queueDir = join(vault.path, '.spark', 'chat-queue');
            mkdirSync(queueDir, { recursive: true });

            const queueFile = join(queueDir, 'invalid-123.md');
            writeFileSync(queueFile, 'No frontmatter here');

            await handler.process('.spark/chat-queue/invalid-123.md');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Chat queue processing failed',
                expect.objectContaining({
                    error: expect.stringContaining('missing frontmatter'),
                })
            );

            // Verify error result written
            const resultFile = join(vault.path, '.spark', 'chat-results', 'invalid.jsonl');
            expect(existsSync(resultFile)).toBe(true);
            const result = JSON.parse(readFileSync(resultFile, 'utf-8'));
            expect(result.error).toBeDefined();

            // Queue file should be cleaned up
            expect(existsSync(queueFile)).toBe(false);
        });

        it('should handle missing message', async () => {
            const queueDir = join(vault.path, '.spark', 'chat-queue');
            mkdirSync(queueDir, { recursive: true });

            const queueFile = join(queueDir, 'conv-456-123.md');
            const content = `---
conversation_id: conv-456
queue_id: conv-456-123
---

No message markers here
`;
            writeFileSync(queueFile, content);

            await handler.process('.spark/chat-queue/conv-456-123.md');

            expect(mockLogger.error).toHaveBeenCalled();
            expect(existsSync(queueFile)).toBe(false);

            // Should now correctly extract conv-456 from frontmatter
            const resultFile = join(vault.path, '.spark', 'chat-results', 'conv-456.jsonl');
            expect(existsSync(resultFile)).toBe(true);
        });

        it('should extract agent name from mentions', async () => {
            const queueDir = join(vault.path, '.spark', 'chat-queue');
            mkdirSync(queueDir, { recursive: true });

            const queueFile = join(queueDir, 'conv-789-123.md');
            const content = `---
conversation_id: conv-789
queue_id: conv-789-123
---

<!-- spark-chat-message -->
@custom-agent test
<!-- /spark-chat-message -->
`;
            writeFileSync(queueFile, content);

            mockParser.parse.mockReturnValue([
                {
                    type: 'agent',
                    value: 'custom-agent',
                    raw: '@custom-agent',
                    position: 0,
                },
            ]);
            mockExecutor.executeAndReturn.mockResolvedValue('Custom agent response');

            await handler.process('.spark/chat-queue/conv-789-123.md');

            const resultFile = join(vault.path, '.spark', 'chat-results', 'conv-789.jsonl');
            const result = JSON.parse(readFileSync(resultFile, 'utf-8'));
            expect(result.agent).toBe('custom-agent');
        });

        it('should default to Assistant if no agent mention', async () => {
            const queueDir = join(vault.path, '.spark', 'chat-queue');
            mkdirSync(queueDir, { recursive: true });

            const queueFile = join(queueDir, 'conv-999-123.md');
            const content = `---
conversation_id: conv-999
queue_id: conv-999-123
---

<!-- spark-chat-message -->
help me
<!-- /spark-chat-message -->
`;
            writeFileSync(queueFile, content);

            mockParser.parse.mockReturnValue([]);
            mockExecutor.executeAndReturn.mockResolvedValue('Default response');

            await handler.process('.spark/chat-queue/conv-999-123.md');

            const resultFile = join(vault.path, '.spark', 'chat-results', 'conv-999.jsonl');
            const result = JSON.parse(readFileSync(resultFile, 'utf-8'));
            expect(result.agent).toBe('Assistant');
        });

        it('should inject primaryAgent when no explicit agent mentioned', async () => {
            const queueDir = join(vault.path, '.spark', 'chat-queue');
            mkdirSync(queueDir, { recursive: true });

            const queueFile = join(queueDir, 'conv-888-123.md');
            const content = `---
conversation_id: conv-888
queue_id: conv-888-123
primary_agent: mykola
---

<!-- spark-chat-message -->
what's your name?
<!-- /spark-chat-message -->
`;
            writeFileSync(queueFile, content);

            // Parser returns no mentions from the user message
            mockParser.parse.mockReturnValue([]);
            mockExecutor.executeAndReturn.mockResolvedValue('I am Mykola');

            await handler.process('.spark/chat-queue/conv-888-123.md');

            // Verify primaryAgent was injected into mentions for routing
            expect(mockExecutor.executeAndReturn).toHaveBeenCalled();
            const callArgs = mockExecutor.executeAndReturn.mock.calls[0];
            expect(callArgs).toBeDefined();
            const [command] = callArgs!;
            expect(command.mentions).toBeDefined();
            expect(command.mentions).toHaveLength(1);
            expect(command.mentions![0]).toEqual({
                type: 'agent',
                value: 'mykola',
                raw: '@mykola',
                position: 0,
            });

            // Verify result uses primaryAgent
            const resultFile = join(vault.path, '.spark', 'chat-results', 'conv-888.jsonl');
            const result = JSON.parse(readFileSync(resultFile, 'utf-8'));
            expect(result.agent).toBe('mykola');
        });

        it('should prioritize explicit agent mention over primaryAgent', async () => {
            const queueDir = join(vault.path, '.spark', 'chat-queue');
            mkdirSync(queueDir, { recursive: true });

            const queueFile = join(queueDir, 'conv-777-123.md');
            const content = `---
conversation_id: conv-777
queue_id: conv-777-123
primary_agent: mykola
---

<!-- spark-chat-message -->
@betty help me with finances
<!-- /spark-chat-message -->
`;
            writeFileSync(queueFile, content);

            // Parser returns the explicit @betty mention
            mockParser.parse.mockReturnValue([
                {
                    type: 'agent',
                    value: 'betty',
                    raw: '@betty',
                    position: 0,
                },
            ]);
            mockExecutor.executeAndReturn.mockResolvedValue('Financial advice from Betty');

            await handler.process('.spark/chat-queue/conv-777-123.md');

            // Verify mentions NOT modified (no injection, explicit mention present)
            expect(mockExecutor.executeAndReturn).toHaveBeenCalled();
            const callArgs = mockExecutor.executeAndReturn.mock.calls[0];
            expect(callArgs).toBeDefined();
            const [command] = callArgs!;
            expect(command.mentions).toBeDefined();
            expect(command.mentions).toHaveLength(1);
            expect(command.mentions?.[0]).toBeDefined();
            expect(command.mentions?.[0]?.value).toBe('betty');

            // Verify result uses explicit agent, not primaryAgent
            const resultFile = join(vault.path, '.spark', 'chat-results', 'conv-777.jsonl');
            const result = JSON.parse(readFileSync(resultFile, 'utf-8'));
            expect(result.agent).toBe('betty');
        });
    });
});

