/**
 * WorkflowRunsIndex - small, engine-maintained summary of last run per workflow.
 *
 * Stored at: .spark/workflow-runs/index.json
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { WorkflowRun, WorkflowStatus } from './types.js';

const WORKFLOW_RUNS_DIR = '.spark/workflow-runs';
const RUNS_INDEX_FILENAME = 'index.json';
const RUNS_INDEX_TMP_FILENAME = 'index.json.tmp';

export interface WorkflowLastRunSummary {
  lastRunId: string;
  status: Exclude<WorkflowStatus, 'idle'>;
  startTime: number;
  endTime?: number;
  error?: string;
}

export interface WorkflowRunsIndex {
  version: 1;
  updatedAt: number;
  workflows: Record<string, WorkflowLastRunSummary>;
}

function defaultIndex(): WorkflowRunsIndex {
  return { version: 1, updatedAt: Date.now(), workflows: {} };
}

function indexPath(vaultPath: string): string {
  return join(vaultPath, WORKFLOW_RUNS_DIR, RUNS_INDEX_FILENAME);
}

function tmpIndexPath(vaultPath: string): string {
  return join(vaultPath, WORKFLOW_RUNS_DIR, RUNS_INDEX_TMP_FILENAME);
}

export function loadRunsIndex(vaultPath: string): WorkflowRunsIndex {
  const path = indexPath(vaultPath);
  if (!existsSync(path)) {
    return defaultIndex();
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as WorkflowRunsIndex;
    if (
      parsed?.version !== 1 ||
      typeof parsed.updatedAt !== 'number' ||
      typeof parsed.workflows !== 'object'
    ) {
      return defaultIndex();
    }
    return parsed;
  } catch {
    // Corrupt or partially-written file; prefer reset to keep engine running.
    return defaultIndex();
  }
}

function safeReplaceFile(tmpPath: string, finalPath: string): void {
  try {
    renameSync(tmpPath, finalPath);
  } catch (error) {
    // On some platforms, rename may fail if destination exists or is locked.
    try {
      if (existsSync(finalPath)) {
        unlinkSync(finalPath);
      }
      renameSync(tmpPath, finalPath);
    } catch {
      // Re-throw original error for debugging.
      throw error;
    }
  }
}

export function writeRunsIndexAtomic(vaultPath: string, index: WorkflowRunsIndex): void {
  const runsDir = join(vaultPath, WORKFLOW_RUNS_DIR);
  if (!existsSync(runsDir)) {
    mkdirSync(runsDir, { recursive: true });
  }

  const tmpPath = tmpIndexPath(vaultPath);
  const finalPath = indexPath(vaultPath);
  writeFileSync(tmpPath, JSON.stringify(index, null, 2));
  safeReplaceFile(tmpPath, finalPath);
}

export function updateRunsIndexFromRun(vaultPath: string, run: WorkflowRun): void {
  // Index only meaningful statuses; ignore idle (should never appear in WorkflowRun anyway).
  if (run.status === 'idle') return;

  const index = loadRunsIndex(vaultPath);
  const existing = index.workflows[run.workflowId];

  // Only update if:
  // - no entry yet
  // - this is the same run (status changes over time)
  // - this run is newer than the stored last run (startTime as tie-breaker)
  const shouldUpdate =
    !existing ||
    existing.lastRunId === run.id ||
    (typeof existing.startTime === 'number' && run.startTime >= existing.startTime);

  if (!shouldUpdate) return;

  index.workflows[run.workflowId] = {
    lastRunId: run.id,
    status: run.status,
    startTime: run.startTime,
    endTime: run.endTime,
    error: run.error,
  };
  index.updatedAt = Date.now();

  writeRunsIndexAtomic(vaultPath, index);
}
