import { type App, TFolder } from 'obsidian';
import { ResourceService } from '../services/ResourceService';
import type { PaletteItem } from '../types/command-palette';

/**
 * Loads palette items from various sources
 */
export class ItemLoader {
	private app: App;
	private resourceService: ResourceService;

	constructor(app: App) {
		this.app = app;
		this.resourceService = ResourceService.getInstance(app);
	}

	/**
	 * Load all commands from .spark/commands/
	 */
	loadCommands(): Promise<PaletteItem[]> {
		return this.resourceService.loadCommands();
	}

	/**
	 * Load all agents from .spark/agents/
	 */
	loadAgents(): Promise<PaletteItem[]> {
		return this.resourceService.loadAgents();
	}

	/**
	 * Load all markdown files from vault
	 */
	loadFiles(): Promise<PaletteItem[]> {
		return Promise.resolve(
			this.app.vault
				.getMarkdownFiles()
				.filter(file => !file.path.startsWith('.spark/'))
				.map(file => this.createFileItem(file))
		);
	}

	/**
	 * Load all folders from vault
	 */
	loadFolders(): Promise<PaletteItem[]> {
		return Promise.resolve(
			this.getAllFolders(this.app.vault.getRoot())
				.filter(folder => this.shouldIncludeFolder(folder))
				.map(folder => this.createFolderItem(folder))
		);
	}

	/**
	 * Create a file palette item
	 */
	private createFileItem(file: { basename: string; path: string }): PaletteItem {
		return {
			type: 'file',
			id: `@${file.basename}`,
			name: file.basename,
			description: file.path,
			path: file.path,
		};
	}

	/**
	 * Create a folder palette item
	 */
	private createFolderItem(folder: { name: string; path: string }): PaletteItem {
		return {
			type: 'folder',
			id: `@${folder.path}/`,
			name: folder.name,
			description: folder.path,
			path: folder.path,
		};
	}

	/**
	 * Check if folder should be included in results
	 */
	private shouldIncludeFolder(folder: TFolder): boolean {
		const configDir = this.app.vault.configDir;
		return !folder.path.startsWith('.spark') && !folder.path.startsWith(configDir);
	}

	/**
	 * Get all markdown files in a folder
	 */
	private async getMarkdownFiles(folderPath: string): Promise<string[]> {
		const listing = await this.app.vault.adapter.list(folderPath);
		return listing.files.filter(path => {
			if (!path.endsWith('.md')) return false;
			// Skip README files
			const fileName = path.split('/').pop()?.toLowerCase();
			return fileName !== 'readme.md';
		});
	}

	/**
	 * Get all folders recursively
	 */
	private getAllFolders(folder: TFolder): TFolder[] {
		const folders: TFolder[] = [];

		for (const child of folder.children) {
			if (child instanceof TFolder) {
				folders.push(child);
				folders.push(...this.getAllFolders(child));
			}
		}

		return folders;
	}
}
