import { App } from 'obsidian';
import { ChatConversation } from './types';

export class ConversationStorage {
	private app: App;
	private conversationsDir = '.spark/conversations';

	constructor(app: App) {
		this.app = app;
	}

	async saveConversation(conversation: ChatConversation): Promise<void> {
		const filePath = `${this.conversationsDir}/${conversation.id}.json`;
		const content = JSON.stringify(conversation, null, 2);

		// Create directory if it doesn't exist
		const dirExists = await this.app.vault.adapter.exists(this.conversationsDir);
		if (!dirExists) {
			await this.app.vault.adapter.mkdir(this.conversationsDir);
		}

		await this.app.vault.adapter.write(filePath, content);
	}

	async loadConversation(id: string): Promise<ChatConversation | null> {
		const filePath = `${this.conversationsDir}/${id}.json`;

		try {
			const content = await this.app.vault.adapter.read(filePath);
			return JSON.parse(content) as ChatConversation;
		} catch {
			return null;
		}
	}

	async listConversations(): Promise<ChatConversation[]> {
		try {
			const files = await this.app.vault.adapter.list(this.conversationsDir);
			const conversations: ChatConversation[] = [];

			for (const file of files.files) {
				if (file.includes('chat-')) {
					try {
						const conversation = await this.loadConversation(
							file.replace(`${this.conversationsDir}/`, '').replace('.json', '')
						);
						if (conversation) {
							conversations.push(conversation);
						}
					} catch (error) {
						console.warn('ConversationStorage: Failed to load conversation:', file, error);
					}
				}
			}

			// Sort by creation date (newest first)
			return conversations.sort(
				(a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
			);
		} catch (error) {
			console.error('ConversationStorage: Failed to list conversations:', error);
			return [];
		}
	}

	async deleteConversation(id: string): Promise<void> {
		try {
			const filePath = `${this.conversationsDir}/${id}.json`;
			const exists = await this.app.vault.adapter.exists(filePath);
			if (exists) {
				await this.app.vault.adapter.remove(filePath);
			}
		} catch (error) {
			console.error('ConversationStorage: Failed to delete conversation:', id, error);
			throw error;
		}
	}

	async getMostRecentConversation(): Promise<string | null> {
		try {
			const files = await this.app.vault.adapter.list(this.conversationsDir);
			if (files.files.length === 0) return null;

			// Sort files by name (timestamp) to get the most recent
			const chatFiles = files.files
				.filter(file => file.includes('chat-'))
				.sort((a, b) => {
					// Extract just the filename part for comparison
					const aFile = a.replace(`${this.conversationsDir}/`, '');
					const bFile = b.replace(`${this.conversationsDir}/`, '');

					// Extract timestamp from filename format: chat-{timestamp}.json
					const aTime = this.extractTimestampFromFilename(aFile);
					const bTime = this.extractTimestampFromFilename(bFile);

					return bTime - aTime; // Descending order
				});

			const mostRecentFile = chatFiles[0];
			if (mostRecentFile) {
				const conversationId = mostRecentFile
					.replace(`${this.conversationsDir}/`, '')
					.replace('.json', '');
				return conversationId;
			}

			return null;
		} catch (error) {
			console.error('ConversationStorage: Error finding most recent conversation:', error);
			return null;
		}
	}

	private extractTimestampFromFilename(filename: string): number {
		// Handle format: chat-{timestamp}.json
		const match = filename.match(/chat-(\d+)\.json$/);
		if (match) {
			return parseInt(match[1], 10);
		}
		return 0;
	}
}
