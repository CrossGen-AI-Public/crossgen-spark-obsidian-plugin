import type { App } from 'obsidian';
import type SparkPlugin from '../main';
import { ChatWindow } from './ChatWindow';
import { ConversationStorage } from './ConversationStorage';
import type { ChatMessage } from './types';

export class ChatManager {
	private static instance: ChatManager;
	private chatWindow: ChatWindow;
	private conversationStorage: ConversationStorage;

	private constructor(app: App, plugin: SparkPlugin) {
		this.conversationStorage = new ConversationStorage(app);
		this.chatWindow = new ChatWindow(app, plugin, this.conversationStorage);
	}

	public static getInstance(app: App, plugin: SparkPlugin): ChatManager {
		if (!ChatManager.instance) {
			ChatManager.instance = new ChatManager(app, plugin);
		}
		return ChatManager.instance;
	}

	initialize() {
		this.chatWindow.load();
	}

	unload() {
		this.chatWindow.unload();
	}

	toggleChat() {
		this.chatWindow.toggle();
	}

	openChatWithAgent(agentName: string) {
		this.chatWindow.addAgentMention(agentName);
	}

	// Add methods for conversation management
	getMessages(): ChatMessage[] {
		return this.chatWindow.getMessages();
	}

	getConversationId(): string | null {
		return this.chatWindow.getConversationId();
	}

	isProcessing(): boolean {
		return this.chatWindow.isProcessing();
	}

	clearConversation() {
		this.chatWindow.clearConversation();
	}

	async refreshCurrentChat(): Promise<void> {
		await this.chatWindow.refreshCurrentChat();
	}

	// Export conversation storage for external access
	getConversationStorage() {
		return this.conversationStorage;
	}
}
