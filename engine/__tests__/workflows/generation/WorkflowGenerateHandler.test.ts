import fs from 'node:fs/promises';
import path from 'node:path';
import { jest } from '@jest/globals';
import type { AIProviderFactory } from '../../../src/providers/AIProviderFactory.js';
import type { AIConfig } from '../../../src/types/config.js';
import type { Logger } from '../../../src/logger/Logger.js';
import { ProviderType } from '../../../src/types/provider.js';
import { WorkflowGenerateHandler } from '../../../src/workflows/generation/WorkflowGenerateHandler.js';
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

describe('WorkflowGenerateHandler', () => {
  let vault: TestVault;

  beforeEach(async () => {
    vault = new TestVault();
    await vault.create();
  });

  afterEach(async () => {
    await vault.cleanup();
  });

  it('writes workflow + result on completed generation and deletes queue file', async () => {
    const provider = {
      complete: jest.fn(async (_opts: { prompt: string }) => ({
        content: JSON.stringify({
          id: 'wf_generated',
          name: 'Generated',
          version: 1,
          nodes: [
            {
              id: 'p1',
              type: 'prompt',
              position: { x: 0, y: 0 },
              data: { type: 'prompt', label: 'Step', prompt: 'Hello' },
            },
          ],
          edges: [],
          settings: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        }),
      })),
    };

    const providerFactory = {
      createFromConfig: jest.fn().mockReturnValue(provider),
    } as unknown as AIProviderFactory;

    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    const handler = new WorkflowGenerateHandler(vault.root, logger, providerFactory, makeAIConfig());

    const requestId = 'req_1';
    const queueRel = `.spark/workflow-generate-queue/${requestId}.json`;
    await vault.writeFile(
      queueRel,
      JSON.stringify({
        requestId,
        timestamp: Date.now(),
        source: 'workflow-ui',
        target: 'new-workflow',
        prompt: 'Make a workflow',
        allowCode: true,
      })
    );

    await handler.processQueueFile(queueRel);

    expect(await vault.fileExists(queueRel)).toBe(false);
    expect(await vault.fileExists('.spark/workflow-generate-results/req_1.json')).toBe(true);
    expect(await vault.fileExists('.spark/workflows/wf_generated.json')).toBe(true);

    const resultRaw = await vault.readFile('.spark/workflow-generate-results/req_1.json');
    const result = JSON.parse(resultRaw) as { status: string; workflowId?: string };
    expect(result.status).toBe('completed');
    expect(result.workflowId).toBe('wf_generated');
  });

  it('writes needs_clarification result and does not write a workflow file', async () => {
    const provider = {
      complete: jest.fn(async (_opts: { prompt: string }) => ({
        content: JSON.stringify({
          status: 'needs_clarification',
          questions: ['What should the workflow do?'],
        }),
      })),
    };

    const providerFactory = {
      createFromConfig: jest.fn().mockReturnValue(provider),
    } as unknown as AIProviderFactory;

    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    const handler = new WorkflowGenerateHandler(vault.root, logger, providerFactory, makeAIConfig());

    const requestId = 'req_2';
    const queueRel = `.spark/workflow-generate-queue/${requestId}.json`;
    await vault.writeFile(
      queueRel,
      JSON.stringify({
        requestId,
        timestamp: Date.now(),
        source: 'workflow-ui',
        target: 'new-workflow',
        prompt: 'Generate something',
        allowCode: true,
      })
    );

    await handler.processQueueFile(queueRel);

    expect(await vault.fileExists(queueRel)).toBe(false);
    expect(await vault.fileExists('.spark/workflow-generate-results/req_2.json')).toBe(true);
    expect(await vault.fileExists('.spark/workflows/wf_generated.json')).toBe(false);

    const resultRaw = await vault.readFile('.spark/workflow-generate-results/req_2.json');
    const result = JSON.parse(resultRaw) as { status: string; questions?: string[] };
    expect(result.status).toBe('needs_clarification');
    expect(result.questions?.length).toBeGreaterThan(0);
  });

  it('repairs invalid workflow JSON via validation errors', async () => {
    const provider = {
      complete: jest.fn(async (_opts: { prompt: string }) => ({ content: '{}' })),
    };
    provider.complete
      .mockImplementationOnce(async () => ({
        content: JSON.stringify({
          id: 'wf_bad',
          name: 'Bad',
          version: 1,
          nodes: [
            {
              id: 'p1',
              type: 'prompt',
              position: { x: 0, y: 0 },
              data: { type: 'prompt', label: 'Step' /* missing prompt */ },
            },
          ],
          edges: [],
          settings: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        }),
      }))
      .mockImplementationOnce(async () => ({
        content: JSON.stringify({
          id: 'wf_fixed',
          name: 'Fixed',
          version: 1,
          nodes: [
            {
              id: 'p1',
              type: 'prompt',
              position: { x: 0, y: 0 },
              data: { type: 'prompt', label: 'Step', prompt: 'Hello' },
            },
          ],
          edges: [],
          settings: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        }),
      }));

    const providerFactory = {
      createFromConfig: jest.fn().mockReturnValue(provider),
    } as unknown as AIProviderFactory;

    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    const handler = new WorkflowGenerateHandler(vault.root, logger, providerFactory, makeAIConfig());

    const requestId = 'req_3';
    const queueRel = `.spark/workflow-generate-queue/${requestId}.json`;
    await vault.writeFile(
      queueRel,
      JSON.stringify({
        requestId,
        timestamp: Date.now(),
        source: 'workflow-ui',
        target: 'new-workflow',
        prompt: 'Make a workflow',
        allowCode: true,
      })
    );

    await handler.processQueueFile(queueRel);

    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(await vault.fileExists('.spark/workflows/wf_fixed.json')).toBe(true);
  });

  it('scanQueue processes all pending requests', async () => {
    const provider = {
      complete: jest.fn(async (_opts: { prompt: string }) => ({
        content: JSON.stringify({
          id: 'wf_scan',
          name: 'Scan',
          version: 1,
          nodes: [
            {
              id: 'p1',
              type: 'prompt',
              position: { x: 0, y: 0 },
              data: { type: 'prompt', label: 'Step', prompt: 'Hello' },
            },
          ],
          edges: [],
          settings: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        }),
      })),
    };

    const providerFactory = {
      createFromConfig: jest.fn().mockReturnValue(provider),
    } as unknown as AIProviderFactory;

    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    const handler = new WorkflowGenerateHandler(vault.root, logger, providerFactory, makeAIConfig());

    await vault.writeFile(
      '.spark/workflow-generate-queue/a.json',
      JSON.stringify({
        requestId: 'a',
        timestamp: Date.now(),
        source: 'workflow-ui',
        target: 'new-workflow',
        prompt: 'A',
        allowCode: true,
      })
    );
    await vault.writeFile(
      '.spark/workflow-generate-queue/b.json',
      JSON.stringify({
        requestId: 'b',
        timestamp: Date.now(),
        source: 'workflow-ui',
        target: 'new-workflow',
        prompt: 'B',
        allowCode: true,
      })
    );

    await handler.scanQueue();

    expect(await vault.fileExists('.spark/workflow-generate-queue/a.json')).toBe(false);
    expect(await vault.fileExists('.spark/workflow-generate-queue/b.json')).toBe(false);
    expect(await vault.fileExists('.spark/workflow-generate-results/a.json')).toBe(true);
    expect(await vault.fileExists('.spark/workflow-generate-results/b.json')).toBe(true);
    expect(await vault.fileExists('.spark/workflows/wf_scan.json')).toBe(true);

    // Touch results to ensure they're parseable JSON.
    const raw = await fs.readFile(path.join(vault.root, '.spark', 'workflow-generate-results', 'a.json'), 'utf-8');
    expect(JSON.parse(raw)).toBeDefined();
  });
});

