import { type App, Modal, Notice, Setting } from 'obsidian';
import type { DaemonService } from '../services/DaemonService';
import type { ISparkPlugin } from '../types';

export type SetupModalMode = 'install' | 'start';

/**
 * Modal shown on startup when daemon is not installed or not running
 */
export class SetupModal extends Modal {
	private plugin: ISparkPlugin;
	private daemonService: DaemonService;
	private mode: SetupModalMode;
	private onDismiss?: (dontShowAgain: boolean) => void;

	constructor(
		app: App,
		plugin: ISparkPlugin,
		daemonService: DaemonService,
		mode: SetupModalMode = 'install',
		onDismiss?: (dontShowAgain: boolean) => void
	) {
		super(app);
		this.plugin = plugin;
		this.daemonService = daemonService;
		this.mode = mode;
		this.onDismiss = onDismiss;
	}

	/**
	 * Check if the modal is currently open by looking at the DOM
	 * This survives plugin reloads
	 */
	public static isModalOpen(): boolean {
		return document.querySelector('.spark-setup-modal') !== null;
	}

	open() {
		if (SetupModal.isModalOpen()) {
			return; // Don't open another instance
		}
		super.open();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('spark-setup-modal');

		if (this.mode === 'install') {
			this.renderInstallView();
		} else {
			this.renderStartView();
		}
	}

	private renderInstallView() {
		const { contentEl } = this;

		// Header
		contentEl.createEl('h2', { text: 'Welcome to Spark Assistant' });

		// Description
		const desc = contentEl.createDiv({ cls: 'spark-setup-description' });
		desc.createEl('p', {
			text: 'Spark requires a daemon process to handle AI requests. The daemon runs locally and processes your commands.',
		});

		desc.createEl('p', {
			text: 'The installation will:',
		});

		const list = desc.createEl('ul');
		list.createEl('li', { text: 'Download the Spark daemon' });
		list.createEl('li', { text: 'Install it globally on your system' });
		list.createEl('li', { text: 'Add the spark command to your PATH' });

		// Install button
		new Setting(contentEl)
			.setName('Install Spark daemon')
			.setDesc('Opens a terminal window to run the installation')
			.addButton(btn =>
				btn
					.setButtonText('Install Spark Daemon')
					.setCta()
					.onClick(() => {
						this.daemonService.installDaemon();
						this.close();
					})
			);

		// Button container for dismiss options
		const buttonContainer = contentEl.createDiv({ cls: 'spark-setup-buttons' });

		// "I'll do it later" button
		const laterBtn = buttonContainer.createEl('button', {
			text: "I'll do it later",
		});
		laterBtn.addEventListener('click', () => {
			this.onDismiss?.(false);
			this.close();
		});

		// "Don't show again" button
		const dontShowBtn = buttonContainer.createEl('button', {
			text: "Don't show again",
		});
		dontShowBtn.addEventListener('click', () => {
			this.onDismiss?.(true);
			this.close();
		});

		// Settings hint
		contentEl.createEl('p', {
			text: 'You can manage the daemon from plugin settings at any time.',
			cls: 'spark-setup-hint',
		});

		// Manual install info
		const manualInfo = contentEl.createDiv({ cls: 'spark-setup-manual' });
		manualInfo.createEl('p', {
			text: 'Or install manually by running:',
			cls: 'setting-item-description',
		});

		const codeBlock = manualInfo.createEl('code', {
			cls: 'spark-setup-code',
		});
		codeBlock.setText(this.daemonService.getInstallCommand());
	}

	private renderStartView() {
		const { contentEl } = this;

		// Header
		contentEl.createEl('h2', { text: 'Start Spark Daemon' });

		// Description
		const desc = contentEl.createDiv({ cls: 'spark-setup-description' });
		desc.createEl('p', {
			text: 'The Spark daemon is installed but not running for this vault. Start it to enable AI features.',
		});

		// Start button
		new Setting(contentEl)
			.setName('Start daemon')
			.setDesc('Starts the daemon in the background')
			.addButton(btn =>
				btn
					.setButtonText('Start Spark Daemon')
					.setCta()
					.onClick(async () => {
						btn.setButtonText('Starting...');
						btn.setDisabled(true);
						const success = await this.daemonService.startDaemonBackground();
						if (success) {
							new Notice('Daemon started');
							this.plugin.updateStatusBar();
						} else {
							new Notice('Failed to start daemon');
						}
						this.close();
					})
			);

		// Auto-launch toggle
		new Setting(contentEl)
			.setName('Auto-launch daemon')
			.setDesc('Automatically start the daemon when Obsidian opens')
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.autoLaunchDaemon ?? false).onChange(async value => {
					this.plugin.settings.autoLaunchDaemon = value;
					await this.plugin.saveSettings();
				})
			);

		// Button container for dismiss options
		const buttonContainer = contentEl.createDiv({ cls: 'spark-setup-buttons' });

		// "I'll do it later" button
		const laterBtn = buttonContainer.createEl('button', {
			text: "I'll do it later",
		});
		laterBtn.addEventListener('click', () => {
			this.onDismiss?.(false);
			this.close();
		});

		// "Don't show again" button
		const dontShowBtn = buttonContainer.createEl('button', {
			text: "Don't show again",
		});
		dontShowBtn.addEventListener('click', () => {
			this.onDismiss?.(true);
			this.close();
		});

		// Settings hint
		contentEl.createEl('p', {
			text: 'You can manage the daemon from plugin settings at any time.',
			cls: 'spark-setup-hint',
		});

		// Manual start info
		const manualInfo = contentEl.createDiv({ cls: 'spark-setup-manual' });
		manualInfo.createEl('p', {
			text: 'Or start manually by running:',
			cls: 'setting-item-description',
		});

		const codeBlock = manualInfo.createEl('code', {
			cls: 'spark-setup-code',
		});
		codeBlock.setText(this.daemonService.getStartCommand());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
