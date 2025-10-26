import { App } from 'obsidian';

/**
 * Manages writing chat messages to the queue for daemon processing
 */
export class ChatQueue {
	private app: App;
	private queueDir = '.spark/chat-queue';

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Write a chat message to the queue for daemon processing
	 * @param conversationId - The conversation ID
	 * @param userMessage - The user's message content
	 * @param conversationHistory - Previous messages for context
	 * @param activeFilePath - Currently active file path for vault context
	 * @param primaryAgent - Primary agent for this conversation (last mentioned agent)
	 */
	async enqueue(
		conversationId: string,
		userMessage: string,
		conversationHistory: Array<{ role: string; content: string }>,
		activeFilePath?: string,
		primaryAgent?: string
	): Promise<string> {
		// Ensure queue directory exists
		await this.ensureQueueDir();

		// Generate unique queue file name
		const timestamp = Date.now();
		const queueId = `${conversationId}-${timestamp}`;
		const queueFile = `${this.queueDir}/${queueId}.md`;

		// Build markdown content with Spark syntax
		let content = '---\n';
		content += `conversation_id: ${conversationId}\n`;
		content += `timestamp: ${timestamp}\n`;
		content += `queue_id: ${queueId}\n`;
		if (activeFilePath) {
			content += `active_file: ${activeFilePath}\n`;
		}
		if (primaryAgent) {
			content += `primary_agent: ${primaryAgent}\n`;
		}
		content += '---\n\n';

		// Add conversation context if available
		if (conversationHistory.length > 0) {
			content += '<!-- spark-chat-context -->\n';
			conversationHistory.forEach(msg => {
				content += `**${msg.role}**: ${msg.content}\n\n`;
			});
			content += '<!-- /spark-chat-context -->\n\n';
		}

		// Add the user's current message
		content += '<!-- spark-chat-message -->\n';
		content += userMessage + '\n';
		content += '<!-- /spark-chat-message -->\n';

		// Write to queue
		await this.app.vault.adapter.write(queueFile, content);

		console.log('ChatQueue: Enqueued message:', queueFile);
		return queueId;
	}

	/**
	 * Ensure queue directory exists
	 */
	private async ensureQueueDir(): Promise<void> {
		const exists = await this.app.vault.adapter.exists(this.queueDir);
		if (!exists) {
			await this.app.vault.adapter.mkdir(this.queueDir);
			console.log('ChatQueue: Created queue directory');
		}
	}

	/**
	 * Clean up a processed queue file
	 */
	async dequeue(queueId: string): Promise<void> {
		const queueFile = `${this.queueDir}/${queueId}.md`;
		try {
			const exists = await this.app.vault.adapter.exists(queueFile);
			if (exists) {
				await this.app.vault.adapter.remove(queueFile);
				console.log('ChatQueue: Dequeued message:', queueFile);
			}
		} catch (error) {
			console.error('ChatQueue: Failed to dequeue:', error);
		}
	}

	/**
	 * List all pending queue files
	 */
	async listPending(): Promise<string[]> {
		try {
			const exists = await this.app.vault.adapter.exists(this.queueDir);
			if (!exists) {
				return [];
			}

			const files = await this.app.vault.adapter.list(this.queueDir);
			return files.files
				.filter(f => f.endsWith('.md'))
				.map(f => f.replace(`${this.queueDir}/`, '').replace('.md', ''));
		} catch (error) {
			console.error('ChatQueue: Failed to list pending:', error);
			return [];
		}
	}
}
