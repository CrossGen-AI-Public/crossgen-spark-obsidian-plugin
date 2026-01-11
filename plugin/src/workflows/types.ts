/**
 * Workflow Types
 * Shared types for workflow canvas and execution
 */

import type { Edge } from '@xyflow/react';

// Step types available in workflows
export type StepType = 'action' | 'prompt' | 'code' | 'condition';

// Step status during execution
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// Workflow execution status
export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Base data for all node types
 */
export interface BaseNodeData {
	label: string;
	description?: string;
}

/**
 * Prompt step data
 * Agent is specified via @agent mention in the prompt text
 */
export interface PromptNodeData extends BaseNodeData {
	prompt: string; // Template with @agent, $input, $context
	/** When true, output must be valid JSON matching outputSchema */
	structuredOutput?: boolean;
	/** JSON example/schema the agent must output (required when structuredOutput is true) */
	outputSchema?: string;
}

/**
 * Code step data
 */
export interface CodeNodeData extends BaseNodeData {
	code: string; // JavaScript code to execute
}

/**
 * Condition step data
 */
export interface ConditionNodeData extends BaseNodeData {
	expression: string; // JavaScript expression to evaluate
	maxCycles: number; // Max times this node can be visited in loops
}

/**
 * Action step data (placeholder before type is selected)
 */
export type ActionNodeData = BaseNodeData;

/**
 * Union type for all node data
 */
export type WorkflowNodeData =
	| ({ type: 'action' } & ActionNodeData)
	| ({ type: 'prompt' } & PromptNodeData)
	| ({ type: 'code' } & CodeNodeData)
	| ({ type: 'condition' } & ConditionNodeData);

/**
 * Workflow node with typed data
 * Using Record<string, unknown> to satisfy React Flow's constraints
 */
export interface WorkflowNode {
	id: string;
	type: StepType;
	position: { x: number; y: number };
	data: WorkflowNodeData;
}

/**
 * Workflow edge with optional label for conditions
 */
export interface WorkflowEdge extends Edge {
	label?: string; // 'true' | 'false' for condition branches
}

/**
 * Workflow settings
 * Note: Global limits (maxGlobalCycles, timeout) removed - will be user-configurable later
 */
export type WorkflowSettings = Record<string, never>;

/**
 * Workflow definition (stored in .spark/workflows/{id}.json)
 */
export interface WorkflowDefinition {
	id: string;
	name: string;
	description?: string;
	version: number;
	nodes: WorkflowNode[];
	edges: WorkflowEdge[];
	settings: WorkflowSettings;
	created: string; // ISO timestamp
	updated: string; // ISO timestamp
}

/**
 * Step execution result
 */
export interface StepResult {
	nodeId: string;
	status: StepStatus;
	input?: unknown; // Input data received by step
	output?: unknown; // Output data from step
	error?: string;
	startTime: number;
	endTime?: number;
	cycleCount?: number; // For loop detection
}

/**
 * Workflow run record (stored in .spark/workflow-runs/{workflowId}/{runId}.json)
 */
export interface WorkflowRun {
	id: string;
	workflowId: string;
	status: WorkflowStatus;
	input?: unknown;
	output?: unknown;
	error?: string;
	stepResults: StepResult[];
	startTime: number;
	endTime?: number;
	totalCycles: number;
}

/**
 * Workflow queue item (written to .spark/workflow-queue/{id}.json)
 */
export interface WorkflowQueueItem {
	workflowId: string;
	runId: string;
	status: 'pending' | 'processing';
	input?: unknown;
	timestamp: number;
}

/**
 * Workflow generation request (written to .spark/workflow-generate-queue/{requestId}.json)
 */
export interface WorkflowGenerateRequest {
	requestId: string;
	timestamp: number;
	source: 'workflow-ui';
	target: 'new-workflow';
	prompt: string;
	allowCode: boolean;
	threadId?: string;
	attempt?: number;
	clarifications?: string;
}

/**
 * Workflow generation result (written to .spark/workflow-generate-results/{requestId}.json)
 */
export type WorkflowGenerateProgressStage =
	| 'queued'
	| 'generating'
	| 'validating'
	| 'repairing'
	| 'layout'
	| 'writing';

export type WorkflowGenerateResult =
	| {
			requestId: string;
			status: 'processing';
			stage: WorkflowGenerateProgressStage;
			progress?: number; // 0-100
			message?: string;
			attempt?: number;
			maxAttempts?: number;
			updatedAt: number;
	  }
	| {
			requestId: string;
			status: 'completed';
			workflowId: string;
			workflowName?: string;
	  }
	| {
			requestId: string;
			status: 'needs_clarification';
			questions: string[];
	  }
	| {
			requestId: string;
			status: 'failed';
			error: string;
	  };

/**
 * Workflow runs index (stored in .spark/workflow-runs/index.json)
 * Engine-maintained summary to avoid scanning run files.
 */
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

/**
 * Sidebar tab types
 */
export type SidebarTab = 'properties' | 'prompt' | 'code' | 'runs';

/**
 * Canvas context for child components
 */
export interface WorkflowCanvasContext {
	workflowId: string;
	selectedNode: WorkflowNode | null;
	setSelectedNode: (node: WorkflowNode | null) => void;
	updateNode: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
	deleteNode: (nodeId: string) => void;
	runs: WorkflowRun[];
	isRunning: boolean;
}

/**
 * Default workflow settings
 */
export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
	// Reserved for future user-configurable settings
};

/**
 * Generate unique IDs
 */
export function generateId(prefix: string): string {
	return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new empty workflow
 */
export function createEmptyWorkflow(name = 'Untitled Workflow'): WorkflowDefinition {
	const now = new Date().toISOString();
	const id = generateId('wf');

	// Create initial action node (placeholder)
	const actionNode: WorkflowNode = {
		id: generateId('action'),
		type: 'action',
		position: { x: 100, y: 200 },
		data: {
			type: 'action',
			label: 'Action',
		},
	};

	return {
		id,
		name,
		version: 1,
		nodes: [actionNode],
		edges: [],
		settings: { ...DEFAULT_WORKFLOW_SETTINGS },
		created: now,
		updated: now,
	};
}
