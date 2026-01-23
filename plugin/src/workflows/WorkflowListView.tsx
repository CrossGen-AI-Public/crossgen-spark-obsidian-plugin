/**
 * WorkflowListView - Obsidian view showing all workflows
 */

import { type App, ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ISparkPlugin } from '../types';
import { showConfirmModal } from '../utils/confirmModal';
import type {
	WorkflowDefinition,
	WorkflowGenerateRequest,
	WorkflowGenerateResult,
	WorkflowLastRunSummary,
	WorkflowRunsIndex,
} from './types';
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

	const [isGenerateOpen, setIsGenerateOpen] = useState(false);
	const [generatePrompt, setGeneratePrompt] = useState('');
	const [isGenerating, setIsGenerating] = useState(false);
	const [generationProgress, setGenerationProgress] = useState<WorkflowGenerateResult | null>(null);
	const [generateError, setGenerateError] = useState<string | null>(null);
	const [clarificationQuestions, setClarificationQuestions] = useState<string[] | null>(null);
	const [clarificationAnswers, setClarificationAnswers] = useState('');
	const threadIdRef = useRef<string | null>(null);
	const attemptRef = useRef<number>(1);
	const pollAbortRef = useRef<{ aborted: boolean } | null>(null);

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
			const confirmed = await showConfirmModal(app, `Delete workflow "${name}"? This cannot be undone.`, {
				title: 'Delete workflow',
				confirmText: 'Delete',
				dangerous: true,
			});
			if (confirmed) {
				await storage.deleteWorkflow(id);
				await loadWorkflows();
			}
		},
		[app, loadWorkflows]
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
				globalThis.setTimeout(() => {
					void (async () => {
						const index = await storage.loadRunsIndex();
						if (index) setRunsIndex(index);
					})();
				}, delayMs);
			}
		},
		[storage]
	);

	const pollForGenerationResult = useCallback(
		async (requestId: string, abortSignal: { aborted: boolean }) => {
			// Overall timeout, but extend while we keep receiving progress updates.
			const baseTimeoutMs = 60_000;
			const maxTimeoutMs = 3 * 60_000;
			let deadline = Date.now() + baseTimeoutMs;
			const intervalMs = 500;
			let lastProgressAt: number | null = null;

			while (!abortSignal.aborted) {
				if (Date.now() > deadline) {
					throw new Error('Timed out waiting for engine to generate workflow.');
				}

				const parsed = await storage.loadWorkflowGenerationResult(requestId);
				if (parsed) {
					if (parsed.status === 'processing') {
						setGenerationProgress(parsed);
						// If progress is advancing, keep extending the deadline up to maxTimeoutMs.
						if (parsed.updatedAt && parsed.updatedAt !== lastProgressAt) {
							lastProgressAt = parsed.updatedAt;
							const now = Date.now();
							deadline = Math.min(now + baseTimeoutMs, now + maxTimeoutMs);
						}
					} else {
						return parsed;
					}
				}

				await new Promise((resolve) => globalThis.setTimeout(resolve, intervalMs));
			}

			throw new Error('Generation cancelled.');
		},
		[storage]
	);

	const cancelGeneration = useCallback(() => {
		if (pollAbortRef.current) pollAbortRef.current.aborted = true;
		setIsGenerating(false);
		setGenerationProgress(null);
	}, []);

	const startGeneration = useCallback(
		async (prompt: string, clarifications?: string) => {
			setGenerateError(null);
			setIsGenerating(true);

			const requestId = generateId('wfgen');
			const threadId = threadIdRef.current ?? requestId;
			threadIdRef.current = threadId;

			setGenerationProgress({
				requestId,
				status: 'processing',
				stage: 'queued',
				progress: 0,
				message: 'Queueing request…',
				updatedAt: Date.now(),
			});

			const request: WorkflowGenerateRequest = {
				requestId,
				timestamp: Date.now(),
				source: 'workflow-ui',
				target: 'new-workflow',
				prompt,
				allowCode: true,
				threadId,
				attempt: attemptRef.current,
				clarifications: clarifications?.trim() ? clarifications.trim() : undefined,
			};

			// Abort any previous poll.
			if (pollAbortRef.current) pollAbortRef.current.aborted = true;
			const abortSignal = { aborted: false };
			pollAbortRef.current = abortSignal;

			try {
				await storage.queueWorkflowGeneration(request);
				const result = (await pollForGenerationResult(requestId, abortSignal)) as WorkflowGenerateResult;

				setGenerationProgress(null);
				if (result.status === 'needs_clarification') {
					setClarificationQuestions(result.questions ?? ['Please clarify your request.']);
					setIsGenerating(false);
					return;
				}

				if (result.status === 'failed') {
					setGenerateError(result.error ?? 'Workflow generation failed.');
					setIsGenerating(false);
					return;
				}

				if (result.status !== 'completed') {
					throw new Error(`Unexpected generation status: ${result.status}`);
				}

				const workflowId = result.workflowId;
				if (!workflowId) {
					setGenerateError('Workflow generation completed but returned no workflowId.');
					setIsGenerating(false);
					return;
				}

				new Notice(`Generated workflow: ${result.workflowName ?? workflowId}`);
				setIsGenerating(false);
				setIsGenerateOpen(false);
				setGeneratePrompt('');
				setClarificationQuestions(null);
				setClarificationAnswers('');
				setGenerationProgress(null);
				threadIdRef.current = null;
				attemptRef.current = 1;

				await loadWorkflows();
				onOpenWorkflow(workflowId);
			} catch (error) {
				setIsGenerating(false);
				setGenerationProgress(null);
				setGenerateError(error instanceof Error ? error.message : String(error));
			}
		},
		[loadWorkflows, onOpenWorkflow, pollForGenerationResult, storage]
	);

	const handleGenerateSubmit = useCallback(async () => {
		const prompt = generatePrompt.trim();
		if (!prompt) {
			setGenerateError('Enter a prompt to generate a workflow.');
			return;
		}
		setClarificationQuestions(null);
		attemptRef.current = 1;
		await startGeneration(prompt);
	}, [generatePrompt, startGeneration]);

	const handleClarificationSubmit = useCallback(async () => {
		if (!generatePrompt.trim()) {
			setGenerateError('Missing original prompt.');
			return;
		}
		const answers = clarificationAnswers.trim();
		if (!answers) {
			setGenerateError('Enter answers to continue.');
			return;
		}
		setGenerateError(null);
		setClarificationQuestions(null);
		attemptRef.current += 1;
		await startGeneration(generatePrompt.trim(), answers);
	}, [clarificationAnswers, generatePrompt, startGeneration]);

	useEffect(() => {
		return () => {
			if (pollAbortRef.current) pollAbortRef.current.aborted = true;
		};
	}, []);

	// While something is running, poll the on-disk index so the list updates without manual refresh.
	useEffect(() => {
		if (!runsIndex) return;
		const anyRunning = Object.values(runsIndex.workflows || {}).some((w) => w.status === 'running');
		if (!anyRunning) return;

		const interval = globalThis.setInterval(() => {
			void (async () => {
				const index = await storage.loadRunsIndex();
				if (index) setRunsIndex(index);
			})();
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
				<div className="spark-workflow-list-header-actions">
					<button
						type="button"
						className="clickable-icon"
						onClick={() => {
							setGenerateError(null);
							setClarificationQuestions(null);
							setClarificationAnswers('');
							setIsGenerateOpen((v) => !v);
						}}
						aria-label="Generate workflow"
						title="Generate workflow"
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
							<path d="M12 2v4" />
							<path d="M12 18v4" />
							<path d="M4.93 4.93l2.83 2.83" />
							<path d="M16.24 16.24l2.83 2.83" />
							<path d="M2 12h4" />
							<path d="M18 12h4" />
							<path d="M4.93 19.07l2.83-2.83" />
							<path d="M16.24 7.76l2.83-2.83" />
						</svg>
					</button>
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
			</div>

			{isGenerateOpen ? (
				<div className="spark-workflow-generate-panel">
					<div className="spark-workflow-generate-row">
						<textarea
							className="spark-workflow-generate-prompt"
							placeholder="Describe the workflow you want..."
							value={generatePrompt}
							onChange={(e) => setGeneratePrompt(e.target.value)}
							disabled={isGenerating}
							rows={3}
						/>
					</div>
					{isGenerating && generationProgress?.status === 'processing' ? (
						<div className="spark-workflow-generate-progress">
							<div className="spark-workflow-generate-progress-header">
								<svg
									className="spark-workflow-spinner spark-workflow-generate-spinner"
									viewBox="0 0 16 16"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<circle
										cx="8"
										cy="8"
										r="6"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeDasharray="28"
										strokeDashoffset="8"
									/>
								</svg>
								<div className="spark-workflow-generate-progress-text">
									{generationProgress.message ?? 'Working…'}
								</div>
							</div>
							<div className="spark-workflow-generate-progressbar" role="progressbar">
								<div
									className="spark-workflow-generate-progressbar-fill"
									style={{ width: `${Math.max(0, Math.min(100, generationProgress.progress ?? 0))}%` }}
								/>
							</div>
							<div className="spark-workflow-generate-steps">
								{(
									[
										{ key: 'queued', label: 'Queue' },
										{ key: 'generating', label: 'Generate' },
										{ key: 'validating', label: 'Validate' },
										{ key: 'repairing', label: 'Refine' },
										{ key: 'layout', label: 'Organize' },
										{ key: 'writing', label: 'Save' },
									] as const
								).map((s) => {
									const active = generationProgress.stage === s.key;
									return (
										<div
											key={s.key}
											className={`spark-workflow-generate-step ${active ? 'is-active' : ''}`}
										>
											{s.label}
										</div>
									);
								})}
							</div>
						</div>
					) : null}
					{clarificationQuestions ? (
						<div className="spark-workflow-generate-clarifications">
							<div className="spark-workflow-generate-questions">
								<div className="spark-workflow-generate-questions-title">Clarifications</div>
								<ul>
									{clarificationQuestions.map((q) => (
										<li key={q}>{q}</li>
									))}
								</ul>
							</div>
							<textarea
								className="spark-workflow-generate-answers"
								placeholder="Answer the questions above..."
								value={clarificationAnswers}
								onChange={(e) => setClarificationAnswers(e.target.value)}
								disabled={isGenerating}
								rows={3}
							/>
						</div>
					) : null}
					{generateError ? <div className="spark-workflow-generate-error">{generateError}</div> : null}
					<div className="spark-workflow-generate-actions">
						<button
							type="button"
							className="mod-cta"
							onClick={() => void (clarificationQuestions ? handleClarificationSubmit() : handleGenerateSubmit())}
							disabled={isGenerating}
						>
							{clarificationQuestions ? 'Submit answers' : isGenerating ? 'Generating…' : 'Generate'}
						</button>
						<button
							type="button"
							className="mod-muted"
							onClick={() => {
								if (isGenerating) {
									cancelGeneration();
									setGenerateError(null);
									setClarificationQuestions(null);
									setClarificationAnswers('');
									threadIdRef.current = null;
									attemptRef.current = 1;
									return;
								}

								setGenerateError(null);
								setClarificationQuestions(null);
								setClarificationAnswers('');
								threadIdRef.current = null;
								attemptRef.current = 1;
								setIsGenerateOpen(false);
							}}
						>
							{isGenerating ? 'Cancel' : 'Close'}
						</button>
					</div>
				</div>
			) : null}

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
										onClick={(e) => void handleRun(e, workflow.id)}
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
										onClick={(e) => void handleDelete(e, workflow.id, workflow.name)}
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
	private root = null as Root | null;
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

	onOpen(): Promise<void> {
		// Hide view header (we don't need it for the list view)
		const viewHeader = this.containerEl.children[0];
		if (viewHeader) {
			viewHeader.addClass('spark-hidden');
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
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
		return Promise.resolve();
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
				onOpenWorkflow={(id) => void this.openWorkflow(id)}
				onCreateWorkflow={() => void this.createWorkflow()}
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
