/**
 * Workflow Types for Engine
 * Shared types between plugin and engine
 */

// Step types available in workflows
export type StepType = 'prompt' | 'code' | 'condition' | 'file';

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
  prompt: string;
  /** When true, output must be valid JSON matching outputSchema */
  structuredOutput?: boolean;
  /** JSON example/schema the agent must output (required when structuredOutput is true) */
  outputSchema?: string;
}

/**
 * Code step data
 */
export interface CodeNodeData extends BaseNodeData {
  code: string;
}

/**
 * Condition step data
 */
export interface ConditionNodeData extends BaseNodeData {
  expression: string;
  maxCycles: number;
}

/**
 * File step data
 * Provides file content as attachment to connected nodes
 */
export interface FileNodeData extends BaseNodeData {
  path: string; // Vault-relative path (e.g., "notes/my-file.md")
  lastModified: number; // Timestamp for display
  fileSize: number; // Bytes for display
}

/**
 * File attachment (content resolved at execution time)
 */
export interface FileAttachment {
  path: string;
  content: string;
}

/**
 * Union type for all node data
 */
export type WorkflowNodeData =
  | ({ type: 'prompt' } & PromptNodeData)
  | ({ type: 'code' } & CodeNodeData)
  | ({ type: 'condition' } & ConditionNodeData)
  | ({ type: 'file' } & FileNodeData);

/**
 * Position for nodes
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Workflow node
 */
export interface WorkflowNode {
  id: string;
  type: StepType;
  position: Position;
  data: WorkflowNodeData;
}

/**
 * Workflow edge
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string; // 'true' | 'false' for condition branches
}

/**
 * Workflow settings
 * Note: Global limits (maxGlobalCycles, timeout) removed - will be user-configurable in plugin
 */
export type WorkflowSettings = Record<string, never>;

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  created: string;
  updated: string;
}

/**
 * Step execution result
 */
export interface StepResult {
  nodeId: string;
  status: StepStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
  cycleCount?: number;
}

/**
 * Workflow run record
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
 * Workflow queue item
 */
export interface WorkflowQueueItem {
  workflowId: string;
  runId: string;
  status: 'pending' | 'processing';
  input?: unknown;
  timestamp: number;
}

/**
 * Execution context passed between steps
 */
export interface ExecutionContext {
  workflowId: string;
  runId: string;
  input?: unknown;
  stepOutputs: Map<string, unknown>;
  visitCounts: Map<string, number>;
  totalCycles: number;
}

/**
 * Labeled output from a step
 */
export interface LabeledOutput {
  nodeId: string;
  label: string;
  output: unknown;
}

/**
 * Structured input context for prompt nodes
 * Distinguishes between primary input (most recent) and context (other inputs)
 */
export interface WorkflowInputContext {
  /** Most recently executed upstream node's output */
  primary: LabeledOutput | null;
  /** Other inputs (for reference/context) */
  context: LabeledOutput[];
  /** Original workflow input (if any) */
  workflowInput?: unknown;
  /** File attachments from connected file nodes */
  attachments?: FileAttachment[];
}

/**
 * Request from PromptRunner to CommandExecutor
 * Separates concerns: system prompt addons vs user message structure
 */
export interface WorkflowPromptRequest {
  // Agent identification
  agentId?: string;

  // Workflow metadata
  workflowId: string;
  runId: string;
  nodeId: string;

  // Step info (for system prompt addon)
  stepLabel: string;
  stepDescription?: string;

  // Input context (for user message)
  inputContext: WorkflowInputContext;

  // The actual task (user's prompt template)
  task: string;

  // Output requirements
  structuredOutput?: boolean;
  outputSchema?: string;
}
