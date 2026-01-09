/**
 * ConditionRunner - Evaluates condition expressions for branching
 */

import { runInNewContext } from 'node:vm';
import type { Logger } from '../logger/Logger.js';
import type { ConditionNodeData, ExecutionContext, WorkflowNode } from './types.js';

// Timeout for expression evaluation (1 second)
const EXPRESSION_TIMEOUT_MS = 1000;

export class ConditionRunner {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Run a condition step
   * Returns boolean result that determines which branch to take
   */
  async run(node: WorkflowNode, input: unknown, context: ExecutionContext): Promise<boolean> {
    const data = node.data as ConditionNodeData & { type: 'condition' };

    this.logger.debug('Running condition step', {
      nodeId: node.id,
      expression: data.expression,
    });

    // Create sandbox for expression evaluation
    const sandbox = this.createSandbox(input, context);

    try {
      // Evaluate expression
      const result = runInNewContext(data.expression, sandbox, {
        timeout: EXPRESSION_TIMEOUT_MS,
        displayErrors: true,
      });

      // Convert to boolean
      const boolResult = Boolean(result);

      this.logger.debug('Condition evaluated', {
        nodeId: node.id,
        expression: data.expression,
        result: boolResult,
      });

      return boolResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Condition evaluation failed', {
        nodeId: node.id,
        expression: data.expression,
        error: errorMessage,
      });
      throw new Error(`Condition evaluation failed: ${errorMessage}`);
    }
  }

  /**
   * Create sandboxed evaluation context
   */
  private createSandbox(input: unknown, context: ExecutionContext): Record<string, unknown> {
    return {
      // Input from previous step (main variable for conditions)
      input,

      // Also expose as 'output' for consistency
      output: input,

      // Context information
      context: {
        workflowId: context.workflowId,
        runId: context.runId,
        totalCycles: context.totalCycles,
      },

      // Safe built-ins for expressions
      JSON,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,

      // Common comparison helpers
      isNull: (v: unknown) => v === null,
      isUndefined: (v: unknown) => v === undefined,
      isNullOrUndefined: (v: unknown) => v === null || v === undefined,
      isEmpty: (v: unknown) => {
        if (v === null || v === undefined) return true;
        if (typeof v === 'string') return v.length === 0;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === 'object') return Object.keys(v).length === 0;
        return false;
      },
      hasProperty: (obj: unknown, prop: string) => {
        if (obj === null || obj === undefined) return false;
        return Object.hasOwn(obj, prop);
      },
    };
  }
}
