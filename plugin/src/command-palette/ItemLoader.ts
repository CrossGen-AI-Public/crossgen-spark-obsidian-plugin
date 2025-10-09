import { App, TFolder } from 'obsidian';
import { PaletteItem } from '../types/command-palette';

export class ItemLoader {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Load all commands from .spark/commands/
	 */
	async loadCommands(): Promise<PaletteItem[]> {
		const commands: PaletteItem[] = [];

		try {
			const folderPath = '.spark/commands';
			const exists = await this.app.vault.adapter.exists(folderPath);

			if (!exists) {
				return commands;
			}

			const files = await this.app.vault.adapter.list(folderPath);

			for (const filePath of files.files) {
				if (filePath.endsWith('.md')) {
					const content = await this.app.vault.adapter.read(filePath);
					const metadata = this.parseFrontmatter(content);
					const fileName = filePath.split('/').pop()?.replace('.md', '') || '';

					commands.push({
						type: 'command' as const,
						id: `/${fileName}`,
						name: metadata.name || fileName,
						description: metadata.description,
						path: filePath,
					});
				}
			}
		} catch (error) {
			console.error('Error loading commands:', error);
		}

		return commands;
	}

	/**
	 * Load all agents from .spark/agents/
	 */
	async loadAgents(): Promise<PaletteItem[]> {
		const agents: PaletteItem[] = [];

		try {
			const folderPath = '.spark/agents';
			const exists = await this.app.vault.adapter.exists(folderPath);

			if (!exists) {
				return agents;
			}

			const files = await this.app.vault.adapter.list(folderPath);

			for (const filePath of files.files) {
				if (filePath.endsWith('.md')) {
					const content = await this.app.vault.adapter.read(filePath);
					const metadata = this.parseFrontmatter(content);
					const fileName = filePath.split('/').pop()?.replace('.md', '') || '';

					agents.push({
						type: 'agent' as const,
						id: `@${fileName}`,
						name: metadata.name || fileName,
						description: metadata.description || metadata.role,
						path: filePath,
					});
				}
			}
		} catch (error) {
			console.error('Error loading agents:', error);
		}

		return agents;
	}

	/**
	 * Load all markdown files from vault
	 */
	async loadFiles(): Promise<PaletteItem[]> {
		const files: PaletteItem[] = [];
		const allFiles = this.app.vault.getMarkdownFiles();

		for (const file of allFiles) {
			// Skip .spark folder files
			if (file.path.startsWith('.spark/')) {
				continue;
			}

			files.push({
				type: 'file',
				id: `@${file.basename}`,
				name: file.basename,
				description: file.path,
				path: file.path,
			});
		}

		return files;
	}

	/**
	 * Load all folders from vault
	 */
	async loadFolders(): Promise<PaletteItem[]> {
		const folders: PaletteItem[] = [];
		const allFolders = this.getAllFolders(this.app.vault.getRoot());

		for (const folder of allFolders) {
			// Skip .spark and .obsidian folders
			if (folder.path.startsWith('.spark') || folder.path.startsWith('.obsidian')) {
				continue;
			}

			folders.push({
				type: 'folder',
				id: `@${folder.path}/`,
				name: folder.name,
				description: folder.path,
				path: folder.path,
			});
		}

		return folders;
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
	 * Parse frontmatter from markdown content
	 */
	private parseFrontmatter(content: string): Record<string, string> {
		const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
		const match = content.match(frontmatterRegex);

		if (!match) {
			return {};
		}

		const frontmatter = match[1];
		const metadata: Record<string, string> = {};

		const lines = frontmatter.split('\n');
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
