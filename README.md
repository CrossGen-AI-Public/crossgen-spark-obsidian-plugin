# Spark Assistant

[![Engine CI](https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/actions/workflows/engine-ci.yml/badge.svg)](https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/actions/workflows/engine-ci.yml)
[![Plugin CI](https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/actions/workflows/plugin-ci.yml/badge.svg)](https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/actions/workflows/plugin-ci.yml)

**Transform Obsidian into an intelligent business operating system powered by AI.**

Spark Assistant enables "markdown files triggering AI agents" - turning your Obsidian vault into a living, automated workspace where notes become actions, and simple text triggers complex workflows.

---

## 📑 Table of Contents

- [🎯 What is Spark?](#-what-is-spark)
- [🚀 Quick Start](#-quick-start)
- [🔧 CLI Commands](#-cli-commands)
- [📁 Repository Structure](#-repository-structure)
- [🎨 Features](#-features)
  - [Slash Commands](#slash-commands)
  - [Agent Mentions](#agent-mentions)
  - [Chat Assistant](#chat-assistant)
  - [Workflow Builder](#workflow-builder)
- [🏗️ Architecture](#-architecture)
- [📝 Configuration](#-configuration)
- [🔧 Development](#-development)
- [🐛 Troubleshooting](#-troubleshooting)
- [📚 Documentation](#-documentation)
- [🤝 Contributing](#-contributing)
- [🙏 Acknowledgments](#-acknowledgments)
- [📧 Contact](#-contact)

---

## 🎯 What is Spark?

Spark provides powerful interfaces for AI interaction in Obsidian:

1. **Command Palette** - Notion-style autocomplete for instant, atomic actions (`/summarize`, `@betty`)
2. **Chat Widget** - Persistent conversational AI with full vault context (Cmd+K)
3. **Workflow Builder** - Visual node editor for multi-step AI automations (Cmd+Shift+W)
4. **Automation Engine** - File changes trigger automated workflows

**Key Innovation:** All powered by a file-based architecture. The plugin writes markdown, a engine watches and processes, results appear automatically. No complex APIs, no fragile integrations—just files.

---

## 🚀 Quick Start

### Prerequisites

**Minimal requirements for fresh machines:**
- `curl` or `wget` (for downloading)
- `bash` (for running the script)
- `tar` (usually pre-installed)

That's it! No Node.js, npm, git, or other tools needed.

**Everything else is auto-installed:**
- ✅ Node.js 18+ (via nvm)
- ✅ npm (comes with Node.js)
- ✅ Obsidian (optional - example vault included)

**Development features (enable with DEV_MODE=1):**
- 🔧 Hot Reload plugin (auto-reload on changes)
- 🔧 GitHub CLI (for contributing)

> **Note:** API keys are managed securely in Obsidian plugin settings (`~/.spark/secrets.yaml`, encrypted)

### Installation

**One-Command Install (Easiest):**

Fresh machine? No problem! This installs everything:

```bash
# Install to example vault (for testing/development)
curl -fsSL https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install.sh | bash

# Or install to your vault
curl -fsSL https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install.sh | bash -s -- ~/Documents/MyVault
```

**What it does:**
- ✅ Installs Node.js via nvm (if needed)
- ✅ Downloads and builds Spark engine + plugin
- ✅ Auto-starts engine (configures vault)
- ✅ Ready for production use (add API key in plugin settings)

---

**Engine Only (for Community Plugins users):**

If you installed the Spark plugin from Obsidian Community Plugins, you only need the engine.

**Option 1: Install from Plugin (Recommended)**

The plugin will automatically detect if the engine is missing and prompt you to install it:
- A setup modal appears on first launch
- Or go to **Settings → Spark → Engine** and click "Install Spark Engine"
- The plugin can also auto-launch the engine when Obsidian starts

**Option 2: Manual Installation**

```bash
# Install engine via script
curl -fsSL https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install-engine.sh | bash

# Start the engine
spark start ~/Documents/MyVault
```

---

**For developers:**
```bash
# Enable development features (hot reload + gh CLI)
DEV_MODE=1 curl -fsSL https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install.sh | bash
```

**Environment flags:**
```bash
# Development mode (hot reload, gh CLI)
DEV_MODE=1 curl -fsSL https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install.sh | bash

# Skip Node.js installation (if you have it)
SKIP_NODE=1 curl -fsSL https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install.sh | bash

# Skip engine auto-start
AUTO_START=0 curl -fsSL https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install.sh | bash
```

---

**Development Setup (Clone First):**

```bash
# 1. Clone repository
git clone https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin.git
cd crossgen-spark

# 2. Run installer (sets up example-vault with hot reload)
./install.sh

# 3. Open example-vault in Obsidian
# - Plugins are auto-enabled (Spark + Hot Reload)
# - Add your API key in plugin settings (Settings → Spark → Advanced)
# - Ready for development!

# 5. Start engine
spark start example-vault
```

**Manual Installation:**

<details>
<summary>Click to expand manual installation steps</summary>

```bash
# 1. Clone repository
git clone https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin.git
cd spark

# 2. Install and build engine
cd engine
npm install
npm run build
npm link

# 3. Install and build plugin
cd ../plugin
npm install
npm run build

# 4. Copy plugin to your vault
mkdir -p ~/Documents/MyVault/.obsidian/plugins/spark
cp -r dist/* ~/Documents/MyVault/.obsidian/plugins/spark/

# 5. Enable plugin in Obsidian
# Settings → Community plugins → Enable "Spark"

# 6. Add API key in plugin settings
# Settings → Spark → Advanced → Add your API key for each provider

# 7. Start engine
spark start ~/Documents/MyVault
```

</details>

### First Steps

1. Open `example-vault` in Obsidian
2. Type `@` in any note to see available agents, type `/` to see available commands
3. Try `/summarize` or mention `@betty`
4. Press `Cmd+K` to open chat widget
5. For development: `cd plugin && npm run dev` for hot reload

---

## 🔧 CLI Commands

The `spark` CLI provides debugging and inspection tools:

```bash
# Engine control
spark start [vault-path]              # Start watching vault (foreground)
spark start ~/vault &                 # Run in background
spark start ~/vault --debug &         # Background with debug logging
nohup spark start ~/vault > ~/.spark/engine.log 2>&1 &  # Persistent background

spark status                          # Show all running engines
spark status ~/vault                  # Check specific vault
spark stop ~/vault                    # Stop engine gracefully
spark stop ~/vault --force            # Force stop (SIGKILL)

# Configuration
spark config [vault-path]             # Validate configuration
spark inspect [vault-path]            # Show vault info and config

# Debugging & History
spark history [vault-path]            # Show processing history and stats
spark history ~/vault --limit 20      # Show last 20 events
spark history ~/vault --stats         # Show statistics only
spark history ~/vault --clear         # Clear history

# Testing
spark parse <content>                 # Test parser on text
spark parse "@betty review @file.md"
spark parse tasks/todo.md --file      # Parse a file

# Info
spark version                         # Show version
spark --help                          # Show all commands
```

**Global Registry:** The engine maintains a registry at `~/.spark/registry.json` to track all running engines across different vaults.

### Running as a Background Service

**Simple background process:**
```bash
# Run in background
spark start ~/Documents/Vault &

# Check status
spark status

# Stop engine
spark stop ~/Documents/Vault

# Stop all engines
spark stop --all
```

---

## 📁 Repository Structure

```
spark/
├── README.md                          # This file
├── PRD.md                             # Original product requirements
├── ARCHITECTURE_QUESTIONS.md          # Architectural decisions
├── DECISIONS_STATUS.md                # Decision tracking
│
├── specs/                             # Detailed specifications & docs
│   ├── PRODUCT_ARCHITECTURE.md        # System architecture
│   ├── MENTION_PARSER.md              # Parsing @mentions and /commands
│   ├── DEVELOPER_EXPERIENCE.md        # DX roadmap and test coverage
│   ├── CI_CD_SETUP.md                 # GitHub Actions setup
│   ├── PLUGIN_PROGRESS.md             # Plugin implementation tracking
│   ├── ENGINE_PROGRESS.md             # Engine implementation tracking
│   ├── CONFIGURATION.md               # Config system
│   ├── FILE_FORMATS.md                # Command/agent/trigger formats
│   ├── PLUGIN_UI_SPEC.md              # Plugin interface design
│   ├── RESULT_AND_ERROR_HANDLING.md   # Result/error handling
│   ├── TRIGGER_SYSTEM_CLARIFIED.md    # Trigger automation
│   ├── IMPLEMENTATION_PLAN_PLUGIN.md  # Plugin implementation (4-6 weeks)
│   └── IMPLEMENTATION_PLAN_ENGINE.md  # Engine implementation (6-8 weeks)
│
├── example-vault/                     # Example Obsidian vault
│   ├── .spark/                        # Spark configuration
│   │   ├── config.yaml
│   │   ├── commands/
│   │   ├── agents/
│   │   └── triggers/
│   ├── emails/                        # Example email automation
│   ├── tasks/                         # Example task management
│   └── README.md
│
├── plugin/                            # Obsidian plugin (UI layer)
│   ├── src/
│   │   ├── main.ts
│   │   ├── settings.ts
│   │   ├── command-palette/           
│   │   ├── chat/
│   │   ├── workflows/                 # Workflow builder UI
│   │   │   ├── WorkflowCanvas.tsx     # React Flow canvas
│   │   │   ├── WorkflowView.tsx       # Obsidian ItemView
│   │   │   ├── WorkflowListView.tsx   # Workflow list/dashboard
│   │   │   ├── WorkflowManager.ts     # View management
│   │   │   ├── WorkflowStorage.ts     # Persistence layer
│   │   │   ├── Sidebar.tsx            # Properties/code/runs panel
│   │   │   ├── MentionTextarea.tsx    # @mention input component
│   │   │   ├── types.ts               # Shared types
│   │   │   └── nodes/                 # Node components
│   │   │       ├── PromptNode.tsx     # AI prompt step
│   │   │       ├── CodeNode.tsx       # JavaScript code step
│   │   │       └── ConditionNode.tsx  # Branching condition
│   │   └── types/
│   ├── dist/                          # Build output
│   └── package.json
│
└── engine/                            # Node.js engine (intelligence layer)
    ├── src/
    │   ├── cli.ts                     # CLI entry point
    │   ├── main.ts                    # Main orchestrator
    │   ├── cli/                       # CLI utilities (registry, inspector)
    │   ├── config/                    # Configuration management
    │   ├── watcher/                   # File system watching
    │   ├── parser/                    # Syntax parsing
    │   ├── context/                   # Context loading
    │   ├── logger/                    # Logging (Logger, DevLogger)
    │   ├── chat/                      # Chat queue handler
    │   ├── workflows/                 # Workflow execution engine
    │   │   ├── WorkflowExecutor.ts    # Queue processing, graph traversal
    │   │   ├── PromptRunner.ts        # AI prompt execution
    │   │   ├── CodeRunner.ts          # JavaScript code execution
    │   │   ├── ConditionRunner.ts     # Condition evaluation
    │   │   └── types.ts               # Shared types
    │   └── types/                     # TypeScript types
    ├── __tests__/                     # Test suite
    └── package.json
```

---

## 🎨 Features

### Slash Commands

Quick, inline actions triggered by typing `/`:

```markdown
/summarize

/extract-tasks

/email-draft
```

**How it works:**
1. Type `/` in any note
2. Fuzzy search shows available commands
3. Select and press Enter
4. AI processes and writes result

### Agent Mentions

Specialized AI personas with domain expertise:

```markdown
@betty review @tasks/review-q4-finances.md and check if all data sources are accessible

@alice edit @emails/draft-client-proposal.md for clarity and professionalism
```

**Available agents:**
- `@betty` - Senior Accountant & Financial Analyst (financial reporting, tax compliance, QuickBooks)
- `@alice` - Content Editor & Writing Coach (content editing, grammar, tone and voice)
- `@bob` - System Debugger & Context Validator (context validation, debugging with attitude)

**Create your own!** Add a new `.md` file to `.spark/agents/` with YAML frontmatter and instructions. The engine picks up new agents instantly — no restart needed.

**How it works:**
1. Type `@` to see agents and files
2. Chain together: agents, files, folders, services, commands
3. Engine parses and loads context based on proximity
4. AI executes with full context
5. Results appear in file with ✅

### Chat Assistant

Persistent conversational AI with vault awareness:

```
Press Cmd+K

You: @betty review @tasks/review-q4-finances.md

Betty: I see the Q4 financial review task.
       I'll need access to QuickBooks and finance data.
       Let me check the required data sources...

You: @alice can you improve @emails/draft-client-proposal.md?

Alice: I'll review your proposal for clarity and tone.
       Draft improvements will appear inline.
```

**How it works:**
1. Press `Cmd+K` to open floating chat widget
2. Full conversation history maintained in `.spark/conversations/`
3. Real-time responses from engine via file system
4. Mentions work same as in documents with auto-completion
5. Can reference files, folders, and agents naturally

### Workflow Builder

Visual workflow editor for creating multi-step AI automations:

```
Press Cmd+Shift+W or use "Spark: Open Workflows" command
```

**Step Types:**

| Step | Purpose | Example |
|------|---------|---------|
| **Prompt** | AI processing with @agent support | `@betty analyze $input and suggest improvements` |
| **Code** | JavaScript data transformation | `return { total: input.items.reduce((a,b) => a+b, 0) };` |
| **Condition** | Branch logic with loop detection | `input.score > 0.8` → true/false branches |

**How it works:**
1. Create workflows with drag-and-drop nodes
2. Connect nodes with edges (conditions support true/false branches)
3. Use `@agent` mentions in prompts to specify AI persona
4. Use `$input` and `$context` variables for data flow (type `$` for autocomplete)
5. Run workflow and monitor step execution in real-time
6. View run history with input/output for each step

**Architecture:**
```
┌─────────────────────────┐
│  PLUGIN (UI)            │
│  WorkflowCanvas         │
│  • React Flow editor    │
│  • Node properties      │
│  • Run history          │
└────────┬────────────────┘
         │ Saves to .spark/workflows/{id}.json
         │ Queues to .spark/workflow-queue/{runId}.json
         ▼
┌─────────────────────────┐
│  ENGINE (Execution)     │
│  WorkflowExecutor       │
│  • Graph traversal      │
│  • Loop detection       │
│  • Step runners         │
└─────────────────────────┘
```

**File Structure:**
```
.spark/
├── workflows/           # Workflow definitions
│   └── {id}.json        # Nodes, edges, settings
├── workflow-runs/       # Execution history
│   └── {workflowId}/
│       └── {runId}.json # Step results, input/output
└── workflow-queue/      # Pending executions
    └── {runId}.json     # Queue items for engine
```

**Loop Detection:**
- Global cycle limit (default: 10) prevents infinite loops
- Per-condition `maxCycles` setting for controlled iteration
- Visit counts tracked per node during execution

### Automation Triggers (Planned)

File changes will trigger automated workflows:

**Example: Kanban Email Automation**

```yaml
# .spark/triggers/email-automation.yaml
triggers:
  - name: send_email_on_status_change
    watch:
      directory: "emails/"
      frontmatter_field: status
      from_value: draft
      to_value: sent
    instructions: |
      1. Extract recipient from frontmatter
      2. Format content as email
      3. Send via $gmail
      4. Update sent_date
      5. Move to sent/ folder
```

**User workflow:**
1. Create email in `emails/` folder
2. Add frontmatter: `status: draft`
3. Write email content
4. When ready, change to `status: sent`
5. **Email automatically sent!**

---

## 🏗️ Architecture

### File-Based Event System

```
┌─────────────────────────┐
│  OBSIDIAN PLUGIN        │
│  (UI Only)              │
│  • Command palette      │
│  • Chat widget          │
│  • Notifications        │
└────────┬────────────────┘
         │
         │ Writes raw text to files
         ▼
┌─────────────────────────┐
│  FILE SYSTEM            │
│  (.md files in vault)   │
└────────┬────────────────┘
         │
         │ Watches for changes
         ▼
┌─────────────────────────┐
│  SPARK ENGINE           │
│  (All Intelligence)     │
│  • Parse mentions       │
│  • Load context         │
│  • Call Claude API      │
│  • Write results        │
└─────────────────────────┘
```

**Why this works:**
- ✅ Plugin can't crash engine
- ✅ Engine can't crash Obsidian
- ✅ Everything is inspectable (files)
- ✅ Version control friendly
- ✅ No complex IPC needed

### Mention System

Universal syntax for referencing anything:

| Syntax | Type | Example |
|--------|------|---------|
| `@name` | Agent | `@betty` |
| `@file.md` | File | `@agents.md` |
| `@folder/` | Folder | `@tasks/` |
| `/command` | Command | `/summarize` |
| `$service` | MCP Service | `$gmail` |
| `#tag` | Tag | `#urgent` |

**Context Priority:**
1. **Mentioned files** (highest priority)
2. **Current file** (where command typed)
3. **Sibling files** (same directory)
4. **Nearby files** (by path distance)
5. **Other vault files** (lowest priority)

---

## 📝 Configuration

### Main Config

`.spark/config.yaml` - System configuration

```yaml
version: 1
engine:
  debounce_ms: 300
  results:
    add_blank_lines: true

ai:
  defaultProvider: claude-agent
  providers:
    claude-client:
      type: anthropic
      model: claude-3-5-sonnet-20241022
      maxTokens: 4096
      temperature: 0.7
    claude-agent:
      type: anthropic
      model: claude-sonnet-4-5-20250929
      maxTokens: 4096
      temperature: 0.7
      # API keys are managed in plugin settings (~/.spark/secrets.yaml)

logging:
  level: info
  console: true

features:
  slash_commands: true
  chat_assistant: true
  trigger_automation: true
```

### Commands

`.spark/commands/my-command.md` - Define new slash commands

```markdown
---
id: my-command
name: My Custom Command
description: What it does
context: current_file
output: inline
---

Instructions for AI to execute...
```

### Agents

`.spark/agents/my-agent.md` - Define AI personas

```markdown
---
name: MyAgent
role: What they do
expertise:
  - Domain 1
  - Domain 2
tools:
  - service1
  - service2
---

You are an expert in...

When doing tasks:
1. Step 1
2. Step 2
```

### Triggers

`.spark/triggers/my-automation.yaml` - Define automated workflows

```yaml
triggers:
  - name: my_trigger
    description: When this happens
    watch:
      directory: "folder/"
      frontmatter_field: status
      to_value: active
    instructions: |
      What to do when triggered...
    priority: 10
```

---

## 🔧 Development

### Setup

**Prerequisites:**
- Node.js 18+
- npm or pnpm
- Git

**Quick setup for development:**
```bash
git clone https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin.git
cd spark

# Install everything (engine + plugin)
./install.sh

# Or install to a specific vault
./install.sh ~/Documents/MyVault
```

**Manual setup:**
```bash
# Install dependencies separately
cd plugin && npm install --legacy-peer-deps
cd ../engine && npm install
```

### Plugin Development

```bash
cd plugin
npm install
npm run dev         # Hot reload with esbuild

# Quality checks
npm run check       # Run all checks (format, lint, types)
npm run format      # Auto-format code
npm run lint:fix    # Auto-fix linting issues

```

### Engine Development

```bash
cd engine
npm install
npm run dev         # Watch mode
npm run check       # Format, lint, types, tests
npm test            # Run tests
```

### Quality Standards

The repository enforces strict quality standards through **automated checks**:

#### CI/CD Pipeline
✅ **Automated testing** on every PR and push to main
✅ **Multi-version testing** (Node 18.x and 20.x)
✅ **Coverage tracking** in CI logs (79% current)
✅ **Build validation** for both engine and plugin
❌ **Blocks merging** if checks fail

See [CI_CD_SETUP.md](specs/CI_CD_SETUP.md) for 2-minute setup.

#### Pre-Commit Hooks
✅ **Auto-fix** formatting and linting issues locally
✅ **Validate** types, tests, and code quality
❌ **Block commit** if any check fails

#### Running Checks Manually

```bash
# Check everything before committing (auto-fixes formatting & linting)
cd plugin && npm run check    # Plugin: format, lint, types
cd engine && npm run check    # Engine: format, lint, types, tests

# Individual fixes
npm run format                # Biome formatting
npm run lint:fix              # Biome linting auto-fixes
```

Run `npm run check` before committing to ensure all checks pass.

---

## 🐛 Troubleshooting

### Engine not processing files

```bash
spark status                          # Check engine status
spark start ~/vault --debug           # Restart with debug logging
```

### Commands not appearing

1. Check `.spark/commands/` exists
2. Verify frontmatter format
3. Reload Obsidian plugin

### Claude API errors

```bash
spark config ~/vault                  # Check configuration
spark inspect ~/vault                 # Inspect engine state (includes API key status)
```

#### Plugin Debugging
1. Open Obsidian Developer Tools: `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows)
2. Console shows plugin logs
3. Sources tab for breakpoints
4. Reload plugin: `Cmd+R` or Settings → Reload Plugins

---

## 📚 Documentation

- **[Product Architecture](specs/PRODUCT_ARCHITECTURE.md)** - System design
- **[Workflow Builder](specs/WORKFLOW_BUILDER_SPEC.md)** - Visual workflow editor
- **[Plugin UI Spec](specs/PLUGIN_UI_SPEC.md)** - Command palette & chat
- **[Mention Parser](specs/MENTION_PARSER.md)** - Parsing syntax
- **[Configuration](specs/CONFIGURATION.md)** - Config reference
- **[File Formats](specs/FILE_FORMATS.md)** - Command/agent/trigger formats
- **[Developer Experience](specs/DEVELOPER_EXPERIENCE.md)** - Testing & DX
- **[Engine README](engine/README.md)** - Engine-specific docs

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/name`
3. Make changes, add tests
4. Run `npm run check` in both plugin/ and engine/
5. Commit: `git commit -m "feat: description"`
6. Push and create PR

**Code Standards:**
- TypeScript strict mode
- No `any` types (engine)
- Biome (linting + formatting)
- Tests required (engine)

### Code Standards

**Enforced via pre-commit hooks:**
- ✅ **TypeScript** - All code in strict mode
- ✅ **No `any` types** - Engine enforces explicit typing
- ✅ **Biome** - Linting and formatting (strict rules, no unused vars - use `_prefix` for intentionally unused)
- ✅ **Tests** - Required for engine, all tests must pass
- ✅ **Conventional commits** - `feat:`, `fix:`, `docs:`, etc.

**Pre-commit checks will:**
1. Auto-fix formatting and linting issues
2. Run type checking
3. Run all tests (engine)
4. Block commit if any check fails

**Pro tip:** Run `npm run check` before committing to catch issues early!

### Areas to Contribute

- **Plugin UI/UX** - Improve command palette, chat widget, workflow builder
- **Workflow Builder** - New node types, execution features, templates
- **Engine Performance** - Optimize file watching, parsing
- **Documentation** - Examples, tutorials, guides
- **Testing** - Unit tests, integration tests (engine: 81 tests currently)
- **Commands/Agents** - New default commands and personas
- **Bug Fixes** - Check GitHub issues for open bugs

---

## 🐛 Troubleshooting

### Engine not processing files

```bash
# Check engine status
spark status

# View logs
tail -f ~/.spark/logs/engine.log

# Restart engine
spark stop
spark start ~/Documents/Vault
```

### Commands not appearing in palette

1. Check `.spark/commands/` folder exists
2. Verify command files have proper frontmatter
3. Reload Obsidian plugin
4. Check plugin console for errors

### Claude API errors

API keys are stored securely in `~/.spark/secrets.yaml` (encrypted). To check:

```bash
spark inspect ~/vault                 # Shows API key status
cat ~/.spark/secrets.yaml             # View encrypted secrets (Base64 encoded)
```

To troubleshoot:
1. Check API key is set in plugin settings (Settings → Spark → Advanced)
2. Verify provider configuration in `.spark/config.yaml`
3. Check engine logs in `.spark/logs/`

---

## 🙏 Acknowledgments

- **Anthropic** - Claude AI platform
- **Obsidian** - Knowledge management platform
- **MCP Protocol** - Model Context Protocol for service integrations

---

## 📧 Contact

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

---

**Transform your notes into actions. Turn your vault into an AI-powered operating system.**

Built with ❤️ for power users who want their tools to work *for* them.
