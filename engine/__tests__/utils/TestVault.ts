import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Utility class for creating isolated test vaults
 * 
 * @example
 * ```typescript
 * const vault = new TestVault();
 * await vault.create();
 * await vault.writeFile('test.md', '# Content');
 * const content = await vault.readFile('test.md');
 * await vault.cleanup();
 * ```
 */
export class TestVault {
    private _path: string | null = null;

    /**
     * Get the vault root path (alias for path)
     */
    get root(): string {
        if (!this._path) {
            throw new Error('Vault not created. Call create() first.');
        }
        return this._path;
    }

    /**
     * Get the vault path
     */
    get path(): string {
        if (!this._path) {
            throw new Error('Vault not created. Call create() first.');
        }
        return this._path;
    }

    /**
     * Create a new temporary test vault
     */
    async create(config?: Partial<TestVaultConfig>): Promise<void> {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spark-test-'));
        this._path = tempDir;

        const sparkDir = path.join(tempDir, '.spark');

        // Create .spark directory
        await fs.mkdir(sparkDir, { recursive: true });

        // Create subdirectories
        await fs.mkdir(path.join(sparkDir, 'commands'), { recursive: true });
        await fs.mkdir(path.join(sparkDir, 'agents'), { recursive: true });
        await fs.mkdir(path.join(sparkDir, 'sops'), { recursive: true });
        await fs.mkdir(path.join(sparkDir, 'triggers'), { recursive: true });
        await fs.mkdir(path.join(sparkDir, 'integrations'), { recursive: true });

        // Write default config if provided
        if (config) {
            const configContent = TestVault.generateConfig(config);
            await fs.writeFile(path.join(sparkDir, 'config.yaml'), configContent);
        }
    }

    /**
     * Write a file to the vault
     */
    async writeFile(relativePath: string, content: string): Promise<void> {
        const fullPath = path.join(this.path, relativePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
    }

    /**
     * Write config object as YAML to .spark/config.yaml
     */
    async writeConfig(config: unknown): Promise<void> {
        const yaml = await import('yaml');
        const configYaml = yaml.stringify(config);
        await this.writeFile('.spark/config.yaml', configYaml);
    }

    /**
     * Read a file from the vault
     */
    async readFile(relativePath: string): Promise<string> {
        const fullPath = path.join(this.path, relativePath);
        return fs.readFile(fullPath, 'utf-8');
    }

    /**
     * Check if a file exists
     */
    async fileExists(relativePath: string): Promise<boolean> {
        try {
            const fullPath = path.join(this.path, relativePath);
            await fs.access(fullPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Delete a file from the vault
     */
    async deleteFile(relativePath: string): Promise<void> {
        const fullPath = path.join(this.path, relativePath);
        await fs.unlink(fullPath);
    }

    /**
     * List files in a directory
     */
    async listFiles(relativePath = ''): Promise<string[]> {
        const fullPath = path.join(this.path, relativePath);
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        return entries
            .filter(entry => entry.isFile())
            .map(entry => entry.name);
    }

    /**
     * Get absolute path to a file
     */
    getAbsolutePath(relativePath: string): string {
        return path.join(this.path, relativePath);
    }

    /**
     * Get path to .spark directory
     */
    get sparkPath(): string {
        return path.join(this.path, '.spark');
    }

    /**
     * Get path to config file
     */
    get configPath(): string {
        return path.join(this.sparkPath, 'config.yaml');
    }

    /**
     * Clean up the test vault
     */
    async cleanup(): Promise<void> {
        if (!this._path) {
            return;
        }
        try {
            await fs.rm(this._path, { recursive: true, force: true });
        } catch (error) {
            console.error(`Failed to cleanup test vault at ${this._path}:`, error);
        }
    }

    /**
     * Generate default config YAML
     */
    private static generateConfig(config?: Partial<TestVaultConfig>): string {
        const defaultConfig: TestVaultConfig = {
            aiProvider: 'claude',
            watchPatterns: ['**/*.md'],
            logLevel: 'error',
            ...config,
        };

        return `# Test vault configuration
engine:
  watch:
    patterns:
${defaultConfig.watchPatterns.map(p => `      - "${p}"`).join('\n')}
    debounce_ms: 100

ai:
  provider: ${defaultConfig.aiProvider}
  claude:
    model: claude-3-5-sonnet-20241022
    max_tokens: 4096

logging:
  level: ${defaultConfig.logLevel}
  file: null
`;
    }
}

interface TestVaultConfig {
    aiProvider: string;
    watchPatterns: string[];
    logLevel: string;
}

