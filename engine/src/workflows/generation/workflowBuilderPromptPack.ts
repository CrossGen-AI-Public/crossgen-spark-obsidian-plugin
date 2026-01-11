export const WORKFLOW_BUILDER_V1_PROMPT = `
You are generating a Spark workflow definition.

OUTPUT RULES (critical):
- Output MUST be a single JSON object only.
- Do NOT output markdown fences.
- Do NOT include commentary or explanations.

If the user's request is underspecified or ambiguous, output ONLY:
{ "status": "needs_clarification", "questions": ["..."] }

WORKFLOW SCHEMA (version 1):
- id: string
- name: string
- description?: string
- version: 1
- nodes: array of { id, type, position: { x, y }, data }
- edges: array of { id, source, target, sourceHandle?, targetHandle?, label? }
- settings: {}
- created: ISO timestamp string
- updated: ISO timestamp string

NODE TYPES ALLOWED:
- prompt
- code
- condition

NODE DATA RULE:
- node.data.type MUST equal node.type

REQUIRED NODE DATA FIELDS:
- prompt node: data.prompt (string)
- code node: data.code (string)
- condition node: data.expression (string) and data.maxCycles (number)

IMPORTANT RUNTIME CONSTRAINTS:
- Do NOT generate any "action" nodes. Only prompt/code/condition exist at runtime.
- Condition routing uses edge.sourceHandle as the source of truth:
  - Outgoing edges from a condition node MUST include sourceHandle: "true" or "false"
  - Do NOT rely on edge.label for routing (label may exist for display only).
- Condition nodes MUST have exactly 2 outgoing edges: one "true" branch and one "false" branch.
- settings MUST be {}.

CONDITION NODE INPUTS (important):
- Condition nodes evaluate an expression against their input (variable: input/output).
- If a condition is meant to evaluate the output of a previous step, it MUST have at least one incoming edge.
- Only make a condition node the entry node when you explicitly want to branch on the workflow's initial input.

NODE TITLES + DESCRIPTIONS (required for good UX):
- Every node MUST set:
  - data.label: a short, human-friendly title (2–5 words), action-oriented.
  - data.description: a one-line summary of what the node does.
- Examples:
  - prompt: label "Generate ideas", description "Generate 5 headline options."
  - code: label "Pick best", description "Select the strongest headline based on constraints."
  - condition: label "More iterations?", description "Continue refining until done or max cycles reached."

RUNTIME VARIABLES (important; do not invent variables):
- prompt nodes:
  - data.prompt is a natural language instruction. It may reference previous output as "$input".
  - If you need the prompt output to be machine-readable downstream, set:
    - data.structuredOutput: true
    - data.outputSchema: REQUIRED. Must be valid JSON (either a JSON Schema object, or a concrete example object/array shape).
      The engine will paste this into the prompt under "Required Output Format" and requires the model to match it exactly.
- code nodes:
  - JavaScript executes with variable: input (the previous step's output)
  - It should return the next output (object/string/number/etc).
- condition nodes:
  - JavaScript expression executes with variables:
    - input (previous step output)
    - output (alias of input)
    - iteration (1-based visit count for THIS condition node in the current run)
    - maxCycles (the node's data.maxCycles)
  - The expression MUST evaluate to a boolean (truthy/falsey).
  - The boolean is ONLY for routing; the payload passed to the next node remains the previous output.

WHEN TO USE structuredOutput:
- Use structuredOutput ONLY when a later code/condition needs to read specific fields.
- If downstream steps only need free-form text, DO NOT use structuredOutput.

STRUCTURED OUTPUT EXAMPLE (use if downstream code reads fields):
- prompt output JSON example: { "items": ["..."], "selected": "..." }
- then code can do: input.items, input.selected
`.trim();
