// Spark Assistant Types
import type { Plugin } from 'obsidian';
import type { ChatManager } from '../chat/ChatManager';
import type { MentionDecorator } from '../mention/MentionDecorator';

export interface SparkSettings {
	enablePalette: boolean;
	chatHotkey: string;
	vaultPath: string;
	// API keys stored in encrypted ~/.spark/secrets.yaml, not in settings
	chatWindowWidth?: number; // Chat window width in pixels
	chatWindowHeight?: number; // Chat window height in pixels
	chatWindowRight?: number; // Chat window position from right edge in pixels
	chatWindowBottom?: number; // Chat window position from bottom edge in pixels
	// Workflows UI
	workflowSidebarWidth?: number; // Workflow node sidebar width in pixels
	// Engine setup
	dismissedEngineSetup?: boolean; // User dismissed the engine setup modal
	autoLaunchEngine?: boolean; // Auto-launch engine when Obsidian starts
}

export interface ISparkPlugin extends Plugin {
	settings: SparkSettings;
	loadSettings(): Promise<void>;
	saveSettings(): Promise<void>;
	mentionDecorator: MentionDecorator;
	chatManager: ChatManager;
	updateStatusBar(): void;
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
