// Spark Assistant Types
import { Plugin } from 'obsidian';

export interface SparkSettings {
	enablePalette: boolean;
	enableChat: boolean;
	chatHotkey: string;
	vaultPath: string;
	sparkFolder: string;
}

export interface ISparkPlugin extends Plugin {
	settings: SparkSettings;
	loadSettings(): Promise<void>;
	saveSettings(): Promise<void>;
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
