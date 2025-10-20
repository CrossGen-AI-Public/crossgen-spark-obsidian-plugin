/**
 * Prompt builder
 * Structures prompts with context priority
 */

import type { IPromptBuilder } from '../types/ai.js';
import type { ParsedCommand } from '../types/parser.js';
import type { LoadedContext } from '../types/context.js';

export class PromptBuilder implements IPromptBuilder {
  build(command: ParsedCommand, context: LoadedContext): string {
    const sections: string[] = [];

    // Agent persona (if present)
    if (context.agent) {
      sections.push('<agent_persona>', context.agent.persona, '</agent_persona>', '');
    }

    // Instructions
    sections.push('<instructions>', this.extractInstructions(command), '</instructions>', '');

    // HIGH priority: Explicitly mentioned files
    if (context.mentionedFiles.length > 0) {
      sections.push('<context priority="high">');
      context.mentionedFiles.forEach((file) => {
        sections.push(`<file path="${file.path}">`, file.content, '</file>', '');
      });
      sections.push('</context>', '');
    }

    // MEDIUM priority: Current file (where command was typed)
    sections.push(
      '<context priority="medium">',
      `<file path="${context.currentFile.path}" note="Command was typed here">`,
      context.currentFile.content,
      '</file>',
      '</context>',
      ''
    );

    // LOW priority: Nearby files (summaries only)
    if (context.nearbyFiles.length > 0) {
      sections.push('<context priority="low">');
      context.nearbyFiles.forEach((file) => {
        sections.push(
          `<file path="${file.path}" distance="${file.distance}">`,
          file.summary,
          '</file>',
          ''
        );
      });
      sections.push('</context>', '');
    }

    sections.push('Please execute the instructions above.');

    return sections.join('\n');
  }

  private extractInstructions(command: ParsedCommand): string {
    // Use raw command line
    // Future: Load from .spark/commands/ if /command detected
    return command.raw;
  }

  estimateTokens(prompt: string): number {
    return Math.ceil(prompt.length / 4);
  }
}
