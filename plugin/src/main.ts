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

        // Initialize mention decorator first
        this.mentionDecorator = new MentionDecorator(this.app);
        await this.mentionDecorator.initialize();
        this.registerEditorExtension(this.mentionDecorator.createExtension());

        // Initialize command palette manager with decorator reference
        this.commandPaletteManager = new CommandPaletteManager(this, this.mentionDecorator);
        this.commandPaletteManager.register();

        // Start observing HTML table cells for mention styling
        this.mentionDecorator.startTableObserver();

        // Register mousedown handler to prevent cursor movement when clicking tokens
        this.registerDomEvent(
            document,
            'mousedown',
            (event: MouseEvent) => {
                const target = event.target as HTMLElement;
                if (target.classList.contains('spark-token')) {
                    event.preventDefault();
                }
            },
            true
        );

        // Register click handler for tokens (mentions and commands)
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
        this.mentionDecorator?.stopTableObserver();
        console.log('Spark Assistant: Plugin unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

