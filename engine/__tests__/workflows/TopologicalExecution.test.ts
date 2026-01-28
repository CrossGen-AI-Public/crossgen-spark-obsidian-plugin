/**
 * Tests for topological workflow execution model
 * Verifies correct handling of fan-in patterns, loops, and condition branches
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from '../../src/workflows/types.js';
import { WorkflowExecutor } from '../../src/workflows/WorkflowExecutor.js';
import type { CommandExecutor } from '../../src/execution/CommandExecutor.js';
import { Logger } from '../../src/logger/Logger.js';
import { TestVault } from '../utils/TestVault.js';

describe('Topological Execution', () => {
  let vault: TestVault;
  let executor: WorkflowExecutor;
  let mockCommandExecutor: jest.Mocked<CommandExecutor>;

  beforeEach(async () => {
    vault = new TestVault();
    await vault.create();

    await vault.writeFile('.spark/workflows/.gitkeep', '');
    await vault.writeFile('.spark/workflow-runs/.gitkeep', '');
    await vault.writeFile('.spark/workflow-queue/.gitkeep', '');

    mockCommandExecutor = {
      executeWorkflowPrompt: jest.fn<() => Promise<{ content: string }>>().mockResolvedValue({ content: 'AI response' }),
    } as unknown as jest.Mocked<CommandExecutor>;

    const logger = Logger.getInstance();
    executor = new WorkflowExecutor(vault.path, logger, mockCommandExecutor);
  });

  afterEach(async () => {
    await vault.cleanup();
  });

  function createCodeNode(code: string, id: string, label?: string): WorkflowNode {
    return {
      id,
      type: 'code',
      position: { x: 0, y: 0 },
      data: {
        type: 'code',
        label: label || id,
        code,
      },
    };
  }

  function createConditionNode(expression: string, id: string, maxCycles = 10): WorkflowNode {
    return {
      id,
      type: 'condition',
      position: { x: 0, y: 0 },
      data: {
        type: 'condition',
        label: 'Condition',
        expression,
        maxCycles,
      },
    };
  }

  function createWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    id = 'wf_test'
  ): WorkflowDefinition {
    return {
      id,
      name: 'Test Workflow',
      version: 1,
      nodes,
      edges,
      settings: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
  }

  async function saveWorkflow(workflow: WorkflowDefinition): Promise<void> {
    await vault.writeFile(
      `.spark/workflows/${workflow.id}.json`,
      JSON.stringify(workflow, null, 2)
    );
  }

  async function queueWorkflow(workflowId: string, runId: string, input?: unknown): Promise<void> {
    await vault.writeFile(
      `.spark/workflow-queue/${runId}.json`,
      JSON.stringify({
        workflowId,
        runId,
        status: 'pending',
        timestamp: Date.now(),
        input,
      })
    );
  }

  async function readRunResult(workflowId: string, runId: string) {
    const runPath = path.join(vault.path, '.spark', 'workflow-runs', workflowId, `${runId}.json`);
    return JSON.parse(readFileSync(runPath, 'utf-8'));
  }

  describe('Fan-in patterns (diamond)', () => {
    it('executes downstream node once when multiple paths converge', async () => {
      // Diamond pattern: A → B, A → C, B → D, C → D
      // D should execute ONCE (not multiple times like depth-first)
      // Note: Code nodes use "most recent input", not merged inputs
      const nodeA = createCodeNode('return { value: 1 }', 'node_a', 'A');
      const nodeB = createCodeNode('return { fromB: input.value + 10 }', 'node_b', 'B');
      const nodeC = createCodeNode('return { fromC: input.value + 100 }', 'node_c', 'C');
      const nodeD = createCodeNode('return { combined: true, inputs: input }', 'node_d', 'D');

      const workflow = createWorkflow(
        [nodeA, nodeB, nodeC, nodeD],
        [
          { id: 'e1', source: 'node_a', target: 'node_b' },
          { id: 'e2', source: 'node_a', target: 'node_c' },
          { id: 'e3', source: 'node_b', target: 'node_d' },
          { id: 'e4', source: 'node_c', target: 'node_d' },
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_diamond';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      // D should only appear ONCE in stepResults (key behavior for topological execution)
      const dResults = run.stepResults.filter((r: { nodeId: string }) => r.nodeId === 'node_d');
      expect(dResults).toHaveLength(1);

      // D received input and produced output
      const dResult = dResults[0];
      expect(dResult.output.combined).toBe(true);
      // Code nodes receive most recent input (not merged) - this is expected behavior
      expect(dResult.input).toBeDefined();
    });

    it('handles triple fan-in (three entry points merging into one)', async () => {
      // A, B, C → D (all entry points)
      // D should execute ONCE after all upstreams complete
      const nodeA = createCodeNode('return { a: 1 }', 'node_a');
      const nodeB = createCodeNode('return { b: 2 }', 'node_b');
      const nodeC = createCodeNode('return { c: 3 }', 'node_c');
      const nodeD = createCodeNode('return { received: true }', 'node_d');

      const workflow = createWorkflow(
        [nodeA, nodeB, nodeC, nodeD],
        [
          { id: 'e1', source: 'node_a', target: 'node_d' },
          { id: 'e2', source: 'node_b', target: 'node_d' },
          { id: 'e3', source: 'node_c', target: 'node_d' },
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_triple_fanin';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      // D executes exactly once (key topological behavior)
      const dResults = run.stepResults.filter((r: { nodeId: string }) => r.nodeId === 'node_d');
      expect(dResults).toHaveLength(1);

      // All 4 nodes executed
      expect(run.stepResults).toHaveLength(4);
    });
  });

  describe('Loop handling with back-edges', () => {
    it('does not block on back-edge during initial execution', async () => {
      // Workflow: A → B → Condition
      //           Condition (true) → C (end)
      //           Condition (false) → D → loops back to Condition
      // When condition is TRUE, should execute A → B → Condition → C
      // The back-edge D → Condition should NOT block Condition from executing
      const nodeA = createCodeNode('return { counter: 0 }', 'node_a');
      const nodeB = createCodeNode('return { ...input, test: true }', 'node_b');
      const condition = createConditionNode('input.test === true', 'cond');
      const nodeC = createCodeNode('return { result: "done" }', 'node_c');
      const nodeD = createCodeNode('return input', 'node_d');

      const workflow = createWorkflow(
        [nodeA, nodeB, condition, nodeC, nodeD],
        [
          { id: 'e1', source: 'node_a', target: 'node_b' },
          { id: 'e2', source: 'node_b', target: 'cond' },
          { id: 'e3', source: 'cond', target: 'node_c', sourceHandle: 'true' },
          { id: 'e4', source: 'cond', target: 'node_d', sourceHandle: 'false' },
          { id: 'e5', source: 'node_d', target: 'cond' }, // Back-edge
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_backedge';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      // Should have executed: A, B, Condition, C
      const executedNodes = run.stepResults.map((r: { nodeId: string }) => r.nodeId);
      expect(executedNodes).toContain('node_a');
      expect(executedNodes).toContain('node_b');
      expect(executedNodes).toContain('cond');
      expect(executedNodes).toContain('node_c');

      // D should NOT have executed (false branch not taken)
      expect(executedNodes).not.toContain('node_d');
    });

    it('executes loop when condition takes loop branch', async () => {
      // Counter loop: increments until counter >= 3
      // A (counter=0) → Condition (counter < 3)
      //   true: B (counter++) → loops back to Condition
      //   false: C (done)
      const nodeA = createCodeNode('return { counter: 0 }', 'node_a');
      const condition = createConditionNode('input.counter < 3', 'cond', 10);
      const nodeB = createCodeNode('return { counter: input.counter + 1 }', 'node_b');
      const nodeC = createCodeNode('return { result: "done", finalCount: input.counter }', 'node_c');

      const workflow = createWorkflow(
        [nodeA, condition, nodeB, nodeC],
        [
          { id: 'e1', source: 'node_a', target: 'cond' },
          { id: 'e2', source: 'cond', target: 'node_b', sourceHandle: 'true' },
          { id: 'e3', source: 'node_b', target: 'cond' }, // Loop back
          { id: 'e4', source: 'cond', target: 'node_c', sourceHandle: 'false' },
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_loop';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      // Condition should have executed 4 times (0<3, 1<3, 2<3, 3<3=false)
      const condResults = run.stepResults.filter((r: { nodeId: string }) => r.nodeId === 'cond');
      expect(condResults).toHaveLength(4);

      // B should have executed 3 times (increments 0→1, 1→2, 2→3)
      const bResults = run.stepResults.filter((r: { nodeId: string }) => r.nodeId === 'node_b');
      expect(bResults).toHaveLength(3);

      // C should have executed once with final count = 3
      const cResult = run.stepResults.find((r: { nodeId: string }) => r.nodeId === 'node_c');
      expect(cResult).toBeDefined();
      expect(cResult.output.finalCount).toBe(3);
    });

    it('respects maxCycles limit', async () => {
      // Infinite loop that should stop at maxCycles
      const nodeA = createCodeNode('return { counter: 0 }', 'node_a');
      const condition = createConditionNode('true', 'cond', 3); // Always true, max 3 cycles
      const nodeB = createCodeNode('return { counter: input.counter + 1 }', 'node_b');

      const workflow = createWorkflow(
        [nodeA, condition, nodeB],
        [
          { id: 'e1', source: 'node_a', target: 'cond' },
          { id: 'e2', source: 'cond', target: 'node_b', sourceHandle: 'true' },
          { id: 'e3', source: 'node_b', target: 'cond' }, // Loop back
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_maxcycles';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      // Condition should have executed exactly maxCycles (3) times
      const condResults = run.stepResults.filter((r: { nodeId: string }) => r.nodeId === 'cond');
      expect(condResults).toHaveLength(3);
    });
  });

  describe('Condition branch handling', () => {
    it('only executes the taken branch (true)', async () => {
      // A → Condition
      //   true: B → C
      //   false: D → E
      const nodeA = createCodeNode('return { flag: true }', 'node_a');
      const condition = createConditionNode('input.flag === true', 'cond');
      const nodeB = createCodeNode('return "B"', 'node_b');
      const nodeC = createCodeNode('return "C"', 'node_c');
      const nodeD = createCodeNode('return "D"', 'node_d');
      const nodeE = createCodeNode('return "E"', 'node_e');

      const workflow = createWorkflow(
        [nodeA, condition, nodeB, nodeC, nodeD, nodeE],
        [
          { id: 'e1', source: 'node_a', target: 'cond' },
          { id: 'e2', source: 'cond', target: 'node_b', sourceHandle: 'true' },
          { id: 'e3', source: 'node_b', target: 'node_c' },
          { id: 'e4', source: 'cond', target: 'node_d', sourceHandle: 'false' },
          { id: 'e5', source: 'node_d', target: 'node_e' },
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_true_branch';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      const executedNodes = run.stepResults.map((r: { nodeId: string }) => r.nodeId);
      expect(executedNodes).toContain('node_a');
      expect(executedNodes).toContain('cond');
      expect(executedNodes).toContain('node_b');
      expect(executedNodes).toContain('node_c');

      // False branch should NOT execute
      expect(executedNodes).not.toContain('node_d');
      expect(executedNodes).not.toContain('node_e');
    });

    it('only executes the taken branch (false)', async () => {
      const nodeA = createCodeNode('return { flag: false }', 'node_a');
      const condition = createConditionNode('input.flag === true', 'cond');
      const nodeB = createCodeNode('return "B"', 'node_b');
      const nodeD = createCodeNode('return "D"', 'node_d');

      const workflow = createWorkflow(
        [nodeA, condition, nodeB, nodeD],
        [
          { id: 'e1', source: 'node_a', target: 'cond' },
          { id: 'e2', source: 'cond', target: 'node_b', sourceHandle: 'true' },
          { id: 'e3', source: 'cond', target: 'node_d', sourceHandle: 'false' },
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_false_branch';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      const executedNodes = run.stepResults.map((r: { nodeId: string }) => r.nodeId);
      expect(executedNodes).toContain('node_a');
      expect(executedNodes).toContain('cond');
      expect(executedNodes).toContain('node_d');

      // True branch should NOT execute
      expect(executedNodes).not.toContain('node_b');
    });

    it('handles condition with branches that reconverge', async () => {
      // A → Condition
      //   true: B
      //   false: C
      // B, C → D (reconverge)
      // Only one branch executes, so D should still run with single input
      const nodeA = createCodeNode('return { flag: true }', 'node_a');
      const condition = createConditionNode('input.flag === true', 'cond');
      const nodeB = createCodeNode('return { from: "B" }', 'node_b');
      const nodeC = createCodeNode('return { from: "C" }', 'node_c');
      const nodeD = createCodeNode('return { received: input }', 'node_d');

      const workflow = createWorkflow(
        [nodeA, condition, nodeB, nodeC, nodeD],
        [
          { id: 'e1', source: 'node_a', target: 'cond' },
          { id: 'e2', source: 'cond', target: 'node_b', sourceHandle: 'true' },
          { id: 'e3', source: 'cond', target: 'node_c', sourceHandle: 'false' },
          { id: 'e4', source: 'node_b', target: 'node_d' },
          { id: 'e5', source: 'node_c', target: 'node_d' },
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_reconverge';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      const executedNodes = run.stepResults.map((r: { nodeId: string }) => r.nodeId);
      expect(executedNodes).toContain('node_a');
      expect(executedNodes).toContain('cond');
      expect(executedNodes).toContain('node_b');
      expect(executedNodes).toContain('node_d');
      expect(executedNodes).not.toContain('node_c');

      // D should have received input from B only
      const dResult = run.stepResults.find((r: { nodeId: string }) => r.nodeId === 'node_d');
      expect(dResult.input).toHaveProperty('from', 'B');
    });
  });

  describe('Complex patterns', () => {
    it('handles "test 1" workflow pattern (condition with loop back-edge)', async () => {
      // Mimics the real "test 1" workflow:
      // A → B → Condition (input.test1 == 1)
      //   true: Code → ProcessResult (end)
      //   false: B1 → LoopCode → back to Condition
      const nodeA = createCodeNode('return 3', 'node_a', 'A');
      const nodeB = createCodeNode('return { test1: 1 }', 'node_b', 'B');
      const condition = createConditionNode('input.test1 == 1', 'cond', 3);
      const codeTrue = createCodeNode('return { result: input }', 'code_true', 'Code');
      const processResult = createCodeNode(
        'return { ...input, timestamp: Date.now(), processed: true }',
        'process_result',
        'ProcessResult'
      );
      const b1 = createCodeNode('return { result: input }', 'b1', 'B1');
      const loopCode = createCodeNode('return { result: input }', 'loop_code', 'LoopCode');

      const workflow = createWorkflow(
        [nodeA, nodeB, condition, codeTrue, processResult, b1, loopCode],
        [
          { id: 'e1', source: 'node_a', target: 'node_b' },
          { id: 'e2', source: 'node_b', target: 'cond' },
          { id: 'e3', source: 'cond', target: 'code_true', sourceHandle: 'true' },
          { id: 'e4', source: 'code_true', target: 'process_result' },
          { id: 'e5', source: 'cond', target: 'b1', sourceHandle: 'false' },
          { id: 'e6', source: 'b1', target: 'loop_code' },
          { id: 'e7', source: 'loop_code', target: 'cond' }, // Back-edge
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_test1_pattern';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      // Should execute: A → B → Condition → Code → ProcessResult
      const executedNodes = run.stepResults.map((r: { nodeId: string }) => r.nodeId);
      expect(executedNodes).toEqual(['node_a', 'node_b', 'cond', 'code_true', 'process_result']);

      // False branch (B1, LoopCode) should NOT execute
      expect(executedNodes).not.toContain('b1');
      expect(executedNodes).not.toContain('loop_code');
    });

    it('handles parallel branches that merge before condition', async () => {
      // A → B
      // A → C
      // B, C → Condition → D
      const nodeA = createCodeNode('return { start: true }', 'node_a');
      const nodeB = createCodeNode('return { b: 1 }', 'node_b');
      const nodeC = createCodeNode('return { c: 2 }', 'node_c');
      const condition = createConditionNode('true', 'cond');
      const nodeD = createCodeNode('return "done"', 'node_d');

      const workflow = createWorkflow(
        [nodeA, nodeB, nodeC, condition, nodeD],
        [
          { id: 'e1', source: 'node_a', target: 'node_b' },
          { id: 'e2', source: 'node_a', target: 'node_c' },
          { id: 'e3', source: 'node_b', target: 'cond' },
          { id: 'e4', source: 'node_c', target: 'cond' },
          { id: 'e5', source: 'cond', target: 'node_d', sourceHandle: 'true' },
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_parallel_merge';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      // Condition should execute once (after both B and C)
      const condResults = run.stepResults.filter((r: { nodeId: string }) => r.nodeId === 'cond');
      expect(condResults).toHaveLength(1);

      // All nodes should execute
      expect(run.stepResults).toHaveLength(5);
    });

    it('handles workflow with multiple entry points', async () => {
      // Two independent entry points: A and B
      // A → C
      // B → C
      // C executes ONCE after both A and B (topological behavior)
      const nodeA = createCodeNode('return { a: 1 }', 'node_a');
      const nodeB = createCodeNode('return { b: 2 }', 'node_b');
      const nodeC = createCodeNode('return { received: input }', 'node_c');

      const workflow = createWorkflow(
        [nodeA, nodeB, nodeC],
        [
          { id: 'e1', source: 'node_a', target: 'node_c' },
          { id: 'e2', source: 'node_b', target: 'node_c' },
        ]
      );

      await saveWorkflow(workflow);
      const runId = 'run_multi_entry';
      await queueWorkflow(workflow.id, runId);

      await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

      const run = await readRunResult(workflow.id, runId);
      expect(run.status).toBe('completed');

      // C should execute exactly once (key topological behavior)
      const cResults = run.stepResults.filter((r: { nodeId: string }) => r.nodeId === 'node_c');
      expect(cResults).toHaveLength(1);

      // All 3 nodes executed
      expect(run.stepResults).toHaveLength(3);

      // C received some input (code nodes use most recent, not merged)
      expect(cResults[0].input).toBeDefined();
    });
  });
});
