/**
 * WorkflowChatStorage - Persists chat history per workflow
 */

import type { App } from 'obsidian';
import type { WorkflowChatMessage } from './types';

const WORKFLOW_CHATS_DIR = '.spark/workflow-chats';

export interface WorkflowChatHistory {
	workflowId: string;
	messages: WorkflowChatMessage[];
	updatedAt: number;
}

export class WorkflowChatStorage {
	private readonly app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Ensure directory exists
	 */
	private async ensureDir(path: string): Promise<void> {
		const exists = await this.app.vault.adapter.exists(path);
		if (!exists) {
			await this.app.vault.adapter.mkdir(path);
		}
	}

	/**
	 * Load chat history for a workflow
	 */
	async loadChatHistory(workflowId: string): Promise<WorkflowChatHistory | null> {
		const path = `${WORKFLOW_CHATS_DIR}/${workflowId}.json`;

		try {
			const exists = await this.app.vault.adapter.exists(path);
			if (!exists) {
				return null;
			}

			const content = await this.app.vault.adapter.read(path);
			return JSON.parse(content) as WorkflowChatHistory;
		} catch (error) {
			console.error(`Failed to load chat history for workflow ${workflowId}:`, error);
			return null;
		}
	}

	/**
	 * Save chat history for a workflow
	 */
	async saveChatHistory(workflowId: string, messages: WorkflowChatMessage[]): Promise<void> {
		await this.ensureDir(WORKFLOW_CHATS_DIR);

		const history: WorkflowChatHistory = {
			workflowId,
			messages,
			updatedAt: Date.now(),
		};

		const path = `${WORKFLOW_CHATS_DIR}/${workflowId}.json`;
		const content = JSON.stringify(history, null, 2);

		await this.app.vault.adapter.write(path, content);
	}

	/**
	 * Delete chat history for a workflow
	 */
	async deleteChatHistory(workflowId: string): Promise<void> {
		const path = `${WORKFLOW_CHATS_DIR}/${workflowId}.json`;

		const exists = await this.app.vault.adapter.exists(path);
		if (exists) {
			await this.app.vault.adapter.remove(path);
		}
	}

	/**
	 * Add a message to the chat history
	 */
	async addMessage(workflowId: string, message: WorkflowChatMessage): Promise<void> {
		const history = await this.loadChatHistory(workflowId);
		const messages = history?.messages ?? [];
		messages.push(message);
		await this.saveChatHistory(workflowId, messages);
	}

	/**
	 * Clear chat history for a workflow
	 */
	async clearChatHistory(workflowId: string): Promise<void> {
		await this.saveChatHistory(workflowId, []);
	}
}
