import {
  buildWorkflowEditPrompt,
  buildRepairPrompt,
  WORKFLOW_EDITOR_SYSTEM_PROMPT,
} from '../../../src/workflows/editing/workflowEditorPromptPack.js';

describe('workflowEditorPromptPack', () => {
  describe('WORKFLOW_EDITOR_SYSTEM_PROMPT', () => {
    it('contains key sections', () => {
      expect(WORKFLOW_EDITOR_SYSTEM_PROMPT).toContain('Spark workflow editor');
      expect(WORKFLOW_EDITOR_SYSTEM_PROMPT).toContain('Node Types');
      expect(WORKFLOW_EDITOR_SYSTEM_PROMPT).toContain('Response Format');
      expect(WORKFLOW_EDITOR_SYSTEM_PROMPT).toContain('Important Rules');
    });

    it('describes node types', () => {
      expect(WORKFLOW_EDITOR_SYSTEM_PROMPT).toContain('Prompt nodes');
      expect(WORKFLOW_EDITOR_SYSTEM_PROMPT).toContain('Code nodes');
      expect(WORKFLOW_EDITOR_SYSTEM_PROMPT).toContain('Condition nodes');
    });

    it('describes response formats', () => {
      expect(WORKFLOW_EDITOR_SYSTEM_PROMPT).toContain('"status": "completed"');
      expect(WORKFLOW_EDITOR_SYSTEM_PROMPT).toContain('"status": "needs_clarification"');
    });
  });

  describe('buildWorkflowEditPrompt', () => {
    const baseWorkflow = {
      id: 'wf_1',
      name: 'Test',
      version: 1,
      nodes: [],
      edges: [],
      settings: {},
    };

    it('includes system prompt', () => {
      const result = buildWorkflowEditPrompt({
        workflow: baseWorkflow,
        selectedNodeId: undefined,
        recentRuns: [],
        message: 'Hello',
        conversationHistory: [],
      });

      expect(result).toContain(WORKFLOW_EDITOR_SYSTEM_PROMPT);
    });

    it('includes workflow JSON', () => {
      const result = buildWorkflowEditPrompt({
        workflow: baseWorkflow,
        selectedNodeId: undefined,
        recentRuns: [],
        message: 'Hello',
        conversationHistory: [],
      });

      expect(result).toContain('## Current Workflow');
      expect(result).toContain('"id": "wf_1"');
      expect(result).toContain('"name": "Test"');
    });

    it('includes selected node ID when provided', () => {
      const result = buildWorkflowEditPrompt({
        workflow: baseWorkflow,
        selectedNodeId: 'node_123',
        recentRuns: [],
        message: 'Hello',
        conversationHistory: [],
      });

      expect(result).toContain('## Selected Node ID: node_123');
    });

    it('omits selected node section when not provided', () => {
      const result = buildWorkflowEditPrompt({
        workflow: baseWorkflow,
        selectedNodeId: undefined,
        recentRuns: [],
        message: 'Hello',
        conversationHistory: [],
      });

      expect(result).not.toContain('## Selected Node ID');
    });

    it('includes recent runs when provided', () => {
      const recentRuns = [
        { id: 'run_1', status: 'completed', stepResults: [] },
        { id: 'run_2', status: 'failed', error: 'Something broke' },
      ];

      const result = buildWorkflowEditPrompt({
        workflow: baseWorkflow,
        selectedNodeId: undefined,
        recentRuns,
        message: 'Why did it fail?',
        conversationHistory: [],
      });

      expect(result).toContain('## Recent Run History');
      expect(result).toContain('"id": "run_1"');
      expect(result).toContain('"status": "failed"');
      expect(result).toContain('Something broke');
    });

    it('omits run history section when empty', () => {
      const result = buildWorkflowEditPrompt({
        workflow: baseWorkflow,
        selectedNodeId: undefined,
        recentRuns: [],
        message: 'Hello',
        conversationHistory: [],
      });

      expect(result).not.toContain('## Recent Run History');
    });

    it('includes conversation history when provided', () => {
      const conversationHistory = [
        { role: 'user', content: 'Add a node' },
        { role: 'assistant', content: 'I added one' },
      ];

      const result = buildWorkflowEditPrompt({
        workflow: baseWorkflow,
        selectedNodeId: undefined,
        recentRuns: [],
        message: 'Now add another',
        conversationHistory,
      });

      expect(result).toContain('## Conversation History');
      expect(result).toContain('**user**: Add a node');
      expect(result).toContain('**assistant**: I added one');
    });

    it('omits conversation history section when empty', () => {
      const result = buildWorkflowEditPrompt({
        workflow: baseWorkflow,
        selectedNodeId: undefined,
        recentRuns: [],
        message: 'Hello',
        conversationHistory: [],
      });

      expect(result).not.toContain('## Conversation History');
    });

    it('includes user message', () => {
      const result = buildWorkflowEditPrompt({
        workflow: baseWorkflow,
        selectedNodeId: undefined,
        recentRuns: [],
        message: 'Please add a code node that filters data',
        conversationHistory: [],
      });

      expect(result).toContain('## User Message');
      expect(result).toContain('Please add a code node that filters data');
    });

    it('includes instruction to respond with JSON', () => {
      const result = buildWorkflowEditPrompt({
        workflow: baseWorkflow,
        selectedNodeId: undefined,
        recentRuns: [],
        message: 'Hello',
        conversationHistory: [],
      });

      expect(result).toContain('Respond with a JSON object');
    });
  });

  describe('buildRepairPrompt', () => {
    it('includes validation errors', () => {
      const result = buildRepairPrompt({
        errors: ['Missing prompt field', 'Invalid node type'],
        lastJson: '{}',
      });

      expect(result).toContain('Validation errors:');
      expect(result).toContain('- Missing prompt field');
      expect(result).toContain('- Invalid node type');
    });

    it('includes last JSON', () => {
      const lastJson = '{"id": "bad", "nodes": []}';
      const result = buildRepairPrompt({
        errors: ['Missing field'],
        lastJson,
      });

      expect(result).toContain('Invalid JSON:');
      expect(result).toContain(lastJson);
    });

    it('instructs to return corrected JSON only', () => {
      const result = buildRepairPrompt({
        errors: ['Error'],
        lastJson: '{}',
      });

      expect(result).toContain('Return a single corrected JSON object only');
      expect(result).toContain('No commentary');
    });
  });
});
