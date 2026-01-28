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
  FileAttachment,
  FileNodeData,
  FileTarget,
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
   * Execute a workflow using topological execution model.
   * Each node executes exactly once when all its upstream nodes have completed.
   * This properly handles fan-in patterns (multiple nodes → single node).
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
      await this.runTopologicalExecution(workflow, context, run);

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
   * Run the topological execution loop.
   * Executes nodes in dependency order, handling condition branches and loops.
   */
  private async runTopologicalExecution(
    workflow: WorkflowDefinition,
    context: ExecutionContext,
    run: WorkflowRun
  ): Promise<void> {
    // Identify back-edges (edges that create cycles) using DFS
    const backEdges = this.identifyBackEdges(workflow);

    // Build forward upstream map (excludes back-edges)
    const forwardUpstreamMap = this.buildForwardUpstreamMap(workflow, backEdges);

    // Track execution state
    const pendingNodes = new Set(workflow.nodes.map((n) => n.id));
    const executedNodes = new Set<string>();
    // Track which nodes are reachable (for condition branch handling)
    const reachableNodes = new Set(workflow.nodes.map((n) => n.id));

    // Execute nodes in topological order using dynamic ready-check
    while (pendingNodes.size > 0) {
      const readyNodes = this.findReadyNodes(
        pendingNodes,
        executedNodes,
        reachableNodes,
        forwardUpstreamMap
      );

      if (readyNodes.length === 0) {
        // No progress possible - remaining nodes are unreachable (condition branch not taken)
        break;
      }

      // Execute all ready nodes (in order for determinism)
      for (const nodeId of readyNodes) {
        await this.executeReadyNode(
          workflow,
          nodeId,
          context,
          run,
          pendingNodes,
          executedNodes,
          reachableNodes
        );
      }
    }
  }

  /**
   * Execute a single ready node and update execution state.
   */
  private async executeReadyNode(
    workflow: WorkflowDefinition,
    nodeId: string,
    context: ExecutionContext,
    run: WorkflowRun,
    pendingNodes: Set<string>,
    executedNodes: Set<string>,
    reachableNodes: Set<string>
  ): Promise<void> {
    const node = workflow.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Execute the node
    const result = await this.executeNode(workflow, node, context, run);

    // Move from pending to executed
    pendingNodes.delete(nodeId);
    executedNodes.add(nodeId);

    // If step failed, stop execution
    if (result.status === 'failed') {
      throw new Error(`Step ${nodeId} failed: ${result.error}`);
    }

    // Handle condition node branching (marks untaken branch as unreachable)
    if (node.type === 'condition') {
      this.updateReachabilityForCondition(
        workflow,
        node,
        result.output,
        reachableNodes,
        pendingNodes,
        executedNodes
      );
    }

    // Check for loop back-edges: if this node has outgoing edges to already-executed nodes,
    // reset those loop sections for re-execution
    this.handleLoopBackEdges(
      workflow,
      nodeId,
      pendingNodes,
      executedNodes,
      reachableNodes,
      context
    );
  }

  /**
   * Handle loop back-edges after a node executes.
   * If this node has outgoing edges to already-executed nodes (back-edges),
   * reset the loop section for re-execution (respecting maxCycles).
   */
  private handleLoopBackEdges(
    workflow: WorkflowDefinition,
    nodeId: string,
    pendingNodes: Set<string>,
    executedNodes: Set<string>,
    reachableNodes: Set<string>,
    context: ExecutionContext
  ): void {
    // Find outgoing edges that point to already-executed nodes (back-edges)
    const outgoingEdges = workflow.edges.filter((e) => e.source === nodeId);

    for (const edge of outgoingEdges) {
      if (executedNodes.has(edge.target)) {
        // This is a back-edge to an already-executed node - potential loop
        const targetNode = workflow.nodes.find((n) => n.id === edge.target);
        if (!targetNode) continue;

        // Check if the target (typically a condition node) has exceeded maxCycles
        if (targetNode.type === 'condition') {
          const conditionData = targetNode.data as { maxCycles?: number };
          const maxCycles = conditionData.maxCycles || 10;
          const visitCount = context.visitCounts.get(edge.target) || 0;

          if (visitCount >= maxCycles) {
            // Max cycles reached, don't reset the loop
            continue;
          }
        }

        // Reset the loop section for re-execution
        this.resetLoopSection(
          workflow,
          edge.target, // Loop start (the node we're looping back to)
          nodeId, // Loop end (the node with the back-edge)
          pendingNodes,
          executedNodes,
          reachableNodes
        );
      }
    }
  }

  /**
   * Identify back-edges in the workflow graph using DFS from entry points.
   * A back-edge is an edge that points to an ancestor in the DFS tree (creates a cycle).
   * Returns a Set of edge IDs that are back-edges.
   */
  private identifyBackEdges(workflow: WorkflowDefinition): Set<string> {
    const backEdges = new Set<string>();

    // Find entry points (nodes with no incoming edges)
    const targetNodeIds = new Set(workflow.edges.map((e) => e.target));
    const entryNodeIds = workflow.nodes.filter((n) => !targetNodeIds.has(n.id)).map((n) => n.id);

    // If no entry points found, all nodes might be in a cycle - use first node
    const firstNode = workflow.nodes[0];
    if (entryNodeIds.length === 0 && firstNode) {
      entryNodeIds.push(firstNode.id);
    }

    // DFS state
    const visited = new Set<string>();
    const inStack = new Set<string>(); // Nodes currently in recursion stack

    const dfs = (nodeId: string): void => {
      visited.add(nodeId);
      inStack.add(nodeId);

      // Check all outgoing edges
      for (const edge of workflow.edges) {
        if (edge.source !== nodeId) continue;

        if (inStack.has(edge.target)) {
          // Target is an ancestor in DFS tree - this is a back-edge
          backEdges.add(edge.id);
        } else if (!visited.has(edge.target)) {
          // Continue DFS
          dfs(edge.target);
        }
      }

      inStack.delete(nodeId);
    };

    // Run DFS from all entry points
    for (const entryId of entryNodeIds) {
      if (!visited.has(entryId)) {
        dfs(entryId);
      }
    }

    // Also run DFS from any unvisited nodes (handles disconnected components)
    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }

    return backEdges;
  }

  /**
   * Build a map of nodeId → Set of forward upstream nodeIds (excluding back-edges)
   */
  private buildForwardUpstreamMap(
    workflow: WorkflowDefinition,
    backEdges: Set<string>
  ): Map<string, Set<string>> {
    const upstreamMap = new Map<string, Set<string>>();
    for (const node of workflow.nodes) {
      upstreamMap.set(node.id, new Set());
    }
    for (const edge of workflow.edges) {
      // Skip back-edges - they don't create forward dependencies
      if (backEdges.has(edge.id)) continue;

      const upstreams = upstreamMap.get(edge.target);
      if (upstreams) {
        upstreams.add(edge.source);
      }
    }
    return upstreamMap;
  }

  /**
   * Find nodes that are ready to execute:
   * - In pending set
   * - Reachable (not on an untaken condition branch)
   * - All forward upstream nodes have been executed (back-edges already excluded from map)
   */
  private findReadyNodes(
    pendingNodes: Set<string>,
    executedNodes: Set<string>,
    reachableNodes: Set<string>,
    forwardUpstreamMap: Map<string, Set<string>>
  ): string[] {
    const ready: string[] = [];

    for (const nodeId of pendingNodes) {
      // Skip if not reachable
      if (!reachableNodes.has(nodeId)) continue;

      // Get forward upstream nodes (back-edges already excluded)
      const upstreams = forwardUpstreamMap.get(nodeId) || new Set();

      // Check if all reachable forward upstreams have executed
      let allUpstreamsReady = true;
      for (const upstreamId of upstreams) {
        // Skip if upstream is not reachable (on untaken branch)
        if (!reachableNodes.has(upstreamId)) continue;

        // This is a forward upstream - must be executed
        if (!executedNodes.has(upstreamId)) {
          allUpstreamsReady = false;
          break;
        }
      }

      if (allUpstreamsReady) {
        ready.push(nodeId);
      }
    }

    // Sort for deterministic execution order (by node id)
    return ready.sort();
  }

  /**
   * Update reachability based on condition node result.
   * Only the taken branch remains reachable; nodes on the untaken branch become unreachable.
   * Important for loops: restore reachability for taken branch (may have been unreachable in previous iteration).
   */
  private updateReachabilityForCondition(
    workflow: WorkflowDefinition,
    conditionNode: WorkflowNode,
    output: unknown,
    reachableNodes: Set<string>,
    pendingNodes: Set<string>,
    _executedNodes: Set<string>
  ): void {
    const conditionResult = Boolean(output);
    const takenHandle = conditionResult ? 'true' : 'false';
    const untakenHandle = conditionResult ? 'false' : 'true';

    // Find edges from this condition node
    const outgoingEdges = workflow.edges.filter((e) => e.source === conditionNode.id);

    // First, restore reachability for the taken branch
    // This is important for loops where the condition result may change
    for (const edge of outgoingEdges) {
      if (edge.sourceHandle === takenHandle) {
        this.markBranchReachable(workflow, edge.target, reachableNodes, pendingNodes);
      }
    }

    // Then mark untaken branch as unreachable
    for (const edge of outgoingEdges) {
      if (edge.sourceHandle === untakenHandle) {
        this.markBranchUnreachable(workflow, edge.target, reachableNodes, pendingNodes);
      }
    }
  }

  /**
   * Mark a branch as reachable, propagating to downstream nodes that are pending.
   */
  private markBranchReachable(
    workflow: WorkflowDefinition,
    startNodeId: string,
    reachableNodes: Set<string>,
    pendingNodes: Set<string>
  ): void {
    // BFS to mark nodes as reachable
    const queue = [startNodeId];
    const visited = new Set<string>();

    let nodeId = queue.shift();
    while (nodeId !== undefined) {
      if (!visited.has(nodeId)) {
        visited.add(nodeId);

        // Mark reachable if it's pending
        if (pendingNodes.has(nodeId)) {
          reachableNodes.add(nodeId);
        }

        // Find downstream nodes
        const downstream = workflow.edges.filter((e) => e.source === nodeId).map((e) => e.target);
        for (const nextId of downstream) {
          if (!visited.has(nextId) && pendingNodes.has(nextId)) {
            queue.push(nextId);
          }
        }
      }
      nodeId = queue.shift();
    }
  }

  /**
   * Mark a branch as unreachable, propagating to downstream nodes.
   * A node is only marked unreachable if ALL its upstream nodes are unreachable.
   * This handles reconverging branches correctly.
   */
  private markBranchUnreachable(
    workflow: WorkflowDefinition,
    startNodeId: string,
    reachableNodes: Set<string>,
    pendingNodes: Set<string>
  ): void {
    // First, mark the start node as unreachable
    if (pendingNodes.has(startNodeId)) {
      reachableNodes.delete(startNodeId);
    }

    // Then propagate: a node becomes unreachable only if ALL its upstream nodes are unreachable
    // We need to iterate until no more changes (fixed-point)
    let changed = true;
    while (changed) {
      changed = false;

      for (const node of workflow.nodes) {
        // Skip if already unreachable or not pending
        if (!reachableNodes.has(node.id) || !pendingNodes.has(node.id)) continue;

        // Find all upstream nodes (incoming edges)
        const upstreamIds = workflow.edges.filter((e) => e.target === node.id).map((e) => e.source);

        // If no upstreams, this is an entry node - stays reachable
        if (upstreamIds.length === 0) continue;

        // Check if ALL upstream nodes are unreachable
        const allUpstreamsUnreachable = upstreamIds.every((upId) => !reachableNodes.has(upId));

        if (allUpstreamsUnreachable) {
          reachableNodes.delete(node.id);
          changed = true;
        }
      }
    }
  }

  /**
   * Reset nodes in a loop section for re-execution.
   * Finds all nodes between loopStartId and conditionId and moves them from executed back to pending.
   */
  private resetLoopSection(
    workflow: WorkflowDefinition,
    loopStartId: string,
    conditionId: string,
    pendingNodes: Set<string>,
    executedNodes: Set<string>,
    reachableNodes: Set<string>
  ): void {
    // Find all nodes in the loop (from loopStart to condition, inclusive)
    const loopNodes = this.findLoopNodes(workflow, loopStartId, conditionId);

    for (const nodeId of loopNodes) {
      if (executedNodes.has(nodeId)) {
        executedNodes.delete(nodeId);
        pendingNodes.add(nodeId);
        reachableNodes.add(nodeId);
      }
    }
  }

  /**
   * Find all nodes that are part of a loop from startId to endId
   */
  private findLoopNodes(workflow: WorkflowDefinition, startId: string, endId: string): Set<string> {
    const loopNodes = new Set<string>();

    // BFS from startId, looking for paths that reach endId
    const queue: string[] = [startId];
    const visited = new Set<string>();

    let nodeId = queue.shift();
    while (nodeId !== undefined) {
      if (!visited.has(nodeId)) {
        visited.add(nodeId);
        loopNodes.add(nodeId);

        // Stop at the condition node (but include it)
        if (nodeId !== endId) {
          // Find downstream nodes
          const downstream = workflow.edges.filter((e) => e.source === nodeId).map((e) => e.target);
          for (const nextId of downstream) {
            if (!visited.has(nextId)) {
              queue.push(nextId);
            }
          }
        }
      }
      nodeId = queue.shift();
    }

    return loopNodes;
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    context: ExecutionContext,
    run: WorkflowRun
  ): Promise<StepResult> {
    // Track visit count for loop detection
    const visitCount = (context.visitCounts.get(node.id) || 0) + 1;
    context.visitCounts.set(node.id, visitCount);

    // Check node-specific cycle limit for condition nodes
    if (node.type === 'condition') {
      const conditionData = node.data as ConditionNodeData & { type: 'condition' };
      if (visitCount > conditionData.maxCycles) {
        this.logger.warn('Condition node max cycles exceeded, stopping loop', {
          nodeId: node.id,
          maxCycles: conditionData.maxCycles,
          visitCount,
        });
        // Return a "completed" result to stop execution gracefully
        const skipResult: StepResult = {
          nodeId: node.id,
          status: 'completed',
          input: undefined,
          startTime: Date.now(),
          endTime: Date.now(),
          cycleCount: visitCount,
          output: false, // Treat max cycles as "false" to exit loop
        };
        run.stepResults.push(skipResult);
        this.saveRun(run);
        return skipResult;
      }
    }

    context.totalCycles++;

    // Get input from upstream nodes
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

    // Execute the step
    const result = await this.executeStep(workflow, node, previousOutput, context);
    result.cycleCount = visitCount;

    // Update the running result in place with final status
    const resultIndex = run.stepResults.findIndex(
      (r) => r.nodeId === node.id && r.status === 'running'
    );
    if (resultIndex !== -1) {
      run.stepResults[resultIndex] = result;
    } else {
      run.stepResults.push(result);
    }

    // Save run after each step for real-time progress updates
    this.saveRun(run);

    // Store output for downstream nodes
    if (result.status === 'completed') {
      if (node.type === 'condition') {
        // Condition nodes pass through their INPUT, not their boolean output
        context.stepOutputs.set(node.id, previousOutput);
      } else if (result.output !== undefined) {
        context.stepOutputs.set(node.id, result.output);
      }
    }

    return result;
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
      input,
      startTime: Date.now(),
    };

    try {
      const output = await this.executeStepByType(workflow, node, input, context);
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
   * Execute step based on node type
   */
  private async executeStepByType(
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    input: unknown,
    context: ExecutionContext
  ): Promise<unknown> {
    const attachments = this.collectFileAttachments(workflow, node.id, context);

    switch (node.type) {
      case 'prompt':
        return this.executePromptNode(workflow, node, input, context);

      case 'code':
        return this.executeCodeNode(workflow, node, input, context, attachments);

      case 'condition':
        return this.conditionRunner.run(node, input, context, attachments);

      case 'file':
        return this.executeFileNode(node, workflow);

      default:
        throw new Error(`Unknown step type: ${String(node.type)}`);
    }
  }

  /**
   * Execute a prompt node and write to connected file nodes
   */
  private async executePromptNode(
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    input: unknown,
    context: ExecutionContext
  ): Promise<unknown> {
    const fileTargets = this.getDownstreamFileTargets(workflow, node.id);
    const inputContext = this.buildInputContext(workflow, node.id, input, context);
    const output = await this.promptRunner.run(node, inputContext, context, fileTargets);

    this.writeOutputToFileTargets(output, fileTargets);
    return output;
  }

  /**
   * Execute a code node and write to connected file nodes
   */
  private async executeCodeNode(
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    input: unknown,
    context: ExecutionContext,
    attachments: FileAttachment[]
  ): Promise<unknown> {
    const fileTargets = this.getDownstreamFileTargets(workflow, node.id);
    const output = await this.codeRunner.run(node, input, context, attachments);

    this.writeOutputToFileTargets(output, fileTargets);
    return output;
  }

  /**
   * Write output to connected file targets
   */
  private writeOutputToFileTargets(output: unknown, fileTargets: FileTarget[]): void {
    if (fileTargets.length === 0 || output === undefined) return;

    const content = this.extractContentForFileWrite(output);
    for (const target of fileTargets) {
      this.writeToFileNode(target.path, content);
    }
  }

  /**
   * Extract string content from output for writing to files
   */
  private extractContentForFileWrite(output: unknown): string {
    if (typeof output === 'string') {
      return output;
    }
    if (typeof output === 'object' && output !== null) {
      // Handle { content: string } wrapper from prompt responses
      if ('content' in output && typeof (output as { content: unknown }).content === 'string') {
        return (output as { content: string }).content;
      }
      // Serialize objects as JSON
      return JSON.stringify(output, null, 2);
    }
    return String(output);
  }

  /**
   * Execute a file node - reads file content and returns it as an attachment
   * In write mode (has incoming edges), the file is written to by upstream nodes
   */
  private async executeFileNode(
    node: WorkflowNode,
    workflow: WorkflowDefinition
  ): Promise<FileAttachment | null> {
    const data = node.data as FileNodeData & { type: 'file' };
    const filePath = join(this.vaultPath, data.path);

    // Check if this is a write-mode file node (has incoming edges from non-file nodes)
    const hasIncomingFromNonFile = workflow.edges.some((e) => {
      if (e.target !== node.id) return false;
      const sourceNode = workflow.nodes.find((n) => n.id === e.source);
      return sourceNode && sourceNode.type !== 'file';
    });

    this.logger.debug('Executing file node', {
      nodeId: node.id,
      path: data.path,
      isWriteMode: hasIncomingFromNonFile,
    });

    // In write mode, skip reading - the file will be written to by upstream nodes
    if (hasIncomingFromNonFile) {
      return null;
    }

    // Read mode - return file content as attachment
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${data.path}`);
    }

    const content = readFileSync(filePath, 'utf-8');

    return {
      path: data.path,
      content,
    };
  }

  /**
   * Get file nodes connected as targets (downstream) from a source node
   * These are files that should receive the node's output
   */
  private getDownstreamFileTargets(workflow: WorkflowDefinition, nodeId: string): FileTarget[] {
    const targets: FileTarget[] = [];
    const outgoingEdges = workflow.edges.filter((e) => e.source === nodeId);

    for (const edge of outgoingEdges) {
      const targetNode = workflow.nodes.find((n) => n.id === edge.target);
      if (targetNode?.type === 'file') {
        const fileData = targetNode.data as FileNodeData & { type: 'file' };
        targets.push({
          nodeId: targetNode.id,
          path: fileData.path,
          label: fileData.label,
        });
      }
    }

    return targets;
  }

  /**
   * Write content to a file node's path
   * Creates parent directories if they don't exist
   */
  private writeToFileNode(path: string, content: string): void {
    const filePath = join(this.vaultPath, path);
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));

    // Create parent directories if needed
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(filePath, content, 'utf-8');
    this.logger.debug('Wrote content to file node', {
      path,
      contentLength: content.length,
    });
  }

  /**
   * Collect file attachments from upstream file nodes
   */
  private collectFileAttachments(
    workflow: WorkflowDefinition,
    nodeId: string,
    context: ExecutionContext
  ): FileAttachment[] {
    const attachments: FileAttachment[] = [];
    const incomingEdges = workflow.edges.filter((e) => e.target === nodeId);

    for (const edge of incomingEdges) {
      const sourceNode = workflow.nodes.find((n) => n.id === edge.source);
      if (sourceNode?.type === 'file') {
        const output = context.stepOutputs.get(edge.source);
        if (output && typeof output === 'object' && 'path' in output && 'content' in output) {
          attachments.push(output as FileAttachment);
        }
      }
    }

    return attachments;
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

    // Collect file attachments from connected file nodes
    const attachments = this.collectFileAttachments(workflow, nodeId, context);

    // No incoming edges - use workflow input
    if (incomingEdges.length === 0) {
      return {
        primary: null,
        context: [],
        workflowInput: context.input,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    }

    // Collect all inputs with labels (excluding file nodes - they go in attachments)
    const inputs: LabeledOutput[] = [];
    for (const edge of incomingEdges) {
      const sourceNode = workflow.nodes.find((n) => n.id === edge.source);
      // Skip file nodes - their output goes in attachments, not inputs
      if (sourceNode?.type === 'file') continue;

      const output = context.stepOutputs.get(edge.source);
      if (output !== undefined) {
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
      attachments: attachments.length > 0 ? attachments : undefined,
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
