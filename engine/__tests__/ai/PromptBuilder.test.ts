import { PromptBuilder } from '../../src/ai/PromptBuilder.js';
import type { ParsedCommand } from '../../src/types/parser.js';
import type { LoadedContext } from '../../src/types/context.js';

describe('PromptBuilder', () => {
    let promptBuilder: PromptBuilder;

    beforeEach(() => {
        promptBuilder = new PromptBuilder();
    });

    describe('build', () => {
        it('should build prompt with system instructions', () => {
            const command: ParsedCommand = {
                line: 1,
                raw: '/summarize this text',
                type: 'slash',
                command: 'summarize',
                args: 'this text',
                status: 'pending',
                isComplete: true,
            };

            const context: LoadedContext = {
                currentFile: {
                    path: '/test/file.md',
                    content: '# Test\nSome content',
                },
                mentionedFiles: [],
                nearbyFiles: [],
                agent: undefined,
                serviceConnections: [],
            };

            const prompt = promptBuilder.build(command, context);

            expect(prompt).toContain('<system>');
            expect(prompt).toContain('When referencing files and folders in your response');
            expect(prompt).toContain('@filename');
            expect(prompt).toContain('@folder/');
        });

        it('should include agent persona when provided', () => {
            const command: ParsedCommand = {
                line: 1,
                raw: '@betty analyze this',
                type: 'mention-chain',
                mentions: [{ type: 'agent', raw: '@betty', value: 'betty', position: 0 }],
                status: 'pending',
                isComplete: true,
            };

            const context: LoadedContext = {
                currentFile: {
                    path: '/test/file.md',
                    content: '# Test\nSome content',
                },
                mentionedFiles: [],
                nearbyFiles: [],
                agent: {
                    path: '/agents/betty.md',
                    persona: 'You are Betty, a senior accountant.',
                },
                serviceConnections: [],
            };

            const prompt = promptBuilder.build(command, context);

            expect(prompt).toContain('<agent_persona>');
            expect(prompt).toContain('You are Betty, a senior accountant.');
            expect(prompt).toContain('</agent_persona>');
        });

        it('should include instructions from command', () => {
            const command: ParsedCommand = {
                line: 1,
                raw: '/summarize this document',
                type: 'slash',
                command: 'summarize',
                args: 'this document',
                status: 'pending',
                isComplete: true,
            };

            const context: LoadedContext = {
                currentFile: {
                    path: '/test/file.md',
                    content: 'Content',
                },
                mentionedFiles: [],
                nearbyFiles: [],
                agent: undefined,
                serviceConnections: [],
            };

            const prompt = promptBuilder.build(command, context);

            expect(prompt).toContain('<instructions>');
            expect(prompt).toContain('/summarize this document');
            expect(prompt).toContain('</instructions>');
        });

        it('should include high priority mentioned files', () => {
            const command: ParsedCommand = {
                line: 1,
                raw: '@file1 summarize',
                type: 'mention-chain',
                mentions: [{ type: 'file', raw: '@file1', value: 'file1', position: 0 }],
                status: 'pending',
                isComplete: true,
            };

            const context: LoadedContext = {
                currentFile: {
                    path: '/test/current.md',
                    content: 'Current content',
                },
                mentionedFiles: [
                    {
                        path: '/test/file1.md',
                        content: 'File 1 content',
                        priority: 10,
                    },
                ],
                nearbyFiles: [],
                agent: undefined,
                serviceConnections: [],
            };

            const prompt = promptBuilder.build(command, context);

            expect(prompt).toContain('<context priority="high">');
            expect(prompt).toContain('/test/file1.md');
            expect(prompt).toContain('File 1 content');
        });

        it('should include medium priority current file', () => {
            const command: ParsedCommand = {
                line: 1,
                raw: '/summarize',
                type: 'slash',
                command: 'summarize',
                status: 'pending',
                isComplete: true,
            };

            const context: LoadedContext = {
                currentFile: {
                    path: '/test/current.md',
                    content: 'Current file content',
                },
                mentionedFiles: [],
                nearbyFiles: [],
                agent: undefined,
                serviceConnections: [],
            };

            const prompt = promptBuilder.build(command, context);

            expect(prompt).toContain('<context priority="medium">');
            expect(prompt).toContain('Command was typed here');
            expect(prompt).toContain('/test/current.md');
            expect(prompt).toContain('Current file content');
        });

        it('should include low priority nearby files', () => {
            const command: ParsedCommand = {
                line: 1,
                raw: '/summarize',
                type: 'slash',
                command: 'summarize',
                status: 'pending',
                isComplete: true,
            };

            const context: LoadedContext = {
                currentFile: {
                    path: '/test/current.md',
                    content: 'Current',
                },
                mentionedFiles: [],
                nearbyFiles: [
                    {
                        path: '/test/nearby.md',
                        summary: 'Summary of nearby file',
                        distance: 1,
                    },
                ],
                agent: undefined,
                serviceConnections: [],
            };

            const prompt = promptBuilder.build(command, context);

            expect(prompt).toContain('<context priority="low">');
            expect(prompt).toContain('/test/nearby.md');
            expect(prompt).toContain('distance="1"');
            expect(prompt).toContain('Summary of nearby file');
        });

        it('should end with execution instruction', () => {
            const command: ParsedCommand = {
                line: 1,
                raw: '/test',
                type: 'slash',
                command: 'test',
                status: 'pending',
                isComplete: true,
            };

            const context: LoadedContext = {
                currentFile: {
                    path: '/test/file.md',
                    content: 'Content',
                },
                mentionedFiles: [],
                nearbyFiles: [],
                agent: undefined,
                serviceConnections: [],
            };

            const prompt = promptBuilder.build(command, context);

            expect(prompt).toContain('Please execute the instructions above.');
        });
    });

    describe('estimateTokens', () => {
        it('should estimate tokens as 1/4 of character count', () => {
            const text = 'This is a test string with some content';
            const estimate = promptBuilder.estimateTokens(text);

            expect(estimate).toBe(Math.ceil(text.length / 4));
        });

        it('should round up token estimate', () => {
            const text = 'abc'; // 3 characters, should round up to 1
            const estimate = promptBuilder.estimateTokens(text);

            expect(estimate).toBe(1);
        });

        it('should handle empty string', () => {
            const estimate = promptBuilder.estimateTokens('');
            expect(estimate).toBe(0);
        });

        it('should handle long text', () => {
            const text = 'a'.repeat(1000);
            const estimate = promptBuilder.estimateTokens(text);

            expect(estimate).toBe(250); // 1000 / 4
        });
    });
});

