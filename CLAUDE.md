# Spark - AI Automation Platform for Obsidian

This project builds a comprehensive AI automation platform that enables intelligent automation workflows within Obsidian vaults.

## Always-Apply Rules

These rules apply to EVERY session and task:

### Development Workflow

**Purpose:** Maximize autonomy, minimize token usage, ensure quality

#### Key Principles
- **Minimize token usage** – No over-verbose explanations
- **Track progress** – Use TODO lists when working through multi-step tasks
- **Keep plans concise** – High-level approach only, no code in plans
- **Self-validate** – Verify changes via console logs before asking for review
- **Be autonomous** – Work through all steps independently when possible

#### Workflow Steps

1. **Plan** - Understand requirements, review context, create TODO list
2. **Decision** - Figure out options, identify open questions
   - **Baseline Check**: Run `npm run check` to note current state
3. **Implementation** - Keep it minimal and elegant, respect existing patterns
4. **Check for Errors** - Run `npm run check` (daemon: tests+coverage, plugin: lint+format)
5. **Address Issues** - Fix problems, re-run check
6. **Check Coverage** - Maintain or improve test coverage
7. **Hot-Reload Verification** - Changes should auto-reload, rebuild manually if needed
8. **Self-Validation** - ALWAYS try to validate via console logs first
9. **User Feedback** - Only if unable to verify yourself

#### Key Commands
- `npm run check` – comprehensive validation
- See README or specs for launch instructions

#### Philosophy
- **Maximize autonomy** – work independently through all steps
- **Minimize token usage** – be concise
- **Minimal and elegant** over complex and comprehensive
- **Robust implementations** over quick workarounds
- **Respect patterns** that already exist
- **Test coverage** is a quality metric

---

### Debugging Approach

**Purpose:** Avoid overcomplicating bug fixes

#### Core Principles

1. **Understand Before Fixing** - Never write a fix without understanding the root cause
2. **Analyze Error Messages Carefully** - Error messages are hints, trace backwards
3. **Keep Fixes Minimal** - If your fix is >20 lines for a simple bug, you don't understand the problem
4. **Resist Premature Solutions** - Read, trace, understand THEN fix
5. **Question Your Assumptions** - Symptoms ≠ Root Cause

#### Anti-Patterns to Avoid
- ❌ Adding complexity to handle edge cases
- ❌ Working around symptoms
- ❌ Try-catch blocks to suppress errors
- ❌ Elaborate state management for edge cases

#### Debugging Checklist
Before writing any fix:
- [ ] Can you explain WHY the bug happens?
- [ ] Have you traced the execution flow?
- [ ] Did you analyze error messages for hints?
- [ ] Is there a simpler root cause you're missing?
- [ ] Would your fix be obvious to someone reading it later?

After implementing the fix:
- [ ] Run `npm run check` to validate

> "Debugging is twice as hard as writing the code in the first place. Therefore, if you write the code as cleverly as possible, you are, by definition, not smart enough to debug it." - Brian Kernighan

Write simple fixes. If it's complex, you're solving the wrong problem.

---

### TypeScript Standards

**Never use `any` type** - Use proper types, interfaces, union types, or generics instead.

**Type Organization:**
- All types in `src/types/` directory, organized by domain
- Interfaces: Prefix with `I` (e.g., `ISparkPlugin`)
- Extract shared types to avoid circular dependencies

**When types seem difficult:**
1. Stop and think: What is the actual type?
2. Check library docs for exported types
3. Use TypeScript utilities (`Partial<T>`, `Pick<T>`, `Omit<T>`)
4. Create a union: `string | number` is better than `any`

---

## Project Context Rules

For specific implementation details, refer to the comprehensive specs in `/specs/`:

### Architecture & Design
- `PRD.md` - Product requirements and vision
- `PRODUCT_ARCHITECTURE.md` - System architecture (plugin vs daemon)
- `ARCHITECTURE_QUESTIONS.md` - Key architectural decisions

### Implementation Specs
- `DAEMON_SPEC.md` - Daemon implementation details
- `PLUGIN_UI_SPEC.md` - Plugin UI design and behavior
- `MENTION_PARSER.md` - How mentions are parsed and processed
- `TRIGGER_SYSTEM_CLARIFIED.md` - Trigger system design
- `CONFIGURATION.md` - Configuration system
- `FILE_FORMATS.md` - File format specifications
- `RESULT_AND_ERROR_HANDLING.md` - How results and errors are handled

### Implementation Plans
- `IMPLEMENTATION_PLAN_DAEMON.md` - Daemon build phases
- `IMPLEMENTATION_PLAN_PLUGIN.md` - Plugin build phases
- `AI_IMPLEMENTATION.md` - AI integration approach
- `CHAT_FUNCTIONALITY.md` - Chat widget implementation

### Development
- `DEVELOPER_EXPERIENCE.md` - Developer tooling and workflow

**Note:** When working on a specific feature, READ the relevant spec file(s) from `/specs/` for detailed context.

---

## Quick Reference

**Project Structure:**
```
crossgen-spark/
├── daemon/          # Spark daemon (TypeScript)
├── plugin/          # Obsidian plugin (TypeScript)
├── example-vault/   # Test vault with .spark/ configuration
├── specs/           # Detailed specifications (READ THESE!)
└── .cursor/rules/   # Cursor-specific rules (mostly superseded by specs)
```

**Development:**
- Daemon: `cd daemon && npm run dev`
- Plugin: `cd plugin && npm run dev`
- Validation: `npm run check` (in daemon or plugin directory)

**Hot Reload:**
- Uses `tsx watch` for daemon (zero config, automatic restart)
- Config auto-reloads (no daemon restart needed)
- Plugin: standard Obsidian plugin hot reload

---

## Communication Protocol

**File System as API:**
- Plugin writes to files
- Daemon watches files
- Daemon processes and writes results
- Plugin displays notifications

**Zero dependencies** - Plugin works without daemon (writes files), daemon works without plugin (processes files).
