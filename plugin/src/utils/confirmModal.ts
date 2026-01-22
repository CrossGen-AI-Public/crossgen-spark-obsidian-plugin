/**
 * Confirmation modal utility for Obsidian
 * Replaces window.confirm with a proper Obsidian Modal
 */

import { type App, Modal, Setting } from 'obsidian';

/**
 * Shows a confirmation dialog using Obsidian's Modal API
 * @param app - The Obsidian app instance
 * @param message - The message to display
 * @param options - Optional configuration
 * @returns Promise that resolves to true if confirmed, false otherwise
 */
export function showConfirmModal(
	app: App,
	message: string,
	options?: {
		title?: string;
		confirmText?: string;
		cancelText?: string;
		dangerous?: boolean;
	}
): Promise<boolean> {
	return new Promise(resolve => {
		const modal = new ConfirmModal(app, message, options, resolve);
		modal.open();
	});
}

class ConfirmModal extends Modal {
	private message: string;
	private options: {
		title?: string;
		confirmText?: string;
		cancelText?: string;
		dangerous?: boolean;
	};
	private resolve: (confirmed: boolean) => void;
	private resolved = false;

	constructor(
		app: App,
		message: string,
		options: {
			title?: string;
			confirmText?: string;
			cancelText?: string;
			dangerous?: boolean;
		} = {},
		resolve: (confirmed: boolean) => void
	) {
		super(app);
		this.message = message;
		this.options = options;
		this.resolve = resolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		if (this.options.title) {
			new Setting(contentEl).setName(this.options.title).setHeading();
		}

		contentEl.createEl('p', { text: this.message });

		new Setting(contentEl)
			.addButton(btn => {
				const confirmBtn = btn.setButtonText(this.options.confirmText ?? 'Confirm').onClick(() => {
					this.resolved = true;
					this.close();
					this.resolve(true);
				});

				if (this.options.dangerous) {
					confirmBtn.setWarning();
				}
			})
			.addButton(btn => {
				btn.setButtonText(this.options.cancelText ?? 'Cancel').onClick(() => {
					this.resolved = true;
					this.close();
					this.resolve(false);
				});
			});
	}

	onClose() {
		// If closed without clicking a button (e.g., Escape key), resolve as cancelled
		if (!this.resolved) {
			this.resolve(false);
		}
	}
}
