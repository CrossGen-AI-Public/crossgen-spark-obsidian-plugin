/**
 * Tests for file node execution in workflows
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FileAttachment, WorkflowDefinition, WorkflowNode, WorkflowEdge } from '../../src/workflows/types.js';
import { WorkflowExecutor } from '../../src/workflows/WorkflowExecutor.js';
import type { CommandExecutor } from '../../src/execution/CommandExecutor.js';
import { Logger } from '../../src/logger/Logger.js';
import { TestVault } from '../utils/TestVault.js';

describe('File Node Execution', () => {
  let vault: TestVault;
  let executor: WorkflowExecutor;
  let mockCommandExecutor: jest.Mocked<CommandExecutor>;

  beforeEach(async () => {
    vault = new TestVault();
    await vault.create();

    // Create workflow directories
    await vault.writeFile('.spark/workflows/.gitkeep', '');
    await vault.writeFile('.spark/workflow-runs/.gitkeep', '');
    await vault.writeFile('.spark/workflow-queue/.gitkeep', '');

    // Mock command executor for prompt nodes
    mockCommandExecutor = {
      executeWorkflowPrompt: jest.fn<() => Promise<{ content: string }>>().mockResolvedValue({ content: 'AI response' }),
    } as unknown as jest.Mocked<CommandExecutor>;

    const logger = Logger.getInstance();
    executor = new WorkflowExecutor(vault.path, logger, mockCommandExecutor);
  });

  afterEach(async () => {
    await vault.cleanup();
  });

  function createFileNode(filePath: string, id = 'file_1'): WorkflowNode {
    return {
      id,
      type: 'file',
      position: { x: 100, y: 100 },
      data: {
        type: 'file',
        label: filePath.split('/').pop() || filePath,
        path: filePath,
        lastModified: Date.now(),
        fileSize: 100,
      },
    };
  }

  function createPromptNode(prompt: string, id = 'prompt_1'): WorkflowNode {
    return {
      id,
      type: 'prompt',
      position: { x: 300, y: 100 },
      data: {
        type: 'prompt',
        label: 'AI Step',
        prompt,
      },
    };
  }

  function createCodeNode(code: string, id = 'code_1'): WorkflowNode {
    return {
      id,
      type: 'code',
      position: { x: 300, y: 100 },
      data: {
        type: 'code',
        label: 'Code Step',
        code,
      },
    };
  }

  function createConditionNode(expression: string, id = 'cond_1'): WorkflowNode {
    return {
      id,
      type: 'condition',
      position: { x: 300, y: 100 },
      data: {
        type: 'condition',
        label: 'Condition',
        expression,
        maxCycles: 10,
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

  async function queueWorkflow(workflowId: string, runId: string): Promise<void> {
    await vault.writeFile(
      `.spark/workflow-queue/${runId}.json`,
      JSON.stringify({
        workflowId,
        runId,
        status: 'pending',
        timestamp: Date.now(),
      })
    );
  }

  async function readRunResult(workflowId: string, runId: string) {
    const runPath = path.join(vault.path, '.spark', 'workflow-runs', workflowId, `${runId}.json`);
    return JSON.parse(readFileSync(runPath, 'utf-8'));
  }

  it('reads file content at execution time', async () => {
    // Create a test file
    const testFilePath = 'test-doc.md';
    const testContent = '# Test Document\n\nThis is test content.';
    await vault.writeFile(testFilePath, testContent);

    // Create workflow with file -> prompt
    const fileNode = createFileNode(testFilePath);
    const promptNode = createPromptNode('Summarize: $input');
    const workflow = createWorkflow(
      [fileNode, promptNode],
      [{ id: 'e1', source: fileNode.id, target: promptNode.id }]
    );

    await saveWorkflow(workflow);
    const runId = 'run_file_read';
    await queueWorkflow(workflow.id, runId);

    await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

    // Verify the prompt was called with file content as attachment
    expect(mockCommandExecutor.executeWorkflowPrompt).toHaveBeenCalled();
    const call = mockCommandExecutor.executeWorkflowPrompt.mock.calls[0]![0] as { inputContext: { attachments?: FileAttachment[] } };
    const attachments = call.inputContext.attachments!;
    expect(attachments).toHaveLength(1);
    expect(attachments[0]!.path).toBe(testFilePath);
    expect(attachments[0]!.content).toBe(testContent);
  });

  it('fails with clear error when file is missing', async () => {
    const fileNode = createFileNode('nonexistent-file.md');
    const promptNode = createPromptNode('Process this');
    const workflow = createWorkflow(
      [fileNode, promptNode],
      [{ id: 'e1', source: fileNode.id, target: promptNode.id }]
    );

    await saveWorkflow(workflow);
    const runId = 'run_missing_file';
    await queueWorkflow(workflow.id, runId);

    await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

    // Check run result shows error
    const run = await readRunResult(workflow.id, runId);
    expect(run.status).toBe('failed');
    expect(run.error).toContain('File not found: nonexistent-file.md');
  });

  it('merges multiple file nodes into attachments array', async () => {
    // Create test files
    await vault.writeFile('file1.md', '# File 1\nContent one');
    await vault.writeFile('file2.md', '# File 2\nContent two');

    const file1 = createFileNode('file1.md', 'file_1');
    const file2 = createFileNode('file2.md', 'file_2');
    const promptNode = createPromptNode('Combine these files');
    const workflow = createWorkflow(
      [file1, file2, promptNode],
      [
        { id: 'e1', source: file1.id, target: promptNode.id },
        { id: 'e2', source: file2.id, target: promptNode.id },
      ]
    );

    await saveWorkflow(workflow);
    const runId = 'run_multi_files';
    await queueWorkflow(workflow.id, runId);

    await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

    // The prompt is called twice (once per file node entry path)
    // On the second call, both file outputs are in context
    expect(mockCommandExecutor.executeWorkflowPrompt).toHaveBeenCalledTimes(2);

    // The second call should have both files as attachments
    const secondCall = mockCommandExecutor.executeWorkflowPrompt.mock.calls[1]![0] as { inputContext: { attachments?: FileAttachment[] } };
    expect(secondCall.inputContext.attachments).toHaveLength(2);
    const paths = secondCall.inputContext.attachments!.map((a: FileAttachment) => a.path).sort();
    expect(paths).toEqual(['file1.md', 'file2.md']);
  });

  it('passes attachments to code nodes', async () => {
    await vault.writeFile('data.md', '# Data\nSome data here');

    const fileNode = createFileNode('data.md');
    // Code that uses attachments
    const codeNode = createCodeNode('return attachments.length');
    const workflow = createWorkflow(
      [fileNode, codeNode],
      [{ id: 'e1', source: fileNode.id, target: codeNode.id }]
    );

    await saveWorkflow(workflow);
    const runId = 'run_code_attach';
    await queueWorkflow(workflow.id, runId);

    await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

    // Check run completed and code node output is 1 (one attachment)
    const run = await readRunResult(workflow.id, runId);
    expect(run.status).toBe('completed');
    const codeResult = run.stepResults.find((r: { nodeId: string }) => r.nodeId === codeNode.id);
    expect(codeResult.output).toBe(1);
  });

  it('passes attachments to condition nodes', async () => {
    await vault.writeFile('check.md', '# Check File');

    const fileNode = createFileNode('check.md');
    // Condition checking attachments
    const conditionNode = createConditionNode('attachments.length > 0');
    const workflow = createWorkflow(
      [fileNode, conditionNode],
      [{ id: 'e1', source: fileNode.id, target: conditionNode.id }]
    );

    await saveWorkflow(workflow);
    const runId = 'run_cond_attach';
    await queueWorkflow(workflow.id, runId);

    await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

    // Check run completed and condition returned true
    const run = await readRunResult(workflow.id, runId);
    expect(run.status).toBe('completed');
    const condResult = run.stepResults.find((r: { nodeId: string }) => r.nodeId === conditionNode.id);
    expect(condResult.output).toBe(true);
  });

  it('executes workflow with file node as entry point', async () => {
    await vault.writeFile('entry.md', '# Entry Document\nInitial content');

    const fileNode = createFileNode('entry.md');
    const codeNode = createCodeNode('return attachments[0].content.includes("Entry")');
    const workflow = createWorkflow(
      [fileNode, codeNode],
      [{ id: 'e1', source: fileNode.id, target: codeNode.id }]
    );

    await saveWorkflow(workflow);
    const runId = 'run_file_entry';
    await queueWorkflow(workflow.id, runId);

    await executor.processQueueFile(`.spark/workflow-queue/${runId}.json`);

    const run = await readRunResult(workflow.id, runId);
    expect(run.status).toBe('completed');
    expect(run.stepResults).toHaveLength(2); // File node + code node
    const codeResult = run.stepResults.find((r: { nodeId: string }) => r.nodeId === codeNode.id);
    expect(codeResult.output).toBe(true);
  });
});
