# Claude Agent SDK Migration Plan

**Status:** Phase 2 Complete + Enhanced Logging  
**Date:** October 24, 2025  
**Related Docs:** AI_IMPLEMENTATION.md, DAEMON_PROGRESS.md, PRD.md

---

## Decisions Made

**Date:** October 23, 2025

### Core Architectural Decisions
1. ✅ **SDK Context Management:** Hybrid approach - Keep our proximity-based context, disable SDK settings sources (`settingSources: []`)
2. ✅ **SDK Settings:** No .claude directories/files - Configure everything programmatically in code via `ClaudeAgentOptions`
3. ✅ **System Prompts:** Hybrid - SDK preset as base + Spark extensions + agent personas
4. ✅ **Agent Personas:** Hybrid - Store in .spark/agents/, format for SDK when loading
5. ✅ **Model Configuration:** Agent-specific for now (Global → Provider → Agent cascade)
6. ✅ **File Operations:** Sandbox mode - Allow vault access except system dirs (.spark/, .obsidian/, .git/, node_modules/, .trash/)
7. ✅ **Error Handling:** Follow existing ErrorHandler pattern (console + detailed logs)
8. ✅ **Message Completion:** Hybrid - Auto for simple commands, explicit trigger for complex
9. ✅ **Finalization Marker:** Yes - Use for inline chat UX to show "sent" state with decoration
10. ✅ **Plugin-Daemon Communication:** File-based (no change from current architecture)
11. ✅ **Provider Fallback:** Add interface in Phase 1, defer implementation
12. ✅ **Agent Config Types:** Add `ai:` section types now, modify later if needed
13. ✅ **Testing Strategy:** Mock providers, test factory logic, no API calls
14. ✅ **Migration:** Breaking changes OK (no users yet), no migration CLI needed

### Implementation Priorities
- **Phase 1 Focus:** Provider abstraction with fallback interface
- **No .claude Files:** All configuration in config.yaml and programmatic
- **Clean Separation:** Model-agnostic from the start
- **Sandbox First:** File operations restricted to safe areas

---

## Executive Summary

This document outlines the migration from `@anthropic-ai/sdk` to `@anthropic-ai/claude-agent-sdk` and the architectural evolution toward a model-agnostic design. The migration enables advanced file manipulation capabilities, better context management, and positions us for multi-provider support.

**Current State:**
- Using `@anthropic-ai/sdk` v0.30.0
- Direct API calls with manual prompt building
- Inline-only result writing
- Single AI provider (Claude)
- Manual context management

**Target State:**
- Using `@anthropic-ai/claude-agent-sdk`
- Leveraging agent SDK's built-in tools and context management
- File creation, editing, and multi-file operations
- Model-agnostic architecture supporting multiple AI providers
- Per-agent model configuration
- Flexible output modes (inline, chat, separate files)

---

## Current Architecture Analysis

### What's Implemented (Phase 4B Complete)

**Core Components:**
1. `ClaudeClient` - Wraps `@anthropic-ai/sdk` 
2. `PromptBuilder` - Manual prompt construction with context sections
3. `ContextLoader` - Loads mentioned files and nearby files by proximity
4. `CommandExecutor` - Orchestrates execution flow
5. `ResultWriter` - Writes results inline only

**Flow:**
```
FileChange → Parse → ContextLoader → PromptBuilder → ClaudeClient → ResultWriter (inline)
```

**Limitations:**
- Manual prompt building (system prompts, agent personas)
- Inline writing only (can't create/edit other files)
- Single provider tightly coupled
- No built-in tool use
- Limited file manipulation capabilities

---

## Agent SDK Capabilities & Mapping

### What Agent SDK Provides

**1. Built-in Context Management**
- Automatic file context handling
- Settings sources (user, project, local)
- System prompt presets (including `claude_code` preset)
- Custom slash commands support

**2. Tool Integration**
- MCP (Model Context Protocol) server integration
- Custom tool definitions
- Agent skills framework

**3. File Operations**
- Read files
- Edit files (not just inline)
- Create new files
- Multi-file operations

**4. Agent Configuration**
- Per-agent settings
- Custom system prompts
- Model selection per agent

### How This Maps to Spark Needs

| Spark Feature | Current Approach | Agent SDK Approach |
|--------------|------------------|-------------------|
| **Context Loading** | Manual ContextLoader | SDK context management + our proximity ranking |
| **System Prompts** | Manual in PromptBuilder | SDK preset system + custom prompts |
| **Agent Personas** | Load from .spark/agents/ | Integrate with SDK agent config |
| **File Operations** | Inline only via ResultWriter | SDK file tools (read/write/create) |
| **Commands** | Parse and execute ourselves | SDK slash command support |
| **Tools/MCP** | Not implemented yet | SDK built-in MCP support |

---

## Model-Agnostic Architecture Design

### Design Pattern: Strategy + Factory + Adapter

To support multiple AI providers without code changes, we'll use:

**1. Provider Interface (Strategy Pattern)**
```
interface IAIProvider {
  name: string;
  complete(options: ProviderCompletionOptions): Promise<ProviderResult>;
  supportsTools(): boolean;
  supportsFileOperations(): boolean;
  getAvailableModels(): string[];
}
```

**2. Provider Factory**
```
class AIProviderFactory {
  createProvider(config: AIProviderConfig): IAIProvider;
  registerProvider(name: string, factory: ProviderFactory): void;
}
```

**3. Provider Adapters**
- `ClaudeAgentProvider` - Wraps claude-agent-sdk
- `OpenAIProvider` - Wraps OpenAI SDK (future)
- `LocalLLMProvider` - Wraps local models (future)
- `AnthropicDirectProvider` - Direct API fallback

**4. Provider Registry**
```
ProviderRegistry:
  - claude-agent (primary)
  - claude-direct (fallback)
  - openai (future)
  - local (future)
```

### Configuration Structure

**Global Level (daemon-wide):**
```yaml
ai:
  default_provider: claude-agent
  providers:
    claude-agent:
      model: claude-3-5-sonnet-20241022
      api_key_env: ANTHROPIC_API_KEY
      max_tokens: 4096
      temperature: 0.7
      system_prompt_preset: claude_code  # Use SDK preset
      settings_sources: [project]  # Don't load user/local by default
    
    claude-direct:
      model: claude-3-5-sonnet-20241022
      api_key_env: ANTHROPIC_API_KEY
      max_tokens: 4096
      temperature: 0.7
    
    openai:  # Future
      model: gpt-4-turbo
      api_key_env: OPENAI_API_KEY
      max_tokens: 4096
      temperature: 0.7
```

**Agent Level (per-agent override):**
```yaml
# .spark/agents/betty.md
---
name: Betty
role: Senior Accountant
ai:
  provider: claude-agent  # Override to use specific provider
  model: claude-3-opus-20240229  # Betty gets the smarter model
  temperature: 0.3  # More deterministic for financial analysis
---

You are Betty, a senior accountant...
```

**Fallback Chain:**
```
Agent Config → Daemon Default → Hardcoded Fallback
```

---

## Migration Phases

### Phase 1: Abstraction Layer (Foundation)
**Goal:** Create provider-agnostic interfaces without breaking existing functionality

**Tasks:**
1. Define `IAIProvider` interface
2. Create `AIProviderFactory` 
3. Implement `ProviderRegistry`
4. Create `ClaudeDirectProvider` (wraps current ClaudeClient)
5. Update `CommandExecutor` to use `IAIProvider` interface
6. Add provider configuration to config types
7. Maintain backward compatibility (everything still works)

**Success Criteria:**
- All existing tests pass
- No functional changes
- Current ClaudeClient wrapped as provider
- Foundation for adding new providers

**Duration:** 2-3 days

---

### Phase 2: Agent SDK Integration (Core Migration)
**Goal:** Add claude-agent-sdk alongside existing provider

**Tasks:**
1. Install `@anthropic-ai/claude-agent-sdk`
2. Create `ClaudeAgentProvider` implementing `IAIProvider`
3. Map our context to SDK context format
4. Integrate SDK system prompt presets
5. Configure SDK settings sources
6. Add provider selection logic to CommandExecutor
7. Update configuration to support both providers

**Key Decisions:**
- How to merge our proximity-based context with SDK context?
- Do we use SDK's system prompt preset or keep ours?
- How to handle agent personas in SDK format?

**Success Criteria:**
- Can switch between claude-direct and claude-agent providers
- Same functionality with both providers
- SDK context properly loaded
- Tests pass for both providers

**Duration:** 3-4 days

---

### Phase 3: Enhanced File Operations
**Goal:** Leverage agent SDK's file operation capabilities

**Tasks:**
1. Extend `IAIProvider` with file operation methods
2. Implement file operations in `ClaudeAgentProvider`
3. Create new result writers:
   - `InlineResultWriter` (current)
   - `FileCreationWriter` (new files)
   - `MultiFileWriter` (edit multiple files)
4. Update result configuration to support new modes
5. Add file operation notifications

**New Result Modes:**
```yaml
daemon:
  results:
    mode: auto  # auto, inline, separate, multi-file
    inline_max_chars: 500
    separate_folder: reports/
    allow_file_creation: true
    allow_file_editing: true
    require_confirmation: false  # Future: UI confirmation
```

**Success Criteria:**
- Agent can create new files
- Agent can edit files other than the trigger file
- Proper notifications when files are modified
- User understands which files were changed

**Duration:** 3-4 days

---

### Phase 4: Per-Agent Configuration
**Goal:** Enable agent-specific model and provider settings

**Tasks:**
1. Extend agent frontmatter schema with `ai:` section
2. Update `ContextLoader` to parse agent AI config
3. Implement configuration cascade (agent → daemon → defaults)
4. Add validation for agent-specific configs
5. Update agent loading to pass config to provider
6. Create agent management utilities

**Agent Config Format:**
```yaml
# .spark/agents/betty.md
---
name: Betty
role: Senior Accountant
ai:
  provider: claude-agent
  model: claude-3-opus-20240229
  temperature: 0.3
  max_tokens: 8192
---
```

**Success Criteria:**
- Each agent can specify its own model
- Configuration properly cascades
- Invalid configs provide helpful errors
- Agent settings override daemon defaults

**Duration:** 2-3 days

---

### Phase 5: System Prompt & Persona Integration
**Goal:** Optimize system prompt handling with SDK capabilities

**Tasks:**
1. Evaluate SDK `claude_code` preset vs our custom prompt
2. Decide on hybrid approach (SDK preset + Spark extensions)
3. Update `PromptBuilder` to work with SDK preset system
4. Convert agent personas to SDK-compatible format
5. Test prompt effectiveness with both approaches

**Hybrid Approach:**
```
SDK Preset (claude_code) + Spark Extensions:
  - File reference syntax (@file, @folder/)
  - Proximity context explanation
  - Result writing instructions
  - Spark-specific conventions
```

**Success Criteria:**
- System prompts are concise and effective
- Agent personas properly integrated
- SDK preset enhances rather than conflicts
- File operations work as expected

**Duration:** 2 days

---

### Phase 6: Provider Cleanup & Testing
**Goal:** Finalize provider architecture and comprehensive testing

**Tasks:**
1. Remove or deprecate old ClaudeClient (keep as fallback)
2. Set claude-agent as default provider
3. Comprehensive testing of all providers
4. Performance benchmarking
5. Documentation updates
6. Migration guide for users

**Testing Matrix:**
```
Providers: [claude-agent, claude-direct]
Commands: [simple, complex, multi-file]
Agents: [default, betty, custom]
Result Modes: [inline, separate, multi-file]
```

**Success Criteria:**
- All tests pass for all providers
- Performance acceptable
- Documentation complete
- Smooth upgrade path

**Duration:** 2 days

---

## Context Management Strategy

### Current Context System (Keep)
Our proximity-based context loading is valuable and unique:
- Loads nearby files based on directory distance
- Ranks by proximity
- Provides summaries of low-priority files
- User-controlled via mentions

### Agent SDK Context System
The SDK provides:
- Settings sources (user, project, local)
- File loading
- System prompt management

### Integration Strategy: Hybrid Approach

**1. Use SDK for System-Level Context**
```
SDK provides:
  - System prompt preset
  - Settings from .claude/settings.json (if enabled)
  - Command definitions
  - Basic file operations
```

**2. Use Our Context for Spark-Specific Features**
```
Spark ContextLoader provides:
  - Proximity-based nearby files
  - Agent personas from .spark/agents/
  - Mentioned file resolution (@file, @folder/)
  - Priority-based context ranking
```

**3. Merge Strategy**
```
const context = {
  // SDK context (system prompt, settings)
  ...sdkContext,
  
  // Our proximity context
  files: [
    ...mentionedFiles,      // High priority
    currentFile,             // Medium priority
    ...nearbyFiles           // Low priority (ranked)
  ],
  
  // Agent persona
  agent: agentConfig
};
```

**Configuration:**
```yaml
ai:
  claude-agent:
    # SDK settings
    system_prompt_preset: claude_code
    settings_sources: [project]  # Only project-level .claude/settings.json
    
    # Spark extensions
    use_proximity_context: true
    max_nearby_files: 10
    proximity_max_distance: 3
```

---

## System Prompt & Persona Handling

### Current Approach
```
PromptBuilder manually constructs:
  <system> Spark syntax rules </system>
  <agent_persona> Betty's persona </agent_persona>
  <instructions> User command </instructions>
  <context> Files with priority </context>
```

### Agent SDK Approach
```
SDK provides:
  - System prompt presets (claude_code)
  - Custom system prompts
  - Agent configuration

Our agents stored in .spark/agents/*.md:
  - YAML frontmatter (metadata)
  - Markdown body (persona instructions)
```

### Recommended Hybrid Strategy

**1. Use SDK's `claude_code` Preset as Base**
- Provides solid foundation for coding/editing
- Includes file operation instructions
- Proven effective

**2. Extend with Spark Conventions**
```
SDK preset (claude_code) +
Spark extensions:
  - File reference syntax: @file (basename), @folder/ (trailing slash)
  - Priority context explanation
  - Result writing conventions
  - Status indicator meanings (⏳✅❌⚠️)
```

**3. Agent Personas as System Prompt Augmentation**
```
When agent specified:
  systemPrompt = `${sdkPreset}\n\n${agentPersona}`
  
Example:
  [claude_code preset]
  
  # Agent Persona
  You are Betty, a senior accountant with 20 years experience...
```

**Implementation:**
```yaml
ai:
  claude-agent:
    system_prompt:
      type: hybrid
      base_preset: claude_code  # SDK preset
      spark_extensions: true     # Add Spark conventions
      agent_persona: true        # Append agent persona when specified
```

---

## Future Features Consideration

### Inline Chats (Cursor-style)

**Challenge:** Current message detection uses debouncing + punctuation
**Problem:** Users can't write multiple sentences

**Solution: UI-Driven Message Completion**
- Plugin provides inline chat UI
- User types freely
- Explicit "send" trigger (button or hotkey)
- Daemon processes on trigger, not auto-detection

**Architecture:**
```
Plugin UI (inline chat) → 
  Command to daemon (message complete) →
    Agent SDK processes →
      Response written (inline or chat)
```

**Configuration:**
```yaml
features:
  inline_chats:
    enabled: true
    trigger_hotkey: "Cmd+Enter"
    auto_send_timeout: null  # Disabled, wait for explicit trigger
    show_typing_indicator: true
```

**Implementation Notes:**
- Requires plugin-daemon communication protocol
- Plugin sends explicit "message complete" signal
- Daemon doesn't try to auto-detect completion
- Better UX, more reliable

---

### Dynamic Chat Windows

**Concept:** Embedded chat windows within documents

**UX:**
```markdown
Regular content here...

┌─────────────────────────────────┐
│ Chat with @betty                │
├─────────────────────────────────┤
│ User: What's the burn rate?     │
│ Betty: $47K/month               │
│ User: Compare to Q3?            │
│ Betty: Q3 was $52K, down 9.6%   │
│ [Type message...]      [Send]   │
└─────────────────────────────────┘

More content here...
```

**Features:**
- Multiple independent chats per file
- Each maintains session state
- Scrollable with max height
- Can be collapsed/expanded
- Session persisted in .spark/conversations/

**Architecture Implications:**
```
Plugin: 
  - Renders chat UI
  - Manages session state
  - Sends messages to daemon
  
Daemon:
  - Processes each chat session independently
  - Maintains conversation history
  - Returns responses via notification system
  
Storage:
  - .spark/conversations/{file-hash}-{chat-id}.json
```

**Configuration:**
```yaml
features:
  chat_windows:
    enabled: true
    max_height: 400px
    persist_sessions: true
    max_sessions_per_file: 5
    show_timestamps: true
```

---

### Response Mode Selection

**User Choice:** When agent mentioned, offer response mode

**UX:**
```markdown
@betty review @finance/Q4/

[Inline Response] [Chat Window]
```

**Implementation:**
- Plugin detects agent mention
- Shows mode selection UI
- User chooses response destination
- Daemon processes accordingly
- Result written to chosen location

**Configuration:**
```yaml
daemon:
  results:
    default_mode: inline
    allow_mode_selection: true
    remember_user_preference: true  # Per-agent
```

---

### Customizable Trigger Characters

**Goal:** Prevent conflicts with other Obsidian plugins

**Current:**
- `@` for agents/files/folders
- `/` for commands
- `$` for services

**Configurable:**
```yaml
syntax:
  triggers:
    agent: "@"
    command: "/"
    service: "$"
    folder_suffix: "/"
  
  # Alternative set (if conflicts)
  # triggers:
  #   agent: "!@"
  #   command: "//"
  #   service: "$$"
```

**Implementation:**
- Update `MentionParser` to use configured triggers
- Validate no conflicts between triggers
- Update UI to show active triggers
- Migration path if user changes triggers

---

### Agents Management UI

**Goal:** User-friendly alternative to editing .spark/agents/ files

**Features:**
1. List all agents with metadata
2. Create new agent (form-based)
3. Edit agent configuration
4. Test agent prompt
5. Import/export agents
6. Enable/disable agents

**UI Sections:**
```
Agents Panel:
  ├── Agent List
  │   ├── betty (Accountant) [Edit] [Disable]
  │   ├── legal (Legal Advisor) [Edit] [Disable]
  │   └── analyst (Data Analyst) [Edit] [Disable]
  │
  ├── [+ New Agent]
  │
  └── Settings
      ├── Default Model: claude-3-5-sonnet
      ├── Default Temperature: 0.7
      └── [Import Agent Pack]

Agent Edit Form:
  Name: _________
  Role: _________
  Expertise: [Tags...]
  Model: [Dropdown]
  Temperature: [Slider]
  Max Tokens: _____
  
  Persona (markdown):
  ┌─────────────────────┐
  │                     │
  │ [Rich editor]       │
  │                     │
  └─────────────────────┘
  
  [Test Prompt] [Save] [Cancel]
```

**Implementation:**
- Plugin settings tab with agent management
- CRUD operations on .spark/agents/ files
- Live preview of agent configuration
- Validation before save
- Test mode (run sample command)

---

### Enhanced Output & Notifications

**Visual Decoration:**
```markdown
✅ @betty review @finance/Q4/

╔══════════════════════════════════════╗
║ 🤖 Betty (Accountant)                ║
╠══════════════════════════════════════╣
║ I've reviewed Q4 finances and found: ║
║                                      ║
║ • Revenue: $2.3M (+15%)              ║
║ • Expenses: $1.8M (-8%)              ║
║ • Profit: $500K (+23%)               ║
║                                      ║
║ See detailed analysis in:            ║
║ @reports/Q4-financial-review         ║
╚══════════════════════════════════════╝
```

**File Modification Notifications:**
```
When agent modifies file != current file:

┌────────────────────────────────────┐
│ 📝 Betty modified 2 files:         │
│   • reports/Q4-analysis.md (new)   │
│   • finance/summary.md (edited)    │
│                                    │
│ [View Changes] [Dismiss]           │
└────────────────────────────────────┘
```

**Implementation:**
- Custom CSS for agent responses
- Diff view for file changes
- Notification system tracks all file operations
- User can review changes before accepting (optional)

---

## Open Questions & Decisions Needed

### Context Management

**Q1: How much of SDK context management should we use?**

Options:
- A) Minimal - Only use SDK for system prompts, keep our context system
- B) Hybrid - Merge SDK context with our proximity ranking (RECOMMENDED)
- C) Full - Replace our ContextLoader with SDK's system

**Recommendation:** B (Hybrid)
- Keeps our valuable proximity-based ranking
- Leverages SDK for system prompts and settings
- Best of both worlds

**Q2: Should we load SDK settings sources by default?**

SDK can load from:
- User level: `~/.claude/settings.json`
- Project level: `.claude/settings.json` 
- Local level: `.claude/settings.local.json`

**Recommendation:** Project only
- Avoids unexpected behavior from user settings
- Keeps behavior predictable
- User can enable others if needed

```yaml
ai:
  claude-agent:
    settings_sources: [project]  # Only project-level
```

---

### System Prompts

**Q3: Should we use SDK's `claude_code` preset or our custom prompt?**

**Current Spark Prompt:**
```
<system>
File reference syntax rules...
</system>

<agent_persona>
Agent instructions...
</agent_persona>

<instructions>
User command...
</instructions>

<context priority="high">
Files...
</context>
```

**SDK `claude_code` Preset:**
- Optimized for code editing
- Includes file operation instructions
- Battle-tested

**Options:**
- A) Replace with SDK preset
- B) Keep our custom prompt
- C) Hybrid: SDK preset + Spark extensions (RECOMMENDED)

**Recommendation:** C (Hybrid)
```
Use SDK's claude_code preset as base, append:
  - Spark file reference syntax
  - Agent persona (if specified)
  - Priority context explanation
```

**Q4: How to handle agent personas?**

Options:
- A) Append to system prompt (current approach)
- B) Use SDK agent configuration system
- C) Hybrid: Store in .spark/agents/, format for SDK

**Recommendation:** C (Hybrid)
- Keep .spark/agents/ as source of truth
- Convert to SDK-compatible format when loading
- Users edit markdown files (easy)
- SDK gets properly formatted agent config

---

### Model Configuration

**Q5: How granular should model configuration be?**

Levels:
1. Global default (daemon-wide)
2. Provider-specific default
3. Agent-specific override
4. Command-specific override (future)
5. Runtime override (future)

**Recommendation:** Implement 1-3 now, plan for 4-5

```yaml
# Level 1: Global
ai:
  default_provider: claude-agent
  default_model: claude-3-5-sonnet-20241022

# Level 2: Provider-specific
  providers:
    claude-agent:
      model: claude-3-5-sonnet-20241022  # Override global

# Level 3: Agent-specific
# .spark/agents/betty.md
ai:
  model: claude-3-opus-20240229  # Betty gets better model

# Level 4: Command-specific (future)
# .spark/commands/deep-analysis.md
ai:
  model: claude-3-opus-20240229  # This command needs more reasoning

# Level 5: Runtime (future)
/summarize --model=claude-3-opus-20240229
```

---

### File Operations

**Q6: What file operation permissions should be default?**

SDK enables file creation/editing, but this could be dangerous.

Options:
- A) Allow all operations by default (trust the AI)
- B) Require explicit configuration per operation type
- C) Sandbox mode: only allowed directories (RECOMMENDED)

**Recommendation:** C (Sandbox with explicit allow list)

```yaml
daemon:
  file_operations:
    mode: sandbox  # sandbox, restricted, unrestricted
    
    allowed_operations:
      - read  # Always allowed
      - write_inline  # Write to trigger file
      - create_files  # Create new files
      - edit_files  # Edit other files
      - delete_files  # Dangerous!
    
    allowed_directories:
      - "reports/"
      - "drafts/"
      - "output/"
      - "!finance/"  # Explicit deny
    
    require_confirmation: false  # Future: UI confirmation
```

**Q7: How to handle file operations that fail?**

Options:
- A) Silent failure with log
- B) Error status in trigger file
- C) Notification + detailed log (RECOMMENDED)

**Recommendation:** C
- Update trigger line with ❌
- Show notification with details
- Write error log to .spark/logs/
- User can investigate

---

### Message Completion Detection

**Q8: How to improve message completion detection?**

**Current System:** Debouncer + punctuation check
**Problem:** Can't type multiple sentences

Options:
- A) Improve detection (longer timeout, better heuristics)
- B) Explicit trigger (button/hotkey in plugin)
- C) Hybrid: Auto for simple, explicit for complex (RECOMMENDED)

**Recommendation:** C (Hybrid)

```yaml
features:
  message_completion:
    auto_detection:
      enabled: true
      timeout_ms: 3000
      require_punctuation: true
      simple_commands_only: true  # Only for /command or single @mention
    
    explicit_trigger:
      enabled: true
      hotkey: "Cmd+Enter"
      show_button: true
      use_for_complex: true  # Multi-sentence, multiple mentions
```

**Logic:**
```
Is command simple? (single line, ends with punctuation)
  → Yes: Auto-detect after timeout
  → No: Wait for explicit trigger (show UI hint)
```

---

### Plugin-Daemon Communication

**Q9: How should plugin communicate message completion?**

Current: Plugin doesn't communicate, daemon auto-detects from file changes

Future with inline chats: Need explicit "message complete" signal

Options:
- A) File-based protocol (.spark/commands.jsonl)
- B) IPC (socket/pipe)
- C) HTTP (localhost server)

**Recommendation:** A (File-based) for MVP
- Consistent with current architecture
- Simple implementation
- No network/IPC complexity
- Can upgrade to B/C later if needed

```
.spark/commands.jsonl:
{"id": "cmd-123", "type": "send", "file": "note.md", "line": 42, "chat_id": "chat-1"}

Daemon watches this file, processes commands, removes entries when done.
```

---

### Agent SDK Settings vs Spark Configuration

**Q10: How to handle configuration overlap?**

SDK has settings.json, we have config.yaml

**Areas of Overlap:**
- Model selection
- Temperature, max_tokens
- System prompts
- File operation permissions

**Options:**
- A) Use only SDK settings.json (abandon config.yaml)
- B) Use only Spark config.yaml (ignore SDK settings)
- C) Merge: config.yaml primary, settings.json optional (RECOMMENDED)

**Recommendation:** C

```yaml
# config.yaml (primary)
ai:
  claude-agent:
    settings_sources: [project]  # Can load .claude/settings.json
    settings_priority: spark  # spark settings override SDK settings
    
    # If conflict:
    # config.yaml value wins
    # settings.json augments (adds to)
```

**Priority Chain:**
```
Agent Config → Daemon Config → SDK Settings → SDK Defaults
(highest)                                          (lowest)
```

---

### Provider Selection Logic

**Q11: How to handle provider fallbacks?**

Options:
- A) Hard fail if provider unavailable
- B) Automatic fallback to next provider
- C) Configurable fallback with notification (RECOMMENDED)

**Recommendation:** C

```yaml
ai:
  fallback:
    enabled: true
    chain:
      - claude-agent
      - claude-direct
      - openai  # If available
    
    notify_on_fallback: true
    retry_primary_after: 60s
```

**Behavior:**
```
1. Try claude-agent
2. If fails with network error → retry
3. If fails with API error → fallback to claude-direct
4. Notify user: "Using fallback provider due to..."
5. Retry primary after 60s
```

---

### Testing Strategy

**Q12: How to test provider abstraction without API calls?**

**Approach:**
1. Mock providers for unit tests
2. Test provider factory logic
3. Integration tests with test provider
4. E2E tests with real API (optional, gated)

```typescript
class MockProvider implements IAIProvider {
  complete(options) {
    return {
      content: "Mock response",
      usage: { inputTokens: 100, outputTokens: 50 }
    };
  }
}

// In tests
providerFactory.register('mock', () => new MockProvider());
config.ai.provider = 'mock';
```

---

### Migration Path for Users

**Q13: How to handle breaking changes?**

**Breaking Changes:**
- Agent SDK requires different configuration
- File operation permissions may restrict existing workflows
- System prompt changes may affect behavior

**Options:**
- A) Breaking release (v2.0)
- B) Gradual migration with feature flags
- C) Automatic migration + compatibility mode (RECOMMENDED)

**Recommendation:** C

```yaml
# Auto-detect old config format, migrate on startup
# Save backup at .spark/config.yaml.backup

version: 2.0  # New version

migration:
  from_version: 1.0
  compatibility_mode: true  # Use old behavior where possible
  warnings: []  # List of things that changed
```

**Migration Script:**
```bash
spark migrate --from=1.0 --to=2.0 --dry-run
spark migrate --from=1.0 --to=2.0 --apply
```

---

## Implementation Checklist

### Phase 1: Abstraction Layer 🔨 In Progress
**Started:** October 23, 2025

- [ ] Define `IAIProvider` interface (with fallback support)
- [ ] Add agent AI config types to agent frontmatter schema
- [ ] Create `AIProviderFactory` class
- [ ] Implement `ProviderRegistry` singleton
- [ ] Create `ClaudeDirectProvider` (wraps current ClaudeClient)
- [ ] Update `CommandExecutor` to use `IAIProvider`
- [ ] Add provider configuration types (no .claude support)
- [ ] Update config.yaml schema for multi-provider
- [ ] Update ConfigValidator for provider configs
- [ ] Add provider-specific error codes to ErrorHandler
- [ ] Write unit tests for provider abstraction
- [ ] Ensure all existing tests pass

### Phase 2: Agent SDK Integration ⏳ Not Started
- [ ] Install `@anthropic-ai/claude-agent-sdk`
- [ ] Create `ClaudeAgentProvider` class
- [ ] Implement context mapping (Spark → SDK)
- [ ] Configure SDK system prompt preset
- [ ] Configure SDK settings sources
- [ ] Add provider selection logic to CommandExecutor
- [ ] Update config to support agent SDK options
- [ ] Test both providers (claude-direct vs claude-agent)
- [ ] Verify same output for same input
- [ ] Write integration tests

### Phase 3: Enhanced File Operations ⏳ Not Started
- [ ] Extend `IAIProvider` with file operation methods
- [ ] Implement file operations in `ClaudeAgentProvider`
- [ ] Create `FileCreationWriter` class
- [ ] Create `MultiFileWriter` class
- [ ] Update result configuration schema
- [ ] Add file operation notifications
- [ ] Implement file operation sandboxing
- [ ] Add permission checks
- [ ] Test file creation
- [ ] Test multi-file editing
- [ ] Write file operation tests

### Phase 4: Per-Agent Configuration ⏳ Not Started
- [ ] Extend agent frontmatter schema with `ai:` section
- [ ] Update agent YAML type definitions
- [ ] Update `ContextLoader` to parse agent AI config
- [ ] Implement configuration cascade logic
- [ ] Add validation for agent configs
- [ ] Update agent loading in CommandExecutor
- [ ] Test config cascade (agent → daemon → default)
- [ ] Test invalid config handling
- [ ] Document agent configuration
- [ ] Update example agents

### Phase 5: System Prompt Integration ⏳ Not Started
- [ ] Research SDK `claude_code` preset effectiveness
- [ ] Design hybrid prompt strategy
- [ ] Update `PromptBuilder` for SDK preset support
- [ ] Add Spark extensions to SDK preset
- [ ] Convert agent personas to SDK format
- [ ] Test prompt effectiveness
- [ ] Compare outputs (old vs new prompts)
- [ ] Document prompt structure
- [ ] Update agent persona guidelines

### Phase 6: Cleanup & Polish ⏳ Not Started
- [ ] Set claude-agent as default provider
- [ ] Mark old ClaudeClient as deprecated (keep for fallback)
- [ ] Write comprehensive tests for all providers
- [ ] Performance benchmarking
- [ ] Memory usage analysis
- [ ] Update all documentation
- [ ] Write migration guide
- [ ] Create example configurations
- [ ] Update README
- [ ] Tag release

---

## Success Metrics

### Functional Requirements
- [ ] Can use multiple AI providers without code changes
- [ ] Agent SDK file operations work (create, edit, delete)
- [ ] Per-agent model configuration functional
- [ ] System prompts integrate cleanly with SDK
- [ ] Context management maintains proximity ranking
- [ ] All existing functionality preserved

### Performance Requirements
- [ ] Response time < 200ms overhead (provider abstraction)
- [ ] Memory usage < 10% increase
- [ ] File operations complete in < 100ms
- [ ] Context loading time unchanged or better

### Code Quality Requirements
- [ ] Test coverage > 80%
- [ ] No `any` types
- [ ] All linter rules passing
- [ ] TypeScript strict mode
- [ ] No deprecated API usage

### User Experience Requirements
- [ ] Smooth migration path (no data loss)
- [ ] Clear error messages
- [ ] Helpful documentation
- [ ] Example configurations
- [ ] Backward compatibility where possible

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Agent SDK changes behavior** | High | Medium | Extensive testing, A/B comparison, fallback to direct provider |
| **Performance degradation** | Medium | Low | Benchmarking, profiling, optimization, caching |
| **Breaking user configs** | High | Medium | Auto-migration, compatibility mode, clear upgrade guide |
| **Provider abstraction too complex** | Medium | Low | Keep interface simple, comprehensive docs, examples |
| **Context integration issues** | High | Medium | Thorough testing, hybrid approach allows rollback |
| **File operation security** | High | Low | Sandboxing, explicit permissions, confirmation mode |

---

## Timeline Estimate

### Optimistic: 12-15 days
- Phase 1: 2 days
- Phase 2: 3 days
- Phase 3: 3 days
- Phase 4: 2 days
- Phase 5: 2 days
- Phase 6: 2 days

### Realistic: 18-22 days
- Phase 1: 3 days
- Phase 2: 4 days
- Phase 3: 4 days
- Phase 4: 3 days
- Phase 5: 2 days
- Phase 6: 3 days
- Buffer: 1-2 days

### Pessimistic: 25-30 days
- Unforeseen SDK issues: +3 days
- Context integration complexity: +3 days
- Testing and bug fixes: +4 days

**Recommended:** Plan for realistic timeline (3-4 weeks)

---

## Next Steps

1. **Review this plan** - Discuss open questions and decisions
2. **Make key decisions** - Context strategy, system prompts, permissions
3. **Begin Phase 1** - Abstraction layer (non-breaking)
4. **Iterate** - Get Phase 1 working before moving to Phase 2
5. **Test continuously** - Don't wait until the end

## Questions for Discussion

**High Priority (Block Phase 2):**
1. Q1: How much SDK context management? (Recommend: Hybrid)
2. Q3: SDK preset or custom prompt? (Recommend: Hybrid)
3. Q6: File operation permissions? (Recommend: Sandbox)

**Medium Priority (Block Phase 3-4):**
4. Q5: Model configuration granularity? (Recommend: Global + Provider + Agent)
5. Q7: File operation error handling? (Recommend: Notification + Log)
6. Q10: Config overlap handling? (Recommend: Spark primary, SDK optional)

**Low Priority (Can defer):**
7. Q8: Message completion detection? (Recommend: Hybrid auto + explicit)
8. Q11: Provider fallback strategy? (Recommend: Configurable chain)
9. Q13: Migration path? (Recommend: Auto-migration + compatibility)

---

## Progress Log

### October 23, 2025
- ✅ Created migration plan
- ✅ Made all architectural decisions (see Decisions Made section)
- ✅ **Phase 1: Abstraction Layer Complete**

### Phase 1 Progress
- [x] Types and interfaces defined
- [x] Provider factory implemented
- [x] ClaudeDirectProvider created
- [x] CommandExecutor refactored
- [x] Tests passing (447/447 - all tests updated)

### October 24, 2025
- ✅ **Phase 2: Claude Agent SDK Integration Complete**

### Phase 2 Progress
- [x] Installed `@anthropic-ai/claude-agent-sdk` v0.1.26
- [x] Installed `zod` for tool schema definitions
- [x] Created `ClaudeAgentProvider` implementing `IAIProvider`
- [x] Implemented file operations support (read_file, write_file tools)
- [x] Implemented hybrid context management (proximity + SDK tools)
- [x] Implemented hybrid system prompt (SDK + our conventions + agent personas)
- [x] Registered `claude-agent` provider in SparkDaemon
- [x] Added `claude-agent` provider to example config.yaml
- [x] Updated AIProviderFactory to pass vaultPath via config.options
- [x] Added tests for ClaudeAgentProvider (16 passed, 3 skipped for complex SDK mocking)
- [x] All tests passing (26 suites, 460 tests, 6 skipped)
- [x] Verified both providers registered via `spark inspect`

### Phase 2+ (Enhanced Logging & Tool Usage)
- [x] Fixed tool names: `Read`, `Write`, `Edit` (capitalized, per SDK docs)
- [x] Implemented SDK hooks for tool usage logging (PreToolUse, PostToolUse)
- [x] Enhanced context logging in CommandExecutor (file paths + priorities visible in debug mode)
- [x] Tool usage now logged at INFO level: `🔧 Tool: Write` with input parameters
- [x] Tool results logged at DEBUG level: `✅ Tool result: Write` with output
- [x] All tests passing (26 suites, 460 tests, 6 skipped)

### Phase 3 (Per-Agent Model Selection)
- [x] Extended agent frontmatter schema with `ai:` section support
- [x] Added `AgentAIConfig` type to context types
- [x] Updated `ContextLoader` to extract AI config from agent frontmatter using `FrontmatterParser`
- [x] Added `extractAgentAIConfig()` method for robust AI config parsing
- [x] Updated `CommandExecutor` to log selected provider and model with agent overrides
- [x] Added `getConfig()` method to `IAIProvider` interface
- [x] Implemented `getConfig()` in `ClaudeAgentProvider` and `ClaudeDirectProvider`
- [x] Agent AI config supports: `provider`, `model`, `temperature`, `maxTokens`
- [x] Debug logs show model used when agent processes response
- [x] Example agent (Mykola) updated with AI config demonstration
- [x] All tests passing (28 suites, 497 tests, 6 skipped)

**Key Features Implemented:**
- Simplified: Uses SDK's built-in file operations (no custom MCP server needed)
- File sandboxing via `cwd` option (SDK handles this automatically)
- Async generator handling for SDK query results
- API key isolation (temporary env var swap during execution)
- Fallback provider support
- Health checks
- Full IAIProvider interface compliance

**Architectural Decision:**
The Claude Agent SDK includes built-in file operation tools (read, write, edit). We don't need to create custom MCP servers - just set the `cwd` option and the SDK handles file operations with proper sandboxing. This keeps the implementation simple and leverages the SDK's native capabilities.

---

**Phase 2 complete! Both `claude-client` and `claude-agent` providers are now available.**

**Phase 3 complete! Per-agent model selection now fully functional.**

---

## Per-Agent Model Selection

### Overview
Agents can now specify their own AI configuration in their frontmatter, overriding daemon-level defaults. This enables fine-grained control over which model, temperature, and other settings each agent uses.

### Configuration Format

```yaml
# .spark/agents/betty.md
---
name: Betty
role: Senior Accountant
expertise:
  - Financial reporting
  - Tax compliance
tools:
  - Read
  - Write
  - Edit
ai:
  provider: claude-agent          # Optional: Override provider
  model: claude-opus-4-20250514   # Optional: Override model
  temperature: 0.3                # Optional: Override temperature (0.0-1.0)
  maxTokens: 8192                 # Optional: Override max tokens
---

You are Betty, a senior accountant...
```

### Configuration Cascade

The AI configuration follows a clear priority chain:

1. **Agent-level** (`ai:` in agent frontmatter) - Highest priority
2. **Daemon-level** (`ai.providers.{name}` in config.yaml) - Medium priority
3. **Provider defaults** (hardcoded in provider class) - Lowest priority

Only specified fields are overridden; unspecified fields fall through to the next level.

### Example Use Cases

**Specialized Agent for Complex Tasks:**
```yaml
# .spark/agents/analyst.md
---
name: Data Analyst
ai:
  model: claude-opus-4-20250514  # Use most capable model for analysis
  temperature: 0.2                # Lower temp for deterministic output
  maxTokens: 16000                # Higher token limit for detailed reports
---
```

**Fast Agent for Simple Tasks:**
```yaml
# .spark/agents/summarizer.md
---
name: Quick Summarizer
ai:
  model: claude-sonnet-4-20250514  # Use faster model
  temperature: 0.7                  # Standard creativity
  maxTokens: 2048                   # Lower limit for concise output
---
```

**Provider Override:**
```yaml
# .spark/agents/tester.md
---
name: Test Agent
ai:
  provider: claude-client  # Use direct API instead of agent SDK
---
```

### Debug Logging

When an agent with AI config is invoked, the logs show:

```
[DEBUG] Agent AI config loaded {
  agent: 'mykola',
  provider: undefined,
  model: 'claude-sonnet-4-5-20250929',
  temperature: 0.8,
  maxTokens: undefined
}

[DEBUG] Provider selected {
  provider: 'claude-agent',
  type: 'claude',
  model: 'claude-sonnet-4-5-20250929',
  hasAgentOverrides: true,
  agentProvider: undefined,
  agentModel: 'claude-sonnet-4-5-20250929'
}
```

This makes it easy to verify which model is being used for each agent invocation.

### Implementation Details

- **Type-safe parsing**: AI config extraction validates types at runtime
- **Partial overrides**: Only specified fields override defaults
- **No config required**: Agents work fine without `ai:` section
- **Backward compatible**: Existing agents without `ai:` section continue to work
- **Frontmatter parser**: Uses `FrontmatterParser` with `gray-matter` for robust YAML parsing

