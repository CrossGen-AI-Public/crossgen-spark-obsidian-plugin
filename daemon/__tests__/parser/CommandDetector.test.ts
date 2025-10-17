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
                fullText: '/summarize this document',
                line: 1,
            });
        });

        it('should detect pending mention chain', () => {
            const content = '@betty review @report.md';
            const commands = detector.detectInFile(content);

            expect(commands).toHaveLength(1);
            expect(commands[0]).toMatchObject({
                status: 'pending',
                fullText: '@betty review @report.md',
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
            const content = '✓ @betty review this';
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
            const content = '✗ @betty analyze this';
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
            const content = '🔄 @betty analyze this';
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

        it('should extract multi-line for mention chains', () => {
            const content = '@betty review\n@report.md and\n@finance/';
            const commands = detector.detectInFile(content);

            // Should detect it as one command spanning multiple lines
            expect(commands).toHaveLength(1);
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
            expect(statuses).toContain('in_progress');
            expect(statuses).toContain('failed');
        });
    });
});

