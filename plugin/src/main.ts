import { Plugin } from 'obsidian';
import { SparkSettingTab, DEFAULT_SETTINGS } from './settings';
import type { SparkSettings, ISparkPlugin } from './types';
import { CommandPaletteManager } from './command-palette/CommandPaletteManager';
import { MentionDecorator } from './mention/MentionDecorator';
import { ChatManager } from './chat/ChatManager';
import { InlineChatManager } from './inline-chat/InlineChatManager';
import { ResourceService } from './services/ResourceService';

export default class SparkPlugin extends Plugin implements ISparkPlugin {
	settings: SparkSettings;
	private commandPaletteManager: CommandPaletteManager;
	mentionDecorator: MentionDecorator;
	chatManager: ChatManager;
	private inlineChatManager: InlineChatManager;

	async onload() {
		console.log('Spark Assistant: Loading plugin...');

		// Load settings
		await this.loadSettings();

		// Initialize ResourceService (start file watchers)
		ResourceService.getInstance(this.app).initialize();

		// Initialize mention decorator first (with plugin reference for chat integration)
		this.mentionDecorator = new MentionDecorator(this.app, this);
		await this.mentionDecorator.initialize();
		this.registerEditorExtension(this.mentionDecorator.createExtension());

		// Initialize command palette manager with decorator reference
		this.commandPaletteManager = CommandPaletteManager.getInstance(this, this.mentionDecorator);
		this.commandPaletteManager.register();

		// Initialize chat manager
		this.chatManager = ChatManager.getInstance(this.app, this);
		this.chatManager.initialize();

		// Initialize inline chat manager
		this.inlineChatManager = InlineChatManager.getInstance(this.app, this.mentionDecorator);
		this.inlineChatManager.initialize();

		// Register chat hotkey (Cmd+K)
		this.addCommand({
			id: 'toggle-chat',
			name: 'Toggle Chat Window',
			editorCallback: () => {
				this.chatManager.toggleChat();
			},
			hotkeys: [
				{
					modifiers: ['Mod'],
					key: 'k',
				},
			],
		});

		// Start observing HTML table cells for mention styling
		this.mentionDecorator.startTableObserver();

		// Register mousedown handler to prevent cursor movement when clicking tokens
		this.registerDomEvent(
			document,
			'mousedown',
			(event: MouseEvent) => {
				const target = event.target as HTMLElement;
				if (target.classList.contains('spark-token')) {
					event.preventDefault();
				}
			},
			true
		);

		// Register click handler for tokens (mentions and commands)
		this.registerDomEvent(document, 'click', (event: MouseEvent) => {
			this.mentionDecorator.handleMentionClick(event);
		}); // Add settings tab
		this.addSettingTab(new SparkSettingTab(this.app, this));

		// Add status bar item
		const statusBarItem = this.addStatusBarItem();
		statusBarItem.setText('⚡ Spark');
		console.log('Spark Assistant: Plugin loaded successfully');
	}

	async onunload() {
		this.commandPaletteManager?.unload();
		this.chatManager?.unload();
		await this.inlineChatManager?.cleanup();
		this.mentionDecorator?.stopTableObserver();
		console.log('Spark Assistant: Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
