import { Plugin } from 'obsidian';
import { ChatManager } from './chat/ChatManager';
import { CommandPaletteManager } from './command-palette/CommandPaletteManager';
import { InlineChatManager } from './inline-chat/InlineChatManager';
import { MentionDecorator } from './mention/MentionDecorator';
import { SetupModal } from './modals/SetupModal';
import { DaemonService } from './services/DaemonService';
import { ResourceService } from './services/ResourceService';
import { DEFAULT_SETTINGS, SparkSettingTab } from './settings';
import type { ISparkPlugin, SparkSettings } from './types';

export default class SparkPlugin extends Plugin implements ISparkPlugin {
	settings: SparkSettings;
	private commandPaletteManager: CommandPaletteManager;
	mentionDecorator: MentionDecorator;
	chatManager: ChatManager;
	private inlineChatManager: InlineChatManager;
	private statusBarItem: HTMLElement;
	private statusCheckInterval: number;

	async onload() {
		console.debug('Spark Assistant: Loading plugin...');

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

		// Register chat toggle command
		this.addCommand({
			id: 'toggle-chat',
			name: 'Toggle chat window',
			editorCallback: () => {
				this.chatManager.toggleChat();
			},
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

		// Add status bar item with daemon status
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass('spark-status-bar');
		this.updateStatusBar();

		// Periodically check daemon status (every 10 seconds)
		this.statusCheckInterval = window.setInterval(() => {
			this.updateStatusBar();
		}, 10000);
		this.registerInterval(this.statusCheckInterval);

		// Click on status bar to toggle chat
		this.statusBarItem.addEventListener('click', () => {
			this.chatManager.toggleChat();
		});

		// Add ribbon icon for chat (move to end of ribbon after layout ready)
		const ribbonIcon = this.addRibbonIcon('bot-message-square', 'Open Spark chat', () => {
			this.chatManager.toggleChat();
		});
		this.app.workspace.onLayoutReady(() => {
			ribbonIcon.parentElement?.appendChild(ribbonIcon);
		});

		// Check daemon status and show setup modal if needed
		this.checkDaemonStatus();

		console.debug('Spark Assistant: Plugin loaded successfully');
	}

	/**
	 * Update status bar with daemon status
	 */
	public updateStatusBar(): void {
		const daemonService = DaemonService.getInstance(this.app);
		const isInstalled = daemonService.isDaemonInstalled();
		const isRunning = isInstalled && daemonService.isDaemonRunning();

		this.statusBarItem.empty();

		if (!isInstalled) {
			this.statusBarItem.setText('⚡ Spark (not installed)');
			this.statusBarItem.addClass('spark-status-offline');
			this.statusBarItem.removeClass('spark-status-online');
			this.statusBarItem.setAttribute(
				'aria-label',
				'Spark daemon not installed. Click to open chat.'
			);
		} else if (!isRunning) {
			this.statusBarItem.setText('⚡ Spark (offline)');
			this.statusBarItem.addClass('spark-status-offline');
			this.statusBarItem.removeClass('spark-status-online');
			this.statusBarItem.setAttribute(
				'aria-label',
				'Spark daemon not running. Click to open chat.'
			);
		} else {
			this.statusBarItem.setText('⚡ Spark');
			this.statusBarItem.addClass('spark-status-online');
			this.statusBarItem.removeClass('spark-status-offline');
			this.statusBarItem.setAttribute('aria-label', 'Spark daemon running. Click to open chat.');
		}
	}

	/**
	 * Check if daemon is installed and running, show setup modal if needed
	 */
	private async checkDaemonStatus(): Promise<void> {
		const daemonService = DaemonService.getInstance(this.app);

		// Check if daemon is installed
		if (!daemonService.isDaemonInstalled()) {
			// Show install modal if not dismissed
			if (!this.settings.dismissedDaemonSetup && !SetupModal.isModalOpen()) {
				const handleDismiss = async (dontShowAgain: boolean) => {
					if (dontShowAgain) {
						this.settings.dismissedDaemonSetup = true;
						await this.saveSettings();
					}
				};
				new SetupModal(this.app, this, daemonService, 'install', handleDismiss).open();
			}
			return;
		}

		// Daemon is installed, check if running
		if (daemonService.isDaemonRunning()) {
			console.debug('[Spark] Daemon is already running');
			return;
		}

		// Daemon not running - try auto-launch if enabled
		if (this.settings.autoLaunchDaemon) {
			console.debug('[Spark] Auto-launching daemon...');
			await daemonService.startDaemonBackground();
			this.updateStatusBar(); // Update after auto-launch
			return;
		}

		// Show start modal if not dismissed
		if (!this.settings.dismissedDaemonSetup && !SetupModal.isModalOpen()) {
			const handleDismiss = async (dontShowAgain: boolean) => {
				if (dontShowAgain) {
					this.settings.dismissedDaemonSetup = true;
					await this.saveSettings();
				}
			};
			new SetupModal(this.app, this, daemonService, 'start', handleDismiss).open();
		}
	}

	async onunload() {
		this.commandPaletteManager?.unload();
		this.chatManager?.unload();
		await this.inlineChatManager?.cleanup();
		this.mentionDecorator?.stopTableObserver();
		console.debug('Spark Assistant: Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
