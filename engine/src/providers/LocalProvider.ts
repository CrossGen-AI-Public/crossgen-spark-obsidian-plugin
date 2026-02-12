/**
 * Local AI Provider
 * Delegates to a LocalBackend (e.g., LM Studio) for completions.
 * No API key required — models run locally.
 */

import { Logger } from '../logger/Logger.js';
import type { AICompletionResult } from '../types/ai.js';
import { SparkError } from '../types/index.js';
import type {
  IAIProvider,
  ProviderCompletionOptions,
  ProviderConfig,
  ProviderContextFile,
} from '../types/provider.js';
import { ProviderType } from '../types/provider.js';
import { LMStudioBackend } from './local/LMStudioBackend.js';
import type { LocalBackend, LocalMessage, LocalModelInfo } from './local/LocalBackend.js';

export class LocalProvider implements IAIProvider {
  readonly name: string;
  readonly type = ProviderType.LOCAL;

  private config: ProviderConfig;
  private backend: LocalBackend;
  private logger: Logger;
  private fallbackProviderName: string | null;
  private cachedModels: LocalModelInfo[] = [];

  constructor(config: ProviderConfig, backend?: LocalBackend) {
    this.name = config.name;
    this.config = config;
    this.logger = Logger.getInstance();
    this.fallbackProviderName = config.fallbackProvider || null;

    const backendName = (config.options?.backend as string) || 'lmstudio';
    if (backend) {
      this.backend = backend;
    } else if (backendName === 'lmstudio') {
      this.backend = new LMStudioBackend();
    } else {
      throw new SparkError(`Unknown local backend: ${backendName}`, 'INVALID_PROVIDER_CONFIG');
    }

    this.logger.debug('LocalProvider initialized', {
      provider: this.name,
      backend: backendName,
      model: config.model,
    });
  }

  async complete(options: ProviderCompletionOptions): Promise<AICompletionResult> {
    const messages = this.buildMessages(options);
    const model = options.model || this.config.model;

    this.logger.debug('LocalProvider complete', {
      model,
      messageCount: messages.length,
    });

    const result = await this.backend.complete(messages, {
      model,
      maxTokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
    });

    return result;
  }

  private buildMessages(options: ProviderCompletionOptions): LocalMessage[] {
    const messages: LocalMessage[] = [];

    // Build system message from all system-level content
    const systemContent = this.buildSystemContent(options);
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    // User message
    messages.push({ role: 'user', content: options.prompt });

    return messages;
  }

  private buildSystemContent(options: ProviderCompletionOptions): string {
    const sections: string[] = [];

    // System prompt from config or options
    const systemPrompt = this.getSystemPrompt(options);
    if (systemPrompt) {
      sections.push(systemPrompt);
    }

    // Agent persona
    if (options.context?.agentPersona) {
      sections.push(`<agent_persona>\n${options.context.agentPersona}\n</agent_persona>`);
    }

    // Additional instructions
    if (options.context?.additionalInstructions) {
      sections.push(
        `<additional_instructions>\n${options.context.additionalInstructions}\n</additional_instructions>`
      );
    }

    // Context files
    this.appendFilesContext(sections, options.context?.files);

    return sections.join('\n\n');
  }

  private getSystemPrompt(options: ProviderCompletionOptions): string {
    const configPrompt =
      typeof this.config.systemPrompt === 'string' ? this.config.systemPrompt : '';
    return configPrompt || options.systemPrompt || '';
  }

  private appendFilesContext(sections: string[], files: ProviderContextFile[] | undefined): void {
    if (!files || files.length === 0) return;

    for (const priority of ['high', 'medium', 'low'] as const) {
      const priorityFiles = files.filter((f) => f.priority === priority);
      if (priorityFiles.length === 0) continue;

      const fileEntries = priorityFiles
        .map((f) => {
          const noteAttr = f.note ? ` note="${f.note}"` : '';
          return `<file path="${f.path}"${noteAttr}>\n${f.content}\n</file>`;
        })
        .join('\n');

      sections.push(`<context priority="${priority}">\n${fileEntries}\n</context>`);
    }
  }

  supportsTools(): boolean {
    return this.config.options?.enableTools !== false;
  }

  supportsFileOperations(): boolean {
    return this.supportsTools();
  }

  getAvailableModels(): string[] {
    return this.cachedModels.map((m) => m.path);
  }

  supportsFallback(): boolean {
    return this.fallbackProviderName !== null;
  }

  getFallbackProvider(): string | null {
    return this.fallbackProviderName;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const available = await this.backend.isAvailable();
      if (available) {
        this.cachedModels = await this.backend.listModels();
      }
      return available;
    } catch {
      return false;
    }
  }

  getConfig(): ProviderConfig {
    return this.config;
  }
}
