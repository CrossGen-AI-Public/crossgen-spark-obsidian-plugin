/**
 * PromptRunner - Executes prompt steps with AI
 *
 * Architecture:
 * - System prompt: Agent persona (from config) + minimal workflow role addon
 * - User message: Structured with Input, Context, Task, Output Format sections
 *
 * This separation keeps the system prompt clean and puts flow-specific data
 * in the user message where it belongs.
 */

import type { CommandExecutor } from '../execution/CommandExecutor.js';
import type { Logger } from '../logger/Logger.js';
import type {
  ExecutionContext,
  LabeledOutput,
  PromptNodeData,
  WorkflowInputContext,
  WorkflowNode,
  WorkflowPromptRequest,
} from './types.js';

export class PromptRunner {
  private commandExecutor: CommandExecutor;
  private logger: Logger;

  constructor(commandExecutor: CommandExecutor, logger: Logger) {
    this.commandExecutor = commandExecutor;
    this.logger = logger;
  }

  /**
   * Run a prompt step
   */
  async run(
    node: WorkflowNode,
    inputContext: WorkflowInputContext,
    context: ExecutionContext
  ): Promise<unknown> {
    const data = node.data as PromptNodeData & { type: 'prompt' };

    // Extract agent from @agent mention in the prompt
    const { agentId, cleanPrompt } = this.extractAgentFromPrompt(data.prompt);

    this.logger.debug('Running prompt step', {
      nodeId: node.id,
      agentId: agentId || 'none',
      hasAgent: !!agentId,
      structuredOutput: !!data.structuredOutput,
      hasPrimaryInput: !!inputContext.primary,
      contextCount: inputContext.context.length,
    });

    // Build the request with proper separation of concerns
    const request: WorkflowPromptRequest = {
      agentId,
      workflowId: context.workflowId,
      runId: context.runId,
      nodeId: node.id,
      stepLabel: data.label || 'Unnamed step',
      stepDescription: data.description,
      inputContext,
      task: cleanPrompt,
      structuredOutput: data.structuredOutput,
      outputSchema: data.outputSchema,
    };

    // Execute via command executor
    const result = await this.commandExecutor.executeWorkflowPrompt(request);

    // Parse structured output if enabled
    if (data.structuredOutput && result) {
      return this.parseStructuredOutput(result);
    }

    return result;
  }

  /**
   * Parse structured JSON output from LLM response
   */
  private parseStructuredOutput(result: unknown): unknown {
    // Extract content string from result
    let content: string;
    if (typeof result === 'string') {
      content = result;
    } else if (typeof result === 'object' && result !== null && 'content' in result) {
      content = String((result as { content: unknown }).content);
    } else {
      return result; // Can't parse, return as-is
    }

    // Strip markdown code fences that LLMs often add
    const cleaned = content.replace(/```(?:json)?\n?|\n?```/g, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      // Try to extract JSON object from text (AI sometimes adds explanation before/after JSON)
      const extracted = this.extractJsonFromText(cleaned);
      if (extracted) {
        return extracted;
      }

      this.logger.warn('Failed to parse structured output as JSON', {
        content: cleaned.substring(0, 100),
        error: error instanceof Error ? error.message : String(error),
      });
      // Return original result if parsing fails
      return result;
    }
  }

  /**
   * Extract JSON object from text that may have surrounding content
   * Handles cases where AI adds explanation before/after the JSON
   */
  private extractJsonFromText(text: string): unknown {
    // Find the first { and try to find its matching }
    const startIdx = text.indexOf('{');
    if (startIdx === -1) return null;

    // Find the last } in the text
    const endIdx = text.lastIndexOf('}');
    if (endIdx === -1 || endIdx <= startIdx) return null;

    const jsonCandidate = text.substring(startIdx, endIdx + 1);

    try {
      return JSON.parse(jsonCandidate);
    } catch {
      // Could be nested braces that don't form valid JSON
      return null;
    }
  }

  /**
   * Extract @agent mention from prompt text
   * Returns the agent ID and the prompt with @agent removed
   */
  private extractAgentFromPrompt(prompt: string): {
    agentId: string | undefined;
    cleanPrompt: string;
  } {
    // Match @agent at start of prompt or after whitespace
    // Agent names can contain letters, numbers, hyphens, underscores
    const agentMatch = prompt.match(/(?:^|\s)@([\w-]+)(?!\.\w)/);

    if (!agentMatch) {
      return { agentId: undefined, cleanPrompt: prompt };
    }

    const agentId = agentMatch[1];
    // Remove the @agent mention from the prompt
    const cleanPrompt = prompt.replace(agentMatch[0], ' ').trim();

    return { agentId, cleanPrompt };
  }

  /**
   * Format output value for display
   */
  static formatOutput(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    // For objects with content property, extract it for cleaner display
    if (typeof value === 'object' && value !== null && 'content' in value) {
      const content = (value as { content: unknown }).content;
      if (typeof content === 'string') {
        return content;
      }
    }
    return JSON.stringify(value, null, 2);
  }

  /**
   * Format a labeled output for display
   */
  static formatLabeledOutput(labeled: LabeledOutput): string {
    return PromptRunner.formatOutput(labeled.output);
  }
}
