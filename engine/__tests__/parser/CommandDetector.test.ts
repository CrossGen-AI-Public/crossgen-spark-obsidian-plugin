import { CommandDetector } from '../../src/parser/CommandDetector.js';

describe('CommandDetector', () => {
    let detector: CommandDetector;

    beforeEach(() => {
        detector = new CommandDetector();
    });

    describe('Pending Commands', () => {
        it('should detect pending slash command', () => {
            const content = '/summarize this document';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]).toMatchObject({
                status: 'pending',
                raw: '/summarize this document',
                line: 1,
            });
        });

        it('should detect multiple pending commands', () => {
            const content = '/summarize first\n\n/analyze second';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(2);
            expect(commands[0]!.raw).toContain('summarize');
            expect(commands[1]!.raw).toContain('analyze');
        });
    });

    describe('Completed Commands', () => {
        it('should detect ✅ completed command', () => {
            const content = '✅ /summarize this document';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]).toMatchObject({
                status: 'completed',
                statusEmoji: '✅',
            });
        });

        it('should detect ✓ completed command', () => {
            const content = '✓ /review this document';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]).toMatchObject({
                status: 'completed',
                statusEmoji: '✓',
            });
        });

        it('should detect [x] completed command', () => {
            const content = '[x] /summarize document';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]).toMatchObject({
                status: 'completed',
                statusEmoji: '[x]',
            });
        });
    });

    describe('Failed Commands', () => {
        it('should detect ❌ failed command', () => {
            const content = '❌ /summarize this document';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]).toMatchObject({
                status: 'failed',
                statusEmoji: '❌',
            });
        });

        it('should detect ✗ failed command', () => {
            const content = '✗ /analyze this data';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]).toMatchObject({
                status: 'failed',
                statusEmoji: '✗',
            });
        });
    });

    describe('In-Progress Commands', () => {
        it('should detect ⏳ in-progress command', () => {
            const content = '⏳ /summarize this document';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]).toMatchObject({
                status: 'in_progress',
                statusEmoji: '⏳',
            });
        });

        it('should detect 🔄 in-progress command', () => {
            const content = '🔄 /analyze this data';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]).toMatchObject({
                status: 'in_progress',
                statusEmoji: '🔄',
            });
        });
    });

    describe('Line Numbers', () => {
        it('should track correct line numbers', () => {
            const content = 'line 1\nline 2\n/command on line 3\nline 4';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.line).toBe(3);
        });

        it('should track line numbers for multiple commands', () => {
            const content = '/first on line 1\n\n\n/second on line 4';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(2);
            expect(commands[0]!.line).toBe(1);
            expect(commands[1]!.line).toBe(4);
        });
    });

    describe('Mention Chain Extraction', () => {
        it('should extract mentions from slash command', () => {
            const content = '/summarize @report.md for @betty';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.mentions).toHaveLength(3); // command, file, agent
            expect(commands[0]!.mentions![0]!.type).toBe('command');
            expect(commands[0]!.mentions![1]!.type).toBe('file');
            expect(commands[0]!.mentions![2]!.type).toBe('agent');
        });

        it('should extract mentions from agent chain', () => {
            const content = '@betty /analyze @finance/ using $quickbooks';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.mentions).toHaveLength(4); // agent, command, folder, service
        });
    });

    describe('Code Block Exclusion', () => {
        it('should skip commands in fenced code blocks', () => {
            const content = '```\n/summarize this\n```';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(0);
        });

        it('should detect commands outside code blocks', () => {
            const content = '/before\n```\n/inside\n```\n/after';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(2);
            expect(commands[0]!.raw).toContain('before');
            expect(commands[1]!.raw).toContain('after');
        });

        it('should handle multiple code blocks', () => {
            const content = '```\n/skip1\n```\n/keep\n```\n/skip2\n```';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.raw).toContain('keep');
        });
    });

    describe('Command Text Extraction', () => {
        it('should extract full line for slash command', () => {
            const content = '/summarize this entire line of text';
            const commands = detector.detectInFile(content);

            expect(commands[0]!.raw).toBe('/summarize this entire line of text');
        });

        it('should handle command at end of file', () => {
            const content = 'content\n/command';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.raw).toBe('/command');
        });
    });

    describe('Edge Cases', () => {
        it('should return empty array for no commands', () => {
            const content = 'Just regular text here';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(0);
        });

        it('should handle empty file', () => {
            const content = '';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(0);
        });

        it('should handle whitespace-only file', () => {
            const content = '   \n  \n   ';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(0);
        });

        it('should not detect @ in email addresses', () => {
            const content = 'Contact me at user@example.com';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(0);
        });

        it('should handle commands with emoji status and whitespace', () => {
            const content = '  ✅  /summarize   ';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.status).toBe('completed');
        });
    });

    describe('Realistic Examples', () => {
        it('should detect command in task list', () => {
            const content = `
## Tasks
- [x] Review Q4 report
- [ ] /summarize @finance/Q4/
- [ ] Send to team
      `.trim();

            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.status).toBe('pending');
        });

        it('should detect multiple commands in document', () => {
            const content = `
# Meeting Notes

@betty please /summarize key points

## Action Items
✅ /analyze @sales/report.md
⏳ @charlie review @legal/contracts/
❌ /send-email failed due to auth

## Next Steps
/create-plan for @projects/2024/
      `.trim();

            const commands = detector.detectInFile(content);

            expect(commands.length).toBeGreaterThan(0);

            const statuses = commands.map(c => c.status);
            expect(statuses).toContain('pending');
            expect(statuses).toContain('completed');
            // Note: in_progress and failed tests now use slash commands only
            expect(statuses).toContain('failed');
        });
    });

    describe('Inline Chat Marker Skipping', () => {
        it('should skip commands inside inline chat markers', () => {
            const content = `# Document

<!-- spark-inline-chat:pending:abc-123 -->
/summarize this should be ignored
<!-- /spark-inline-chat -->

/analyze this should be detected`;

            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.raw).toContain('/analyze');
            expect(commands[0]!.raw).not.toContain('/summarize');
        });

        it('should skip agent mentions inside inline chat markers', () => {
            const content = `# Document

<!-- spark-inline-chat:complete:def-456 -->
AI: Here's the answer about @betty
<!-- /spark-inline-chat -->

/command outside`;

            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.command).toBe('command');
        });

        it('should handle multiple inline chat markers', () => {
            const content = `# Document

/command1

<!-- spark-inline-chat:pending:abc-123 -->
User: /ignored1
<!-- /spark-inline-chat -->

/command2

<!-- spark-inline-chat:complete:def-456 -->
AI: Response with /ignored2
<!-- /spark-inline-chat -->

/command3`;

            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(3);
            expect(commands[0]!.command).toBe('command1');
            expect(commands[1]!.command).toBe('command2');
            expect(commands[2]!.command).toBe('command3');
        });

        it('should handle inline chat with processing status', () => {
            const content = `<!-- spark-inline-chat:processing:xyz-789 -->
User: /this should be ignored
<!-- /spark-inline-chat -->

/analyze`;

            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.command).toBe('analyze');
        });

        it('should handle inline chat with error status', () => {
            const content = `/command1

<!-- spark-inline-chat:error:err-123 -->
User: Failed request /ignored
<!-- /spark-inline-chat -->

/command2`;

            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(2);
            expect(commands[0]!.command).toBe('command1');
            expect(commands[1]!.command).toBe('command2');
        });

        it('should detect commands between inline chat markers', () => {
            const content = `<!-- spark-inline-chat:complete:first-123 -->
AI: First response
<!-- /spark-inline-chat -->

/analyze

<!-- spark-inline-chat:complete:second-456 -->
AI: Second response
<!-- /spark-inline-chat -->`;

            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.command).toBe('analyze');
        });

        it('should handle inline chat at start of file', () => {
            const content = `<!-- spark-inline-chat:complete:start-123 -->
AI: /ignored
<!-- /spark-inline-chat -->

/summarize`;

            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.command).toBe('summarize');
        });

        it('should handle inline chat at end of file', () => {
            const content = `/analyze

<!-- spark-inline-chat:pending:end-123 -->
User: /ignored
<!-- /spark-inline-chat -->`;

            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.command).toBe('analyze');
        });

        it('should handle nested-looking markers correctly', () => {
            const content = `<!-- spark-inline-chat:complete:outer-123 -->
AI: Here's info about <!-- spark-result-start --> markers
<!-- /spark-inline-chat -->

/command`;

            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]!.command).toBe('command');
        });

        it('should not be confused by inline chat markers in code blocks', () => {
            const content = `\`\`\`markdown
<!-- spark-inline-chat:pending:fake-123 -->
This is just example text
<!-- /spark-inline-chat -->
\`\`\`

/summarize`;

            const commands = detector.detectInFile(content);

            // The detector will still skip the fake markers as it doesn't parse markdown
            // This is expected behavior - it's safer to skip than accidentally process
            expect(commands).toHaveLength(1);
            expect(commands[0]!.command).toBe('summarize');
        });
    });
});

