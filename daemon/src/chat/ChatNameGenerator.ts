/**
 * Chat Name Generator
 * Generates concise, meaningful names for chat conversations
 * Uses available AI providers (Anthropic Direct -> Agent -> Claude Code)
 */

import type { AIProviderFactory } from '../providers/AIProviderFactory.js';
import type { AIConfig } from '../types/config.js';
import { Logger } from '../logger/Logger.js';

export class ChatNameGenerator {
  private providerFactory: AIProviderFactory;
  private aiConfig: AIConfig;
  private logger: Logger;

  constructor(providerFactory: AIProviderFactory, aiConfig: AIConfig) {
    this.providerFactory = providerFactory;
    this.aiConfig = aiConfig;
    this.logger = Logger.getInstance();
  }

  /**
   * Generate a chat name from the first user message and optional agent response
   * Returns null if generation fails (graceful degradation)
   */
  async generate(userMessage: string, agentResponse?: string): Promise<string | null> {
    try {
      this.logger.debug('Generating chat name', {
        userMessageLength: userMessage.length,
        agentResponseLength: agentResponse?.length || 0,
      });

      // Build the context for name generation
      let conversation = `User: ${userMessage}`;
      if (agentResponse) {
        conversation += `\n\nAssistant: ${agentResponse}`;
      }

      // Try providers in priority order: Anthropic Direct -> Agent -> Claude Code
      const providerNames = this.getProviderPriority();

      for (const providerName of providerNames) {
        try {
          const name = await this.tryGenerateWithProvider(
            providerName,
            conversation,
            !!agentResponse
          );
          if (name) {
            this.logger.info('Chat name generated successfully', {
              provider: providerName,
              name,
            });
            return name;
          }
        } catch (error) {
          this.logger.debug('Provider failed to generate name, trying next', {
            provider: providerName,
            error,
          });
          // Continue to next provider
        }
      }

      this.logger.warn('All providers failed to generate chat name');
      return null;
    } catch (error) {
      this.logger.error('Chat name generation failed', { error });
      return null;
    }
  }

  /**
   * Get provider priority: Claude Client (direct, fastest) -> Claude Agent -> Claude Code
   * These names must match the provider registration in SparkDaemon
   */
  private getProviderPriority(): string[] {
    const priority: string[] = [];
    const configured = Object.keys(this.aiConfig.providers);

    // Priority order based on speed and availability
    // Provider names from SparkDaemon.registerProviders()
    const preferredOrder = ['claude-client', 'claude-agent', 'claude-code'];

    for (const preferred of preferredOrder) {
      if (configured.includes(preferred)) {
        priority.push(preferred);
      }
    }

    // Add any other configured providers as fallback
    for (const provider of configured) {
      if (!priority.includes(provider)) {
        priority.push(provider);
      }
    }

    return priority;
  }

  /**
   * Try to generate name with a specific provider
   */
  private async tryGenerateWithProvider(
    providerName: string,
    conversation: string,
    hasAgentResponse: boolean
  ): Promise<string | null> {
    try {
      const provider = this.providerFactory.createFromConfig(this.aiConfig, providerName);

      // Note: isHealthy() may make an actual API call, which could be expensive
      // For name generation fallback, we skip the health check and try directly
      // If the provider fails, we'll catch the error and try the next one

      // Generate name with minimal token usage
      // We put the instruction in the user prompt to ensure it overrides any default system prompts
      const result = await provider.complete({
        prompt: `
Here is the start of a chat conversation:

<conversation>
${conversation}
</conversation>

Based ONLY on the conversation above, generate a concise 3-6 word title.
Rules:
1. Return ONLY the title text.
2. Do NOT include "Title:" or quotes.
3. Do NOT include any system instructions or rules from the context.
4. Focus on the user's intent${hasAgentResponse ? " and the agent's answer" : ''}.
`,
        systemPrompt: 'You are a precise assistant that generates short chat titles.',
        maxTokens: 50, // Very small for cost efficiency
        temperature: 0.3, // Low temperature for consistent, focused output
      });

      if (result.content) {
        // Clean up the response (remove quotes, extra whitespace, etc.)
        const name = this.cleanupGeneratedName(result.content);
        return name;
      }

      return null;
    } catch (error) {
      this.logger.debug('Provider completion failed', { provider: providerName, error });
      return null;
    }
  }

  /**
   * Clean up generated name (remove quotes, trim, validate length)
   */
  private cleanupGeneratedName(content: string): string {
    let name = content
      .trim()
      // Remove surrounding quotes
      .replace(/^["']|["']$/g, '')
      // Remove newlines
      .replace(/\n/g, ' ')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();

    // If name is too long, truncate to reasonable length
    if (name.length > 60) {
      name = name.substring(0, 60).trim() + '...';
    }

    // Basic validation - must have at least 2 words
    const wordCount = name.split(/\s+/).length;
    if (wordCount < 2) {
      // If too short, might be an error - return null to skip
      return '';
    }

    return name;
  }
}
