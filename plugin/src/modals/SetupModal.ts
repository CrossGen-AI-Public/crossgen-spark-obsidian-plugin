import { type App, Modal, Notice, Setting } from 'obsidian';
import type { EngineService } from '../services/EngineService';
import type { ISparkPlugin } from '../types';

export type SetupModalMode = 'install' | 'start';

/**
 * Modal shown on startup when engine is not installed or not running
 */
export class SetupModal extends Modal {
	private plugin: ISparkPlugin;
	private engineService: EngineService;
	private mode: SetupModalMode;
	private onDismiss?: (dontShowAgain: boolean) => void;

	constructor(
		app: App,
		plugin: ISparkPlugin,
		engineService: EngineService,
		mode: SetupModalMode = 'install',
		onDismiss?: (dontShowAgain: boolean) => void
	) {
		super(app);
		this.plugin = plugin;
		this.engineService = engineService;
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
		new Setting(contentEl).setName('Welcome to Spark').setHeading();

		// Description
		const desc = contentEl.createDiv({ cls: 'spark-setup-description' });
		desc.createEl('p', {
			text: 'Spark requires a engine process to handle AI requests. The engine runs locally and processes your commands.',
		});

		desc.createEl('p', {
			text: 'The installation will:',
		});

		const list = desc.createEl('ul');
		list.createEl('li', { text: 'Download the Spark engine' });
		list.createEl('li', { text: 'Install it globally on your system' });
		list.createEl('li', { text: 'Add the command to your PATH' });

		// Install button
		new Setting(contentEl)
			.setName('Install Spark engine')
			.setDesc('Opens a terminal window to run the installation')
			.addButton(btn =>
				btn
					.setButtonText('Install Spark engine')
					.setCta()
					.onClick(() => {
						this.engineService.installEngine();
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
			text: 'You can manage the engine from plugin settings at any time.',
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
		codeBlock.setText(this.engineService.getInstallCommand());
	}

	private renderStartView() {
		const { contentEl } = this;

		// Header
		new Setting(contentEl).setName('Start Spark engine').setHeading();

		// Description
		const desc = contentEl.createDiv({ cls: 'spark-setup-description' });
		desc.createEl('p', {
			text: 'The Spark engine is installed but not running for this vault. Start it to enable AI features.',
		});

		// Start button
		new Setting(contentEl)
			.setName('Start engine')
			.setDesc('Starts the engine in the background')
			.addButton(btn =>
				btn
					.setButtonText('Start engine')
					.setCta()
					.onClick(() => {
						void (async () => {
							btn.setButtonText('Starting...');
							btn.setDisabled(true);
							const success = await this.engineService.startEngineBackground();
							if (success) {
								new Notice('Engine started');
								this.plugin.updateStatusBar();
							} else {
								new Notice('Failed to start engine');
							}
							this.close();
						})();
					})
			);

		// Auto-launch toggle
		new Setting(contentEl)
			.setName('Auto-launch engine')
			.setDesc('Automatically start the engine when Obsidian opens')
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.autoLaunchEngine ?? false).onChange(value => {
					this.plugin.settings.autoLaunchEngine = value;
					void this.plugin.saveSettings();
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
			text: 'You can manage the engine from plugin settings at any time.',
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
		codeBlock.setText(this.engineService.getStartCommand());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
