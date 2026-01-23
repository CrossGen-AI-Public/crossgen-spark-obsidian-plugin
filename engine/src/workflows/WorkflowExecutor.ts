/**
 * WorkflowExecutor - Main workflow execution engine
 * Handles queue processing, step execution, and loop detection
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { CommandExecutor } from '../execution/CommandExecutor.js';
import type { Logger } from '../logger/Logger.js';
import { CodeRunner } from './CodeRunner.js';
import { ConditionRunner } from './ConditionRunner.js';
import { PromptRunner } from './PromptRunner.js';
import type {
  ConditionNodeData,
  ExecutionContext,
  LabeledOutput,
  StepResult,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowInputContext,
  WorkflowNode,
  WorkflowQueueItem,
  WorkflowRun,
} from './types.js';
import { updateRunsIndexFromRun } from './WorkflowRunsIndex.js';

const WORKFLOWS_DIR = '.spark/workflows';
const WORKFLOW_RUNS_DIR = '.spark/workflow-runs';
const WORKFLOW_QUEUE_DIR = '.spark/workflow-queue';

export class WorkflowExecutor {
  private vaultPath: string;
  private logger: Logger;
  private promptRunner: PromptRunner;
  private codeRunner: CodeRunner;
  private conditionRunner: ConditionRunner;
  private processingRuns: Set<string> = new Set();

  constructor(vaultPath: string, logger: Logger, commandExecutor: CommandExecutor) {
    this.vaultPath = vaultPath;
    this.logger = logger;
    this.promptRunner = new PromptRunner(commandExecutor, logger);
    this.codeRunner = new CodeRunner(logger);
    this.conditionRunner = new ConditionRunner(logger);
  }

  /**
   * Check if a path is a workflow queue file
   */
  isQueueFile(relativePath: string): boolean {
    return relativePath.startsWith(WORKFLOW_QUEUE_DIR) && relativePath.endsWith('.json');
  }

  /**
   * Process a workflow queue file
   */
  async processQueueFile(relativePath: string): Promise<void> {
    const fullPath = join(this.vaultPath, relativePath);

    if (!existsSync(fullPath)) {
      return;
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const queueItem = JSON.parse(content) as WorkflowQueueItem;

      // Handle stuck items: reset "processing" items older than 5 minutes back to "pending"
      // This happens when engine crashed during execution
      const STUCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
      if (
        queueItem.status === 'processing' &&
        !this.processingRuns.has(queueItem.runId) &&
        Date.now() - queueItem.timestamp > STUCK_TIMEOUT_MS
      ) {
        this.logger.warn('Resetting stuck workflow queue item', {
          runId: queueItem.runId,
          workflowId: queueItem.workflowId,
          stuckForMs: Date.now() - queueItem.timestamp,
        });
        queueItem.status = 'pending';
        queueItem.timestamp = Date.now(); // Reset timestamp to avoid immediate re-reset
        writeFileSync(fullPath, JSON.stringify(queueItem, null, 2));
      }

      // Skip if already processing or not pending
      if (queueItem.status !== 'pending' || this.processingRuns.has(queueItem.runId)) {
        return;
      }

      this.logger.info('Processing workflow queue item', {
        workflowId: queueItem.workflowId,
        runId: queueItem.runId,
      });

      // Mark as processing
      this.processingRuns.add(queueItem.runId);
      queueItem.status = 'processing';
      writeFileSync(fullPath, JSON.stringify(queueItem, null, 2));

      // Execute workflow
      await this.executeWorkflow(queueItem);

      // Remove queue file after completion
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
      }
    } catch (error) {
      this.logger.error('Failed to process workflow queue file', {
        path: relativePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Scan and process any pending queue items
   * Called on engine startup to handle items queued while engine was down
   */
  async scanQueue(): Promise<void> {
    const queuePath = join(this.vaultPath, WORKFLOW_QUEUE_DIR);

    if (!existsSync(queuePath)) {
      return;
    }

    const files = readdirSync(queuePath).filter((f) => f.endsWith('.json'));

    if (files.length > 0) {
      this.logger.info('Found pending workflow queue items', { count: files.length });
    }

    for (const file of files) {
      const relativePath = `${WORKFLOW_QUEUE_DIR}/${file}`;
      await this.processQueueFile(relativePath);
    }
  }

  /**
   * Execute a workflow
   */
  private async executeWorkflow(queueItem: WorkflowQueueItem): Promise<void> {
    const { workflowId, runId, input } = queueItem;

    // Load workflow definition
    const workflow = this.loadWorkflow(workflowId);
    if (!workflow) {
      this.logger.error('Workflow not found', { workflowId });
      this.processingRuns.delete(runId);
      return;
    }

    // Initialize run
    const run: WorkflowRun = {
      id: runId,
      workflowId,
      status: 'running',
      input,
      stepResults: [],
      startTime: Date.now(),
      totalCycles: 0,
    };

    // Initialize execution context
    const context: ExecutionContext = {
      workflowId,
      runId,
      input,
      stepOutputs: new Map(),
      visitCounts: new Map(),
      totalCycles: 0,
    };

    // Save initial run state so UI can see workflow is running
    this.saveRun(run);

    try {
      // Find entry point: first node with no incoming edges
      const targetNodeIds = new Set(workflow.edges.map((e) => e.target));
      const entryNode = workflow.nodes.find((n) => !targetNodeIds.has(n.id));
      if (!entryNode) {
        throw new Error('No entry point found in workflow (no node without incoming edges)');
      }

      // Execute from entry node
      await this.executeFromNode(workflow, entryNode.id, context, run);

      // Mark as completed
      run.status = 'completed';
      run.endTime = Date.now();
      run.totalCycles = context.totalCycles;

      // Get final output (from last completed step)
      const lastResult = run.stepResults.filter((r) => r.status === 'completed').pop();
      run.output = lastResult?.output;

      this.logger.info('Workflow completed', {
        workflowId,
        runId,
        duration: run.endTime - run.startTime,
        totalCycles: run.totalCycles,
      });
    } catch (error) {
      run.status = 'failed';
      run.error = error instanceof Error ? error.message : String(error);
      run.endTime = Date.now();

      this.logger.error('Workflow execution failed', {
        workflowId,
        runId,
        error: run.error,
      });
    } finally {
      // Save run result
      this.saveRun(run);
      this.processingRuns.delete(runId);
    }
  }

  /**
   * Execute workflow from a specific node
   */
  private async executeFromNode(
    workflow: WorkflowDefinition,
    nodeId: string,
    context: ExecutionContext,
    run: WorkflowRun
  ): Promise<void> {
    const node = workflow.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // Track visit count for loop detection
    const visitCount = (context.visitCounts.get(nodeId) || 0) + 1;
    context.visitCounts.set(nodeId, visitCount);

    // Check node-specific cycle limit for condition nodes (revisits only)
    if (node.type === 'condition') {
      const conditionData = node.data as ConditionNodeData & { type: 'condition' };
      if (visitCount > conditionData.maxCycles) {
        this.logger.warn('Condition node max cycles exceeded, stopping loop', {
          nodeId,
          maxCycles: conditionData.maxCycles,
          visitCount,
        });
        return;
      }
    }

    context.totalCycles++;

    // Get input from previous step
    const previousOutput = this.getNodeInput(workflow, node, context);

    // Create initial "running" result and save immediately for UI feedback
    const runningResult: StepResult = {
      nodeId: node.id,
      status: 'running',
      input: previousOutput,
      startTime: Date.now(),
      cycleCount: visitCount,
    };
    run.stepResults.push(runningResult);
    this.saveRun(run);

    // Execute the step (pass workflow for prompt nodes to access labels)
    const result = await this.executeStep(workflow, node, previousOutput, context);
    result.cycleCount = visitCount;

    // Update the running result in place with final status
    const resultIndex = run.stepResults.findIndex(
      (r) => r.nodeId === node.id && r.status === 'running'
    );
    if (resultIndex !== -1) {
      run.stepResults[resultIndex] = result;
    } else {
      // Fallback: push if not found (shouldn't happen)
      run.stepResults.push(result);
    }

    // Save run after each step for real-time progress updates
    this.saveRun(run);

    // Store output for downstream nodes
    if (result.status === 'completed') {
      if (node.type === 'condition') {
        // Condition nodes pass through their INPUT, not their boolean output
        // The output (true/false) is only used for routing decisions
        // This preserves data flow through conditional branches
        context.stepOutputs.set(nodeId, previousOutput);
      } else if (result.output !== undefined) {
        context.stepOutputs.set(nodeId, result.output);
      }
    }

    // If step failed, stop execution
    if (result.status === 'failed') {
      throw new Error(`Step ${nodeId} failed: ${result.error}`);
    }

    // Find next node(s) to execute
    const nextNodes = this.getNextNodes(workflow, node, result.output);

    // Execute next nodes
    for (const nextNodeId of nextNodes) {
      await this.executeFromNode(workflow, nextNodeId, context, run);
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    input: unknown,
    context: ExecutionContext
  ): Promise<StepResult> {
    const result: StepResult = {
      nodeId: node.id,
      status: 'running',
      input, // Store input for debugging/display
      startTime: Date.now(),
    };

    try {
      let output: unknown;

      switch (node.type) {
        case 'prompt': {
          // Build structured input context for prompt nodes
          const inputContext = this.buildInputContext(workflow, node.id, input, context);
          output = await this.promptRunner.run(node, inputContext, context);
          break;
        }

        case 'code':
          output = await this.codeRunner.run(node, input, context);
          break;

        case 'condition':
          output = await this.conditionRunner.run(node, input, context);
          break;

        default:
          throw new Error(`Unknown step type: ${String(node.type)}`);
      }

      result.status = 'completed';
      result.output = output;
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
    }

    result.endTime = Date.now();
    return result;
  }

  /**
   * Build structured input context for prompt nodes
   * Distinguishes between primary input (most recent) and context (other inputs)
   */
  private buildInputContext(
    workflow: WorkflowDefinition,
    nodeId: string,
    _rawInput: unknown,
    context: ExecutionContext
  ): WorkflowInputContext {
    const incomingEdges = workflow.edges.filter((e) => e.target === nodeId);

    // No incoming edges - use workflow input
    if (incomingEdges.length === 0) {
      return {
        primary: null,
        context: [],
        workflowInput: context.input,
      };
    }

    // Collect all inputs with labels
    const inputs: LabeledOutput[] = [];
    for (const edge of incomingEdges) {
      const output = context.stepOutputs.get(edge.source);
      if (output !== undefined) {
        const sourceNode = workflow.nodes.find((n) => n.id === edge.source);
        inputs.push({
          nodeId: edge.source,
          label: sourceNode?.data.label || edge.source,
          output,
        });
      }
    }

    // Determine primary (most recently executed)
    // stepOutputs is a Map, insertion order is preserved
    // The last entry for our inputs is the most recent
    const stepOutputKeys = Array.from(context.stepOutputs.keys());
    let primaryInput: LabeledOutput | null = null;
    let mostRecentIndex = -1;

    for (const input of inputs) {
      const index = stepOutputKeys.indexOf(input.nodeId);
      if (index > mostRecentIndex) {
        mostRecentIndex = index;
        primaryInput = input;
      }
    }

    // All other inputs are context
    const contextInputs = inputs.filter((i) => i !== primaryInput);

    return {
      primary: primaryInput,
      context: contextInputs,
      workflowInput: context.input,
    };
  }

  /**
   * Get input for a node from upstream step(s)
   */
  private getNodeInput(
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    context: ExecutionContext
  ): unknown {
    // Find edges pointing to this node
    const incomingEdges = workflow.edges.filter((e) => e.target === node.id);

    if (incomingEdges.length === 0) {
      return context.input;
    }

    // If single incoming edge, return that output
    if (incomingEdges.length === 1) {
      const edge = incomingEdges[0];
      return edge ? context.stepOutputs.get(edge.source) : context.input;
    }

    // Condition + code nodes: even with multiple incoming edges (common in loops),
    // we want to use the most recent upstream value, not a merged object keyed by node ids.
    // This keeps code/expressions simple (e.g. input.results, input.score) and makes loops intuitive.
    if (node.type === 'condition' || node.type === 'code') {
      return this.getMostRecentInput(incomingEdges, context);
    }

    // For other node types, merge outputs
    return this.mergeIncomingOutputs(incomingEdges, context);
  }

  /**
   * Get the most recent output from incoming edges (for condition/code nodes)
   */
  private getMostRecentInput(incomingEdges: WorkflowEdge[], context: ExecutionContext): unknown {
    const stepOutputKeys = Array.from(context.stepOutputs.keys());
    let bestEdge = incomingEdges[0];
    let bestIndex = -1;

    for (const edge of incomingEdges) {
      const idx = stepOutputKeys.indexOf(edge.source);
      if (idx > bestIndex) {
        bestIndex = idx;
        bestEdge = edge;
      }
    }

    const value = bestEdge ? context.stepOutputs.get(bestEdge.source) : undefined;
    return value !== undefined ? value : context.input;
  }

  /**
   * Merge outputs from multiple incoming edges into a single object
   */
  private mergeIncomingOutputs(
    incomingEdges: WorkflowEdge[],
    context: ExecutionContext
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const edge of incomingEdges) {
      const output = context.stepOutputs.get(edge.source);
      if (output !== undefined) {
        merged[edge.source] = output;
      }
    }
    return merged;
  }

  /**
   * Get next nodes based on current node and output
   */
  private getNextNodes(
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    output: unknown
  ): string[] {
    const outgoingEdges = workflow.edges.filter((e) => e.source === node.id);

    if (outgoingEdges.length === 0) {
      return [];
    }

    // For condition nodes, filter by sourceHandle (the source of truth for which port the edge comes from)
    if (node.type === 'condition') {
      const conditionResult = Boolean(output);
      const expectedHandle = conditionResult ? 'true' : 'false';
      // Use sourceHandle as the source of truth - it indicates which output port (true/false) the edge comes from
      const matchingEdges = outgoingEdges.filter((e) => e.sourceHandle === expectedHandle);
      return matchingEdges.map((e) => e.target);
    }

    // For other nodes, return all targets
    return outgoingEdges.map((e) => e.target);
  }

  /**
   * Load workflow definition
   */
  private loadWorkflow(workflowId: string): WorkflowDefinition | null {
    const path = join(this.vaultPath, WORKFLOWS_DIR, `${workflowId}.json`);

    if (!existsSync(path)) {
      return null;
    }

    try {
      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content) as WorkflowDefinition;
    } catch (error) {
      this.logger.error('Failed to load workflow', {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Save workflow run
   */
  private saveRun(run: WorkflowRun): void {
    const runsDir = join(this.vaultPath, WORKFLOW_RUNS_DIR, run.workflowId);

    // Ensure directory exists
    if (!existsSync(runsDir)) {
      mkdirSync(runsDir, { recursive: true });
    }

    const path = join(runsDir, `${run.id}.json`);
    writeFileSync(path, JSON.stringify(run, null, 2));

    // Maintain last-run summary index for fast UI listing (workflow library)
    try {
      updateRunsIndexFromRun(this.vaultPath, run);
    } catch (error) {
      this.logger.warn('Failed to update workflow runs index', {
        workflowId: run.workflowId,
        runId: run.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
