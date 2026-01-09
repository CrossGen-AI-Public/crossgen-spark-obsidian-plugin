/**
 * WorkflowManager - Manages workflow views and operations
 */

import type { App, WorkspaceLeaf } from 'obsidian';
import type { ISparkPlugin } from '../types';
import { createEmptyWorkflow, type WorkflowDefinition } from './types';
import { WORKFLOW_LIST_VIEW_TYPE } from './WorkflowListView';
import { WorkflowStorage } from './WorkflowStorage';
import { WORKFLOW_VIEW_TYPE, WorkflowView } from './WorkflowView';

export class WorkflowManager {
	private static instance: WorkflowManager;
	private app: App;
	private storage: WorkflowStorage;

	private constructor(app: App, _plugin: ISparkPlugin) {
		this.app = app;
		this.storage = new WorkflowStorage(app);
	}

	public static getInstance(app: App, plugin: ISparkPlugin): WorkflowManager {
		if (!WorkflowManager.instance) {
			WorkflowManager.instance = new WorkflowManager(app, plugin);
		}
		return WorkflowManager.instance;
	}

	/**
	 * Create a new workflow and open it
	 */
	async createWorkflow(name?: string): Promise<void> {
		const workflow = createEmptyWorkflow(name || 'Untitled Workflow');
		await this.storage.saveWorkflow(workflow);
		await this.openWorkflow(workflow.id);
	}

	/**
	 * Open an existing workflow
	 */
	async openWorkflow(workflowId: string): Promise<void> {
		const workflow = await this.storage.loadWorkflow(workflowId);
		if (!workflow) {
			console.error(`Workflow ${workflowId} not found`);
			return;
		}

		// Get or create the leaf for this specific workflow
		const leaf = await this.getOrCreateLeafForWorkflow(workflowId);

		// Set the workflow on the view (only if not already set via setState)
		if (leaf.view instanceof WorkflowView) {
			const existingWorkflow = leaf.view.getWorkflow();
			// Skip if setState already loaded this workflow
			if (existingWorkflow?.id !== workflow.id) {
				leaf.view.setWorkflow(workflow);
			}
		}

		// Reveal the leaf
		await this.app.workspace.revealLeaf(leaf);
	}

	/**
	 * List all workflows
	 */
	async listWorkflows(): Promise<WorkflowDefinition[]> {
		return this.storage.listWorkflows();
	}

	/**
	 * Delete a workflow
	 */
	async deleteWorkflow(workflowId: string): Promise<void> {
		await this.storage.deleteWorkflow(workflowId);
	}

	/**
	 * Get existing leaf for this workflow, or create a new one
	 * Only reuses a leaf if it already has this exact workflow open
	 */
	private async getOrCreateLeafForWorkflow(workflowId: string): Promise<WorkspaceLeaf> {
		const leaves = this.app.workspace.getLeavesOfType(WORKFLOW_VIEW_TYPE);

		// Find existing leaf with this exact workflow
		for (const leaf of leaves) {
			if (leaf.view instanceof WorkflowView) {
				const existingWorkflow = leaf.view.getWorkflow();
				if (existingWorkflow?.id === workflowId) {
					return leaf;
				}
			}
		}

		// Create new leaf in main area
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: WORKFLOW_VIEW_TYPE,
			active: true,
			state: { workflowId }, // Pass workflowId so setState can load workflow before getDisplayText
		});

		return leaf;
	}

	/**
	 * Open the workflow list view
	 */
	async showWorkflowList(): Promise<void> {
		// Check if list view is already open
		const existingLeaves = this.app.workspace.getLeavesOfType(WORKFLOW_LIST_VIEW_TYPE);

		if (existingLeaves.length > 0) {
			// Reveal existing leaf
			await this.app.workspace.revealLeaf(existingLeaves[0]);
			return;
		}

		// Create new leaf for list view
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: WORKFLOW_LIST_VIEW_TYPE,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
	}
}
