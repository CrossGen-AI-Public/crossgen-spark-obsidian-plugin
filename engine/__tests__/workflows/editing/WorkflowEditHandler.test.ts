import { jest } from '@jest/globals';
import type { AIProviderFactory } from '../../../src/providers/AIProviderFactory.js';
import type { AIConfig } from '../../../src/types/config.js';
import type { Logger } from '../../../src/logger/Logger.js';
import { ProviderType } from '../../../src/types/provider.js';
import { WorkflowEditHandler } from '../../../src/workflows/editing/WorkflowEditHandler.js';
import { TestVault } from '../../utils/TestVault.js';

function makeAIConfig(): AIConfig {
  return {
    defaultProvider: 'claude-client',
    providers: {
      'claude-client': {
        type: ProviderType.ANTHROPIC,
        model: 'test-model',
        maxTokens: 128,
        temperature: 0,
      },
    },
  };
}

function makeValidWorkflow() {
  return {
    id: 'wf_test',
    name: 'Test Workflow',
    version: 1,
    nodes: [
      {
        id: 'p1',
        type: 'prompt',
        position: { x: 0, y: 0 },
        data: { type: 'prompt', label: 'Step 1', prompt: 'Hello' },
      },
    ],
    edges: [],
    settings: {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

function makeEditRequest(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'req_edit_1',
    workflowId: 'wf_test',
    timestamp: Date.now(),
    source: 'workflow-chat',
    workflow: makeValidWorkflow(),
    selectedNodeId: undefined,
    recentRuns: [],
    message: 'Add a new node',
    conversationHistory: [],
    ...overrides,
  };
}

function makeMockLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

describe('WorkflowEditHandler', () => {
  let vault: TestVault;

  beforeEach(async () => {
    vault = new TestVault();
    await vault.create();
  });

  afterEach(async () => {
    await vault.cleanup();
  });

  describe('isQueueFile', () => {
    it('returns true for files in workflow-edit-queue directory', () => {
      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        {} as AIProviderFactory,
        makeAIConfig()
      );

      expect(handler.isQueueFile('.spark/workflow-edit-queue/req_1.json')).toBe(true);
      expect(handler.isQueueFile('.spark/workflow-edit-queue/abc.json')).toBe(true);
    });

    it('returns false for files outside workflow-edit-queue directory', () => {
      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        {} as AIProviderFactory,
        makeAIConfig()
      );

      expect(handler.isQueueFile('.spark/workflow-generate-queue/req_1.json')).toBe(false);
      expect(handler.isQueueFile('.spark/workflows/wf_1.json')).toBe(false);
      expect(handler.isQueueFile('notes/test.md')).toBe(false);
    });

    it('returns false for non-json files', () => {
      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        {} as AIProviderFactory,
        makeAIConfig()
      );

      expect(handler.isQueueFile('.spark/workflow-edit-queue/req_1.txt')).toBe(false);
    });
  });

  describe('processQueueFile', () => {
    it('writes completed result with response message when no workflow changes', async () => {
      const provider = {
        complete: jest.fn(async () => ({
          content: JSON.stringify({
            status: 'completed',
            responseMessage: 'The workflow has 1 node that sends a prompt.',
          }),
        })),
      };

      const providerFactory = {
        createFromConfig: jest.fn().mockReturnValue(provider),
      } as unknown as AIProviderFactory;

      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        providerFactory,
        makeAIConfig()
      );

      const request = makeEditRequest({ message: 'Explain this workflow' });
      const queueRel = `.spark/workflow-edit-queue/${request.requestId}.json`;
      await vault.writeFile(queueRel, JSON.stringify(request));

      await handler.processQueueFile(queueRel);

      // Queue file should be deleted
      expect(await vault.fileExists(queueRel)).toBe(false);

      // Result file should exist
      expect(await vault.fileExists(`.spark/workflow-edit-results/${request.requestId}.json`)).toBe(true);

      const resultRaw = await vault.readFile(`.spark/workflow-edit-results/${request.requestId}.json`);
      const result = JSON.parse(resultRaw);
      expect(result.status).toBe('completed');
      expect(result.responseMessage).toBe('The workflow has 1 node that sends a prompt.');
      expect(result.updatedWorkflow).toBeUndefined();
    });

    it('writes completed result with updated workflow when changes are made', async () => {
      const updatedWorkflow = {
        ...makeValidWorkflow(),
        nodes: [
          ...makeValidWorkflow().nodes,
          {
            id: 'p2',
            type: 'prompt',
            position: { x: 0, y: 200 },
            data: { type: 'prompt', label: 'Step 2', prompt: 'Do more' },
          },
        ],
      };

      const provider = {
        complete: jest.fn(async () => ({
          content: JSON.stringify({
            status: 'completed',
            responseMessage: 'I added a new node.',
            changesDescription: 'Added Step 2 prompt node',
            updatedWorkflow,
          }),
        })),
      };

      const providerFactory = {
        createFromConfig: jest.fn().mockReturnValue(provider),
      } as unknown as AIProviderFactory;

      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        providerFactory,
        makeAIConfig()
      );

      const request = makeEditRequest({ message: 'Add a new node' });
      const queueRel = `.spark/workflow-edit-queue/${request.requestId}.json`;
      await vault.writeFile(queueRel, JSON.stringify(request));

      await handler.processQueueFile(queueRel);

      // Queue file should be deleted
      expect(await vault.fileExists(queueRel)).toBe(false);

      // Result file should exist with updated workflow
      const resultRaw = await vault.readFile(`.spark/workflow-edit-results/${request.requestId}.json`);
      const result = JSON.parse(resultRaw);
      expect(result.status).toBe('completed');
      expect(result.responseMessage).toBe('I added a new node.');
      expect(result.updatedWorkflow).toBeDefined();
      expect(result.updatedWorkflow.nodes.length).toBe(2);

      // Workflow file should be updated
      expect(await vault.fileExists('.spark/workflows/wf_test.json')).toBe(true);
    });

    it('writes needs_clarification result when AI asks for clarification', async () => {
      const provider = {
        complete: jest.fn(async () => ({
          content: JSON.stringify({
            status: 'needs_clarification',
            questions: ['Which node should I modify?', 'What should the new prompt say?'],
          }),
        })),
      };

      const providerFactory = {
        createFromConfig: jest.fn().mockReturnValue(provider),
      } as unknown as AIProviderFactory;

      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        providerFactory,
        makeAIConfig()
      );

      const request = makeEditRequest({ message: 'Change the prompt' });
      const queueRel = `.spark/workflow-edit-queue/${request.requestId}.json`;
      await vault.writeFile(queueRel, JSON.stringify(request));

      await handler.processQueueFile(queueRel);

      // Queue file should be deleted
      expect(await vault.fileExists(queueRel)).toBe(false);

      // Result should be needs_clarification
      const resultRaw = await vault.readFile(`.spark/workflow-edit-results/${request.requestId}.json`);
      const result = JSON.parse(resultRaw);
      expect(result.status).toBe('needs_clarification');
      expect(result.questions).toHaveLength(2);
      expect(result.questions[0]).toBe('Which node should I modify?');
    });

    it('repairs invalid workflow via validation loop', async () => {
      const invalidWorkflow = {
        ...makeValidWorkflow(),
        nodes: [
          {
            id: 'p1',
            type: 'prompt',
            position: { x: 0, y: 0 },
            data: { type: 'prompt', label: 'Step 1' }, // Missing prompt field
          },
        ],
      };

      const validWorkflow = {
        ...makeValidWorkflow(),
        nodes: [
          {
            id: 'p1',
            type: 'prompt',
            position: { x: 0, y: 0 },
            data: { type: 'prompt', label: 'Step 1', prompt: 'Fixed prompt' },
          },
        ],
      };

      const provider = {
        complete: jest.fn(async () => ({ content: '{}' })),
      };

      // First call returns invalid, second call returns fixed
      provider.complete
        .mockImplementationOnce(async () => ({
          content: JSON.stringify({
            status: 'completed',
            responseMessage: 'Updated',
            updatedWorkflow: invalidWorkflow,
          }),
        }))
        .mockImplementationOnce(async () => ({
          content: JSON.stringify(validWorkflow),
        }));

      const providerFactory = {
        createFromConfig: jest.fn().mockReturnValue(provider),
      } as unknown as AIProviderFactory;

      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        providerFactory,
        makeAIConfig()
      );

      const request = makeEditRequest();
      const queueRel = `.spark/workflow-edit-queue/${request.requestId}.json`;
      await vault.writeFile(queueRel, JSON.stringify(request));

      await handler.processQueueFile(queueRel);

      // Should have called complete twice (initial + repair)
      expect(provider.complete).toHaveBeenCalledTimes(2);

      // Result should be completed with fixed workflow
      const resultRaw = await vault.readFile(`.spark/workflow-edit-results/${request.requestId}.json`);
      const result = JSON.parse(resultRaw);
      expect(result.status).toBe('completed');
    });

    it('writes failed result when AI returns invalid format', async () => {
      const provider = {
        complete: jest.fn(async () => ({
          content: JSON.stringify({ invalid: 'format' }),
        })),
      };

      const providerFactory = {
        createFromConfig: jest.fn().mockReturnValue(provider),
      } as unknown as AIProviderFactory;

      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        providerFactory,
        makeAIConfig()
      );

      const request = makeEditRequest();
      const queueRel = `.spark/workflow-edit-queue/${request.requestId}.json`;
      await vault.writeFile(queueRel, JSON.stringify(request));

      await handler.processQueueFile(queueRel);

      const resultRaw = await vault.readFile(`.spark/workflow-edit-results/${request.requestId}.json`);
      const result = JSON.parse(resultRaw);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('invalid');
    });

    it('writes failed result when AI throws error', async () => {
      const provider = {
        complete: jest.fn(async () => {
          throw new Error('API connection failed');
        }),
      };

      const providerFactory = {
        createFromConfig: jest.fn().mockReturnValue(provider),
      } as unknown as AIProviderFactory;

      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        providerFactory,
        makeAIConfig()
      );

      const request = makeEditRequest();
      const queueRel = `.spark/workflow-edit-queue/${request.requestId}.json`;
      await vault.writeFile(queueRel, JSON.stringify(request));

      await handler.processQueueFile(queueRel);

      const resultRaw = await vault.readFile(`.spark/workflow-edit-results/${request.requestId}.json`);
      const result = JSON.parse(resultRaw);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('API connection failed');
    });

    it('does not process if queue file is already being processed', async () => {
      const provider = {
        complete: jest.fn(async () => {
          // Delay to simulate slow processing
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            content: JSON.stringify({
              status: 'completed',
              responseMessage: 'Done',
            }),
          };
        }),
      };

      const providerFactory = {
        createFromConfig: jest.fn().mockReturnValue(provider),
      } as unknown as AIProviderFactory;

      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        providerFactory,
        makeAIConfig()
      );

      const request = makeEditRequest();
      const queueRel = `.spark/workflow-edit-queue/${request.requestId}.json`;
      await vault.writeFile(queueRel, JSON.stringify(request));

      // Start processing without awaiting
      const firstProcess = handler.processQueueFile(queueRel);
      // Try to process again immediately
      await handler.processQueueFile(queueRel);

      // Wait for first process to finish
      await firstProcess;

      // Should only have been called once
      expect(provider.complete).toHaveBeenCalledTimes(1);
    });
  });

  describe('scanQueue', () => {
    it('processes all pending requests in queue', async () => {
      const provider = {
        complete: jest.fn(async () => ({
          content: JSON.stringify({
            status: 'completed',
            responseMessage: 'Done',
          }),
        })),
      };

      const providerFactory = {
        createFromConfig: jest.fn().mockReturnValue(provider),
      } as unknown as AIProviderFactory;

      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        providerFactory,
        makeAIConfig()
      );

      // Create multiple requests
      await vault.writeFile(
        '.spark/workflow-edit-queue/a.json',
        JSON.stringify(makeEditRequest({ requestId: 'a' }))
      );
      await vault.writeFile(
        '.spark/workflow-edit-queue/b.json',
        JSON.stringify(makeEditRequest({ requestId: 'b' }))
      );

      await handler.scanQueue();

      // Both queue files should be deleted
      expect(await vault.fileExists('.spark/workflow-edit-queue/a.json')).toBe(false);
      expect(await vault.fileExists('.spark/workflow-edit-queue/b.json')).toBe(false);

      // Both results should exist
      expect(await vault.fileExists('.spark/workflow-edit-results/a.json')).toBe(true);
      expect(await vault.fileExists('.spark/workflow-edit-results/b.json')).toBe(true);
    });

    it('does nothing if queue directory does not exist', async () => {
      const handler = new WorkflowEditHandler(
        vault.root,
        makeMockLogger(),
        {} as AIProviderFactory,
        makeAIConfig()
      );

      // Should not throw
      await handler.scanQueue();
    });
  });
});
