/**
 * Path Resolver
 * Resolves mentions to actual file paths in the vault
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import type { IPathResolver } from '../types/context.js';

export class PathResolver implements IPathResolver {
  constructor(private vaultPath: string) {}

  public async resolveAgent(name: string): Promise<string | null> {
    const agentPath = join(this.vaultPath, '.spark', 'agents', `${name}.md`);
    return existsSync(agentPath) ? agentPath : null;
  }

  public async resolveFile(filename: string): Promise<string | null> {
    // First try exact path
    const exactPath = join(this.vaultPath, filename);
    if (existsSync(exactPath)) {
      return exactPath;
    }

    // Search vault for file
    try {
      const files = await glob(`**/${filename}`, {
        cwd: this.vaultPath,
        ignore: ['node_modules/**', '.git/**', '.obsidian/**'],
        absolute: false,
      });

      if (files.length > 0) {
        return join(this.vaultPath, files[0] as string);
      }
    } catch (_error) {
      // Glob error, return null
      return null;
    }

    return null;
  }

  public async resolveFolder(folderPath: string): Promise<string | null> {
    const fullPath = join(this.vaultPath, folderPath);
    return existsSync(fullPath) ? fullPath : null;
  }

  public async resolveCommand(name: string): Promise<string | null> {
    const commandPath = join(this.vaultPath, '.spark', 'commands', `${name}.md`);
    return existsSync(commandPath) ? commandPath : null;
  }

  /**
   * Resolve service configuration
   */
  public async resolveService(name: string): Promise<string | null> {
    const servicePath = join(this.vaultPath, '.spark', 'integrations', name, 'config.yaml');
    return existsSync(servicePath) ? servicePath : null;
  }

  /**
   * Get all markdown files in a folder
   */
  public async getFilesInFolder(folderPath: string): Promise<string[]> {
    try {
      const files = await glob('**/*.md', {
        cwd: folderPath,
        ignore: ['node_modules/**', '.git/**'],
        absolute: true,
      });
      return files;
    } catch (_error) {
      return [];
    }
  }

  /**
   * Get all markdown files in vault
   */
  public async getAllVaultFiles(): Promise<string[]> {
    try {
      const files = await glob('**/*.md', {
        cwd: this.vaultPath,
        ignore: ['node_modules/**', '.git/**', '.obsidian/**', '.spark/**'],
        absolute: true,
      });
      return files;
    } catch (_error) {
      return [];
    }
  }
}
