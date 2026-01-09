import { InlineChatDetector } from '../../src/parser/InlineChatDetector.js';

describe('InlineChatDetector', () => {
    let detector: InlineChatDetector;

    beforeEach(() => {
        detector = new InlineChatDetector();
    });

    describe('Mention Parsing', () => {
        it('should parse mentions from user message', () => {
            const content = `
<!-- spark-inline-chat:pending:abc-123:betty:Tell me about @finance and @revenue.md -->
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(1);
            // Agent is prepended to user message: "@betty Tell me about @finance and @revenue.md"
            expect(chats[0]!.userMessage).toBe('@betty Tell me about @finance and @revenue.md');
            expect(chats[0]!.mentions).toBeDefined();
            expect(chats[0]!.mentions).toHaveLength(3); // betty, finance, revenue.md
            expect(chats[0]!.mentions![0]).toMatchObject({
                type: 'agent',
                value: 'betty',
            });
            expect(chats[0]!.mentions![1]).toMatchObject({
                type: 'agent',
                value: 'finance',
            });
            expect(chats[0]!.mentions![2]).toMatchObject({
                type: 'file',
                value: 'revenue.md',
            });
        });

        it('should parse @agent mentions from old format', () => {
            const content = `
<!-- spark-inline-chat:pending:abc-123 -->
User: @spark help me with this
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(1);
            expect(chats[0]!.userMessage).toBe('@spark help me with this');
            expect(chats[0]!.mentions).toBeDefined();
            expect(chats[0]!.mentions).toHaveLength(1);
            expect(chats[0]!.mentions![0]).toMatchObject({
                type: 'agent',
                value: 'spark',
            });
        });

        it('should not parse mentions for complete chats', () => {
            const content = `
<!-- spark-inline-chat:complete:abc-123 -->
Here is the response with @mentions
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(1);
            expect(chats[0]!.status).toBe('complete');
            // Mentions should be undefined for complete chats (empty user message)
            expect(chats[0]!.mentions).toBeUndefined();
        });

        it('should handle multiline messages with escaped newlines', () => {
            const content = `
<!-- spark-inline-chat:pending:abc-123:alice:What do you see?\\nKeep it short -->
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(1);
            // Should unescape the \\n to actual newline
            expect(chats[0]!.userMessage).toBe('@alice What do you see?\nKeep it short');
            expect(chats[0]!.mentions).toBeDefined();
            expect(chats[0]!.mentions).toHaveLength(1);
            expect(chats[0]!.mentions![0]).toMatchObject({
                type: 'agent',
                value: 'alice',
            });
        });
    });

    describe('Basic Detection', () => {
        it('should detect a pending inline chat', () => {
            const content = `
Some text before
<!-- spark-inline-chat:pending:abc-123 -->
User: How do I calculate burn rate?
<!-- /spark-inline-chat -->
Some text after
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(1);
            expect(chats[0]).toMatchObject({
                status: 'pending',
                id: 'abc-123',
                userMessage: 'How do I calculate burn rate?',
                startLine: 2,
                endLine: 4,
            });
        });

        it('should detect a complete inline chat', () => {
            const content = `
<!-- spark-inline-chat:complete:abc-123 -->
To calculate burn rate, take your monthly expenses...
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(1);
            expect(chats[0]).toMatchObject({
                status: 'complete',
                id: 'abc-123',
                aiResponse: 'To calculate burn rate, take your monthly expenses...',
            });
        });

        it('should detect processing status', () => {
            const content = `
<!-- spark-inline-chat:processing:abc-123 -->
User: What is my runway?
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(1);
            expect(chats[0]!.status).toBe('processing');
        });

        it('should detect error status', () => {
            const content = `
<!-- spark-inline-chat:error:abc-123 -->
User: Invalid question
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(1);
            expect(chats[0]!.status).toBe('error');
        });
    });

    describe('Multiple Inline Chats', () => {
        it('should detect multiple inline chats in one file', () => {
            const content = `
# Document

<!-- spark-inline-chat:pending:abc-123 -->
User: Question 1?
<!-- /spark-inline-chat -->

Some text in between

<!-- spark-inline-chat:complete:def-456 -->
Answer to question 2.
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(2);
            expect(chats[0]!.id).toBe('abc-123');
            expect(chats[0]!.status).toBe('pending');
            expect(chats[1]!.id).toBe('def-456');
            expect(chats[1]!.status).toBe('complete');
        });

        it('should handle different UUIDs correctly', () => {
            const content = `
<!-- spark-inline-chat:pending:00000000-0000-0000-0000-000000000001 -->
User: First
<!-- /spark-inline-chat -->

<!-- spark-inline-chat:pending:99999999-9999-9999-9999-999999999999 -->
User: Second
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(2);
            expect(chats[0]!.id).toBe('00000000-0000-0000-0000-000000000001');
            expect(chats[1]!.id).toBe('99999999-9999-9999-9999-999999999999');
        });
    });

    describe('User Message Parsing', () => {
        it('should extract user message with "User:" prefix', () => {
            const content = `
<!-- spark-inline-chat:pending:abc-123 -->
User: What is the burn rate formula?
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats[0]!.userMessage).toBe('What is the burn rate formula?');
        });

        it('should handle user message without "User:" prefix as fallback', () => {
            const content = `
<!-- spark-inline-chat:pending:abc-123 -->
Just a plain message
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats[0]!.userMessage).toBe('Just a plain message');
        });

        it('should handle multi-line user messages', () => {
            const content = `
<!-- spark-inline-chat:pending:abc-123 -->
User: Line 1
Line 2
Line 3
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            // Only first line after "User:" is captured
            expect(chats[0]!.userMessage).toBe('Line 1');
        });

        it('should handle empty user message', () => {
            const content = `
<!-- spark-inline-chat:pending:abc-123 -->
User:
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats[0]!.userMessage).toBe('');
        });
    });

    describe('AI Response Parsing', () => {
        it('should extract AI response for complete status', () => {
            const content = `
<!-- spark-inline-chat:complete:abc-123 -->
This is the AI response.
It can span multiple lines.
And include various content.
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats[0]!.aiResponse).toBe(
                'This is the AI response.\nIt can span multiple lines.\nAnd include various content.'
            );
        });

        it('should not have AI response for pending status', () => {
            const content = `
<!-- spark-inline-chat:pending:abc-123 -->
User: Question?
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats[0]!.aiResponse).toBeUndefined();
        });

        it('should handle empty AI response', () => {
            const content = `
<!-- spark-inline-chat:complete:abc-123 -->
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats[0]!.aiResponse).toBe('');
        });
    });

    describe('Line Numbers', () => {
        it('should correctly report line numbers', () => {
            const content = `Line 1
Line 2
<!-- spark-inline-chat:pending:abc-123 -->
User: Question
<!-- /spark-inline-chat -->
Line 6`;

            const chats = detector.detectInFile(content);

            expect(chats[0]).toMatchObject({
                startLine: 3,
                endLine: 5,
            });
        });

        it('should handle inline chat at start of file', () => {
            const content = `<!-- spark-inline-chat:pending:abc-123 -->
User: Question
<!-- /spark-inline-chat -->`;

            const chats = detector.detectInFile(content);

            expect(chats[0]).toMatchObject({
                startLine: 1,
                endLine: 3,
            });
        });

        it('should handle inline chat at end of file', () => {
            const content = `Line 1
Line 2
<!-- spark-inline-chat:pending:abc-123 -->
User: Question
<!-- /spark-inline-chat -->`;

            const chats = detector.detectInFile(content);

            expect(chats[0]).toMatchObject({
                startLine: 3,
                endLine: 5,
            });
        });
    });

    describe('Edge Cases', () => {
        it('should ignore incomplete inline chat (no closing marker)', () => {
            const content = `
<!-- spark-inline-chat:pending:abc-123 -->
User: Question without closing
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(0);
        });

        it('should ignore orphaned closing marker', () => {
            const content = `
Random text
<!-- /spark-inline-chat -->
More text
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(0);
        });

        it('should handle empty content', () => {
            const content = '';
            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(0);
        });

        it('should handle content with only whitespace', () => {
            const content = '   \n  \n   ';
            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(0);
        });

        it('should handle malformed opening marker', () => {
            const content = `
<!-- spark-inline-chat:invalid:abc-123 -->
User: Question
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(0);
        });

        it('should handle spaces in markers', () => {
            const content = `
<!--   spark-inline-chat:pending:abc-123   -->
User: Question
<!--   /spark-inline-chat   -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats).toHaveLength(1);
            expect(chats[0]!.id).toBe('abc-123');
        });
    });

    describe('Helper Methods', () => {
        describe('hasPendingInlineChats', () => {
            it('should return true if there are pending inline chats', () => {
                const content = `
<!-- spark-inline-chat:pending:abc-123 -->
User: Question
<!-- /spark-inline-chat -->
        `.trim();

                expect(detector.hasPendingInlineChats(content)).toBe(true);
            });

            it('should return false if no pending inline chats', () => {
                const content = `
<!-- spark-inline-chat:complete:abc-123 -->
Answer
<!-- /spark-inline-chat -->
        `.trim();

                expect(detector.hasPendingInlineChats(content)).toBe(false);
            });

            it('should return false for empty content', () => {
                expect(detector.hasPendingInlineChats('')).toBe(false);
            });
        });

        describe('getPendingInlineChats', () => {
            it('should return only pending inline chats', () => {
                const content = `
<!-- spark-inline-chat:pending:abc-123 -->
User: Question 1
<!-- /spark-inline-chat -->

<!-- spark-inline-chat:complete:def-456 -->
Answer 2
<!-- /spark-inline-chat -->

<!-- spark-inline-chat:pending:ghi-789 -->
User: Question 3
<!-- /spark-inline-chat -->
        `.trim();

                const pending = detector.getPendingInlineChats(content);

                expect(pending).toHaveLength(2);
                expect(pending[0]!.id).toBe('abc-123');
                expect(pending[1]!.id).toBe('ghi-789');
            });

            it('should return empty array if no pending chats', () => {
                const content = `
<!-- spark-inline-chat:complete:abc-123 -->
Answer
<!-- /spark-inline-chat -->
        `.trim();

                const pending = detector.getPendingInlineChats(content);
                expect(pending).toHaveLength(0);
            });
        });

        describe('isInsideInlineChat', () => {
            it('should return true for lines inside inline chat', () => {
                const content = `Line 1
<!-- spark-inline-chat:pending:abc-123 -->
User: Question
<!-- /spark-inline-chat -->
Line 5`;

                expect(detector.isInsideInlineChat(content, 2)).toBe(true);
                expect(detector.isInsideInlineChat(content, 3)).toBe(true);
                expect(detector.isInsideInlineChat(content, 4)).toBe(true);
            });

            it('should return false for lines outside inline chat', () => {
                const content = `Line 1
<!-- spark-inline-chat:pending:abc-123 -->
User: Question
<!-- /spark-inline-chat -->
Line 5`;

                expect(detector.isInsideInlineChat(content, 1)).toBe(false);
                expect(detector.isInsideInlineChat(content, 5)).toBe(false);
            });
        });
    });

    describe('Raw Content', () => {
        it('should include raw marker text', () => {
            const content = `
<!-- spark-inline-chat:pending:abc-123 -->
User: Question
<!-- /spark-inline-chat -->
      `.trim();

            const chats = detector.detectInFile(content);

            expect(chats[0]!.raw).toContain('spark-inline-chat:pending:abc-123');
            expect(chats[0]!.raw).toContain('User: Question');
            expect(chats[0]!.raw).toContain('/spark-inline-chat');
        });
    });
});

