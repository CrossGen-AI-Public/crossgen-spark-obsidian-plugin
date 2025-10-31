// Spark Assistant Types
import { Plugin } from 'obsidian';
import { MentionDecorator } from '../command-palette/MentionDecorator';
import { ChatManager } from '../chat/ChatManager';

export interface SparkSettings {
	enablePalette: boolean;
	chatHotkey: string;
	vaultPath: string;
}

export interface ISparkPlugin extends Plugin {
	settings: SparkSettings;
	loadSettings(): Promise<void>;
	saveSettings(): Promise<void>;
	mentionDecorator: MentionDecorator;
	chatManager: ChatManager;
}

export interface SparkNotification {
	id: string;
	type: 'success' | 'error' | 'warning' | 'info';
	message: string;
	file?: string;
	link?: string;
	timestamp: number;
	progress?: number;
}

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
}
