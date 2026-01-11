import { Plugin } from 'obsidian';
import { ChatManager } from './chat/ChatManager';
import { CommandPaletteManager } from './command-palette/CommandPaletteManager';
import { InlineChatManager } from './inline-chat/InlineChatManager';
import { MentionDecorator } from './mention/MentionDecorator';
import { SetupModal } from './modals/SetupModal';
import { EngineService } from './services/EngineService';
import { ResourceService } from './services/ResourceService';
import { DEFAULT_SETTINGS, SparkSettingTab } from './settings';
import type { ISparkPlugin, SparkSettings } from './types';
import { WORKFLOW_LIST_VIEW_TYPE, WorkflowListView } from './workflows/WorkflowListView';
import { WorkflowManager } from './workflows/WorkflowManager';
import { WORKFLOW_VIEW_TYPE, WorkflowView } from './workflows/WorkflowView';

export default class SparkPlugin extends Plugin implements ISparkPlugin {
	settings: SparkSettings;
	private commandPaletteManager: CommandPaletteManager;
	mentionDecorator: MentionDecorator;
	chatManager: ChatManager;
	private inlineChatManager: InlineChatManager;
	private statusBarItem: HTMLElement;
	private statusCheckInterval: number;
	private workflowManager: WorkflowManager;

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

		// Initialize workflow manager and register views
		this.workflowManager = WorkflowManager.getInstance(this.app, this);

		// Register workflow views
		this.registerView(WORKFLOW_VIEW_TYPE, leaf => new WorkflowView(leaf, this));
		this.registerView(WORKFLOW_LIST_VIEW_TYPE, leaf => new WorkflowListView(leaf, this));

		// Register workflow commands
		this.addCommand({
			id: 'open-workflows',
			name: 'Open workflows',
			callback: () => {
				void this.workflowManager.showWorkflowList();
			},
		});

		this.addCommand({
			id: 'create-workflow',
			name: 'Create new workflow',
			callback: () => {
				void this.workflowManager.createWorkflow();
			},
		});

		// Add ribbon icon for workflows
		this.addRibbonIcon('workflow', 'Open workflows', () => {
			void this.workflowManager.showWorkflowList();
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

		// Add status bar item with engine status
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass('spark-status-bar');
		this.updateStatusBar();

		// Periodically check engine status (every 10 seconds)
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

		// Check engine status and show setup modal if needed
		void this.checkEngineStatus();

		console.debug('Spark Assistant: Plugin loaded successfully');
	}

	/**
	 * Update status bar with engine status
	 */
	public updateStatusBar(): void {
		const engineService = EngineService.getInstance(this.app);
		const isInstalled = engineService.isEngineInstalled();
		const isRunning = isInstalled && engineService.isEngineRunning();

		this.statusBarItem.empty();

		if (!isInstalled) {
			this.statusBarItem.setText('⚡ Spark (not installed)');
			this.statusBarItem.addClass('spark-status-offline');
			this.statusBarItem.removeClass('spark-status-online');
			this.statusBarItem.setAttribute(
				'aria-label',
				'Spark engine not installed. Click to open chat.'
			);
		} else if (!isRunning) {
			this.statusBarItem.setText('⚡ Spark (offline)');
			this.statusBarItem.addClass('spark-status-offline');
			this.statusBarItem.removeClass('spark-status-online');
			this.statusBarItem.setAttribute(
				'aria-label',
				'Spark engine not running. Click to open chat.'
			);
		} else {
			this.statusBarItem.setText('⚡ Spark');
			this.statusBarItem.addClass('spark-status-online');
			this.statusBarItem.removeClass('spark-status-offline');
			this.statusBarItem.setAttribute('aria-label', 'Spark engine running. Click to open chat.');
		}
	}

	/**
	 * Check if engine is installed and running, show setup modal if needed
	 */
	private async checkEngineStatus(): Promise<void> {
		const engineService = EngineService.getInstance(this.app);

		// Check if engine is installed
		if (!engineService.isEngineInstalled()) {
			// Show install modal if not dismissed
			if (!this.settings.dismissedEngineSetup && !SetupModal.isModalOpen()) {
				const handleDismiss = (dontShowAgain: boolean) => {
					if (!dontShowAgain) return;
					this.settings.dismissedEngineSetup = true;
					void this.saveSettings();
				};
				new SetupModal(this.app, this, engineService, 'install', handleDismiss).open();
			}
			return;
		}

		// Engine is installed, check if running
		if (engineService.isEngineRunning()) {
			console.debug('[Spark] Engine is already running');
			return;
		}

		// Engine not running - try auto-launch if enabled
		if (this.settings.autoLaunchEngine) {
			console.debug('[Spark] Auto-launching engine...');
			await engineService.startEngineBackground();
			this.updateStatusBar(); // Update after auto-launch
			return;
		}

		// Show start modal if not dismissed
		if (!this.settings.dismissedEngineSetup && !SetupModal.isModalOpen()) {
			const handleDismiss = (dontShowAgain: boolean) => {
				if (!dontShowAgain) return;
				this.settings.dismissedEngineSetup = true;
				void this.saveSettings();
			};
			new SetupModal(this.app, this, engineService, 'start', handleDismiss).open();
		}
	}

	onunload(): void {
		this.commandPaletteManager?.unload();
		this.chatManager?.unload();
		void this.inlineChatManager?.cleanup();
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
