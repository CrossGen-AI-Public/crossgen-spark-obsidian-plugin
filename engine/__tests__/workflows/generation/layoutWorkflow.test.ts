import { layoutWorkflowIfNeeded } from '../../../src/workflows/generation/layoutWorkflow.js';
import type { WorkflowDefinition } from '../../../src/workflows/types.js';

function overlaps(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const W = 240;
  const H = 80;
  return !(a.x + W <= b.x || b.x + W <= a.x || a.y + H <= b.y || b.y + H <= a.y);
}

describe('layoutWorkflowIfNeeded', () => {
  it('repositions overlapping nodes deterministically', () => {
    const wf: WorkflowDefinition = {
      id: 'wf_layout',
      name: 'Layout',
      version: 1,
      nodes: [
        {
          id: 'a',
          type: 'prompt',
          position: { x: 0, y: 0 },
          data: { type: 'prompt', label: 'A', prompt: 'A' },
        },
        {
          id: 'b',
          type: 'prompt',
          position: { x: 0, y: 0 },
          data: { type: 'prompt', label: 'B', prompt: 'B' },
        },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b' }],
      settings: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    const laidOut = layoutWorkflowIfNeeded(wf);
    const a = laidOut.nodes.find((n) => n.id === 'a');
    const b = laidOut.nodes.find((n) => n.id === 'b');
    if (!a || !b) throw new Error('Expected nodes to exist');

    expect(overlaps(a.position, b.position)).toBe(false);
    expect(a.position.x).toBeLessThan(b.position.x);
  });
});

