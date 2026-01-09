/**
 * VaultInitializer
 * Initializes a vault with default structure and files on first run
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../logger/Logger.js';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get templates directory
 * In production (dist): uses dist/init/templates/
 * In dev/test (src): uses example-vault/.spark/
 */
function getTemplatesDir(): string {
  // Check if we're in dist (production)
  const distTemplates = join(__dirname, 'templates');
  if (existsSync(distTemplates)) {
    return distTemplates;
  }

  // Fall back to example-vault for dev/test
  const exampleVault = join(__dirname, '..', '..', '..', 'example-vault', '.spark');
  if (existsSync(exampleVault)) {
    return exampleVault;
  }

  // Last resort: current directory templates
  return distTemplates;
}

const TEMPLATES_DIR = getTemplatesDir();

/**
 * Initializes a vault with default structure and files
 */
export class VaultInitializer {
  private logger: Logger | null = null;

  constructor(private vaultPath: string) {}

  /**
   * Set logger (optional, for reporting initialization steps)
   */
  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Initialize the vault
   * Creates directories and default files if they don't exist
   */
  async initialize(): Promise<void> {
    const sparkDir = join(this.vaultPath, '.spark');

    // Create .spark directory if it doesn't exist
    if (!existsSync(sparkDir)) {
      mkdirSync(sparkDir, { recursive: true });
      this.log('Created .spark directory');
    }

    // Create subdirectories
    this.createDirectories(sparkDir);

    // Create default config if missing
    this.createDefaultConfig(sparkDir);

    // Create default agents if missing
    this.createDefaultAgents(sparkDir);

    // Create default commands if missing
    this.createDefaultCommands(sparkDir);
  }

  /**
   * Create necessary subdirectories
   */
  private createDirectories(sparkDir: string): void {
    const directories = [
      'agents',
      'commands',
      'conversations',
      'chat-queue',
      'chat-results',
      'logs',
      'triggers',
    ];

    for (const dir of directories) {
      const dirPath = join(sparkDir, dir);
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
        this.log(`Created directory: .spark/${dir}/`);
      }
    }
  }

  /**
   * Create default config.yaml if it doesn't exist
   */
  private createDefaultConfig(sparkDir: string): void {
    const configPath = join(sparkDir, 'config.yaml');
    if (!existsSync(configPath)) {
      const templatePath = join(TEMPLATES_DIR, 'config.yaml');
      const content = readFileSync(templatePath, 'utf-8');
      writeFileSync(configPath, content, 'utf-8');
      this.log('Created default config.yaml');
    }
  }

  /**
   * Create default agents if they don't exist
   */
  private createDefaultAgents(sparkDir: string): void {
    const agentsDir = join(sparkDir, 'agents');
    const templatesAgentsDir = join(TEMPLATES_DIR, 'agents');

    if (!existsSync(templatesAgentsDir)) {
      this.log('Warning: Agent templates not found, skipping agent creation');
      return;
    }

    const agentFiles = readdirSync(templatesAgentsDir).filter((f) => f.endsWith('.md'));

    for (const filename of agentFiles) {
      const agentPath = join(agentsDir, filename);
      if (!existsSync(agentPath)) {
        const templatePath = join(templatesAgentsDir, filename);
        const content = readFileSync(templatePath, 'utf-8');
        writeFileSync(agentPath, content, 'utf-8');
        this.log(`Created default agent: ${filename}`);
      }
    }
  }

  /**
   * Create default commands if they don't exist
   */
  private createDefaultCommands(sparkDir: string): void {
    const commandsDir = join(sparkDir, 'commands');
    const templatesCommandsDir = join(TEMPLATES_DIR, 'commands');

    if (!existsSync(templatesCommandsDir)) {
      this.log('Warning: Command templates not found, skipping command creation');
      return;
    }

    const commandFiles = readdirSync(templatesCommandsDir).filter((f) => f.endsWith('.md'));

    for (const filename of commandFiles) {
      const commandPath = join(commandsDir, filename);
      if (!existsSync(commandPath)) {
        const templatePath = join(templatesCommandsDir, filename);
        const content = readFileSync(templatePath, 'utf-8');
        writeFileSync(commandPath, content, 'utf-8');
        this.log(`Created default command: ${filename}`);
      }
    }
  }

  /**
   * Log a message (uses logger if available, otherwise silent)
   */
  private log(message: string): void {
    if (this.logger) {
      this.logger.debug(message);
    }
  }
}
