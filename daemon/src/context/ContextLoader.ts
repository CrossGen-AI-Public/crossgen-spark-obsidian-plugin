/**
 * Context Loader
 * Loads all context needed for command execution
 */

import { readFileSync } from 'fs';
import type { IContextLoader, LoadedContext, AgentAIConfig } from '../types/context.js';
import type { ParsedMention } from '../types/parser.js';
import { PathResolver } from './PathResolver.js';
import { ProximityCalculator } from './ProximityCalculator.js';
import { FrontmatterParser } from '../parser/FrontmatterParser.js';
import { Logger } from '../logger/Logger.js';

export class ContextLoader implements IContextLoader {
  private resolver: PathResolver;
  private proximityCalc: ProximityCalculator;
  private frontmatterParser: FrontmatterParser;
  private logger: Logger;

  constructor(vaultPath: string) {
    this.resolver = new PathResolver(vaultPath);
    this.proximityCalc = new ProximityCalculator();
    this.frontmatterParser = new FrontmatterParser();
    this.logger = Logger.getInstance();
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
      case 'agent': {
        // Try agent first, fallback to file if not found
        const agentLoaded = await this.loadAgent(mention.value, context);
        if (!agentLoaded) {
          this.logger.debug('Agent not found, trying as file', { mention: mention.value });
          await this.loadFile(mention.value, context);
        }
        break;
      }

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

  private async loadAgent(agentName: string, context: LoadedContext): Promise<boolean> {
    const agentPath = await this.resolver.resolveAgent(agentName);
    if (!agentPath) {
      return false; // Agent not found
    }

    const content = this.safeReadFile(agentPath);
    if (!content || content.trim().length === 0) {
      // Empty agent file - skip
      return false;
    }

    // Parse frontmatter and body
    const frontmatterMatch = content.match(/^---\s*\n(.*?)\n---\s*\n([\s\S]*)$/s);

    if (frontmatterMatch) {
      const body = frontmatterMatch[2]?.trim() || '';

      // Parse frontmatter using FrontmatterParser for proper YAML support
      const metadata = this.frontmatterParser.extractFrontmatter(content);
      const aiConfig = this.extractAgentAIConfig(metadata, agentName);

      // Need at least a body for the persona
      if (!body || body.length === 0) {
        // Frontmatter only, no instructions - use a helpful default
        const defaultName = (metadata.name as string) || agentName;
        const defaultRole = (metadata.role as string) || 'a helpful assistant';
        const persona = this.formatAgentPersona(
          metadata as Record<string, string | string[]>,
          `You are ${defaultName}, ${defaultRole}.`
        );

        context.agent = {
          path: agentPath,
          persona,
          aiConfig,
        };
      } else {
        // Normal case: frontmatter + body
        const persona = this.formatAgentPersona(
          metadata as Record<string, string | string[]>,
          body
        );

        context.agent = {
          path: agentPath,
          persona,
          aiConfig,
        };
      }
    } else {
      // No frontmatter - use raw content as persona
      // This allows simple agents without YAML
      context.agent = {
        path: agentPath,
        persona: content.trim(),
      };
    }

    return true; // Agent successfully loaded
  }

  /**
   * Extract AI configuration from agent metadata
   */
  private extractAgentAIConfig(
    metadata: Record<string, unknown>,
    agentName: string
  ): AgentAIConfig | undefined {
    if (!metadata.ai || typeof metadata.ai !== 'object') {
      return undefined;
    }

    const ai = metadata.ai as Record<string, unknown>;
    const aiConfig: AgentAIConfig = {
      provider: typeof ai.provider === 'string' ? ai.provider : undefined,
      model: typeof ai.model === 'string' ? ai.model : undefined,
      temperature: typeof ai.temperature === 'number' ? ai.temperature : undefined,
      maxTokens: typeof ai.maxTokens === 'number' ? ai.maxTokens : undefined,
    };

    // Only return aiConfig if at least one field is set
    if (!aiConfig.provider && !aiConfig.model && !aiConfig.temperature && !aiConfig.maxTokens) {
      return undefined;
    }

    this.logger.debug('Agent AI config loaded', {
      agent: agentName,
      provider: aiConfig.provider,
      model: aiConfig.model,
      temperature: aiConfig.temperature,
      maxTokens: aiConfig.maxTokens,
    });

    return aiConfig;
  }

  private formatAgentPersona(metadata: Record<string, string | string[]>, body: string): string {
    const parts: string[] = [];

    if (metadata.name) {
      parts.push(`Name: ${metadata.name}`);
    }

    if (metadata.role) {
      parts.push(`Role: ${metadata.role}`);
    }

    if (metadata.expertise && Array.isArray(metadata.expertise) && metadata.expertise.length > 0) {
      parts.push(`Expertise: ${metadata.expertise.join(', ')}`);
    }

    if (metadata.tools && Array.isArray(metadata.tools) && metadata.tools.length > 0) {
      parts.push(`Available Tools: ${metadata.tools.join(', ')}`);
    }

    if (
      metadata.context_folders &&
      Array.isArray(metadata.context_folders) &&
      metadata.context_folders.length > 0
    ) {
      parts.push(`Context Folders: ${metadata.context_folders.join(', ')}`);
    }

    // Combine metadata with body
    if (parts.length > 0) {
      return parts.join('\n') + '\n\n' + body;
    }

    return body;
  }

  private async loadFile(filename: string, context: LoadedContext): Promise<void> {
    // If filename has no extension, assume .md
    const fileToResolve = filename.includes('.') ? filename : `${filename}.md`;

    const filePath = await this.resolver.resolveFile(fileToResolve);
    if (filePath) {
      const content = this.safeReadFile(filePath);
      context.mentionedFiles.push({
        path: filePath,
        content,
        priority: 1.0, // Explicitly mentioned files have highest priority
      });
    } else {
      this.logger.debug('File not found', { filename, attempted: fileToResolve });
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
      this.logger.warn('Failed to load nearby files for proximity context', {
        currentFile,
        error: _error instanceof Error ? _error.message : String(_error),
      });
    }
  }

  private safeReadFile(filePath: string): string {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (_error) {
      this.logger.warn('Failed to read file for context', {
        filePath,
        error: _error instanceof Error ? _error.message : String(_error),
      });
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
