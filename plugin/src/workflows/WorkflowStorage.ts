/**
 * WorkflowStorage - Handles persistence of workflows and runs
 */

import type { App } from 'obsidian';
import type { WorkflowDefinition, WorkflowQueueItem, WorkflowRun } from './types';

const WORKFLOWS_DIR = '.spark/workflows';
const WORKFLOW_RUNS_DIR = '.spark/workflow-runs';
const WORKFLOW_QUEUE_DIR = '.spark/workflow-queue';

export class WorkflowStorage {
	private app: App;

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

		const sorted = runs.sort((a, b) => b.startTime - a.startTime);

		return sorted;
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
}
