import { jest } from '@jest/globals';
import type { App } from 'obsidian';
import { WorkflowChatStorage } from '../../src/workflows/WorkflowChatStorage';
import type { WorkflowChatMessage } from '../../src/workflows/types';

describe('WorkflowChatStorage', () => {
	let storage: WorkflowChatStorage;
	let mockAdapter: {
		exists: jest.Mock<() => Promise<boolean>>;
		read: jest.Mock<() => Promise<string>>;
		write: jest.Mock<() => Promise<void>>;
		remove: jest.Mock<() => Promise<void>>;
		mkdir: jest.Mock<() => Promise<void>>;
	};
	let mockApp: App;

	beforeEach(() => {
		mockAdapter = {
			exists: jest.fn(),
			read: jest.fn(),
			write: jest.fn(),
			remove: jest.fn(),
			mkdir: jest.fn(),
		};

		mockApp = {
			vault: {
				adapter: mockAdapter,
			},
		} as unknown as App;

		storage = new WorkflowChatStorage(mockApp);
	});

	describe('loadChatHistory', () => {
		it('returns null when file does not exist', async () => {
			mockAdapter.exists.mockResolvedValue(false);

			const result = await storage.loadChatHistory('wf_123');

			expect(result).toBeNull();
			expect(mockAdapter.exists).toHaveBeenCalledWith('.spark/workflow-chats/wf_123.json');
		});

		it('returns parsed history when file exists', async () => {
			const history = {
				workflowId: 'wf_123',
				messages: [
					{ id: 'msg_1', role: 'user', content: 'Hello', timestamp: 1000 },
					{ id: 'msg_2', role: 'assistant', content: 'Hi there', timestamp: 2000 },
				],
				updatedAt: 3000,
			};

			mockAdapter.exists.mockResolvedValue(true);
			mockAdapter.read.mockResolvedValue(JSON.stringify(history));

			const result = await storage.loadChatHistory('wf_123');

			expect(result).toEqual(history);
			expect(mockAdapter.read).toHaveBeenCalledWith('.spark/workflow-chats/wf_123.json');
		});

		it('returns null when file read fails', async () => {
			mockAdapter.exists.mockResolvedValue(true);
			mockAdapter.read.mockRejectedValue(new Error('Read error'));

			const result = await storage.loadChatHistory('wf_123');

			expect(result).toBeNull();
		});

		it('returns null when JSON is invalid', async () => {
			mockAdapter.exists.mockResolvedValue(true);
			mockAdapter.read.mockResolvedValue('not valid json');

			const result = await storage.loadChatHistory('wf_123');

			expect(result).toBeNull();
		});
	});

	describe('saveChatHistory', () => {
		it('creates directory if needed and writes file', async () => {
			mockAdapter.exists.mockResolvedValue(false);

			const messages: WorkflowChatMessage[] = [
				{ id: 'msg_1', role: 'user', content: 'Hello', timestamp: 1000 },
			];

			await storage.saveChatHistory('wf_123', messages);

			expect(mockAdapter.mkdir).toHaveBeenCalledWith('.spark/workflow-chats');
			expect(mockAdapter.write).toHaveBeenCalledWith(
				'.spark/workflow-chats/wf_123.json',
				expect.any(String)
			);

			// Verify the written content
			const writtenContent = JSON.parse(
				(mockAdapter.write.mock.calls[0] as unknown as [string, string])[1]
			);
			expect(writtenContent.workflowId).toBe('wf_123');
			expect(writtenContent.messages).toEqual(messages);
			expect(writtenContent.updatedAt).toBeGreaterThan(0);
		});

		it('skips mkdir if directory exists', async () => {
			mockAdapter.exists.mockResolvedValue(true);

			const messages: WorkflowChatMessage[] = [];

			await storage.saveChatHistory('wf_123', messages);

			expect(mockAdapter.mkdir).not.toHaveBeenCalled();
			expect(mockAdapter.write).toHaveBeenCalled();
		});
	});

	describe('deleteChatHistory', () => {
		it('removes file if it exists', async () => {
			mockAdapter.exists.mockResolvedValue(true);

			await storage.deleteChatHistory('wf_123');

			expect(mockAdapter.remove).toHaveBeenCalledWith('.spark/workflow-chats/wf_123.json');
		});

		it('does nothing if file does not exist', async () => {
			mockAdapter.exists.mockResolvedValue(false);

			await storage.deleteChatHistory('wf_123');

			expect(mockAdapter.remove).not.toHaveBeenCalled();
		});
	});

	describe('addMessage', () => {
		it('adds message to existing history', async () => {
			const existingHistory = {
				workflowId: 'wf_123',
				messages: [{ id: 'msg_1', role: 'user' as const, content: 'Hello', timestamp: 1000 }],
				updatedAt: 1000,
			};

			mockAdapter.exists.mockResolvedValue(true);
			mockAdapter.read.mockResolvedValue(JSON.stringify(existingHistory));

			const newMessage: WorkflowChatMessage = {
				id: 'msg_2',
				role: 'assistant',
				content: 'Hi there',
				timestamp: 2000,
			};

			await storage.addMessage('wf_123', newMessage);

			expect(mockAdapter.write).toHaveBeenCalled();
			const writtenContent = JSON.parse(
				(mockAdapter.write.mock.calls[0] as unknown as [string, string])[1]
			);
			expect(writtenContent.messages).toHaveLength(2);
			expect(writtenContent.messages[1]).toEqual(newMessage);
		});

		it('creates new history if none exists', async () => {
			mockAdapter.exists.mockResolvedValue(false);

			const newMessage: WorkflowChatMessage = {
				id: 'msg_1',
				role: 'user',
				content: 'Hello',
				timestamp: 1000,
			};

			await storage.addMessage('wf_123', newMessage);

			expect(mockAdapter.write).toHaveBeenCalled();
			const writtenContent = JSON.parse(
				(mockAdapter.write.mock.calls[0] as unknown as [string, string])[1]
			);
			expect(writtenContent.messages).toHaveLength(1);
			expect(writtenContent.messages[0]).toEqual(newMessage);
		});
	});

	describe('clearChatHistory', () => {
		it('saves empty messages array', async () => {
			mockAdapter.exists.mockResolvedValue(true);

			await storage.clearChatHistory('wf_123');

			expect(mockAdapter.write).toHaveBeenCalled();
			const writtenContent = JSON.parse(
				(mockAdapter.write.mock.calls[0] as unknown as [string, string])[1]
			);
			expect(writtenContent.messages).toEqual([]);
		});
	});
});
