import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from '../types.js';

type Ok = { ok: true; workflow: WorkflowDefinition; warnings: string[] };
type Err = { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeIsoTimestamp(value: unknown, nowIso: string): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
  return nowIso;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function normalizePosition(pos: unknown): { x: number; y: number } {
  if (!isRecord(pos)) return { x: 0, y: 0 };
  const x = isFiniteNumber(pos.x) ? pos.x : 0;
  const y = isFiniteNumber(pos.y) ? pos.y : 0;
  return { x, y };
}

function normalizeLabel(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeBooleanString(value: unknown): 'true' | 'false' | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'true') return 'true';
  if (v === 'false') return 'false';
  return null;
}

function normalizeSettings(value: unknown, warnings: string[]): Record<string, never> {
  if (!isRecord(value)) {
    warnings.push('Missing/invalid workflow.settings; normalized to {}.');
    return {};
  }
  if (Object.keys(value).length !== 0) {
    warnings.push('workflow.settings must be {}; normalized to {}.');
  }
  return {};
}

function normalizeWorkflowMeta(
  input: Record<string, unknown>,
  warnings: string[],
  errors: string[]
): {
  id: string;
  name: string;
  description?: string;
  created: string;
  updated: string;
  settings: Record<string, never>;
} {
  const nowIso = new Date().toISOString();

  const id = normalizeString(input.id) ?? generateId('wf');
  if (!normalizeString(input.id)) warnings.push('Missing workflow id; generated one.');

  const name = normalizeString(input.name) ?? 'Untitled Workflow';
  if (!normalizeString(input.name)) warnings.push('Missing workflow name; defaulted.');

  if (input.version !== 1) errors.push('workflow.version must be 1.');

  const created = normalizeIsoTimestamp(input.created, nowIso);
  const updated = normalizeIsoTimestamp(input.updated, nowIso);

  if (input.created === undefined) warnings.push('Missing workflow.created; filled.');
  if (input.updated === undefined) warnings.push('Missing workflow.updated; filled.');
  if (created === nowIso && input.created !== undefined)
    warnings.push('Invalid workflow.created; normalized.');
  if (updated === nowIso && input.updated !== undefined)
    warnings.push('Invalid workflow.updated; normalized.');

  return {
    id,
    name,
    description: normalizeString(input.description) ?? undefined,
    created,
    updated,
    settings: normalizeSettings(input.settings, warnings),
  };
}

function warnIfInvalidPosition(rawPosition: unknown, nodeId: string, warnings: string[]): void {
  if (!isRecord(rawPosition) || !isFiniteNumber(rawPosition.x)) {
    warnings.push(`Node ${nodeId} missing/invalid position.x; normalized.`);
  }
  if (!isRecord(rawPosition) || !isFiniteNumber(rawPosition.y)) {
    warnings.push(`Node ${nodeId} missing/invalid position.y; normalized.`);
  }
}

type EngineWorkflowNodeType = 'prompt' | 'code' | 'condition';

function isEngineWorkflowNodeType(value: string | null): value is EngineWorkflowNodeType {
  return value === 'prompt' || value === 'code' || value === 'condition';
}

type NodeBase = {
  nodeId: string;
  type: EngineWorkflowNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  label: string;
};

function parseNodeBase(
  raw: Record<string, unknown>,
  options: { allowCode: boolean },
  nodeIds: Set<string>,
  errors: string[],
  warnings: string[]
): NodeBase | null {
  const nodeId = normalizeString(raw.id) ?? generateId('node');
  if (!normalizeString(raw.id)) warnings.push('Node missing id; generated one.');
  if (nodeIds.has(nodeId)) {
    errors.push(`Duplicate node id: ${nodeId}`);
    return null;
  }

  const typeRaw = normalizeString(raw.type);
  if (!isEngineWorkflowNodeType(typeRaw)) {
    errors.push(`Invalid node.type for node ${nodeId}: ${String(raw.type)}`);
    return null;
  }

  if (!options.allowCode && typeRaw === 'code') {
    errors.push(`Code nodes are not allowed (node ${nodeId}).`);
    return null;
  }

  warnIfInvalidPosition(raw.position, nodeId, warnings);
  const position = normalizePosition(raw.position);

  if (!isRecord(raw.data)) {
    errors.push(`Node ${nodeId} missing data.`);
    return null;
  }

  const dataType = normalizeString(raw.data.type);
  if (dataType !== typeRaw) {
    errors.push(`Node ${nodeId} data.type must equal node.type (${typeRaw}).`);
    return null;
  }

  const label = normalizeLabel(raw.data.label, typeRaw);
  if (!normalizeString(raw.data.label)) warnings.push(`Node ${nodeId} missing label; defaulted.`);

  nodeIds.add(nodeId);
  return { nodeId, type: typeRaw, position, data: raw.data, label };
}

function normalizePromptNode(base: NodeBase, errors: string[]): WorkflowNode | null {
  const prompt = normalizeString(base.data.prompt);
  if (!prompt) {
    errors.push(`Prompt node ${base.nodeId} missing data.prompt.`);
    return null;
  }

  const structuredOutput =
    typeof base.data.structuredOutput === 'boolean' ? base.data.structuredOutput : false;
  let outputSchema: string | undefined = normalizeString(base.data.outputSchema) ?? undefined;

  // Accept object/array schemas and stringify them for runtime prompts.
  if (
    !outputSchema &&
    (isRecord(base.data.outputSchema) || Array.isArray(base.data.outputSchema))
  ) {
    try {
      outputSchema = JSON.stringify(base.data.outputSchema, null, 2);
    } catch {
      // Keep undefined; will be handled by structuredOutput enforcement below.
    }
  }

  if (structuredOutput) {
    if (!outputSchema) {
      errors.push(
        `Prompt node ${base.nodeId} has structuredOutput=true but is missing data.outputSchema.`
      );
      return null;
    }
    try {
      JSON.parse(outputSchema);
    } catch {
      errors.push(
        `Prompt node ${base.nodeId} data.outputSchema must be valid JSON (an example object/array or JSON Schema).`
      );
      return null;
    }
  }

  return {
    id: base.nodeId,
    type: 'prompt',
    position: base.position,
    data: {
      type: 'prompt',
      label: base.label,
      prompt,
      description: normalizeString(base.data.description) ?? undefined,
      structuredOutput: structuredOutput ? true : undefined,
      outputSchema,
    },
  };
}

function normalizeCodeNode(base: NodeBase, errors: string[]): WorkflowNode | null {
  const code = normalizeString(base.data.code);
  if (!code) {
    errors.push(`Code node ${base.nodeId} missing data.code.`);
    return null;
  }

  return {
    id: base.nodeId,
    type: 'code',
    position: base.position,
    data: {
      type: 'code',
      label: base.label,
      code,
      description: normalizeString(base.data.description) ?? undefined,
    },
  };
}

function normalizeConditionNode(base: NodeBase, errors: string[]): WorkflowNode | null {
  const expression = normalizeString(base.data.expression);
  const maxCycles = base.data.maxCycles;
  if (!expression) {
    errors.push(`Condition node ${base.nodeId} missing data.expression.`);
    return null;
  }
  if (!isFiniteNumber(maxCycles)) {
    errors.push(`Condition node ${base.nodeId} data.maxCycles must be a number.`);
    return null;
  }

  return {
    id: base.nodeId,
    type: 'condition',
    position: base.position,
    data: {
      type: 'condition',
      label: base.label,
      expression,
      maxCycles,
      description: normalizeString(base.data.description) ?? undefined,
    },
  };
}

function normalizeNodeByType(
  base: NodeBase,
  errors: string[]
): { node: WorkflowNode; isCondition: boolean } | null {
  if (base.type === 'prompt') {
    const node = normalizePromptNode(base, errors);
    return node ? { node, isCondition: false } : null;
  }

  if (base.type === 'code') {
    const node = normalizeCodeNode(base, errors);
    return node ? { node, isCondition: false } : null;
  }

  const node = normalizeConditionNode(base, errors);
  return node ? { node, isCondition: true } : null;
}

function normalizeNodes(
  rawNodes: unknown[],
  options: { allowCode: boolean },
  errors: string[],
  warnings: string[]
): { nodes: WorkflowNode[]; nodeIds: Set<string>; conditionNodeIds: Set<string> } {
  const nodes: WorkflowNode[] = [];
  const nodeIds = new Set<string>();
  const conditionNodeIds = new Set<string>();

  for (const raw of rawNodes) {
    if (!isRecord(raw)) {
      errors.push('workflow.nodes entries must be objects.');
      continue;
    }

    const base = parseNodeBase(raw, options, nodeIds, errors, warnings);
    if (!base) continue;

    const normalized = normalizeNodeByType(base, errors);
    if (!normalized) continue;

    if (normalized.isCondition) conditionNodeIds.add(base.nodeId);
    nodes.push(normalized.node);
  }

  return { nodes, nodeIds, conditionNodeIds };
}

function normalizeEdge(
  raw: Record<string, unknown>,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
  errors: string[],
  warnings: string[]
): WorkflowEdge | null {
  const edgeId = normalizeString(raw.id) ?? generateId('edge');
  if (!normalizeString(raw.id)) warnings.push('Edge missing id; generated one.');
  if (edgeIds.has(edgeId)) {
    errors.push(`Duplicate edge id: ${edgeId}`);
    return null;
  }

  const source = normalizeString(raw.source);
  const target = normalizeString(raw.target);
  if (!source || !target) {
    errors.push(`Edge ${edgeId} missing source/target.`);
    return null;
  }

  if (!nodeIds.has(source)) errors.push(`Edge ${edgeId} source references missing node: ${source}`);
  if (!nodeIds.has(target)) errors.push(`Edge ${edgeId} target references missing node: ${target}`);

  const labelRaw = normalizeString(raw.label) ?? undefined;
  const sourceHandleRaw = normalizeString(raw.sourceHandle) ?? undefined;
  const normalizedLabelBool = normalizeBooleanString(labelRaw);
  const normalizedHandleBool = normalizeBooleanString(sourceHandleRaw);

  const sourceHandle = sourceHandleRaw ?? (normalizedLabelBool ? normalizedLabelBool : undefined);
  warnIfInferredSourceHandle(edgeId, sourceHandleRaw, normalizedLabelBool, warnings);

  const label = labelRaw ?? (normalizedHandleBool ? normalizedHandleBool : undefined);

  edgeIds.add(edgeId);
  return {
    id: edgeId,
    source,
    target,
    sourceHandle,
    targetHandle: normalizeString(raw.targetHandle) ?? undefined,
    label,
  };
}

function warnIfInferredSourceHandle(
  edgeId: string,
  sourceHandleRaw: string | undefined,
  inferred: 'true' | 'false' | null,
  warnings: string[]
): void {
  if (sourceHandleRaw) return;
  if (!inferred) return;
  warnings.push(`Edge ${edgeId} missing sourceHandle; inferred from label (${inferred}).`);
}

function normalizeEdges(
  rawEdges: unknown[],
  nodeIds: Set<string>,
  errors: string[],
  warnings: string[]
): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  const edgeIds = new Set<string>();

  for (const raw of rawEdges) {
    if (!isRecord(raw)) {
      errors.push('workflow.edges entries must be objects.');
      continue;
    }

    const edge = normalizeEdge(raw, nodeIds, edgeIds, errors, warnings);
    if (edge) edges.push(edge);
  }

  return edges;
}

function validateEntryPoint(nodes: WorkflowNode[], edges: WorkflowEdge[], errors: string[]): void {
  if (nodes.length === 0) return;
  const targets = new Set(edges.map((e) => e.target));
  const hasEntry = nodes.some((n) => !targets.has(n.id));
  if (!hasEntry) errors.push('Workflow must have an entry node (a node with no incoming edges).');
}

function validateConditionOutgoingCount(
  nodeId: string,
  outgoing: WorkflowEdge[],
  errors: string[]
): boolean {
  if (outgoing.length <= 2) return true;
  errors.push(
    `Condition node ${nodeId} has ${outgoing.length} outgoing edges. Condition nodes support at most 2 outgoing edges (true/false).`
  );
  return false;
}

function validateConditionEdgeHandles(
  nodeId: string,
  outgoing: WorkflowEdge[],
  errors: string[]
): {
  hasTrue: boolean;
  hasFalse: boolean;
} {
  let hasTrue = false;
  let hasFalse = false;

  for (const e of outgoing) {
    const h = normalizeBooleanString(e.sourceHandle);
    if (!h) {
      errors.push(
        `Condition node ${nodeId} outgoing edge ${e.id} must set sourceHandle to "true" or "false".`
      );
      continue;
    }
    if (h === 'true') hasTrue = true;
    if (h === 'false') hasFalse = true;
  }

  return { hasTrue, hasFalse };
}

function validateConditionRouting(
  conditionNodeIds: Set<string>,
  edges: WorkflowEdge[],
  errors: string[]
): void {
  for (const nodeId of conditionNodeIds) {
    const outgoing = edges.filter((e) => e.source === nodeId);
    if (!validateConditionOutgoingCount(nodeId, outgoing, errors)) continue;
    const { hasTrue, hasFalse } = validateConditionEdgeHandles(nodeId, outgoing, errors);

    if (outgoing.length > 0 && (!hasTrue || !hasFalse)) {
      errors.push(
        `Condition node ${nodeId} must include both a "true" and a "false" outgoing edge (sourceHandle).`
      );
    }
  }
}

export function validateAndNormalizeWorkflowDefinition(
  input: unknown,
  options: { allowCode: boolean }
): Ok | Err {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ['Workflow JSON must be an object.'] };
  }

  if (!Array.isArray(input.nodes)) errors.push('workflow.nodes must be an array.');
  if (!Array.isArray(input.edges)) errors.push('workflow.edges must be an array.');

  const meta = normalizeWorkflowMeta(input, warnings, errors);
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const rawEdges = Array.isArray(input.edges) ? input.edges : [];

  const normalizedNodes = normalizeNodes(rawNodes, options, errors, warnings);
  const edges = normalizeEdges(rawEdges, normalizedNodes.nodeIds, errors, warnings);

  validateEntryPoint(normalizedNodes.nodes, edges, errors);
  validateConditionRouting(normalizedNodes.conditionNodeIds, edges, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const workflow: WorkflowDefinition = {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    version: 1,
    nodes: normalizedNodes.nodes,
    edges,
    settings: meta.settings,
    created: meta.created,
    updated: meta.updated,
  };

  return { ok: true, workflow, warnings };
}
