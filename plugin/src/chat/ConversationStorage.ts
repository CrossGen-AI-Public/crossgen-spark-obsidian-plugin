import { type App, normalizePath } from 'obsidian';
import { CHAT_FILENAME_REGEX, REGEX_ESCAPE_PATTERN } from '../constants';
import type { ChatConversation } from './types';

export class ConversationStorage {
	private app: App;
	private conversationsDir = '.spark/conversations';

	constructor(app: App) {
		this.app = app;
	}

	async saveConversation(conversation: ChatConversation): Promise<void> {
		const filePath = normalizePath(`${this.conversationsDir}/${conversation.id}.json`);
		const content = JSON.stringify(conversation, null, 2);

		// Create directory if it doesn't exist
		const dirExists = await this.app.vault.adapter.exists(this.conversationsDir);
		if (!dirExists) {
			await this.app.vault.adapter.mkdir(this.conversationsDir);
		}

		await this.app.vault.adapter.write(filePath, content);
	}

	async loadConversation(id: string): Promise<ChatConversation | null> {
		const filePath = normalizePath(`${this.conversationsDir}/${id}.json`);

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

			// Sort by latest message timestamp (or creation date if no messages)
			return conversations.sort((a, b) => {
				const getLastTime = (conv: ChatConversation) => {
					if (conv.messages && conv.messages.length > 0) {
						return new Date(conv.messages[conv.messages.length - 1].timestamp).getTime();
					}
					return new Date(conv.created).getTime();
				};
				return getLastTime(b) - getLastTime(a);
			});
		} catch (error) {
			console.error('ConversationStorage: Failed to list conversations:', error);
			return [];
		}
	}

	async deleteConversation(id: string): Promise<void> {
		try {
			const filePath = normalizePath(`${this.conversationsDir}/${id}.json`);
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
		const match = filename.match(CHAT_FILENAME_REGEX);
		if (match) {
			return parseInt(match[1], 10);
		}
		return 0;
	}

	/**
	 * Update agent name across all conversations
	 * Used when an agent is renamed in settings
	 * Updates:
	 * - mentionedAgents array
	 * - agent field in messages
	 * - @mentions in message content
	 */
	async updateAgentName(oldName: string, newName: string): Promise<void> {
		try {
			const conversations = await this.listConversations();

			for (const conversation of conversations) {
				let conversationUpdated = false;

				// Update mentionedAgents array
				if (conversation.mentionedAgents?.includes(oldName)) {
					conversation.mentionedAgents = conversation.mentionedAgents.map(name =>
						name === oldName ? newName : name
					);
					conversationUpdated = true;
				}

				// Update agent field in messages and @mentions in content
				for (const message of conversation.messages) {
					// Update agent field (the label shown above agent messages)
					if (message.agent === oldName) {
						message.agent = newName;
						conversationUpdated = true;
					}

					// Update @mentions in content
					const oldMention = `@${oldName}`;
					const newMention = `@${newName}`;
					if (message.content.includes(oldMention)) {
						// Replace @oldName with @newName
						// Match @mention followed by non-word character or end of string
						// This catches spaces, punctuation (including em dash —), or end of line
						const regex = new RegExp(
							`@${oldName.replace(REGEX_ESCAPE_PATTERN, '\\$&')}(?=\\W|$)`,
							'g'
						);
						message.content = message.content.replace(regex, newMention);
						conversationUpdated = true;
					}
				}

				// Save updated conversation
				if (conversationUpdated) {
					await this.saveConversation(conversation);
				}
			}
		} catch (error) {
			console.error('ConversationStorage: Failed to update agent name:', error);
		}
	}
}
