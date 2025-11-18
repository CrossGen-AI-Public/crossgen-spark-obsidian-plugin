import { InlineChatManager } from '../../src/inline-chat/InlineChatManager';
import type { App, Editor } from 'obsidian';

// Mock window.crypto.randomUUID
const mockUUID = '123e4567-e89b-12d3-a456-426614174000';
const mockRandomUUID = () => mockUUID;
Object.defineProperty(global.window, 'crypto', {
    value: {
        randomUUID: mockRandomUUID,
    },
    writable: true,
});

// Mock Notice to track calls
const mockNoticeConstructor: Array<{ message: string; timeout?: number }> = [];
(globalThis as any).Notice = class MockNotice {
    constructor(message: string, timeout?: number) {
        mockNoticeConstructor.push({ message, timeout });
    }
};

describe('InlineChatManager', () => {
    let manager: InlineChatManager;
    let mockApp: App;
    let mockEditor: Editor;
    let mockWorkspace: any;

    beforeEach(() => {
        // Create mock workspace
        mockWorkspace = {
            on: () => { },
            off: () => { },
            getActiveFile: () => ({
                path: 'test.md',
                name: 'test.md',
            }),
            onLayoutReady: (callback: () => void) => {
                // Immediately call callback in tests
                callback();
            },
        };

        // Create mock vault with orphaned marker detection support
        const mockVault = {
            on: () => { },
            off: () => { },
            read: async () => '',
            getAbstractFileByPath: (path: string) => null,
            getMarkdownFiles: () => [],
        };

        // Create mock app
        mockApp = {
            workspace: mockWorkspace,
            vault: mockVault,
        } as any;

        // Create mock editor
        mockEditor = createMockEditor();

        // Clear notice calls
        mockNoticeConstructor.length = 0;

        // Create manager
        manager = new InlineChatManager(mockApp);
    });

    afterEach(() => {
        manager.cleanup();
    });

    describe('Marker Writing (Step 2)', () => {
        describe('handleSend - Basic functionality', () => {
            it('should replace positioning markers with final daemon-readable format', () => {
                // Setup: Initialize and create positioning markers
                manager.initialize();

                // Simulate file content with positioning markers and blank lines
                const markerId = 'spark-inline-1234-abc';
                const fileContent = [
                    'Some text',
                    `<!-- ${markerId}-start -->`,
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    `<!-- ${markerId}-end -->`,
                    'More text',
                ];

                mockEditor = createMockEditorWithContent(fileContent);

                // Setup manager state (simulate widget being shown)
                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = {
                    agentName: 'betty',
                    line: 0,
                    ch: 0,
                    position: { line: 0, ch: 0 },
                };
                (manager as any).markerId = markerId;

                // Act: Send message
                const userMessage = '@betty How do I calculate burn rate?';
                (manager as any).handleSend(userMessage);

                // Assert: Check that replaceRange was called with correct format
                const calls = (mockEditor.replaceRange as any).mock.calls;
                expect(calls.length).toBeGreaterThan(0);
                expect(calls[0][0]).toContain('<!-- spark-inline-chat:pending:');
                expect(calls[0][1]).toEqual({ line: 1, ch: 0 }); // start marker line
                expect(calls[0][2]).toEqual({ line: 10, ch: 0 }); // end marker line + 1

                // Verify the exact format
                const call = (mockEditor.replaceRange as jest.Mock).mock.calls[0];
                const writtenContent = call[0];

                // New format: <!-- spark-inline-chat:pending:uuid:agent:message -->
                expect(writtenContent).toContain(`<!-- spark-inline-chat:pending:${mockUUID}:betty:How do I calculate burn rate? -->`);
                expect(writtenContent).toContain('<!-- /spark-inline-chat -->');
            });

            it('should generate a UUID for tracking', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [
                    `<!-- ${markerId}-start -->`,
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    `<!-- ${markerId}-end -->`,
                ];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('@betty test message');

                // Verify UUID is in the written content (confirms randomUUID was called)
                const writtenContent = (mockEditor.replaceRange as any).mock.calls[0][0];
                expect(writtenContent).toContain(mockUUID);
                expect(writtenContent).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
            });

            it('should strip @agent prefix from user message', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                // Send message with @agent prefix
                (manager as any).handleSend('@betty How do I calculate burn rate?');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];

                // Should NOT contain @betty in the message part (it's in the agent field)
                expect(writtenContent).toContain(`<!-- spark-inline-chat:pending:${mockUUID}:betty:How do I calculate burn rate? -->`);
                expect(writtenContent).not.toContain(':betty:@betty');
            });

            it('should handle messages without @agent prefix', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                // Send message without @agent prefix
                (manager as any).handleSend('How do I calculate burn rate?');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                expect(writtenContent).toContain(`<!-- spark-inline-chat:pending:${mockUUID}:betty:How do I calculate burn rate? -->`);
            });

            it('should show notification after sending', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('test message');

                expect(mockNoticeConstructor).toHaveLength(1);
                expect(mockNoticeConstructor[0].message).toBe('Message sent to @betty');
            });

            it('should reset manager state after sending', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;
                (manager as any).originalMentionText = '@betty';
                (manager as any).mentionLineNumber = 5;

                (manager as any).handleSend('test message');

                // Verify state is NOT reset (kept until completion detected)
                expect((manager as any).currentMention).not.toBeNull();
                expect((manager as any).currentEditor).not.toBeNull();
                expect((manager as any).originalMentionText).toBe('@betty');
                expect((manager as any).mentionLineNumber).toBe(5);
                expect((manager as any).markerId).toBe(markerId);
                expect((manager as any).currentUserMessage).toBe('test message');
            });
        });

        describe('Marker Format Validation', () => {
            it('should write correct opening marker format', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('test message');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                const lines = writtenContent.split('\n');

                // First line should be opening marker with correct format: <!-- spark-inline-chat:pending:uuid:agent:message -->
                expect(lines[0]).toMatch(/^<!-- spark-inline-chat:pending:[a-f0-9-]+:betty:test message -->$/);
            });

            it('should write closing marker on last line', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('How do I calculate burn rate?');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                const lines = writtenContent.trim().split('\n');

                // Last line should be closing marker
                expect(lines[lines.length - 1]).toBe('<!-- /spark-inline-chat -->');
            });

            it('should add newlines between markers for widget space', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('test message');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                const lines = writtenContent.trim().split('\n');

                // Should have at least opening marker, some blank lines, and closing marker
                expect(lines.length).toBeGreaterThanOrEqual(3);
            });

            it('should have opening and closing markers with blank lines between', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('test message');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                const lines = writtenContent.trim().split('\n');

                // First line should be opening marker
                expect(lines[0]).toContain('spark-inline-chat:pending:');
                // Last line should be closing marker
                expect(lines[lines.length - 1]).toBe('<!-- /spark-inline-chat -->');
                // Lines in between should be empty (for widget space)
                for (let i = 1; i < lines.length - 1; i++) {
                    expect(lines[i]).toBe('');
                }
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty message gracefully', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                // Empty message results in ":betty: -->"
                expect(writtenContent).toContain(`<!-- spark-inline-chat:pending:${mockUUID}:betty: -->`);
            });

            it('should handle message with only @agent', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('@betty');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                // Empty message results in ":betty: -->"
                expect(writtenContent).toContain(`<!-- spark-inline-chat:pending:${mockUUID}:betty: -->`);
            });

            it('should not write markers if no current editor', () => {
                manager.initialize();

                (manager as any).currentEditor = null;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };

                // Should not throw
                expect(() => {
                    (manager as any).handleSend('test message');
                }).not.toThrow();

                // Should not call replaceRange (calls array should be empty)
                const calls = (mockEditor.replaceRange as any).mock.calls;
                expect(calls.length).toBe(0);
            });

            it('should not write markers if no current mention', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = null;

                // Should not throw
                expect(() => {
                    (manager as any).handleSend('test message');
                }).not.toThrow();
            });

            it('should handle markers at different positions in file', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [
                    'Line 1',
                    'Line 2',
                    'Line 3',
                    `<!-- ${markerId}-start -->`,
                    '',
                    `<!-- ${markerId}-end -->`,
                    'Line 4',
                    'Line 5',
                ];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 2, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('test message');

                // Should replace markers at correct position
                const calls = (mockEditor.replaceRange as any).mock.calls;
                expect(calls.length).toBeGreaterThan(0);
                expect(calls[0][1]).toEqual({ line: 3, ch: 0 }); // start marker line
                expect(calls[0][2]).toEqual({ line: 6, ch: 0 }); // end marker line + 1
            });

            it('should handle multiple blank lines between markers', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [
                    `<!-- ${markerId}-start -->`,
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    `<!-- ${markerId}-end -->`,
                ];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('test message');

                // Should replace all lines between markers
                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                expect(writtenContent).toContain('<!-- spark-inline-chat:pending:');
            });
        });

        describe('Message Cleaning', () => {
            it('should remove @agent from beginning of message', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('@betty Calculate burn rate');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                expect(writtenContent).toContain(`<!-- spark-inline-chat:pending:${mockUUID}:betty:Calculate burn rate -->`);
            });

            it('should handle @agent with extra spaces', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('@betty    Calculate burn rate');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                expect(writtenContent).toContain(`<!-- spark-inline-chat:pending:${mockUUID}:betty:Calculate burn rate -->`);
            });

            it('should preserve @mentions that are not the agent', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('@betty Ask @john about the project');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                expect(writtenContent).toContain(`<!-- spark-inline-chat:pending:${mockUUID}:betty:Ask @john about the project -->`);
            });

            it('should trim whitespace from cleaned message', () => {
                manager.initialize();

                const markerId = 'spark-inline-1234-abc';
                const fileContent = [`<!-- ${markerId}-start -->`, '', `<!-- ${markerId}-end -->`];

                mockEditor = createMockEditorWithContent(fileContent);

                (manager as any).currentEditor = mockEditor;
                (manager as any).currentMention = { agentName: 'betty', line: 0, ch: 0 };
                (manager as any).markerId = markerId;

                (manager as any).handleSend('@betty    test message    ');

                const writtenContent = (mockEditor.replaceRange as jest.Mock).mock.calls[0][0];
                expect(writtenContent).toContain(`<!-- spark-inline-chat:pending:${mockUUID}:betty:test message -->`);
            });
        });
    });

    describe('Marker Cleanup', () => {
        describe('cleanup() - Plugin unload', () => {
            it('should remove temporary positioning markers from current file', async () => {
                manager.initialize();

                const fileContent = [
                    'Some text',
                    '<!-- spark-inline-1234-start -->',
                    '',
                    '',
                    '<!-- spark-inline-1234-end -->',
                    'More text',
                ].join('\n');

                let modifiedContent: string | null = null;
                const mockFile = { path: 'test.md' };
                const mockVault = {
                    ...mockApp.vault,
                    getAbstractFileByPath: () => mockFile,
                    read: async () => fileContent,
                    modify: async (file: any, content: string) => {
                        modifiedContent = content;
                    },
                };
                (mockApp as any).vault = mockVault;

                // Set current file path to simulate active inline chat
                (manager as any).currentFilePath = 'test.md';

                await manager.cleanup();

                expect(modifiedContent).toBe('Some text\nMore text');
            });

            it('should remove daemon format markers from current file', async () => {
                manager.initialize();

                const fileContent = [
                    'Some text',
                    '<!-- spark-inline-chat:pending:uuid-123:betty:test message -->',
                    '',
                    '',
                    '<!-- /spark-inline-chat -->',
                    'More text',
                ].join('\n');

                let modifiedContent: string | null = null;
                const mockFile = { path: 'test.md' };
                const mockVault = {
                    ...mockApp.vault,
                    getAbstractFileByPath: () => mockFile,
                    read: async () => fileContent,
                    modify: async (file: any, content: string) => {
                        modifiedContent = content;
                    },
                };
                (mockApp as any).vault = mockVault;

                (manager as any).currentFilePath = 'test.md';

                await manager.cleanup();

                expect(modifiedContent).toBe('Some text\nMore text');
            });

            it('should clean up markers from all pending chat files', async () => {
                manager.initialize();

                const cleanedFiles: string[] = [];
                const mockVault = {
                    ...mockApp.vault,
                    getAbstractFileByPath: (path: string) => ({ path }),
                    read: async (file: any) => {
                        if (file.path === 'file1.md') {
                            return '<!-- spark-inline-chat:pending:uuid:betty:msg -->\n\n<!-- /spark-inline-chat -->';
                        }
                        if (file.path === 'file2.md') {
                            return '<!-- spark-inline-1234-start -->\n\n<!-- spark-inline-1234-end -->';
                        }
                        return '';
                    },
                    modify: async (file: any, content: string) => {
                        cleanedFiles.push(file.path);
                    },
                };
                (mockApp as any).vault = mockVault;

                // Add pending chats for multiple files
                (manager as any).pendingChats.set('uuid1', {
                    uuid: 'uuid1',
                    filePath: 'file1.md',
                    agentName: 'betty',
                    timestamp: Date.now(),
                });
                (manager as any).pendingChats.set('uuid2', {
                    uuid: 'uuid2',
                    filePath: 'file2.md',
                    agentName: 'alice',
                    timestamp: Date.now(),
                });

                await manager.cleanup();

                expect(cleanedFiles).toContain('file1.md');
                expect(cleanedFiles).toContain('file2.md');
            });

            it('should not fail if file does not exist', async () => {
                manager.initialize();

                const mockVault = {
                    ...mockApp.vault,
                    getAbstractFileByPath: () => null,
                    read: async () => '',
                    modify: async () => { },
                };
                (mockApp as any).vault = mockVault;

                (manager as any).currentFilePath = 'nonexistent.md';

                // Should not throw
                await expect(manager.cleanup()).resolves.not.toThrow();
            });

            it('should clear all state after cleanup', async () => {
                manager.initialize();

                (manager as any).currentFilePath = 'test.md';
                (manager as any).pendingChats.set('uuid1', {
                    uuid: 'uuid1',
                    filePath: 'test.md',
                    agentName: 'betty',
                    timestamp: Date.now(),
                });

                await manager.cleanup();

                expect((manager as any).pendingChats.size).toBe(0);
                expect((manager as any).editorChangeHandler).toBeNull();
                expect((manager as any).fileModifyHandler).toBeNull();
                expect((manager as any).agentMentionCompleteHandler).toBeNull();
            });
        });

        describe('cleanupOrphanedMarkers() - Plugin initialization', () => {
            it('should scan and clean orphaned markers on startup', async () => {
                const cleanedFiles: string[] = [];

                const mockFiles = [
                    {
                        path: 'file1.md',
                        basename: 'file1',
                        extension: 'md',
                    },
                    {
                        path: 'file2.md',
                        basename: 'file2',
                        extension: 'md',
                    },
                ];

                const mockVault = {
                    ...mockApp.vault,
                    getMarkdownFiles: () => mockFiles,
                    getAbstractFileByPath: (path: string) => mockFiles.find(f => f.path === path),
                    read: async (file: any) => {
                        if (file.path === 'file1.md') {
                            return 'Text\n<!-- spark-inline-1234-start -->\n\n<!-- spark-inline-1234-end -->\nMore';
                        }
                        if (file.path === 'file2.md') {
                            return 'Clean file with no markers';
                        }
                        return '';
                    },
                    modify: async (file: any, content: string) => {
                        cleanedFiles.push(file.path);
                    },
                };
                (mockApp as any).vault = mockVault;

                await (manager as any).cleanupOrphanedMarkers();

                expect(cleanedFiles).toContain('file1.md');
                expect(cleanedFiles).not.toContain('file2.md');
            });

            it('should handle both marker types during orphan cleanup', async () => {
                const cleanedFiles: string[] = [];

                const mockFiles = [
                    { path: 'temp-markers.md', basename: 'temp-markers', extension: 'md' },
                    { path: 'daemon-markers.md', basename: 'daemon-markers', extension: 'md' },
                ];

                const mockVault = {
                    ...mockApp.vault,
                    getMarkdownFiles: () => mockFiles,
                    getAbstractFileByPath: (path: string) => mockFiles.find(f => f.path === path),
                    read: async (file: any) => {
                        if (file.path === 'temp-markers.md') {
                            return '<!-- spark-inline-abc-start -->\n\n<!-- spark-inline-abc-end -->';
                        }
                        if (file.path === 'daemon-markers.md') {
                            return '<!-- spark-inline-chat:pending:uuid:agent:msg -->\n\n<!-- /spark-inline-chat -->';
                        }
                        return '';
                    },
                    modify: async (file: any, content: string) => {
                        cleanedFiles.push(file.path);
                    },
                };
                (mockApp as any).vault = mockVault;

                await (manager as any).cleanupOrphanedMarkers();

                expect(cleanedFiles).toContain('temp-markers.md');
                expect(cleanedFiles).toContain('daemon-markers.md');
            });

            it('should not fail if a file cannot be read', async () => {
                const mockFiles = [
                    { path: 'good.md', basename: 'good', extension: 'md' },
                    { path: 'bad.md', basename: 'bad', extension: 'md' },
                ];

                const mockVault = {
                    ...mockApp.vault,
                    getMarkdownFiles: () => mockFiles,
                    getAbstractFileByPath: (path: string) => mockFiles.find(f => f.path === path),
                    read: async (file: any) => {
                        if (file.path === 'bad.md') {
                            throw new Error('Cannot read file');
                        }
                        return 'Clean content';
                    },
                    modify: async () => { },
                };
                (mockApp as any).vault = mockVault;

                // Should not throw
                await expect((manager as any).cleanupOrphanedMarkers()).resolves.not.toThrow();
            });
        });

        describe('Stale chat timeout cleanup', () => {
            it('should clean up markers from file', async () => {
                let modifiedContent: string | null = null;
                const mockFile = {
                    path: 'stale.md',
                    basename: 'stale',
                    extension: 'md',
                };

                const fileContent = '<!-- spark-inline-chat:pending:uuid:betty:msg -->\n\n<!-- /spark-inline-chat -->';

                // Set up vault with cleanup support
                (mockApp as any).vault = {
                    on: () => { },
                    off: () => { },
                    getAbstractFileByPath: (path: string) => (path === 'stale.md' ? mockFile : null),
                    getMarkdownFiles: () => [],
                    read: async (file: any) => fileContent,
                    modify: async (file: any, content: string) => {
                        modifiedContent = content;
                    },
                };

                manager.initialize();

                // Directly call cleanup method to test marker removal
                await (manager as any).cleanupMarkersFromFile('stale.md');

                expect(modifiedContent).toBe('');
            });
        });
    });
});

/**
 * Helper: Create a mock editor with basic functionality
 */
function createMockEditor(): Editor {
    const lines: string[] = [];
    const replaceRangeCalls: Array<{ text: string; from: any; to?: any }> = [];

    const editor = {
        getLine: (lineNum: number) => lines[lineNum] || '',
        setLine: (lineNum: number, text: string) => {
            lines[lineNum] = text;
        },
        lineCount: () => lines.length,
        replaceRange: (text: string, from: any, to?: any) => {
            replaceRangeCalls.push({ text, from, to });
        },
        getCursor: () => ({ line: 0, ch: 0 }),
        getSelection: () => '',
        somethingSelected: () => false,
    } as any;

    // Add mock tracking for jest assertions
    Object.defineProperty(editor.replaceRange, 'mock', {
        get: () => ({
            calls: replaceRangeCalls.map(call => [call.text, call.from, call.to]),
        }),
    });

    return editor;
}

/**
 * Helper: Create a mock editor with pre-populated content
 */
function createMockEditorWithContent(content: string[]): Editor {
    const lines = [...content];
    const replaceRangeCalls: Array<{ text: string; from: any; to?: any }> = [];

    const editor = {
        getLine: (lineNum: number) => lines[lineNum] || '',
        setLine: (lineNum: number, text: string) => {
            lines[lineNum] = text;
        },
        lineCount: () => lines.length,
        replaceRange: (text: string, from: any, to?: any) => {
            replaceRangeCalls.push({ text, from, to });
        },
        getCursor: () => ({ line: 0, ch: 0 }),
        getSelection: () => '',
        somethingSelected: () => false,
    } as any;

    // Add mock tracking for jest assertions
    Object.defineProperty(editor.replaceRange, 'mock', {
        get: () => ({
            calls: replaceRangeCalls.map(call => [call.text, call.from, call.to]),
        }),
    });

    return editor;
}

