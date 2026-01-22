/**
 * WorkflowRunsSidebar - Workflow-level run history + run detail panel
 */

import type { App } from 'obsidian';
import { useCallback, useMemo, useState } from 'react';
import type { StepResult, WorkflowDefinition, WorkflowRun } from './types';
import { showConfirmModal } from '../utils/confirmModal';

interface WorkflowRunsSidebarProps {
	app: App;
	workflow: WorkflowDefinition;
	runs: WorkflowRun[];
	onRerun: () => Promise<void>;
	onDeleteRun: (runId: string) => Promise<void>;
	onJumpToNode: (nodeId: string) => void;
	onClose: () => void;
}

function formatTimestamp(ts: number): string {
	const startDate = new Date(ts);
	const now = new Date();
	const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const diffDays = Math.floor((startOfDay(now) - startOfDay(startDate)) / (1000 * 60 * 60 * 24));

	const timeText = startDate.toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});

	// Month name should not vary by OS locale (keep time local, date month deterministic).
	const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
	const absoluteDateText = `${EN_MONTHS[startDate.getMonth()]} ${String(startDate.getDate()).padStart(2, '0')}${startDate.getFullYear() !== now.getFullYear() ? ` ${startDate.getFullYear()}` : ''}`;

	if (diffDays === 0) return timeText;
	if (diffDays === 1) return `Yesterday ${timeText}`;
	if (diffDays < 7) return `${diffDays} days ago ${timeText}`;
	return `${timeText} ${absoluteDateText}`;
}

function statusIcon(status: WorkflowRun['status'] | StepResult['status']): string {
	switch (status) {
		case 'completed':
			return '✓';
		case 'failed':
			return '✗';
		case 'running':
			return '⏳';
		case 'cancelled':
			return '⦸';
		case 'pending':
			return '○';
		case 'skipped':
			return '↷';
		default:
			return '○';
	}
}

function statusClass(status: WorkflowRun['status'] | StepResult['status']): string {
	return `spark-workflow-run-status-${status}`;
}

function durationMs(start: number, end?: number): number {
	return end ? Math.max(0, end - start) : 0;
}

interface DataBlockProps {
	label: string;
	data: unknown;
	className?: string;
}

function DataBlock({ label, data, className = '' }: DataBlockProps) {
	const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

	return (
		<div className={`spark-workflow-run-block ${className}`}>
			<strong className="spark-workflow-run-block-label">{label}</strong>
			<pre className="spark-workflow-run-block-content">{content}</pre>
		</div>
	);
}

interface StepRowProps {
	step: StepResult;
	label: string;
	canJump: boolean;
	onJump: () => void;
}

function StepRow({ step, label, canJump, onJump }: StepRowProps) {
	const [expanded, setExpanded] = useState(false);
	const duration = durationMs(step.startTime, step.endTime);

	return (
		<div className="spark-workflow-run-item spark-workflow-run-step">
			<div className="spark-workflow-run-header" onClick={() => setExpanded(!expanded)}>
				<span className={`spark-workflow-run-status ${statusClass(step.status)}`}>{statusIcon(step.status)}</span>
				<span className="spark-workflow-run-step-label">{label}</span>
				<span className="spark-workflow-run-time">{formatTimestamp(step.startTime)}</span>
				<span className="spark-workflow-run-duration">{duration}ms</span>
				{step.cycleCount && step.cycleCount > 0 && (
					<span className="spark-workflow-run-cycles">cycle {step.cycleCount}</span>
				)}
				{canJump && (
					<button
						type="button"
						className="spark-workflow-run-jump clickable-icon"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onJump();
						}}
						aria-label="Jump to node"
						title="Jump to node"
					>
						↗
					</button>
				)}
				<span className="spark-workflow-run-expand">{expanded ? '▼' : '▶'}</span>
			</div>

			{expanded && (
				<div className="spark-workflow-run-details">
					{step.input !== undefined && (
						<DataBlock label="Input" data={step.input} className="spark-workflow-run-input" />
					)}
					{step.output !== undefined && (
						<DataBlock label="Output" data={step.output} className="spark-workflow-run-output" />
					)}
					{step.error && (
						<DataBlock label="Error" data={step.error} className="spark-workflow-run-error" />
					)}
				</div>
			)}
		</div>
	);
}

export function WorkflowRunsSidebar({
	app,
	workflow,
	runs,
	onRerun,
	onDeleteRun,
	onJumpToNode,
	onClose,
}: WorkflowRunsSidebarProps) {
	const sortedRuns = useMemo(() => {
		return [...runs].sort((a, b) => b.startTime - a.startTime);
	}, [runs]);

	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

	const selectedRun = useMemo(() => {
		if (!selectedRunId) return sortedRuns[0] ?? null;
		return sortedRuns.find((r) => r.id === selectedRunId) ?? null;
	}, [selectedRunId, sortedRuns]);

	const nodeLabelById = useMemo(() => {
		const map = new Map<string, string>();
		for (const node of workflow.nodes) {
			map.set(node.id, node.data.label || node.id);
		}
		return map;
	}, [workflow.nodes]);

	const hasRunning = useMemo(() => {
		return sortedRuns.some((r) => r.status === 'running');
	}, [sortedRuns]);

	const stepsChronological = useMemo(() => {
		if (!selectedRun) return [];
		return [...selectedRun.stepResults].sort((a, b) => a.startTime - b.startTime);
	}, [selectedRun]);

	const handleDelete = useCallback(async () => {
		if (!selectedRun) return;
		const confirmed = await showConfirmModal(app, 'Delete this run? This cannot be undone.', {
			title: 'Delete run',
			confirmText: 'Delete',
			dangerous: true,
		});
		if (!confirmed) return;
		await onDeleteRun(selectedRun.id);
		setSelectedRunId(null);
	}, [app, selectedRun, onDeleteRun]);

	if (sortedRuns.length === 0) {
		return (
			<div className="spark-workflow-sidebar">
				<div className="spark-workflow-sidebar-header">
					<h3>Runs</h3>
					<button type="button" className="spark-workflow-sidebar-close" onClick={onClose}>
						×
					</button>
				</div>
				<div className="spark-workflow-sidebar-content">
					<div className="spark-workflow-sidebar-section">
						<p className="spark-workflow-sidebar-empty">No runs yet. Execute the workflow to see results.</p>
						<div className="spark-workflow-form-group spark-workflow-form-actions">
							<button
								type="button"
								className="spark-workflow-btn spark-workflow-btn-primary"
								onClick={() => void onRerun()}
							>
								Run workflow
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="spark-workflow-sidebar">
			<div className="spark-workflow-sidebar-header">
				<h3>Runs</h3>
				<div className="spark-workflow-sidebar-header-actions">
					<button
						type="button"
						className="spark-workflow-sidebar-action clickable-icon"
						onClick={() => void onRerun()}
						disabled={hasRunning}
						aria-label="Rerun workflow"
						title={hasRunning ? 'A run is currently running' : 'Rerun workflow'}
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
							<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
							<path d="M21 3v5h-5" />
						</svg>
					</button>
					<button
						type="button"
						className="spark-workflow-sidebar-action clickable-icon"
						onClick={() => void handleDelete()}
						disabled={!selectedRun || selectedRun.status === 'running'}
						aria-label="Delete run"
						title={
							!selectedRun
								? 'Select a run to delete'
								: selectedRun.status === 'running'
									? 'Cannot delete a running run'
									: 'Delete run'
						}
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
					<button type="button" className="spark-workflow-sidebar-close" onClick={onClose} aria-label="Close">
						×
					</button>
				</div>
			</div>

			<div className="spark-workflow-sidebar-content">
				<div className="spark-workflow-sidebar-section">
					<div className="spark-workflow-runs-split">
						<div className="spark-workflow-runs-list">
							{sortedRuns.map((run) => {
								const isSelected = (selectedRun?.id ?? null) === run.id;
								const duration = durationMs(run.startTime, run.endTime);
								const statusText = statusIcon(run.status);
								const errorSnippet = run.error ? String(run.error).slice(0, 140) : '';

								return (
									<button
										key={run.id}
										type="button"
										className={`spark-workflow-run-item spark-workflow-run-list-item${isSelected ? ' is-selected' : ''}`}
										onClick={() => setSelectedRunId(run.id)}
									>
										<div className="spark-workflow-run-header">
											<span className={`spark-workflow-run-status ${statusClass(run.status)}`}>{statusText}</span>
											<span className="spark-workflow-run-time">{formatTimestamp(run.startTime)}</span>
											<span className="spark-workflow-run-duration">{duration}ms</span>
											{run.totalCycles > 0 && (
												<span className="spark-workflow-run-cycles">{run.totalCycles} cycles</span>
											)}
										</div>
										{errorSnippet && (
											<div className="spark-workflow-run-error-snippet">{errorSnippet}</div>
										)}
									</button>
								);
							})}
						</div>

						<div className="spark-workflow-runs-detail">
							{selectedRun ? (
								<>
									<div className="spark-workflow-run-detail-meta">
										<div className="spark-workflow-run-detail-title">
											<span className={`spark-workflow-run-status ${statusClass(selectedRun.status)}`}>
												{statusIcon(selectedRun.status)}
											</span>
											<span>Run</span>
											<span className="spark-workflow-run-detail-subtle">{formatTimestamp(selectedRun.startTime)}</span>
										</div>
										<div className="spark-workflow-run-detail-subtle">
											Duration: {durationMs(selectedRun.startTime, selectedRun.endTime)}ms · Cycles: {selectedRun.totalCycles}
										</div>
									</div>

									{selectedRun.input !== undefined && (
										<DataBlock label="Run input" data={selectedRun.input} className="spark-workflow-run-input" />
									)}
									{selectedRun.output !== undefined && (
										<DataBlock label="Run output" data={selectedRun.output} className="spark-workflow-run-output" />
									)}
									{selectedRun.error && (
										<DataBlock label="Run error" data={selectedRun.error} className="spark-workflow-run-error" />
									)}

									<div className="spark-workflow-run-steps-title">Steps</div>
									{stepsChronological.length === 0 ? (
										<p className="spark-workflow-sidebar-empty">No steps executed.</p>
									) : (
										<div className="spark-workflow-run-steps">
											{stepsChronological.map((step) => {
												const label = nodeLabelById.get(step.nodeId) || step.nodeId;
												const canJump = nodeLabelById.has(step.nodeId);
												return (
													<StepRow
														key={`${step.nodeId}-${step.startTime}`}
														step={step}
														label={label}
														canJump={canJump}
														onJump={() => onJumpToNode(step.nodeId)}
													/>
												);
											})}
										</div>
									)}
								</>
							) : (
								<p className="spark-workflow-sidebar-empty">Select a run to see details.</p>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

