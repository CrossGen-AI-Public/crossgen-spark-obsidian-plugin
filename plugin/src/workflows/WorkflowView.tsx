/**
 * WorkflowView - Obsidian ItemView that hosts the React workflow canvas
 */

import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import type { ISparkPlugin } from '../types';
import { WorkflowCanvas } from './WorkflowCanvas';
import type { WorkflowDefinition } from './types';
import { WorkflowStorage } from './WorkflowStorage';
import { WorkflowManager } from './WorkflowManager';

export const WORKFLOW_VIEW_TYPE = 'spark-workflow-view';

interface WorkflowViewState extends Record<string, unknown> {
	workflowId: string | null;
}

export class WorkflowView extends ItemView {
	private root?: Root;
	private plugin: ISparkPlugin;
	private workflowId: string | null = null;
	private workflow: WorkflowDefinition | null = null;
	private storage: WorkflowStorage;

	constructor(leaf: WorkspaceLeaf, plugin: ISparkPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.storage = new WorkflowStorage(this.app);
	}

	getViewType(): string {
		return WORKFLOW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.workflow?.name || 'Workflow';
	}

	getIcon(): string {
		return 'workflow';
	}

	/**
	 * Get state for persistence (called by Obsidian on save layout)
	 */
	getState(): WorkflowViewState {
		return { workflowId: this.workflowId };
	}

	/**
	 * Restore state on view open (called by Obsidian)
	 */
	async setState(state: WorkflowViewState, result: { history: boolean }): Promise<void> {
		if (state?.workflowId) {
			this.workflowId = state.workflowId;
			// Load workflow from storage
			const workflow = await this.storage.loadWorkflow(state.workflowId);
			if (workflow) {
				this.workflow = workflow;
				this.renderCanvas();
				// Trigger layout save to refresh tab title from getDisplayText()
				this.app.workspace.requestSaveLayout();
			}
		}
	}

	onOpen(): Promise<void> {
		// Hide Obsidian's view header - we have our own header in the React canvas
		const viewHeader = this.containerEl.children[0];
		if (viewHeader) {
			viewHeader.addClass('spark-hidden');
		}

		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('spark-workflow-container');

		this.root = createRoot(container as HTMLElement);
		this.renderCanvas();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.root?.unmount();
		this.root = undefined;
		return Promise.resolve();
	}

	/**
	 * Set the workflow to display
	 */
	setWorkflow(workflow: WorkflowDefinition): void {
		this.workflowId = workflow.id;
		this.workflow = workflow;
		this.renderCanvas();
		// Trigger layout save to refresh tab title from getDisplayText()
		this.app.workspace.requestSaveLayout();
	}

	/**
	 * Get current workflow
	 */
	getWorkflow(): WorkflowDefinition | null {
		return this.workflow;
	}

	/**
	 * Render or re-render the React canvas
	 */
	private renderCanvas(): void {
		if (!this.root) return;

		// Use workflowId as key to force remount when workflow changes
		// This ensures React reinitializes state when loading a different workflow
		this.root.render(
			<WorkflowCanvas
				key={this.workflowId || 'new'}
				app={this.app}
				plugin={this.plugin}
				workflow={this.workflow}
				onWorkflowChange={(workflow) => {
					this.workflow = workflow;
					this.workflowId = workflow.id;
					// Trigger layout save to refresh tab title from getDisplayText()
					this.app.workspace.requestSaveLayout();
				}}
				onNavigateToList={() => {
					void WorkflowManager.getInstance(this.app, this.plugin).showWorkflowList();
				}}
			/>
		);
	}
}


