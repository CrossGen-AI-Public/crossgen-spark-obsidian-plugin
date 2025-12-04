import { type App, normalizePath } from 'obsidian';

export interface ChatResult {
	conversationId: string;
	queueId: string;
	timestamp: number;
	agent: string;
	content: string;
	filesModified?: string[];
	error?: string;
	conversationName?: string; // Generated chat name from daemon
}

/**
 * Watches for daemon results and notifies listeners
 */
export class ChatResultWatcher {
	private app: App;
	private resultsDir = '.spark/chat-results';
	private watchedFiles: Map<string, number> = new Map();
	private listeners: Array<(result: ChatResult) => void> = [];
	private interval: number | null = null;
	private cleanupInterval: number | null = null;
	private readonly CLEANUP_AGE_MS = 5 * 60 * 1000; // 5 minutes

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Start watching for results
	 */
	async start(): Promise<void> {
		// Ensure results directory exists
		await this.ensureResultsDir();

		// Initialize watchedFiles with existing files to prevent reprocessing old results
		await this.initializeWatchedFiles();

		// Poll for new results every 500ms
		this.interval = window.setInterval(() => {
			void this.checkForResults();
		}, 500);

		// Clean up old result files every 30 seconds
		this.cleanupInterval = window.setInterval(() => {
			void this.cleanupOldResults();
		}, 30000);
	}

	/**
	 * Stop watching
	 */
	stop(): void {
		if (this.interval !== null) {
			window.clearInterval(this.interval);
			this.interval = null;
		}
		if (this.cleanupInterval !== null) {
			window.clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}

	/**
	 * Add a result listener
	 */
	onResult(callback: (result: ChatResult) => void): void {
		this.listeners.push(callback);
	}

	/**
	 * Check for new results
	 */
	private async checkForResults(): Promise<void> {
		try {
			const files = await this.app.vault.adapter.list(this.resultsDir);

			for (const filePath of files.files) {
				if (!filePath.endsWith('.jsonl')) continue;

				const stat = await this.app.vault.adapter.stat(filePath);
				if (!stat) continue;

				const lastModified = stat.mtime;
				const lastChecked = this.watchedFiles.get(filePath) || 0;

				// File was modified since last check
				if (lastModified > lastChecked) {
					this.watchedFiles.set(filePath, lastModified);
					await this.processResultFile(filePath, lastChecked === 0);
				}
			}
		} catch (error) {
			console.error('ChatResultWatcher: Error checking for results:', error);
		}
	}

	/**
	 * Process a result file (JSONL format)
	 */
	private async processResultFile(filePath: string, isNewFile: boolean): Promise<void> {
		try {
			const content = await this.app.vault.adapter.read(filePath);
			const lines = content.split('\n').filter(line => line.trim());

			// If file is new, process all lines
			// Otherwise, only process the last line (the new result)
			const linesToProcess = isNewFile ? lines : lines.slice(-1);

			for (const line of linesToProcess) {
				try {
					const result = JSON.parse(line) as ChatResult;
					this.notifyListeners(result);
				} catch (error) {
					console.error('ChatResultWatcher: Failed to parse result line:', error);
				}
			}
		} catch (error) {
			console.error('ChatResultWatcher: Failed to read result file:', error);
		}
	}

	/**
	 * Notify all listeners of a new result
	 */
	private notifyListeners(result: ChatResult): void {
		this.listeners.forEach(listener => {
			try {
				listener(result);
			} catch (error) {
				console.error('ChatResultWatcher: Listener error:', error);
			}
		});
	}

	/**
	 * Ensure results directory exists
	 */
	private async ensureResultsDir(): Promise<void> {
		const exists = await this.app.vault.adapter.exists(this.resultsDir);
		if (!exists) {
			await this.app.vault.adapter.mkdir(this.resultsDir);
		}
	}

	/**
	 * Initialize watchedFiles map with existing result files
	 * This prevents reprocessing old results on plugin startup
	 */
	private async initializeWatchedFiles(): Promise<void> {
		try {
			const files = await this.app.vault.adapter.list(this.resultsDir);

			for (const filePath of files.files) {
				if (!filePath.endsWith('.jsonl')) continue;

				const stat = await this.app.vault.adapter.stat(filePath);
				if (stat) {
					// Mark file as already processed without triggering handlers
					this.watchedFiles.set(filePath, stat.mtime);
				}
			}
		} catch (error) {
			console.error('ChatResultWatcher: Error initializing watched files:', error);
		}
	}

	/**
	 * Get the result file path for a conversation
	 */
	getResultFilePath(conversationId: string): string {
		return normalizePath(`${this.resultsDir}/${conversationId}.jsonl`);
	}

	/**
	 * Clean up old result files (older than CLEANUP_AGE_MS)
	 */
	private async cleanupOldResults(): Promise<void> {
		try {
			const files = await this.app.vault.adapter.list(this.resultsDir);
			const now = Date.now();

			for (const filePath of files.files) {
				if (!filePath.endsWith('.jsonl')) continue;

				const stat = await this.app.vault.adapter.stat(filePath);
				if (!stat) continue;

				const age = now - stat.mtime;
				if (age > this.CLEANUP_AGE_MS) {
					await this.app.vault.adapter.remove(filePath);
					this.watchedFiles.delete(filePath);
				}
			}
		} catch (error) {
			console.error('ChatResultWatcher: Error during cleanup:', error);
		}
	}
}
