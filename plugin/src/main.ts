import { Plugin } from 'obsidian';
import { SparkSettingTab, DEFAULT_SETTINGS } from './settings';
import { SparkSettings, ISparkPlugin } from './types';
import { CommandPaletteManager } from './command-palette/CommandPaletteManager';
import { MentionDecorator, handleMentionClick } from './command-palette/MentionDecorator';

export default class SparkPlugin extends Plugin implements ISparkPlugin {
    settings: SparkSettings;
    private commandPaletteManager: CommandPaletteManager;
    private mentionDecorator: MentionDecorator;

    async onload() {
        console.log('Spark Assistant: Loading plugin...');

        // Load settings
        await this.loadSettings();

        // Initialize command palette manager
        this.commandPaletteManager = new CommandPaletteManager(this);
        this.commandPaletteManager.register();

        // Initialize mention decorator
        this.mentionDecorator = new MentionDecorator(this.app);
        this.registerEditorExtension(this.mentionDecorator.createExtension());

        // Register click handler for mentions
        this.registerDomEvent(document, 'click', (event: MouseEvent) => {
            handleMentionClick(this.app, event);
        });

        // Add settings tab
        this.addSettingTab(new SparkSettingTab(this.app, this));

        // Add status bar item
        const statusBarItem = this.addStatusBarItem();
        statusBarItem.setText('⚡ Spark');

        console.log('Spark Assistant: Plugin loaded successfully');
    }

    async onunload() {
        this.commandPaletteManager?.unload();
        console.log('Spark Assistant: Plugin unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

