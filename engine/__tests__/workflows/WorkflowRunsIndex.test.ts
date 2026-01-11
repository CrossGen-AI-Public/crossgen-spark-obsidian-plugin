import fs from 'node:fs/promises';
import path from 'node:path';
import { TestVault } from '../utils/TestVault.js';
import type { WorkflowRun } from '../../src/workflows/types.js';
import { loadRunsIndex, updateRunsIndexFromRun } from '../../src/workflows/WorkflowRunsIndex.js';

function makeRun(partial: Partial<WorkflowRun>): WorkflowRun {
  return {
    id: partial.id ?? 'run_abc',
    workflowId: partial.workflowId ?? 'wf_123',
    status: partial.status ?? 'completed',
    input: partial.input,
    output: partial.output,
    error: partial.error,
    stepResults: partial.stepResults ?? [],
    startTime: partial.startTime ?? 1_700_000_000_000,
    endTime: partial.endTime,
    totalCycles: partial.totalCycles ?? 0,
  };
}

describe('WorkflowRunsIndex', () => {
  let vault: TestVault;

  beforeEach(async () => {
    vault = new TestVault();
    await vault.create();
  });

  afterEach(async () => {
    await vault.cleanup();
  });

  it('creates a new index file when missing and updates it from a run', async () => {
    const indexPath = path.join(vault.root, '.spark', 'workflow-runs', 'index.json');

    expect(await vault.fileExists('.spark/workflow-runs/index.json')).toBe(false);

    updateRunsIndexFromRun(vault.root, makeRun({ status: 'running' }));

    expect(await vault.fileExists('.spark/workflow-runs/index.json')).toBe(true);

    const raw = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(raw) as ReturnType<typeof loadRunsIndex>;

    expect(parsed.version).toBe(1);
    const entry = parsed.workflows.wf_123;
    if (!entry) throw new Error('Expected index entry for workflow wf_123');
    expect(entry.lastRunId).toBe('run_abc');
    expect(entry.status).toBe('running');
    expect(typeof parsed.updatedAt).toBe('number');
  });

  it('updates the same run id over time (running -> completed)', async () => {
    const runId = 'run_same';
    updateRunsIndexFromRun(vault.root, makeRun({ id: runId, status: 'running', startTime: 100 }));
    updateRunsIndexFromRun(
      vault.root,
      makeRun({ id: runId, status: 'completed', startTime: 100, endTime: 200 })
    );

    const idx = loadRunsIndex(vault.root);
    const entry = idx.workflows.wf_123;
    if (!entry) throw new Error('Expected index entry for workflow wf_123');
    expect(entry.lastRunId).toBe(runId);
    expect(entry.status).toBe('completed');
    expect(entry.endTime).toBe(200);
  });

  it('does not let an older run overwrite a newer last run', async () => {
    updateRunsIndexFromRun(vault.root, makeRun({ id: 'run_new', startTime: 200, status: 'completed' }));
    updateRunsIndexFromRun(vault.root, makeRun({ id: 'run_old', startTime: 100, status: 'failed' }));

    const idx = loadRunsIndex(vault.root);
    const entry = idx.workflows.wf_123;
    if (!entry) throw new Error('Expected index entry for workflow wf_123');
    expect(entry.lastRunId).toBe('run_new');
    expect(entry.status).toBe('completed');
  });

  it('recovers from a corrupt index file by resetting', async () => {
    await vault.writeFile('.spark/workflow-runs/index.json', '{not valid json');

    const idx = loadRunsIndex(vault.root);
    expect(idx.version).toBe(1);
    expect(idx.workflows).toEqual({});

    // Still should be able to update after reset
    updateRunsIndexFromRun(vault.root, makeRun({ id: 'run_after', status: 'failed', error: 'boom' }));
    const idx2 = loadRunsIndex(vault.root);
    const entry = idx2.workflows.wf_123;
    if (!entry) throw new Error('Expected index entry for workflow wf_123');
    expect(entry.lastRunId).toBe('run_after');
    expect(entry.status).toBe('failed');
    expect(entry.error).toBe('boom');
  });
});

