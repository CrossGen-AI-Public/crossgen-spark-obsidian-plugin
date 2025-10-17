/**
 * Context Loader
 * Loads all context needed for command execution
 */

import { readFileSync } from 'fs';
import type { IContextLoader, LoadedContext } from '../types/context.js';
import type { ParsedMention } from '../types/parser.js';
import { PathResolver } from './PathResolver.js';
import { ProximityCalculator } from './ProximityCalculator.js';

export class ContextLoader implements IContextLoader {
  private resolver: PathResolver;
  private proximityCalc: ProximityCalculator;

  constructor(vaultPath: string) {
    this.resolver = new PathResolver(vaultPath);
    this.proximityCalc = new ProximityCalculator();
  }

  public async load(currentFile: string, mentions: ParsedMention[]): Promise<LoadedContext> {
    const context: LoadedContext = {
      currentFile: {
        path: currentFile,
        content: this.safeReadFile(currentFile),
      },
      mentionedFiles: [],
      nearbyFiles: [],
      serviceConnections: [],
    };

    // Load each mentioned item
    for (const mention of mentions) {
      await this.loadMention(mention, context);
    }

    // Load nearby files (proximity-based context)
    await this.loadNearbyFiles(currentFile, context);

    return context;
  }

  private async loadMention(mention: ParsedMention, context: LoadedContext): Promise<void> {
    switch (mention.type) {
      case 'agent':
        await this.loadAgent(mention.value, context);
        break;

      case 'file':
        await this.loadFile(mention.value, context);
        break;

      case 'folder':
        await this.loadFolder(mention.value, context);
        break;

      case 'service':
        this.loadService(mention.value, context);
        break;

      case 'command':
        // Commands are handled separately, not as context
        break;
    }
  }

  private async loadAgent(agentName: string, context: LoadedContext): Promise<void> {
    const agentPath = await this.resolver.resolveAgent(agentName);
    if (agentPath) {
      const content = this.safeReadFile(agentPath);
      context.agent = {
        path: agentPath,
        persona: content,
      };
    }
  }

  private async loadFile(filename: string, context: LoadedContext): Promise<void> {
    const filePath = await this.resolver.resolveFile(filename);
    if (filePath) {
      const content = this.safeReadFile(filePath);
      context.mentionedFiles.push({
        path: filePath,
        content,
        priority: 1.0, // Explicitly mentioned files have highest priority
      });
    }
  }

  private async loadFolder(folderPath: string, context: LoadedContext): Promise<void> {
    const resolvedPath = await this.resolver.resolveFolder(folderPath);
    if (resolvedPath) {
      const files = await this.resolver.getFilesInFolder(resolvedPath);

      for (const file of files) {
        const content = this.safeReadFile(file);
        context.mentionedFiles.push({
          path: file,
          content,
          priority: 0.9, // Folder files slightly lower priority than explicit files
        });
      }
    }
  }

  private loadService(serviceName: string, context: LoadedContext): void {
    // Add service reference for MCP integration
    context.serviceConnections.push({
      name: serviceName,
      mcpServer: `mcp-${serviceName}`, // Assuming standard naming
    });
  }

  private async loadNearbyFiles(currentFile: string, context: LoadedContext): Promise<void> {
    try {
      // Get all vault files
      const allFiles = await this.resolver.getAllVaultFiles();

      // Get files already in context to exclude them
      const alreadyLoaded = new Set(
        [currentFile, ...context.mentionedFiles.map((f) => f.path), context.agent?.path].filter(
          Boolean
        )
      );

      // Filter out already loaded files
      const candidateFiles = allFiles.filter((file) => !alreadyLoaded.has(file));

      // Rank by proximity
      const ranked = this.proximityCalc.rankFilesByProximity(currentFile, candidateFiles);

      // Take top 10 nearest files
      const nearbyFiles = ranked.slice(0, 10);

      for (const file of nearbyFiles) {
        const distance = this.proximityCalc.calculateDistance(currentFile, file);
        const summary = this.generateSummary(file);

        context.nearbyFiles.push({
          path: file,
          summary,
          distance,
        });
      }
    } catch (_error) {
      // If loading nearby files fails, just skip them
      // We don't want to fail the entire context load
    }
  }

  private safeReadFile(filePath: string): string {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (_error) {
      return '';
    }
  }

  private generateSummary(filePath: string): string {
    const content = this.safeReadFile(filePath);

    if (!content) {
      return '';
    }

    // Simple summary: first 500 characters
    const truncated = content.substring(0, 500);

    // Try to end at a sentence boundary
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const cutoff = Math.max(lastPeriod, lastNewline);

    if (cutoff > 100) {
      return truncated.substring(0, cutoff + 1) + '...';
    }

    return truncated + '...';
  }
}
