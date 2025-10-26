import { App } from 'obsidian';
import SparkPlugin from '../main';
import { ChatWindow } from './ChatWindow';
import { ConversationStorage } from './ConversationStorage';
import { ChatMessage } from './types';

export class ChatManager {
	private app: App;
	private plugin: SparkPlugin;
	private chatWindow: ChatWindow;
	private conversationStorage: ConversationStorage;

	constructor(app: App, plugin: SparkPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.chatWindow = new ChatWindow(app, plugin);
		this.conversationStorage = new ConversationStorage(app);
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

	// Export conversation storage for external access
	getConversationStorage() {
		return this.conversationStorage;
	}
}
