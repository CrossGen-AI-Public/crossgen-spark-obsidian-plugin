import type { App, TAbstractFile } from 'obsidian';
import type { PaletteItem } from '../types/command-palette';
import { parseFrontmatter } from '../utils/markdown';

export class ResourceService {
	private static instance: ResourceService;
	private app: App;

	// Caches
	private agentsCache: PaletteItem[] | null = null;
	private commandsCache: PaletteItem[] | null = null;
	private _validAgentsCache: Set<string> | null = null;
	private _validCommandsCache: Set<string> | null = null;

	// Public readonly getters for validation caches
	get validAgentsCache(): Set<string> | null {
		return this._validAgentsCache;
	}
	get validCommandsCache(): Set<string> | null {
		return this._validCommandsCache;
	}

	private constructor(app: App) {
		this.app = app;
	}

	public static getInstance(app?: App): ResourceService {
		if (!ResourceService.instance) {
			if (!app) {
				throw new Error('ResourceService must be initialized with an App instance first.');
			}
			ResourceService.instance = new ResourceService(app);
		}
		return ResourceService.instance;
	}

	/**
	 * Initialize the service and set up file watchers
	 */
	public initialize(): void {
		// Watch for file changes in .spark/agents and .spark/commands
		this.app.vault.on('create', file => this.handleFileChange(file));
		this.app.vault.on('modify', file => this.handleFileChange(file));
		this.app.vault.on('delete', file => this.handleFileChange(file));
	}

	/**
	 * Handle file changes to invalidate cache if needed
	 */
	private handleFileChange(file: TAbstractFile): void {
		// Invalidate agent cache if agent file changed
		if (file.path.startsWith('.spark/agents/') && file.path.endsWith('.md')) {
			this.invalidateAgentCache();
		}

		// Invalidate command cache if command file changed
		if (file.path.startsWith('.spark/commands/') && file.path.endsWith('.md')) {
			this.invalidateCommandCache();
		}
	}

	/**
	 * Load all agents from .spark/agents/
	 */
	public async loadAgents(): Promise<PaletteItem[]> {
		if (this.agentsCache) {
			return this.agentsCache;
		}

		const items: PaletteItem[] = [];
		const agentsFolder = '.spark/agents';

		try {
			if (!(await this.app.vault.adapter.exists(agentsFolder))) {
				return [];
			}

			const listing = await this.app.vault.adapter.list(agentsFolder);
			const files = listing.files.filter(path => {
				if (!path.endsWith('.md')) return false;
				const fileName = path.split('/').pop()?.toLowerCase();
				return fileName !== 'readme.md';
			});

			for (const filePath of files) {
				const content = await this.app.vault.adapter.read(filePath);
				const metadata = parseFrontmatter(content);
				const fileName = filePath.split('/').pop()?.replace('.md', '') || '';

				items.push({
					type: 'agent',
					id: `@${fileName}`,
					name: metadata.name || fileName,
					description: metadata.role,
					path: filePath,
				});
			}

			this.agentsCache = items;
			this._validAgentsCache = new Set(items.map(item => item.id.substring(1))); // Remove @
		} catch (error) {
			console.error('ResourceService: Error loading agents:', error);
		}

		return items;
	}

	/**
	 * Load all commands from .spark/commands/
	 */
	public async loadCommands(): Promise<PaletteItem[]> {
		if (this.commandsCache) {
			return this.commandsCache;
		}

		const items: PaletteItem[] = [];
		const commandsFolder = '.spark/commands';

		try {
			if (!(await this.app.vault.adapter.exists(commandsFolder))) {
				return [];
			}

			const listing = await this.app.vault.adapter.list(commandsFolder);
			const files = listing.files.filter(path => {
				if (!path.endsWith('.md')) return false;
				const fileName = path.split('/').pop()?.toLowerCase();
				return fileName !== 'readme.md';
			});

			for (const filePath of files) {
				const content = await this.app.vault.adapter.read(filePath);
				const metadata = parseFrontmatter(content);
				const fileName = filePath.split('/').pop()?.replace('.md', '') || '';

				items.push({
					type: 'command',
					id: `/${fileName}`,
					name: metadata.name || fileName,
					description: metadata.description,
					path: filePath,
				});
			}

			this.commandsCache = items;
			this._validCommandsCache = new Set(items.map(item => item.id.substring(1))); // Remove /
		} catch (error) {
			console.error('ResourceService: Error loading commands:', error);
		}

		return items;
	}

	/**
	 * Validate if an agent exists
	 */
	public async validateAgent(agentName: string): Promise<boolean> {
		if (!this.validAgentsCache) {
			await this.loadAgents();
		}
		return this.validAgentsCache?.has(agentName) || false;
	}

	/**
	 * Validate if a command exists
	 */
	public async validateCommand(commandName: string): Promise<boolean> {
		if (!this.validCommandsCache) {
			await this.loadCommands();
		}
		return this.validCommandsCache?.has(commandName) || false;
	}

	/**
	 * Validate if a file exists (by basename)
	 */
	public validateFile(basename: string): boolean {
		return this.app.vault.getMarkdownFiles().some(f => f.basename === basename);
	}

	/**
	 * Validate if a folder exists (by path)
	 */
	public validateFolder(path: string): boolean {
		// Remove trailing slash if present
		const folderPath = path.endsWith('/') ? path.slice(0, -1) : path;
		return this.app.vault.getFolderByPath(folderPath) !== null;
	}

	/**
	 * Validate mention and return type (agent/file/folder) or null
	 * This is a synchronous method that uses cached data
	 */
	public validateMentionType(mention: string): 'agent' | 'file' | 'folder' | null {
		const isFolder = mention.endsWith('/');
		const basename = mention.substring(1); // Remove @

		if (isFolder) {
			const folderPath = basename;
			return this.validateFolder(folderPath) ? 'folder' : null;
		} else {
			// Check if it's an agent first (using cache)
			if (this.validAgentsCache?.has(basename)) {
				return 'agent';
			}

			// Then check if it's a file
			if (this.validateFile(basename)) {
				return 'file';
			}

			return null;
		}
	}

	/**
	 * Validate command and return type or null
	 * This is a synchronous method that uses cached data
	 */
	public validateCommandType(command: string): 'command' | null {
		const commandName = command.substring(1); // Remove /
		if (this.validCommandsCache?.has(commandName)) {
			return 'command';
		}
		return null;
	}

	/**
	 * Get list of all valid agent names
	 */
	public async getAgentNames(): Promise<string[]> {
		if (!this.validAgentsCache) {
			await this.loadAgents();
		}
		return Array.from(this.validAgentsCache || []);
	}

	/**
	 * Get list of all valid command names
	 */
	public async getCommandNames(): Promise<string[]> {
		if (!this.validCommandsCache) {
			await this.loadCommands();
		}
		return Array.from(this.validCommandsCache || []);
	}

	/**
	 * Invalidate agent cache
	 */
	public invalidateAgentCache(): void {
		this.agentsCache = null;
		this._validAgentsCache = null;
	}

	/**
	 * Invalidate command cache
	 */
	public invalidateCommandCache(): void {
		this.commandsCache = null;
		this._validCommandsCache = null;
	}

	/**
	 * Invalidate all caches
	 */
	public invalidateCache(): void {
		this.invalidateAgentCache();
		this.invalidateCommandCache();
	}
}
