# Agent Files

Agent files define AI personas that can be invoked with `@agent-name` mentions.

## Format

```yaml
---
name: AgentName              # Required - Display name
role: Brief Role Description # Optional - What the agent does
expertise:                   # Optional - List of expertise areas
  - Area 1
  - Area 2
  - Area 3
tools:                       # Optional - MCP tools agent can use
  - tool-name
context_folders:             # Optional - Default folders to load
  - folder1/
  - folder2/
---

[Persona instructions in natural language]

The body contains the agent's persona, behavior guidelines, and instructions.
Write in second person ("You are..."). Be specific about:
- Personality traits
- Working style
- Rules to follow
- Output preferences
```

## Example: Financial Agent

```yaml
---
name: Betty
role: Senior Accountant & Financial Analyst
expertise:
  - Financial reporting
  - Tax compliance
  - QuickBooks integration
tools:
  - quickbooks
context_folders:
  - finance/
  - invoices/
---

You are Betty, a senior accountant with 20 years of experience. You are meticulous, detail-oriented, and always ensure compliance with regulations.

When analyzing financial data:
1. Always cross-reference multiple sources
2. Flag any discrepancies over $100
3. Provide both summary and detailed views
4. Include relevant tax implications
```

## Example: Writing Agent

```yaml
---
name: Alice
role: Content Editor & Writing Coach
expertise:
  - Content editing
  - Writing improvement
  - Grammar and style
---

You are Alice, an experienced content editor. You focus on clarity, conciseness, and engaging writing.

When reviewing content:
- Suggest improvements for clarity and flow
- Fix grammar and punctuation
- Maintain the author's voice
- Provide constructive feedback
```

## Minimal Agent (Body Only)

If you don't need metadata, just write the persona:

```markdown
You are a helpful assistant specialized in project management.
```

No frontmatter required! The engine handles both formats.

## Field Reference

### Required
- **Body text** - The persona instructions (always required)

### Optional (Frontmatter)
- `name` - Display name (defaults to filename)
- `role` - Brief description of role
- `expertise` - Array of expertise areas
- `tools` - Array of MCP tool names
- `context_folders` - Array of folders to auto-load

### Future Fields (Not Yet Implemented)
- `temperature` - AI temperature override
- `max_tokens` - Token limit override
- `model` - Model override
- `examples` - Few-shot examples

## Tips

1. **Be specific** - Clear instructions produce better results
2. **Use examples** - Show don't tell (list formats, tone, etc.)
3. **Set boundaries** - What should/shouldn't the agent do
4. **Test iteratively** - Refine based on actual responses
5. **Keep it simple** - Start minimal, add complexity as needed

## Invoking Agents

```markdown
@betty review @finance/Q4/ and summarize key findings
```

The agent's persona is automatically included in the AI prompt.

---

## Spark Syntax Conventions for Agents

When your agent references files and folders in responses, use proper Spark syntax:

**Files:** Use basename only (no path)
```
✅ Correct: @review-q4-finances
❌ Wrong:   @tasks/review-q4-finances
```

**Folders:** Always include trailing slash
```
✅ Correct: @tasks/, @invoices/, @finance/
❌ Wrong:   @tasks, @invoices, @finance
```

**Why?** This ensures references are properly decorated and clickable in Obsidian.

The system automatically reminds agents of these conventions in every prompt.

