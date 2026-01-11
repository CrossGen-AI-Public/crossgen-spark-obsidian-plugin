import { validateAndNormalizeWorkflowDefinition } from '../../../src/workflows/generation/validateWorkflowDefinition.js';

describe('validateAndNormalizeWorkflowDefinition', () => {
  it('rejects action nodes (engine-only types are prompt|code|condition)', () => {
    const result = validateAndNormalizeWorkflowDefinition(
      {
        id: 'wf_x',
        name: 'Bad',
        version: 1,
        nodes: [
          {
            id: 'n1',
            type: 'action',
            position: { x: 0, y: 0 },
            data: { type: 'action', label: 'Action' },
          },
        ],
        edges: [],
        settings: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      { allowCode: true }
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected validation to fail');
    expect(result.errors.join('\n')).toContain('Invalid node.type');
  });

  it('rejects code nodes when allowCode is false', () => {
    const result = validateAndNormalizeWorkflowDefinition(
      {
        id: 'wf_x',
        name: 'No code',
        version: 1,
        nodes: [
          {
            id: 'n1',
            type: 'code',
            position: { x: 0, y: 0 },
            data: { type: 'code', label: 'Code', code: 'return 1;' },
          },
        ],
        edges: [],
        settings: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      { allowCode: false }
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected validation to fail');
    expect(result.errors.join('\n')).toContain('Code nodes are not allowed');
  });

  it('normalizes condition edge sourceHandle from label=true/false', () => {
    const result = validateAndNormalizeWorkflowDefinition(
      {
        id: 'wf_x',
        name: 'Cond',
        version: 1,
        nodes: [
          {
            id: 'c1',
            type: 'condition',
            position: { x: 0, y: 0 },
            data: { type: 'condition', label: 'Check', expression: 'true', maxCycles: 1 },
          },
          {
            id: 'p2',
            type: 'prompt',
            position: { x: 0, y: 0 },
            data: { type: 'prompt', label: 'Next', prompt: 'Hello' },
          },
          {
            id: 'p3',
            type: 'prompt',
            position: { x: 0, y: 0 },
            data: { type: 'prompt', label: 'Alt', prompt: 'World' },
          },
        ],
        edges: [
          {
            id: 'e1',
            source: 'c1',
            target: 'p2',
            label: 'true',
          },
          {
            id: 'e2',
            source: 'c1',
            target: 'p3',
            sourceHandle: 'false',
          },
        ],
        settings: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      { allowCode: true }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected validation to pass');
    const e1 = result.workflow.edges.find((e) => e.id === 'e1');
    expect(e1?.sourceHandle).toBe('true');
  });

  it('fills id/settings/timestamps when missing', () => {
    const result = validateAndNormalizeWorkflowDefinition(
      {
        version: 1,
        nodes: [
          {
            id: 'p1',
            type: 'prompt',
            position: { x: 0, y: 0 },
            data: { type: 'prompt', label: 'Step', prompt: 'Hello' },
          },
        ],
        edges: [],
      },
      { allowCode: true }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected validation to pass');
    expect(result.workflow.id.startsWith('wf_')).toBe(true);
    expect(result.workflow.settings).toEqual({});
    expect(typeof result.workflow.created).toBe('string');
    expect(typeof result.workflow.updated).toBe('string');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('rejects structuredOutput prompt nodes without outputSchema', () => {
    const result = validateAndNormalizeWorkflowDefinition(
      {
        id: 'wf_x',
        name: 'Bad schema',
        version: 1,
        nodes: [
          {
            id: 'p1',
            type: 'prompt',
            position: { x: 0, y: 0 },
            data: {
              type: 'prompt',
              label: 'Need schema',
              prompt: 'Return JSON',
              structuredOutput: true,
            },
          },
        ],
        edges: [],
        settings: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      { allowCode: true }
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected validation to fail');
    expect(result.errors.join('\n')).toContain('structuredOutput=true');
  });
});

