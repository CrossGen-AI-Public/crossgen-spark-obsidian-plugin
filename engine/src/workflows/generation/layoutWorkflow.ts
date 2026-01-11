import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from '../types.js';

type Rect = { x: number; y: number; w: number; h: number };

const NODE_W = 240;
const NODE_H = 80;
const COL_X = 300;
const ROW_Y = 160;

type GenericHandle =
  | 'left-in'
  | 'right-in'
  | 'top-in'
  | 'bottom-in'
  | 'left-out'
  | 'right-out'
  | 'top-out'
  | 'bottom-out';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nodesOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function rectFor(node: WorkflowNode): Rect {
  return { x: node.position.x, y: node.position.y, w: NODE_W, h: NODE_H };
}

function hasInvalidPositions(workflow: WorkflowDefinition): boolean {
  return workflow.nodes.some(
    (n) => !isFiniteNumber(n.position?.x) || !isFiniteNumber(n.position?.y)
  );
}

function hasOverlaps(workflow: WorkflowDefinition): boolean {
  const rects = workflow.nodes.map(rectFor);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (!a || !b) continue;
      if (nodesOverlap(a, b)) return true;
    }
  }
  return false;
}

function entryNodeIds(workflow: WorkflowDefinition): string[] {
  const targets = new Set(workflow.edges.map((e) => e.target));
  return workflow.nodes
    .filter((n) => !targets.has(n.id))
    .map((n) => n.id)
    .sort((a, b) => a.localeCompare(b));
}

function outgoing(workflow: WorkflowDefinition, nodeId: string): string[] {
  return workflow.edges
    .filter((e) => e.source === nodeId)
    .map((e) => e.target)
    .sort((a, b) => a.localeCompare(b));
}

function seedDepths(workflow: WorkflowDefinition): { depth: Map<string, number>; queue: string[] } {
  const depth = new Map<string, number>();
  const queue: string[] = [];

  const entries = entryNodeIds(workflow);
  entries.forEach((id) => {
    depth.set(id, 0);
    queue.push(id);
  });

  // If the graph has no entry (cycle-only), seed with the first node (stable by id).
  if (queue.length === 0) {
    const sorted = workflow.nodes.map((n) => n.id).sort((a, b) => a.localeCompare(b));
    const first = sorted[0];
    if (first) {
      depth.set(first, 0);
      queue.push(first);
    }
  }

  return { depth, queue };
}

function ensureAllDepths(workflow: WorkflowDefinition, depth: Map<string, number>): void {
  workflow.nodes
    .map((n) => n.id)
    .sort((a, b) => a.localeCompare(b))
    .forEach((id) => {
      if (!depth.has(id)) depth.set(id, 0);
    });
}

function computeDepths(workflow: WorkflowDefinition): Map<string, number> {
  // Use a shortest-path style relaxation (not "longest path") so cycles don't
  // push early nodes further to the right (which creates tangled layouts).
  const { depth, queue } = seedDepths(workflow);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const base = depth.get(current) ?? 0;
    for (const next of outgoing(workflow, current)) {
      const nextDepth = base + 1;
      const existing = depth.get(next);
      if (existing === undefined || nextDepth < existing) {
        depth.set(next, nextDepth);
        queue.push(next);
      }
    }
  }
  ensureAllDepths(workflow, depth);
  return depth;
}

function collisionPass(nodes: WorkflowNode[]): WorkflowNode[] {
  const placed: Rect[] = [];
  const output: WorkflowNode[] = [];

  for (const node of nodes) {
    const x = node.position.x;
    let y = node.position.y;

    let rect: Rect = { x, y, w: NODE_W, h: NODE_H };
    let guard = 0;
    while (placed.some((p) => nodesOverlap(p, rect)) && guard < 200) {
      y += 40;
      rect = { x, y, w: NODE_W, h: NODE_H };
      guard++;
    }

    placed.push(rect);
    output.push({ ...node, position: { x, y } });
  }

  return output;
}

function incomingEdges(workflow: WorkflowDefinition, nodeId: string) {
  return workflow.edges.filter((e) => e.target === nodeId);
}

function inferDirectionalHandles(
  source: WorkflowNode,
  target: WorkflowNode
): { sourceHandle: GenericHandle; targetHandle: GenericHandle } {
  const dx = target.position.x - source.position.x;
  const dy = target.position.y - source.position.y;

  // Prefer left/right when mostly horizontal; otherwise top/bottom.
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: 'right-out', targetHandle: 'left-in' }
      : { sourceHandle: 'left-out', targetHandle: 'right-in' };
  }

  return dy >= 0
    ? { sourceHandle: 'bottom-out', targetHandle: 'top-in' }
    : { sourceHandle: 'top-out', targetHandle: 'bottom-in' };
}

function normalizeTargetHandleForNode(target: WorkflowNode, handle: GenericHandle): GenericHandle {
  // Condition nodes only support input handles on left/top/bottom.
  // (They do NOT have "right-in"; right side is reserved for true/false outputs.)
  if (target.type === 'condition' && handle === 'right-in') return 'left-in';
  return handle;
}

function inferBackEdgeHandles(
  source: WorkflowNode,
  target: WorkflowNode
): { sourceHandle: GenericHandle; targetHandle: GenericHandle } {
  // Route "back edges" (loops) vertically to avoid reusing left/right handles that
  // make the graph look like spaghetti.
  const dy = target.position.y - source.position.y;
  return dy >= 0
    ? { sourceHandle: 'bottom-out', targetHandle: 'top-in' }
    : { sourceHandle: 'top-out', targetHandle: 'bottom-in' };
}

function isBackEdge(depths: Map<string, number>, sourceId: string, targetId: string): boolean {
  const sourceDepth = depths.get(sourceId) ?? 0;
  const targetDepth = depths.get(targetId) ?? 0;
  return targetDepth <= sourceDepth;
}

function inferHandlesForNonConditionEdge(
  source: WorkflowNode,
  target: WorkflowNode,
  depths: Map<string, number>
): { sourceHandle: GenericHandle; targetHandle: GenericHandle } {
  if (isBackEdge(depths, source.id, target.id)) return inferBackEdgeHandles(source, target);
  return inferDirectionalHandles(source, target);
}

function defaultTargetHandleForEdge(
  source: WorkflowNode,
  target: WorkflowNode,
  depths: Map<string, number>,
  inferred: { targetHandle: GenericHandle }
): GenericHandle {
  // For forward edges, default incoming handle to left-in for readability.
  // For back edges, keep the vertical routing choice.
  return isBackEdge(depths, source.id, target.id) ? inferred.targetHandle : 'left-in';
}

function applyConditionSourceEdgeHandles(
  edge: WorkflowEdge,
  targetNode: WorkflowNode,
  inferred: { targetHandle: GenericHandle }
): WorkflowEdge {
  if (edge.targetHandle) return edge;
  return { ...edge, targetHandle: normalizeTargetHandleForNode(targetNode, inferred.targetHandle) };
}

function applyEdgeHandles(workflow: WorkflowDefinition): WorkflowDefinition {
  const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]));
  const depths = computeDepths(workflow);

  const edges = workflow.edges.map((e) => {
    // Preserve condition routing handles ("true"/"false") on condition nodes.
    const sourceNode = nodeMap.get(e.source);
    const targetNode = nodeMap.get(e.target);
    if (!sourceNode || !targetNode) return e;

    if (sourceNode.type === 'condition') {
      // Condition edges: sourceHandle is routing ("true"/"false"). Only fill targetHandle if missing.
      const inferred = inferDirectionalHandles(sourceNode, targetNode);
      return applyConditionSourceEdgeHandles(e, targetNode, inferred);
    }

    const inferred = inferHandlesForNonConditionEdge(sourceNode, targetNode, depths);
    const defaultTargetHandle = defaultTargetHandleForEdge(
      sourceNode,
      targetNode,
      depths,
      inferred
    );

    return {
      ...e,
      sourceHandle: e.sourceHandle ?? inferred.sourceHandle,
      targetHandle: e.targetHandle ?? normalizeTargetHandleForNode(targetNode, defaultTargetHandle),
    };
  });

  return { ...workflow, edges };
}

type DepthScore = { id: string; desiredY: number };

function computeDesiredYForNode(options: {
  workflow: WorkflowDefinition;
  nodeId: string;
  depth: number;
  fallbackIdx: number;
  depths: Map<string, number>;
  yById: Map<string, number>;
  nodeMap: Map<string, WorkflowNode>;
}): number {
  const incoming = incomingEdges(options.workflow, options.nodeId).filter((e) => {
    const srcDepth = options.depths.get(e.source) ?? 0;
    return srcDepth < options.depth; // ignore same-depth/back edges for positioning
  });
  if (incoming.length === 0) return options.fallbackIdx * ROW_Y;

  const ys: number[] = [];
  for (const e of incoming) {
    const srcY = options.yById.get(e.source);
    if (srcY === undefined) continue;

    // Spread true/false branches vertically for readability.
    const source = options.nodeMap.get(e.source);
    if (source?.type === 'condition' && (e.sourceHandle === 'true' || e.sourceHandle === 'false')) {
      ys.push(srcY + (e.sourceHandle === 'true' ? -ROW_Y / 2 : ROW_Y / 2));
    } else {
      ys.push(srcY);
    }
  }

  if (ys.length === 0) return options.fallbackIdx * ROW_Y;
  return ys.reduce((a, b) => a + b, 0) / ys.length;
}

function scoreDepthColumn(options: {
  workflow: WorkflowDefinition;
  depth: number;
  ids: string[];
  depths: Map<string, number>;
  yById: Map<string, number>;
  nodeMap: Map<string, WorkflowNode>;
}): DepthScore[] {
  return options.ids
    .map((id, fallbackIdx) => ({
      id,
      desiredY: computeDesiredYForNode({
        workflow: options.workflow,
        nodeId: id,
        depth: options.depth,
        fallbackIdx,
        depths: options.depths,
        yById: options.yById,
        nodeMap: options.nodeMap,
      }),
    }))
    .sort((a, b) => a.desiredY - b.desiredY || a.id.localeCompare(b.id));
}

function placeDepthColumn(options: {
  depth: number;
  scored: DepthScore[];
  nodeMap: Map<string, WorkflowNode>;
  yById: Map<string, number>;
}): WorkflowNode[] {
  const out: WorkflowNode[] = [];
  for (const s of options.scored) {
    const node = options.nodeMap.get(s.id);
    if (!node) continue;
    const y = Math.max(0, Math.round(s.desiredY / 40) * 40);
    options.yById.set(s.id, y);
    out.push({
      ...node,
      position: { x: options.depth * COL_X, y },
    });
  }
  return out;
}

function layoutWorkflowInternal(workflow: WorkflowDefinition): WorkflowDefinition {
  const depths = computeDepths(workflow);
  const byDepth = new Map<number, string[]>();

  for (const node of workflow.nodes) {
    const d = depths.get(node.id) ?? 0;
    const list = byDepth.get(d) ?? [];
    list.push(node.id);
    byDepth.set(d, list);
  }

  const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]));
  const yById = new Map<string, number>();

  const positioned: WorkflowNode[] = [];
  const depthKeys = Array.from(byDepth.keys()).sort((a, b) => a - b);

  for (const d of depthKeys) {
    const ids = byDepth.get(d) ?? [];
    const scored = scoreDepthColumn({
      workflow,
      depth: d,
      ids,
      depths,
      yById,
      nodeMap,
    });
    positioned.push(...placeDepthColumn({ depth: d, scored, nodeMap, yById }));
  }

  const collidedFixed = collisionPass(positioned);
  const withPositions = { ...workflow, nodes: collidedFixed, updated: new Date().toISOString() };
  return applyEdgeHandles(withPositions);
}

export function layoutWorkflowIfNeeded(workflow: WorkflowDefinition): WorkflowDefinition {
  const needsLayout = hasInvalidPositions(workflow) || hasOverlaps(workflow);
  if (!needsLayout) {
    // Even if we keep positions, we can still improve edge routing in the UI.
    return applyEdgeHandles(workflow);
  }
  return layoutWorkflowInternal(workflow);
}

export function layoutWorkflow(
  workflow: WorkflowDefinition,
  options?: { force?: boolean }
): WorkflowDefinition {
  if (options?.force) return layoutWorkflowInternal(workflow);
  return layoutWorkflowIfNeeded(workflow);
}
