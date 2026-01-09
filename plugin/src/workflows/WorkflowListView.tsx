/**
 * WorkflowListView - Obsidian view showing all workflows
 */

import { type App, ItemView, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ISparkPlugin } from '../types';
import type { WorkflowDefinition, WorkflowLastRunSummary, WorkflowRunsIndex } from './types';
import { generateId } from './types';
import { WorkflowStorage } from './WorkflowStorage';

export const WORKFLOW_LIST_VIEW_TYPE = 'spark-workflow-list-view';

interface WorkflowListProps {
	app: App;
	onOpenWorkflow: (id: string) => void;
	onCreateWorkflow: () => void;
	refreshKey?: number; // Increment to force refresh
}

function WorkflowList({ app, onOpenWorkflow, onCreateWorkflow, refreshKey }: WorkflowListProps) {
	const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
	const [runsIndex, setRunsIndex] = useState<WorkflowRunsIndex | null>(null);
	const [loading, setLoading] = useState(true);
	const storage = useMemo(() => new WorkflowStorage(app), [app]);

	const loadWorkflows = useCallback(async () => {
		setLoading(true);
		const [list, index] = await Promise.all([
			storage.listWorkflows(),
			storage.loadRunsIndex(),
		]);
		setWorkflows(list);
		setRunsIndex(index);
		setLoading(false);
	}, []);

	// Reload when refreshKey changes (triggered when view becomes visible)
	useEffect(() => {
		void loadWorkflows();
	}, [loadWorkflows, refreshKey]);

	const handleDelete = useCallback(
		async (e: React.MouseEvent, id: string, name: string) => {
			e.stopPropagation(); // Don't trigger row click
			if (confirm(`Delete workflow "${name}"? This cannot be undone.`)) {
				await storage.deleteWorkflow(id);
				await loadWorkflows();
			}
		},
		[loadWorkflows]
	);

	const formatDate = (isoString: string) => {
		const date = new Date(isoString);
		const now = new Date();
		// Compare by local calendar day boundaries (not "within last 24h"),
		// otherwise e.g. "yesterday 15:36" can show as "Today" at 01:58.
		const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
		const diffDays = Math.floor((startOfDay(now) - startOfDay(date)) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return `Today at ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
		} else if (diffDays === 1) {
			return `Yesterday at ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
		} else if (diffDays < 7) {
			return `${diffDays} days ago`;
		}
		// Month name should not vary by OS locale (keep time local elsewhere).
		const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
		return `${EN_MONTHS[date.getMonth()]} ${date.getDate()}${date.getFullYear() !== now.getFullYear() ? `, ${date.getFullYear()}` : ''}`;
	};

	const formatRunTime = (ts: number) => {
		const date = new Date(ts);
		const now = new Date();
		const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
		const diffDays = Math.floor((startOfDay(now) - startOfDay(date)) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
		} else if (diffDays === 1) {
			return `Yesterday ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
		} else if (diffDays < 7) {
			return `${diffDays} days ago`;
		}
		const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
		return `${EN_MONTHS[date.getMonth()]} ${date.getDate()}${date.getFullYear() !== now.getFullYear() ? `, ${date.getFullYear()}` : ''}`;
	};

	const statusIcon = (status: WorkflowLastRunSummary['status']) => {
		switch (status) {
			case 'completed':
				return '✓';
			case 'failed':
				return '✗';
			case 'running':
				return '⏳';
			case 'cancelled':
				return '⦸';
			default:
				return '○';
		}
	};

	const handleRun = useCallback(
		async (e: React.MouseEvent, workflowId: string) => {
			e.stopPropagation();
			const runId = generateId('run');
			await storage.queueWorkflow(workflowId, runId);

			// Optimistically show a running last-run pill immediately.
			setRunsIndex((prev) => {
				const base: WorkflowRunsIndex = prev ?? { version: 1, updatedAt: Date.now(), workflows: {} };
				return {
					...base,
					updatedAt: Date.now(),
					workflows: {
						...base.workflows,
						[workflowId]: {
							lastRunId: runId,
							status: 'running',
							startTime: Date.now(),
						},
					},
				};
			});

			// Then refresh from disk a few times to pick up engine-written index updates.
			for (const delayMs of [250, 750, 1500]) {
				globalThis.setTimeout(async () => {
					const index = await storage.loadRunsIndex();
					if (index) setRunsIndex(index);
				}, delayMs);
			}
		},
		[storage]
	);

	// While something is running, poll the on-disk index so the list updates without manual refresh.
	useEffect(() => {
		if (!runsIndex) return;
		const anyRunning = Object.values(runsIndex.workflows || {}).some((w) => w.status === 'running');
		if (!anyRunning) return;

		const interval = globalThis.setInterval(async () => {
			const index = await storage.loadRunsIndex();
			if (index) setRunsIndex(index);
		}, 1000);

		return () => globalThis.clearInterval(interval);
	}, [runsIndex, storage]);

	if (loading) {
		return (
			<div className="spark-workflow-list-container">
				<div className="spark-workflow-list-loading">Loading workflows...</div>
			</div>
		);
	}

	return (
		<div className="spark-workflow-list-container">
			<div className="spark-workflow-list-header">
				<h2>Workflows</h2>
				<button
					type="button"
					className="clickable-icon"
					onClick={onCreateWorkflow}
					aria-label="Create new workflow"
					title="Create new workflow"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M12 5v14" />
						<path d="M5 12h14" />
					</svg>
				</button>
			</div>

			{workflows.length === 0 ? (
				<div className="spark-workflow-list-empty">
					<div className="spark-workflow-list-empty-icon">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="48"
							height="48"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect x="3" y="3" width="18" height="18" rx="2" />
							<path d="M12 8v8" />
							<path d="M8 12h8" />
						</svg>
					</div>
					<h3>No workflows yet</h3>
					<p>Create your first workflow to automate tasks with AI.</p>
					<button type="button" className="mod-cta" onClick={onCreateWorkflow}>
						Create Workflow
					</button>
				</div>
			) : (
				<div className="spark-workflow-list">
					{workflows.map((workflow) => (
						(() => {
							const last = runsIndex?.workflows?.[workflow.id];
							return (
						<div
							key={workflow.id}
							className="spark-workflow-list-item"
							onClick={() => onOpenWorkflow(workflow.id)}
							onKeyDown={(e) => e.key === 'Enter' && onOpenWorkflow(workflow.id)}
							role="button"
							tabIndex={0}
						>
							<div className="spark-workflow-list-item-icon">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<circle cx="5" cy="6" r="3" />
									<path d="M5 9v6" />
									<circle cx="5" cy="18" r="3" />
									<path d="M12 3v18" />
									<circle cx="19" cy="6" r="3" />
									<path d="M16 15.7A9 9 0 0 0 19 9" />
								</svg>
							</div>
							<div className="spark-workflow-list-item-content">
								<div className="spark-workflow-list-item-title">{workflow.name}</div>
								<div className="spark-workflow-list-item-meta">
									<span>
										{workflow.nodes.length} step{workflow.nodes.length !== 1 ? 's' : ''}
									</span>
									<span>·</span>
									<span>{formatDate(workflow.updated)}</span>
									<span>·</span>
									{last ? (
										<span className={`spark-workflow-last-run spark-workflow-last-run-${last.status}`}>
											<span className="spark-workflow-last-run-icon">{statusIcon(last.status)}</span>
											<span className="spark-workflow-last-run-time">{formatRunTime(last.startTime)}</span>
										</span>
									) : (
										<span className="spark-workflow-last-run spark-workflow-last-run-none">No runs</span>
									)}
								</div>
							</div>
							<button
								type="button"
								className="spark-workflow-list-item-run clickable-icon"
								onClick={(e) => handleRun(e, workflow.id)}
								aria-label="Run workflow"
								title="Run workflow"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<polygon points="6 3 20 12 6 21 6 3" />
								</svg>
							</button>
							<button
								type="button"
								className="spark-workflow-list-item-delete clickable-icon"
								onClick={(e) => handleDelete(e, workflow.id, workflow.name)}
								aria-label="Delete workflow"
								title="Delete workflow"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M3 6h18" />
									<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
									<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
									<line x1="10" y1="11" x2="10" y2="17" />
									<line x1="14" y1="11" x2="14" y2="17" />
								</svg>
							</button>
						</div>
							);
						})()
					))}
				</div>
			)}
		</div>
	);
}

export class WorkflowListView extends ItemView {
	private root: Root | null = null;
	private plugin: ISparkPlugin;
	private refreshKey = 0;

	constructor(leaf: WorkspaceLeaf, plugin: ISparkPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return WORKFLOW_LIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Workflows';
	}

	getIcon(): string {
		return 'workflow';
	}

	async onOpen(): Promise<void> {
		// Hide view header (we don't need it for the list view)
		const viewHeader = this.containerEl.children[0] as HTMLElement;
		if (viewHeader) {
			viewHeader.style.display = 'none';
		}

		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('spark-workflow-list-view');

		this.root = createRoot(container as HTMLElement);
		this.renderList();

		// Refresh list when this leaf becomes active
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf === this.leaf) {
					this.refresh();
				}
			})
		);
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
	}

	/**
	 * Refresh the workflow list
	 */
	refresh(): void {
		this.refreshKey++;
		this.renderList();
	}

	private renderList(): void {
		if (!this.root) return;

		this.root.render(
			<WorkflowList
				app={this.app}
				onOpenWorkflow={(id) => this.openWorkflow(id)}
				onCreateWorkflow={() => this.createWorkflow()}
				refreshKey={this.refreshKey}
			/>
		);
	}

	private async openWorkflow(id: string): Promise<void> {
		const { WorkflowManager } = await import('./WorkflowManager');
		const manager = WorkflowManager.getInstance(this.app, this.plugin);
		await manager.openWorkflow(id);
	}

	private async createWorkflow(): Promise<void> {
		const { WorkflowManager } = await import('./WorkflowManager');
		const manager = WorkflowManager.getInstance(this.app, this.plugin);
		await manager.createWorkflow();
	}
}
