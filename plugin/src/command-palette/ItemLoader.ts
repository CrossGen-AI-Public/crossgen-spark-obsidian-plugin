import { App, TFolder } from 'obsidian';
import { PaletteItem } from '../types/command-palette';

interface ItemConfig {
	type: PaletteItem['type'];
	folder: string;
	prefix: string;
	descriptionField?: string;
}

/**
 * Loads palette items from various sources
 */
export class ItemLoader {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Load all commands from .spark/commands/
	 */
	async loadCommands(): Promise<PaletteItem[]> {
		return this.loadFromFolder({
			type: 'command',
			folder: '.spark/commands',
			prefix: '/',
		});
	}

	/**
	 * Load all agents from .spark/agents/
	 */
	async loadAgents(): Promise<PaletteItem[]> {
		return this.loadFromFolder({
			type: 'agent',
			folder: '.spark/agents',
			prefix: '@',
			descriptionField: 'role',
		});
	}

	/**
	 * Load all markdown files from vault
	 */
	async loadFiles(): Promise<PaletteItem[]> {
		return this.app.vault
			.getMarkdownFiles()
			.filter(file => !file.path.startsWith('.spark/'))
			.map(file => this.createFileItem(file));
	}

	/**
	 * Load all folders from vault
	 */
	async loadFolders(): Promise<PaletteItem[]> {
		return this.getAllFolders(this.app.vault.getRoot())
			.filter(folder => this.shouldIncludeFolder(folder))
			.map(folder => this.createFolderItem(folder));
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
		return !folder.path.startsWith('.spark') && !folder.path.startsWith('.obsidian');
	}

	/**
	 * Load items from a specific folder with configuration
	 */
	private async loadFromFolder(config: ItemConfig): Promise<PaletteItem[]> {
		const items: PaletteItem[] = [];

		try {
			if (!(await this.folderExists(config.folder))) {
				return items;
			}

			const files = await this.getMarkdownFiles(config.folder);

			for (const filePath of files) {
				const item = await this.createItemFromFile(filePath, config);
				if (item) {
					items.push(item);
				}
			}
		} catch (error) {
			console.error(`Error loading ${config.type}s from ${config.folder}:`, error);
		}

		return items;
	}

	/**
	 * Create a palette item from a file
	 */
	private async createItemFromFile(
		filePath: string,
		config: ItemConfig
	): Promise<PaletteItem | null> {
		const content = await this.app.vault.adapter.read(filePath);
		const metadata = this.parseFrontmatter(content);
		const fileName = this.getFileName(filePath);

		const description =
			metadata.description ||
			(config.descriptionField ? metadata[config.descriptionField] : undefined);

		return {
			type: config.type,
			id: `${config.prefix}${fileName}`,
			name: metadata.name || fileName,
			description,
			path: filePath,
		};
	}

	/**
	 * Check if folder exists
	 */
	private async folderExists(path: string): Promise<boolean> {
		return this.app.vault.adapter.exists(path);
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
	 * Extract file name without extension from path
	 */
	private getFileName(filePath: string): string {
		return filePath.split('/').pop()?.replace('.md', '') || '';
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

	/**
	 * Parse YAML frontmatter from markdown content
	 */
	private parseFrontmatter(content: string): Record<string, string> {
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (!match) {
			return {};
		}

		const metadata: Record<string, string> = {};
		const lines = match[1].split('\n');

		for (const line of lines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex > 0) {
				const key = line.substring(0, colonIndex).trim();
				const value = line.substring(colonIndex + 1).trim();
				metadata[key] = value;
			}
		}

		return metadata;
	}
}
