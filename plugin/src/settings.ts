/* eslint-env node */
import { type App, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import type { SparkSettings, ISparkPlugin } from './types';
import * as yaml from 'js-yaml';
import { AgentConfigSchema, SparkConfigSchema, type SparkConfig } from './validation';
import {
	ALL_MODELS,
	getModelLabel,
	ProviderType,
	getProviderLabel,
	getModelsByProvider,
} from './models';
import { encryptSecrets, decryptSecrets, isEncrypted } from './crypto/index';
import {
	DEFAULT_CHAT_WIDTH,
	DEFAULT_CHAT_HEIGHT,
	DEFAULT_CHAT_RIGHT,
	DEFAULT_CHAT_BOTTOM,
} from './constants';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';

export const DEFAULT_SETTINGS: SparkSettings = {
	enablePalette: true,
	chatHotkey: 'Mod+K',
	vaultPath: '',
	chatWindowWidth: DEFAULT_CHAT_WIDTH,
	chatWindowHeight: DEFAULT_CHAT_HEIGHT,
	chatWindowRight: DEFAULT_CHAT_RIGHT,
	chatWindowBottom: DEFAULT_CHAT_BOTTOM,
};

interface AgentConfig {
	name: string;
	role: string;
	expertise: string[];
	context_folders?: string[];
	tools?: string[];
	ai: {
		model: string;
		temperature: number;
	};
	instructions: string;
}

export class SparkSettingTab extends PluginSettingTab {
	plugin: ISparkPlugin;
	private agentsContainer: HTMLElement | null = null;
	private configContainer: HTMLElement | null = null;
	private cachedApiKeys: Record<string, string> = {};

	constructor(app: App, plugin: ISparkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private async loadApiKeys(): Promise<Record<string, string>> {
		const secretsPath = join(homedir(), '.spark', 'secrets.yaml');
		try {
			if (!existsSync(secretsPath)) return {};

			const content = readFileSync(secretsPath, 'utf-8');
			if (!content.trim()) return {};

			const yamlContent = isEncrypted(content.trim()) ? decryptSecrets(content.trim()) : content;

			const secrets = yaml.load(yamlContent) as { api_keys?: Record<string, string> };
			return secrets.api_keys || {};
		} catch (error) {
			console.error('[Spark] Error loading API keys:', error);
			return {};
		}
	}

	private async saveApiKeys(apiKeys: Record<string, string>): Promise<void> {
		const secretsDir = join(homedir(), '.spark');
		const secretsPath = join(secretsDir, 'secrets.yaml');

		if (!existsSync(secretsDir)) {
			mkdirSync(secretsDir, { recursive: true });
		}

		const yamlStr = yaml.dump({ api_keys: apiKeys }, { lineWidth: -1 });
		const encryptedContent = encryptSecrets(yamlStr);

		writeFileSync(secretsPath, encryptedContent, 'utf-8');
		chmodSync(secretsPath, 0o600);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Spark Assistant Settings' });

		// Create tab navigation
		const tabNav = containerEl.createDiv({ cls: 'spark-settings-tabs' });

		const tabs = [
			{ id: 'general', name: 'General' },
			{ id: 'agents', name: 'Agents' },
			{ id: 'advanced', name: 'Advanced' },
		];

		const tabButtons: HTMLElement[] = [];
		const tabContents: HTMLElement[] = [];

		// Create tab buttons
		tabs.forEach((tab, index) => {
			const tabButton = tabNav.createEl('button', {
				text: tab.name,
				cls: 'spark-tab-button',
			});

			// Active state for first tab
			if (index === 0) {
				tabButton.classList.add('active');
			}

			tabButtons.push(tabButton);
		});

		// Create tab content container
		const tabContentContainer = containerEl.createDiv({ cls: 'spark-tab-content' });

		// Create tab contents
		tabs.forEach((tab, index) => {
			const tabContent = tabContentContainer.createDiv({ cls: `spark-tab-${tab.id}` });
			tabContent.style.display = index === 0 ? 'block' : 'none';
			tabContents.push(tabContent);
		});

		// Tab switching functionality
		tabButtons.forEach((button, index) => {
			button.addEventListener('click', () => {
				// Hide all tab contents
				tabContents.forEach(content => {
					content.style.display = 'none';
				});

				// Reset all tab buttons
				tabButtons.forEach(btn => {
					btn.classList.remove('active');
				});

				// Show selected tab content
				tabContents[index].style.display = 'block';

				// Activate selected tab button
				button.classList.add('active');
			});
		});

		// Populate tab contents
		this.populateGeneralTab(tabContents[0]);
		this.populateAgentsTab(tabContents[1]);
		this.populateAdvancedTab(tabContents[2]);
	}

	private populateGeneralTab(containerEl: HTMLElement) {
		// Plugin Settings Section
		containerEl.createEl('h3', { text: 'Plugin Settings' });
		const pluginDesc = containerEl.createEl('p', {
			text: 'Configure Spark plugin behavior and appearance.',
			cls: 'setting-item-description',
		});
		pluginDesc.style.marginBottom = '1em';

		new Setting(containerEl)
			.setName('Enable Command Palette')
			.setDesc('Enable slash command autocomplete (/ and @)')
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.enablePalette).onChange(async value => {
					this.plugin.settings.enablePalette = value;
					await this.plugin.saveSettings();
				})
			);
	}

	private populateAgentsTab(containerEl: HTMLElement) {
		// Agents Section
		containerEl.createEl('h3', { text: 'Agents' });
		const agentsDesc = containerEl.createEl('p', {
			text: 'Manage AI agents. Changes are saved directly to files and picked up automatically.',
			cls: 'setting-item-description',
		});
		agentsDesc.style.marginBottom = '1em';

		// Add Agent button
		new Setting(containerEl)
			.setName('Add New Agent')
			.setDesc('Create a new AI agent')
			.addButton(btn =>
				btn
					.setButtonText('Add Agent')
					.setCta()
					.onClick(async () => {
						await this.addNewAgent();
					})
			);

		this.agentsContainer = containerEl.createDiv();
		this.loadAgents();
	}

	private populateAdvancedTab(containerEl: HTMLElement) {
		this.configContainer = containerEl.createDiv();
		this.loadConfig();
	}

	private async loadAgents() {
		if (!this.agentsContainer) return;

		this.agentsContainer.empty();
		const agentsPath = '.spark/agents';

		try {
			// Use adapter directly to list and read files (works with hidden folders)
			const adapter = this.app.vault.adapter;

			const agentFileNames = await adapter.list(agentsPath);
			const agentFilePaths = agentFileNames.files.filter(
				fileName => fileName.endsWith('.md') && !fileName.includes('README')
			);

			if (agentFilePaths.length === 0) {
				this.agentsContainer.createEl('p', {
					text: `No agents found in ${agentsPath}`,
					cls: 'setting-item-description',
				});
				return;
			}

			for (const filePath of agentFilePaths) {
				await this.renderAgentEditor(filePath);
			}
		} catch (error) {
			console.error('Error loading agents:', error, 'Path:', agentsPath);
			new Notice(`Error loading agents: ${error.message}`);
		}
	}

	private async renderAgentEditor(filePath: string) {
		if (!this.agentsContainer) return;

		try {
			const adapter = this.app.vault.adapter;
			const content = await adapter.read(filePath);
			const agent = this.parseAgentFile(content);
			const fileName = filePath.split('/').pop() || 'unknown';

			const agentContainer = this.agentsContainer.createDiv({ cls: 'spark-agent-editor' });

			// Agent header with collapsible functionality
			const setting = new Setting(agentContainer)
				.setName(agent.name || fileName.replace('.md', ''))
				.setDesc(agent.role || 'No role specified')
				.addButton(btn =>
					btn.setButtonText('Edit').onClick(() => {
						const editor = agentContainer.querySelector('.spark-agent-form') as HTMLElement;
						if (editor) {
							editor.classList.toggle('visible');
						}
					})
				)
				.addExtraButton(btn => {
					btn
						.setIcon('trash')
						.setTooltip('Delete agent')
						.onClick(async () => {
							await this.deleteAgent(filePath, agent.name);
						});
				});

			// Store reference to update later
			const nameEl = setting.nameEl;
			const descEl = setting.descEl;

			// Style the trash icon button to match Edit button
			const trashButton = setting.controlEl.querySelector(
				'.extra-setting-button:last-child'
			) as HTMLElement;
			if (trashButton) {
				trashButton.addClass('spark-agent-delete-btn');
			}

			// Editor form (hidden by default)
			const editorForm = agentContainer.createDiv({ cls: 'spark-agent-form' });

			// Name
			new Setting(editorForm)
				.setName('Name')
				.addText(text => text.setValue(agent.name).onChange(value => (agent.name = value)));

			// Role
			new Setting(editorForm)
				.setName('Role')
				.addText(text => text.setValue(agent.role).onChange(value => (agent.role = value)));

			// Expertise (comma-separated)
			new Setting(editorForm)
				.setName('Expertise')
				.setDesc('Comma-separated list of expertise areas')
				.addText(text =>
					text
						.setValue(agent.expertise.join(', '))
						.onChange(value => (agent.expertise = value.split(',').map(s => s.trim())))
				);

			// Context folders (comma-separated)
			new Setting(editorForm)
				.setName('Context Folders')
				.setDesc('Comma-separated list of folders (optional)')
				.addText(text =>
					text
						.setValue(agent.context_folders?.join(', ') || '')
						.onChange(
							value => (agent.context_folders = value ? value.split(',').map(s => s.trim()) : [])
						)
				);

			// Tools (comma-separated)
			new Setting(editorForm)
				.setName('Tools')
				.setDesc('Comma-separated list of tools (optional)')
				.addText(text =>
					text
						.setValue(agent.tools?.join(', ') || '')
						.onChange(value => (agent.tools = value ? value.split(',').map(s => s.trim()) : []))
				);

			// AI Model
			new Setting(editorForm)
				.setName('AI Model')
				.setDesc('Select from available Claude models')
				.addDropdown(dropdown => {
					// Add all available Claude models
					ALL_MODELS.forEach(model => {
						dropdown.addOption(model, getModelLabel(model));
					});
					dropdown.setValue(agent.ai.model).onChange(value => (agent.ai.model = value));
					return dropdown;
				});

			// Temperature
			new Setting(editorForm)
				.setName('Temperature')
				.setDesc('0.0 to 1.0')
				.addText(text => {
					text.setValue(agent.ai.temperature.toString()).onChange(value => {
						// Only allow numbers and decimal point
						const sanitized = value.replace(/[^0-9.]/g, '');
						if (sanitized !== value) {
							text.setValue(sanitized);
						}
						agent.ai.temperature = parseFloat(sanitized) || 0.7;
					});
					text.inputEl.setAttribute('type', 'number');
					text.inputEl.setAttribute('step', '0.1');
					text.inputEl.setAttribute('min', '0');
					text.inputEl.setAttribute('max', '1');
					return text;
				});

			// Instructions (textarea)
			new Setting(editorForm)
				.setName('Instructions')
				.setDesc('Agent behavior and personality')
				.addTextArea(text => {
					text.setValue(agent.instructions).onChange(value => (agent.instructions = value));
					text.inputEl.rows = 10;
					text.inputEl.addClass('spark-agent-instructions');
					return text;
				});

			// Save button
			new Setting(editorForm).addButton(btn =>
				btn
					.setButtonText('Save Agent')
					.setCta()
					.onClick(async () => {
						// Validate with Zod
						const result = AgentConfigSchema.safeParse(agent);

						if (!result.success) {
							const firstError = result.error.issues[0];
							new Notice(`Validation error: ${firstError.message}`);
							return;
						}

						await this.saveAgent(filePath, result.data);
						new Notice(`Agent ${agent.name} saved`);

						// Update displayed name and role
						nameEl.textContent = result.data.name;
						descEl.textContent = result.data.role;

						// Close the editor form
						editorForm.classList.remove('visible');
					})
			);
		} catch (error) {
			console.error('Error rendering agent editor:', error);
			new Notice(`Error loading agent ${filePath}`);
		}
	}

	private parseAgentFile(content: string): AgentConfig {
		const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (!match) {
			throw new Error('Invalid agent file format');
		}

		const frontmatter = yaml.load(match[1]) as Partial<AgentConfig>;
		const instructions = match[2].trim();

		return {
			name: frontmatter.name || '',
			role: frontmatter.role || '',
			expertise: frontmatter.expertise || [],
			context_folders: frontmatter.context_folders,
			tools: frontmatter.tools,
			ai: frontmatter.ai || { model: 'claude-sonnet-4-5-20250929', temperature: 0.7 },
			instructions,
		};
	}

	private async saveAgent(filePath: string, agent: AgentConfig) {
		const frontmatter = {
			name: agent.name,
			role: agent.role,
			expertise: agent.expertise,
			...(agent.context_folders &&
				agent.context_folders.length > 0 && { context_folders: agent.context_folders }),
			...(agent.tools && agent.tools.length > 0 && { tools: agent.tools }),
			ai: agent.ai,
		};

		const yamlStr = yaml.dump(frontmatter, { lineWidth: -1 });
		const content = `---\n${yamlStr}---\n\n${agent.instructions}\n`;

		const adapter = this.app.vault.adapter;

		// Check if we need to rename the file
		const oldFileName = filePath.split('/').pop()?.replace('.md', '') || '';
		const newFileName = agent.name.toLowerCase().replace(/\s+/g, '-');

		if (oldFileName !== newFileName) {
			// Rename the file
			const newPath = `.spark/agents/${newFileName}.md`;
			await adapter.write(newPath, content);
			await adapter.remove(filePath);

			// Update all conversations that mention the old agent name
			const conversationStorage = this.plugin.chatManager.getConversationStorage();
			await conversationStorage.updateAgentName(oldFileName, newFileName);

			// Refresh the currently open chat if any (to show updated agent names)
			await this.plugin.chatManager.refreshCurrentChat();

			// Reload agents list to reflect the filename change
			await this.loadAgents();

			// Refresh mention decorator to pick up the new name
			await this.plugin.mentionDecorator.refresh();
		} else {
			// Just update the existing file
			await adapter.write(filePath, content);

			// Refresh mention decorator in case agent metadata changed
			await this.plugin.mentionDecorator.refresh();
		}
	}

	private async addNewAgent() {
		const agentName = await this.promptForAgentName();
		if (!agentName) return;

		const agentsPath = '.spark/agents';
		const fileName = `${agentName.toLowerCase().replace(/\s+/g, '-')}.md`;
		const filePath = `${agentsPath}/${fileName}`;

		try {
			const adapter = this.app.vault.adapter;

			// Check if file already exists
			const exists = await adapter.exists(filePath);
			if (exists) {
				new Notice(`Agent "${agentName}" already exists`);
				return;
			}

			// Create default agent config
			const defaultAgent: AgentConfig = {
				name: agentName,
				role: 'AI Assistant',
				expertise: ['General assistance'],
				ai: {
					model: 'claude-sonnet-4-5-20250929',
					temperature: 0.7,
				},
				instructions: `You are ${agentName}, an AI assistant.\n\nProvide helpful, accurate, and friendly assistance.`,
			};

			// Save the new agent
			await this.saveAgent(filePath, defaultAgent);

			new Notice(`Agent "${agentName}" created successfully`);

			// Reload agents list
			await this.loadAgents();

			// Refresh mention decorator to pick up the new agent
			await this.plugin.mentionDecorator.refresh();
		} catch (error) {
			console.error('Error creating agent:', error);
			new Notice(`Error creating agent: ${error.message}`);
		}
	}

	private async deleteAgent(filePath: string, agentName: string) {
		// Confirm deletion
		const confirmed = await this.confirmDelete(agentName);
		if (!confirmed) return;

		try {
			const adapter = this.app.vault.adapter;

			// Delete the file
			await adapter.remove(filePath);

			new Notice(`Agent "${agentName}" deleted successfully`);

			// Reload agents list
			await this.loadAgents();

			// Refresh mention decorator to remove the deleted agent
			await this.plugin.mentionDecorator.refresh();
		} catch (error) {
			console.error('Error deleting agent:', error);
			new Notice(`Error deleting agent: ${error.message}`);
		}
	}

	private async confirmDelete(agentName: string): Promise<boolean> {
		return new Promise(resolve => {
			const modal = new ConfirmDeleteModal(this.app, agentName, confirmed => {
				resolve(confirmed);
			});
			modal.open();
		});
	}

	private async promptForAgentName(): Promise<string | null> {
		return new Promise(resolve => {
			const modal = new AgentNameModal(this.app, name => {
				resolve(name);
			});
			modal.open();
		});
	}

	private async loadConfig() {
		if (!this.configContainer) return;

		this.configContainer.empty();

		// Load API keys from encrypted secrets file
		this.cachedApiKeys = await this.loadApiKeys();

		const configPath = '.spark/config.yaml';

		try {
			// Use adapter to read config file (works with hidden folders)
			const adapter = this.app.vault.adapter;
			const content = await adapter.read(configPath);
			const config = yaml.load(content) as SparkConfig;

			// Daemon Settings
			this.configContainer.createEl('h4', { text: 'Daemon Settings' });

			new Setting(this.configContainer)
				.setName('Debounce (ms)')
				.setDesc('Delay before processing file changes')
				.addText(text => {
					text
						.setValue(config.daemon.debounce_ms.toString())
						.onChange(value => (config.daemon.debounce_ms = parseInt(value, 10) || 300));
					text.inputEl.setAttribute('type', 'number');
					text.inputEl.setAttribute('min', '0');
					return text;
				});

			new Setting(this.configContainer)
				.setName('Add Blank Lines')
				.setDesc('Add blank lines before results')
				.addToggle(toggle =>
					toggle
						.setValue(config.daemon.results.add_blank_lines)
						.onChange(value => (config.daemon.results.add_blank_lines = value))
				);

			// AI Provider Settings
			this.configContainer.createEl('h4', { text: 'AI Provider' });

			// Get available provider names
			const providerNames = Object.keys(config.ai.providers);

			new Setting(this.configContainer)
				.setName('Default Provider')
				.setDesc('Which provider to use by default')
				.addDropdown(dropdown => {
					// Add all available providers as options
					providerNames.forEach(name => {
						dropdown.addOption(name, name);
					});
					dropdown
						.setValue(config.ai.defaultProvider)
						.onChange(value => (config.ai.defaultProvider = value));
					return dropdown;
				});

			// Provider configurations as nested accordion
			this.configContainer.createEl('h4', { text: 'AI Providers' });
			this.configContainer.createEl('div', {
				text: 'Configure AI provider settings',
				cls: 'setting-item-description spark-providers-description',
			});

			// Add informational banner about API keys storage
			const infoEl = this.configContainer.createDiv({ cls: 'setting-item-description' });
			infoEl.style.marginBottom = '1em';
			infoEl.style.padding = '0.5em';
			infoEl.style.backgroundColor = 'var(--background-secondary)';
			infoEl.style.borderRadius = '4px';

			infoEl.createSpan({ text: '🔒 ' });
			infoEl.createEl('strong', { text: 'API keys storage: ' });
			infoEl.createEl('code', { text: '~/.spark/secrets.yaml' });
			infoEl.appendText(' (outside your vault, safe to sync)');
			infoEl.createEl('br');
			const priorityText = infoEl.createEl('small');
			priorityText.style.opacity = '0.8';

			const providersContainer = this.configContainer.createDiv({
				cls: 'spark-providers-accordion',
			});

			for (const [providerName, providerConfig] of Object.entries(config.ai.providers)) {
				// Provider item (no borders, clean accordion style)
				const providerItem = providersContainer.createDiv({ cls: 'spark-provider-item' });

				// Provider header (clickable to expand)
				const providerHeader = providerItem.createDiv({ cls: 'spark-provider-header' });

				// Provider title (collapsible indicator + name)
				const titleContainer = providerHeader.createDiv({ cls: 'spark-provider-title' });

				// Collapsible arrow indicator
				const arrow = titleContainer.createSpan({ cls: 'spark-provider-arrow' });
				arrow.textContent = '▶';

				// Provider name and type
				const titleEl = titleContainer.createSpan({
					text: `${providerName} (${getProviderLabel(providerConfig.type)})`,
				});

				// Collapsible content (hidden by default)
				const providerContent = providerItem.createDiv({ cls: 'spark-provider-content' });

				// Toggle collapse on header click
				const toggleProvider = () => {
					const isVisible = providerContent.classList.contains('visible');
					if (isVisible) {
						providerContent.classList.remove('visible');
						arrow.classList.remove('expanded');
					} else {
						providerContent.classList.add('visible');
						arrow.classList.add('expanded');
					}
				};

				providerHeader.addEventListener('click', () => {
					toggleProvider();
				});

				// Function to update model dropdown when provider type changes
				// biome-ignore lint/suspicious/noExplicitAny: Dynamic Obsidian Setting element reference
				let modelDropdownElement: any;
				const updateModelDropdown = () => {
					// Remove the old model dropdown if it exists
					if (modelDropdownElement?.settingEl) {
						modelDropdownElement.settingEl.remove();
					}
					// Create new model dropdown with updated models
					modelDropdownElement = createModelDropdown();
				};

				// Create model dropdown function
				const createModelDropdown = () => {
					const modelSetting = new Setting(providerContent)
						.setName('Model')
						.setDesc(`Select ${getProviderLabel(providerConfig.type)} model`)
						.addDropdown(dropdown => {
							// Get models for the current provider type
							const availableModels = getModelsByProvider(providerConfig.type);
							availableModels.forEach(model => {
								dropdown.addOption(model, getModelLabel(model));
							});
							dropdown
								.setValue(providerConfig.model)
								.onChange(value => (providerConfig.model = value));
							return dropdown;
						});
					return modelSetting;
				};

				new Setting(providerContent)
					.setName('Type')
					.setDesc('Provider type')
					.addDropdown(dropdown => {
						// Add all available provider types
						Object.values(ProviderType).forEach(type => {
							dropdown.addOption(type, getProviderLabel(type));
						});
						dropdown.setValue(providerConfig.type).onChange(value => {
							providerConfig.type = value as ProviderType;
							// Update model dropdown when provider type changes
							updateModelDropdown();
							// Update header title
							titleEl.textContent = `${providerName} (${getProviderLabel(providerConfig.type)})`;
						});
						return dropdown;
					});

				// Create initial model dropdown
				updateModelDropdown();

				// API Key input
				const isOptional = providerName === 'claude-code';
				let apiKeyValue = this.cachedApiKeys[providerName] || '';

				const apiKeySetting = new Setting(providerContent)
					.setName('API Key')
					.setDesc(isOptional ? 'Optional for claude-code' : 'Required')
					.addText(text => {
						text.inputEl.type = 'password';
						text.setPlaceholder('Enter API key...');
						text.setValue(apiKeyValue);
						text.onChange(value => {
							apiKeyValue = value;
						});
						return text;
					});

				// Add Show/Hide button
				apiKeySetting.addButton(btn => {
					btn.setButtonText('Show').onClick(() => {
						const input = apiKeySetting.controlEl.querySelector(
							'input[type="password"], input[type="text"]'
						) as HTMLInputElement;
						if (input) {
							if (input.type === 'password') {
								input.type = 'text';
								btn.setButtonText('Hide');
							} else {
								input.type = 'password';
								btn.setButtonText('Show');
							}
						}
					});
				});

				new Setting(providerContent)
					.setName('Max Tokens')
					.setDesc('Maximum tokens per response')
					.addText(text => {
						text
							.setValue(providerConfig.maxTokens.toString())
							.onChange(value => (providerConfig.maxTokens = parseInt(value, 10) || 4096));
						text.inputEl.setAttribute('type', 'number');
						text.inputEl.setAttribute('min', '1');
						return text;
					});

				new Setting(providerContent)
					.setName('Temperature')
					.setDesc('0.0 to 1.0')
					.addText(text => {
						text.setValue(providerConfig.temperature.toString()).onChange(value => {
							const sanitized = value.replace(/[^0-9.]/g, '');
							if (sanitized !== value) {
								text.setValue(sanitized);
							}
							providerConfig.temperature = parseFloat(sanitized) || 0.7;
						});
						text.inputEl.setAttribute('type', 'number');
						text.inputEl.setAttribute('step', '0.1');
						text.inputEl.setAttribute('min', '0');
						text.inputEl.setAttribute('max', '1');
						return text;
					});

				// Save button
				new Setting(providerContent).addButton(btn =>
					btn
						.setButtonText('Save Provider')
						.setCta()
						.onClick(async () => {
							try {
								// Update cached API keys and save to encrypted secrets file
								this.cachedApiKeys[providerName] = apiKeyValue;
								await this.saveApiKeys(this.cachedApiKeys);

								// Validate with Zod
								const result = SparkConfigSchema.safeParse(config);

								if (!result.success) {
									const firstError = result.error.issues[0];
									new Notice(`Validation error: ${firstError.message}`);
									return;
								}

								// Convert back to YAML and save
								const yamlStr = yaml.dump(result.data, { lineWidth: -1 });
								await adapter.write(configPath, yamlStr);
								new Notice(`Provider ${providerName} saved`);

								// Update header title with new type
								titleEl.textContent = `${providerName} (${getProviderLabel(providerConfig.type)})`;

								// Close the editor form
								providerContent.classList.remove('visible');
								arrow.classList.remove('expanded');
							} catch (error) {
								console.error('Error saving config:', error);
								new Notice('Error saving configuration');
							}
						})
				);
			}

			// Logging
			this.configContainer.createEl('h4', { text: 'Logging' });

			new Setting(this.configContainer)
				.setName('Log Level')
				.setDesc('Minimum log level to display')
				.addDropdown(dropdown =>
					dropdown
						.addOption('debug', 'Debug')
						.addOption('info', 'Info')
						.addOption('warn', 'Warning')
						.addOption('error', 'Error')
						.setValue(config.logging.level)
						.onChange(
							value => (config.logging.level = value as 'debug' | 'info' | 'warn' | 'error')
						)
				);

			new Setting(this.configContainer)
				.setName('Console Logging')
				.setDesc('Output logs to console')
				.addToggle(toggle =>
					toggle
						.setValue(config.logging.console)
						.onChange(value => (config.logging.console = value))
				);

			// Feature Flags
			this.configContainer.createEl('h4', { text: 'Features' });

			new Setting(this.configContainer)
				.setName('Slash Commands')
				.setDesc('Enable slash command automation')
				.addToggle(toggle =>
					toggle
						.setValue(config.features.slash_commands)
						.onChange(value => (config.features.slash_commands = value))
				);

			new Setting(this.configContainer)
				.setName('Chat Assistant')
				.setDesc('Enable chat widget')
				.addToggle(toggle =>
					toggle
						.setValue(config.features.chat_assistant)
						.onChange(value => (config.features.chat_assistant = value))
				);

			new Setting(this.configContainer)
				.setName('Trigger Automation')
				.setDesc('Enable automation triggers')
				.addToggle(toggle =>
					toggle
						.setValue(config.features.trigger_automation)
						.onChange(value => (config.features.trigger_automation = value))
				);

			// Save button
			new Setting(this.configContainer).addButton(btn =>
				btn
					.setButtonText('Save Configuration')
					.setCta()
					.onClick(async () => {
						try {
							// Validate with Zod
							const result = SparkConfigSchema.safeParse(config);

							if (!result.success) {
								const firstError = result.error.issues[0];
								new Notice(`Validation error: ${firstError.message}`);
								return;
							}

							// Convert back to YAML and save
							const yamlStr = yaml.dump(result.data, { lineWidth: -1 });
							await adapter.write(configPath, yamlStr);
							new Notice('Configuration saved');
						} catch (error) {
							console.error('Error saving config:', error);
							new Notice('Error saving configuration');
						}
					})
			);
		} catch (error) {
			console.error('Error loading config:', error);
			new Notice(`Error loading config: ${error.message}`);
		}
	}
}

class AgentNameModal extends Modal {
	private onSubmit: (name: string | null) => void;
	private nameInput: HTMLInputElement;
	private submitted = false;

	constructor(app: App, onSubmit: (name: string | null) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Create New Agent' });

		new Setting(contentEl)
			.setName('Agent Name')
			.setDesc('Enter a name for the new agent')
			.addText(text => {
				this.nameInput = text.inputEl;
				text.setPlaceholder('e.g., Charlie').onChange(() => {
					// Clear any previous error styling
					this.nameInput.style.borderColor = '';
				});
				// Focus the input
				setTimeout(() => text.inputEl.focus(), 10);
			});

		new Setting(contentEl)
			.addButton(btn =>
				btn
					.setButtonText('Create')
					.setCta()
					.onClick(() => {
						const name = this.nameInput.value.trim();
						if (!name) {
							this.nameInput.style.borderColor = 'var(--text-error)';
							return;
						}
						this.submitted = true;
						this.close();
						this.onSubmit(name);
					})
			)
			.addButton(btn =>
				btn.setButtonText('Cancel').onClick(() => {
					this.submitted = true;
					this.close();
					this.onSubmit(null);
				})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		// Only call onSubmit(null) if user closed modal without clicking a button
		if (!this.submitted) {
			this.onSubmit(null);
		}
	}
}

class ConfirmDeleteModal extends Modal {
	private agentName: string;
	private onSubmit: (confirmed: boolean) => void;

	constructor(app: App, agentName: string, onSubmit: (confirmed: boolean) => void) {
		super(app);
		this.agentName = agentName;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: `Delete ${this.agentName}?` });

		contentEl.createEl('p', {
			text: `This will remove the agent and all its settings.`,
		});

		const buttonContainer = new Setting(contentEl)
			.addButton(btn => {
				btn
					.setButtonText('Delete')
					.setWarning()
					.onClick(() => {
						this.close();
						this.onSubmit(true);
					});

				// Add CSS class for hover effect
				btn.buttonEl.addClass('spark-modal-delete-btn');
			})
			.addButton(btn => {
				btn.setButtonText('Cancel').onClick(() => {
					this.close();
					this.onSubmit(false);
				});

				// Add CSS class for hover effect
				btn.buttonEl.addClass('spark-modal-cancel-btn');
			});

		// Make buttons more prominent
		buttonContainer.controlEl.style.justifyContent = 'flex-end';
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
