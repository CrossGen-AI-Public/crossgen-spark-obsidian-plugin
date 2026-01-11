/**
 * WorkflowStorage - Handles persistence of workflows and runs
 */

import type { App } from 'obsidian';
import type {
	WorkflowDefinition,
	WorkflowGenerateRequest,
	WorkflowGenerateResult,
	WorkflowQueueItem,
	WorkflowRun,
	WorkflowRunsIndex,
} from './types';

const WORKFLOWS_DIR = '.spark/workflows';
const WORKFLOW_RUNS_DIR = '.spark/workflow-runs';
const WORKFLOW_QUEUE_DIR = '.spark/workflow-queue';
const WORKFLOW_RUNS_INDEX_PATH = '.spark/workflow-runs/index.json';
const WORKFLOW_GENERATE_QUEUE_DIR = '.spark/workflow-generate-queue';
const WORKFLOW_GENERATE_RESULTS_DIR = '.spark/workflow-generate-results';

export class WorkflowStorage {
	private readonly app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Ensure directory exists
	 */
	private async ensureDir(path: string): Promise<void> {
		const exists = await this.app.vault.adapter.exists(path);
		if (!exists) {
			await this.app.vault.adapter.mkdir(path);
		}
	}

	/**
	 * List all workflows
	 */
	async listWorkflows(): Promise<WorkflowDefinition[]> {
		await this.ensureDir(WORKFLOWS_DIR);

		// Use adapter directly for .spark/ internal files
		const exists = await this.app.vault.adapter.exists(WORKFLOWS_DIR);
		if (!exists) {
			return [];
		}

		const files = await this.app.vault.adapter.list(WORKFLOWS_DIR);
		const workflows: WorkflowDefinition[] = [];

		for (const file of files.files) {
			if (!file.endsWith('.json')) continue;

			try {
				const content = await this.app.vault.adapter.read(file);
				const workflow = JSON.parse(content) as WorkflowDefinition;
				workflows.push(workflow);
			} catch (error) {
				console.error(`Failed to load workflow ${file}:`, error);
			}
		}

		return workflows.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
	}

	/**
	 * Load a specific workflow
	 */
	async loadWorkflow(id: string): Promise<WorkflowDefinition | null> {
		const path = `${WORKFLOWS_DIR}/${id}.json`;
		console.debug('[WorkflowStorage] Loading workflow:', id, 'from', path);

		try {
			// Use adapter directly for .spark/ internal files
			const exists = await this.app.vault.adapter.exists(path);
			if (!exists) {
				console.debug('[WorkflowStorage] File not found');
				return null;
			}

			const content = await this.app.vault.adapter.read(path);
			console.debug('[WorkflowStorage] Load complete, content length:', content.length);
			return JSON.parse(content) as WorkflowDefinition;
		} catch (error) {
			console.error(`Failed to load workflow ${id}:`, error);
			return null;
		}
	}

	/**
	 * Save a workflow
	 */
	async saveWorkflow(workflow: WorkflowDefinition): Promise<void> {
		await this.ensureDir(WORKFLOWS_DIR);

		const path = `${WORKFLOWS_DIR}/${workflow.id}.json`;
		const content = JSON.stringify(workflow, null, 2);

		console.debug('[WorkflowStorage] Saving workflow:', workflow.id, 'to', path);

		// Use adapter directly for .spark/ internal files
		await this.app.vault.adapter.write(path, content);
		console.debug('[WorkflowStorage] Save complete');
	}

	/**
	 * Delete a workflow
	 */
	async deleteWorkflow(id: string): Promise<void> {
		const path = `${WORKFLOWS_DIR}/${id}.json`;

		// Use adapter directly for .spark/ internal files
		const exists = await this.app.vault.adapter.exists(path);
		if (exists) {
			await this.app.vault.adapter.remove(path);
		}

		// Also delete run history
		await this.deleteRuns(id);
	}

	/**
	 * Load runs for a workflow
	 */
	async loadRuns(workflowId: string): Promise<WorkflowRun[]> {
		const runsDir = `${WORKFLOW_RUNS_DIR}/${workflowId}`;
		await this.ensureDir(WORKFLOW_RUNS_DIR);

		// Use adapter directly for .spark/ internal files
		const exists = await this.app.vault.adapter.exists(runsDir);
		if (!exists) {
			return [];
		}

		const files = await this.app.vault.adapter.list(runsDir);
		const runs: WorkflowRun[] = [];

		for (const file of files.files) {
			if (!file.endsWith('.json')) continue;

			try {
				const content = await this.app.vault.adapter.read(file);
				const run = JSON.parse(content) as WorkflowRun;
				runs.push(run);
			} catch (error) {
				console.error(`Failed to load run ${file}:`, error);
			}
		}

		const sorted = [...runs].sort((a, b) => b.startTime - a.startTime);

		return sorted;
	}

	/**
	 * Load engine-maintained workflow runs index (last-run summary per workflow).
	 */
	async loadRunsIndex(): Promise<WorkflowRunsIndex | null> {
		// Use adapter directly for .spark/ internal files
		const exists = await this.app.vault.adapter.exists(WORKFLOW_RUNS_INDEX_PATH);
		if (!exists) return null;

		try {
			const content = await this.app.vault.adapter.read(WORKFLOW_RUNS_INDEX_PATH);
			return JSON.parse(content) as WorkflowRunsIndex;
		} catch (error) {
			console.error('Failed to load workflow runs index:', error);
			return null;
		}
	}

	/**
	 * Save a workflow run
	 */
	async saveRun(run: WorkflowRun): Promise<void> {
		const runsDir = `${WORKFLOW_RUNS_DIR}/${run.workflowId}`;
		await this.ensureDir(WORKFLOW_RUNS_DIR);
		await this.ensureDir(runsDir);

		const path = `${runsDir}/${run.id}.json`;
		const content = JSON.stringify(run, null, 2);

		// Use adapter directly for .spark/ internal files
		await this.app.vault.adapter.write(path, content);
	}

	/**
	 * Delete a single run for a workflow
	 */
	async deleteRun(workflowId: string, runId: string): Promise<void> {
		const path = `${WORKFLOW_RUNS_DIR}/${workflowId}/${runId}.json`;

		// Use adapter directly for .spark/ internal files
		const exists = await this.app.vault.adapter.exists(path);
		if (exists) {
			await this.app.vault.adapter.remove(path);
		}

		// Keep the engine-maintained index consistent when runs are deleted from the UI.
		// If the deleted run was the indexed last run, recompute the new last run from remaining runs.
		const index = await this.loadRunsIndex();
		if (!index) return;

		const existing = index.workflows?.[workflowId];
		if (!existing) return;
		if (existing.lastRunId !== runId) return;

		const remainingRuns = await this.loadRuns(workflowId);
		if (remainingRuns.length === 0) {
			delete index.workflows[workflowId];
		} else {
			const last = remainingRuns[0];
			const lastStatus = last.status === 'idle' ? 'completed' : last.status;
			index.workflows[workflowId] = {
				lastRunId: last.id,
				status: lastStatus,
				startTime: last.startTime,
				endTime: last.endTime,
				error: last.error,
			};
		}

		index.updatedAt = Date.now();
		await this.app.vault.adapter.write(WORKFLOW_RUNS_INDEX_PATH, JSON.stringify(index, null, 2));
	}

	/**
	 * Delete all runs for a workflow
	 */
	async deleteRuns(workflowId: string): Promise<void> {
		const runsDir = `${WORKFLOW_RUNS_DIR}/${workflowId}`;

		// Use adapter directly for .spark/ internal files
		const exists = await this.app.vault.adapter.exists(runsDir);
		if (!exists) {
			return;
		}

		const files = await this.app.vault.adapter.list(runsDir);

		// Delete all files in the directory
		for (const file of files.files) {
			await this.app.vault.adapter.remove(file);
		}

		// Delete the directory itself
		await this.app.vault.adapter.rmdir(runsDir, false);
	}

	/**
	 * Queue a workflow for execution
	 */
	async queueWorkflow(workflowId: string, runId: string, input?: unknown): Promise<void> {
		await this.ensureDir(WORKFLOW_QUEUE_DIR);

		const queueItem: WorkflowQueueItem = {
			workflowId,
			runId,
			status: 'pending',
			input,
			timestamp: Date.now(),
		};

		const path = `${WORKFLOW_QUEUE_DIR}/${runId}.json`;
		const content = JSON.stringify(queueItem, null, 2);

		// Use adapter directly for .spark/ internal files
		await this.app.vault.adapter.write(path, content);
	}

	/**
	 * Remove item from queue
	 */
	async dequeueWorkflow(runId: string): Promise<void> {
		const path = `${WORKFLOW_QUEUE_DIR}/${runId}.json`;

		// Use adapter directly for .spark/ internal files
		const exists = await this.app.vault.adapter.exists(path);
		if (exists) {
			await this.app.vault.adapter.remove(path);
		}
	}

	/**
	 * Queue a workflow generation request
	 */
	async queueWorkflowGeneration(request: WorkflowGenerateRequest): Promise<void> {
		await this.ensureDir(WORKFLOW_GENERATE_QUEUE_DIR);
		const path = `${WORKFLOW_GENERATE_QUEUE_DIR}/${request.requestId}.json`;
		await this.app.vault.adapter.write(path, JSON.stringify(request, null, 2));
	}

	/**
	 * Load a workflow generation result if present; returns null if missing/unreadable.
	 */
	async loadWorkflowGenerationResult(requestId: string): Promise<WorkflowGenerateResult | null> {
		const path = `${WORKFLOW_GENERATE_RESULTS_DIR}/${requestId}.json`;
		const exists = await this.app.vault.adapter.exists(path);
		if (!exists) return null;
		try {
			const raw = await this.app.vault.adapter.read(path);
			return JSON.parse(raw) as WorkflowGenerateResult;
		} catch {
			return null;
		}
	}
}
