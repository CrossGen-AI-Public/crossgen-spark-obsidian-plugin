/**
 * CodeRunner - Executes JavaScript code steps in a sandboxed environment
 */

import { runInNewContext } from 'node:vm';
import type { Logger } from '../logger/Logger.js';
import type { CodeNodeData, ExecutionContext, FileAttachment, WorkflowNode } from './types.js';

// Timeout for code execution (5 seconds)
const CODE_TIMEOUT_MS = 5000;

export class CodeRunner {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Run a code step
   */
  async run(
    node: WorkflowNode,
    input: unknown,
    context: ExecutionContext,
    attachments?: FileAttachment[]
  ): Promise<unknown> {
    const data = node.data as CodeNodeData & { type: 'code' };

    this.logger.debug('Running code step', {
      nodeId: node.id,
      codeLength: data.code.length,
      attachmentCount: attachments?.length ?? 0,
    });

    // Create sandbox context
    const sandbox = this.createSandbox(input, context, attachments);

    try {
      // Wrap code to handle return statement
      const wrappedCode = this.wrapCode(data.code);

      // Execute in sandbox with timeout
      const result = runInNewContext(wrappedCode, sandbox, {
        timeout: CODE_TIMEOUT_MS,
        displayErrors: true,
      });

      // Handle async results
      if (result instanceof Promise) {
        return await result;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Code execution failed', {
        nodeId: node.id,
        error: errorMessage,
      });
      throw new Error(`Code execution failed: ${errorMessage}`);
    }
  }

  /**
   * Create sandboxed execution context
   */
  private createSandbox(
    input: unknown,
    context: ExecutionContext,
    attachments?: FileAttachment[]
  ): Record<string, unknown> {
    return {
      // Input from previous step
      input,

      // File attachments from connected file nodes
      attachments: attachments ?? [],

      // Context information
      context: {
        workflowId: context.workflowId,
        runId: context.runId,
        totalCycles: context.totalCycles,
        stepOutputs: Object.fromEntries(context.stepOutputs),
      },

      // Safe built-ins
      console: {
        log: (...args: unknown[]) => this.logger.debug('Code console.log', { args }),
        warn: (...args: unknown[]) => this.logger.warn('Code console.warn', { args }),
        error: (...args: unknown[]) => this.logger.error('Code console.error', { args }),
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      Map,
      Set,
      Promise,

      // Utility functions
      setTimeout: undefined, // Disabled for security
      setInterval: undefined, // Disabled for security
      fetch: undefined, // Disabled for security (will add HTTP step type later)
    };
  }

  /**
   * Wrap user code to handle return statements
   */
  private wrapCode(code: string): string {
    // Check if code already has a return statement at the top level
    const hasReturn = /^\s*return\s/m.test(code) || /;\s*return\s/m.test(code);

    if (hasReturn) {
      // Wrap in IIFE to allow return
      return `(function() { ${code} })()`;
    }

    // If no explicit return, wrap as expression
    return `(function() { ${code} })()`;
  }
}
