# Spark Assistant

**Transform Obsidian into an intelligent business operating system powered by AI.**

Spark Assistant enables "markdown files triggering AI agents" - turning your Obsidian vault into a living, automated workspace where notes become actions, and simple text triggers complex workflows.

---

## 📑 Table of Contents

- [🎯 What is Spark?](#-what-is-spark)
- [🚀 Quick Start](#-quick-start)
- [🔧 CLI Commands](#-cli-commands)
- [📁 Repository Structure](#-repository-structure)
- [🎨 Features](#-features)
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

Spark provides two powerful interfaces for AI interaction in Obsidian:

1. **Command Palette** - Notion-style autocomplete for instant, atomic actions (`/summarize`, `@betty`)
2. **Chat Widget** - Persistent conversational AI with full vault context (Cmd+K)
3. **Automation Engine** - File changes trigger automated workflows

**Key Innovation:** All powered by a file-based architecture. The plugin writes markdown, a daemon watches and processes, results appear automatically. No complex APIs, no fragile integrations—just files.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ 
- **Claude API key** (from Anthropic)
- **Obsidian** (optional - comes with example vault)

### Installation

**Development Setup (Recommended):**

```bash
# 1. Clone repository
git clone https://github.com/automazeio/crossgen-spark.git
cd crossgen-spark

# 2. Run installer (sets up example-vault with hot reload)
./install.sh

# 3. Set your API key
export ANTHROPIC_API_KEY=your_key_here

# 4. Open example-vault in Obsidian
# - Plugins are auto-enabled (Spark + Hot Reload)
# - Ready for development!

# 5. Start daemon
spark start example-vault
```

**Install to Your Vault:**

```bash
# Same steps, but specify your vault path
./install.sh ~/Documents/MyVault
spark start ~/Documents/MyVault
```

**Manual Installation:**

<details>
<summary>Click to expand manual installation steps</summary>

```bash
# 1. Clone repository
git clone https://github.com/automazeio/crossgen-spark.git
cd spark

# 2. Install and build daemon
cd daemon
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

# 5. Set API key
export ANTHROPIC_API_KEY=your_key_here

# 6. Enable plugin in Obsidian
# Settings → Community plugins → Enable "Spark"

# 7. Start daemon
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
# Daemon control
spark start [vault-path]              # Start watching vault (foreground)
spark start ~/vault &                 # Run in background
spark start ~/vault --debug &         # Background with debug logging
nohup spark start ~/vault > ~/.spark/daemon.log 2>&1 &  # Persistent background

spark status                          # Show all running daemons
spark status ~/vault                  # Check specific vault
spark stop ~/vault                    # Stop daemon gracefully
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

**Global Registry:** The daemon maintains a registry at `~/.spark/registry.json` to track all running daemons across different vaults.

### Running as a Background Service

**Simple background process:**
```bash
# Run in background
spark start ~/Documents/Vault &

# Check status
spark status

# Stop daemon
spark stop ~/Documents/Vault

# Stop all daemons
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
│   ├── DAEMON_PROGRESS.md             # Daemon implementation tracking
│   ├── CONFIGURATION.md               # Config system
│   ├── FILE_FORMATS.md                # Command/agent/trigger formats
│   ├── PLUGIN_UI_SPEC.md              # Plugin interface design
│   ├── RESULT_AND_ERROR_HANDLING.md   # Result/error handling
│   ├── TRIGGER_SYSTEM_CLARIFIED.md    # Trigger automation
│   ├── IMPLEMENTATION_PLAN_PLUGIN.md  # Plugin implementation (4-6 weeks)
│   └── IMPLEMENTATION_PLAN_DAEMON.md  # Daemon implementation (6-8 weeks)
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
│   │   └── types/
│   ├── dist/                          # Build output
│   └── package.json
│
└── daemon/                            # Node.js daemon (intelligence layer)
    ├── src/
    │   ├── cli.ts                     # CLI entry point
    │   ├── SparkDaemon.ts             # Main orchestrator
    │   ├── cli/                       # CLI utilities (registry, inspector)
    │   ├── config/                    # Configuration management
    │   ├── watcher/                   # File system watching
    │   ├── parser/                    # Syntax parsing
    │   ├── context/                   # Context loading
    │   ├── logger/                    # Logging (Logger, DevLogger)
    │   ├── chat/                      # Chat queue handler
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

**Create your own!** Add a new `.md` file to `.spark/agents/` with YAML frontmatter and instructions. The daemon picks up new agents instantly — no restart needed.

**How it works:**
1. Type `@` to see agents and files
2. Chain together: agents, files, folders, services, commands
3. Daemon parses and loads context based on proximity
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
3. Real-time responses from daemon via file system
4. Mentions work same as in documents with auto-completion
5. Can reference files, folders, and agents naturally

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
│  SPARK DAEMON           │
│  (All Intelligence)     │
│  • Parse mentions       │
│  • Load context         │
│  • Call Claude API      │
│  • Write results        │
└─────────────────────────┘
```

**Why this works:**
- ✅ Plugin can't crash daemon
- ✅ Daemon can't crash Obsidian
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
daemon:
  watch:
    patterns: ["**/*.md"]
    ignore: [".git/**", ".obsidian/**"]
  debounce_ms: 300

ai:
  provider: claude
  claude:
    model: claude-3-5-sonnet-20241022
    api_key_env: ANTHROPIC_API_KEY
    max_tokens: 4096

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
git clone https://github.com/automazeio/crossgen-spark.git
cd spark

# Install everything (daemon + plugin)
./install.sh

# Or install to a specific vault
./install.sh ~/Documents/MyVault
```

**Manual setup:**
```bash
# Install dependencies separately
cd plugin && npm install --legacy-peer-deps
cd ../daemon && npm install
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

### Daemon Development

```bash
cd daemon
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
✅ **Build validation** for both daemon and plugin
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
cd daemon && npm run check    # Daemon: format, lint, types, tests

# Individual fixes
npm run format                # Prettier formatting
npm run lint:fix              # ESLint auto-fixes
```

Run `npm run check` before committing to ensure all checks pass.

---

## 🐛 Troubleshooting

### Daemon not processing files

```bash
spark status                          # Check daemon status
spark start ~/vault --debug           # Restart with debug logging
```

### Commands not appearing

1. Check `.spark/commands/` exists
2. Verify frontmatter format
3. Reload Obsidian plugin

### Claude API errors

```bash
echo $ANTHROPIC_API_KEY               # Verify API key
spark config ~/vault                  # Check configuration
```

#### Plugin Debugging
1. Open Obsidian Developer Tools: `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows)
2. Console shows plugin logs
3. Sources tab for breakpoints
4. Reload plugin: `Cmd+R` or Settings → Reload Plugins

---

## 📚 Documentation

- **[Product Architecture](specs/PRODUCT_ARCHITECTURE.md)** - System design
- **[Mention Parser](specs/MENTION_PARSER.md)** - Parsing syntax
- **[Configuration](specs/CONFIGURATION.md)** - Config reference
- **[File Formats](specs/FILE_FORMATS.md)** - Command/agent/trigger formats
- **[Developer Experience](specs/DEVELOPER_EXPERIENCE.md)** - Testing & DX
- **[Daemon README](daemon/README.md)** - Daemon-specific docs

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/name`
3. Make changes, add tests
4. Run `npm run check` in both plugin/ and daemon/
5. Commit: `git commit -m "feat: description"`
6. Push and create PR

**Code Standards:**
- TypeScript strict mode
- No `any` types (daemon)
- ESLint + Prettier
- Tests required (daemon)

### Code Standards

**Enforced via pre-commit hooks:**
- ✅ **TypeScript** - All code in strict mode
- ✅ **No `any` types** - Daemon enforces explicit typing
- ✅ **ESLint** - Strict rules, no unused vars (use `_prefix` for intentionally unused)
- ✅ **Prettier** - Consistent formatting
- ✅ **Tests** - Required for daemon, all tests must pass
- ✅ **Conventional commits** - `feat:`, `fix:`, `docs:`, etc.

**Pre-commit checks will:**
1. Auto-fix formatting and linting issues
2. Run type checking
3. Run all tests (daemon)
4. Block commit if any check fails

**Pro tip:** Run `npm run check` before committing to catch issues early!

### Areas to Contribute

- **Plugin UI/UX** - Improve command palette, chat widget
- **Daemon Performance** - Optimize file watching, parsing
- **Documentation** - Examples, tutorials, guides
- **Testing** - Unit tests, integration tests (daemon: 81 tests currently)
- **Commands/Agents** - New default commands and personas
- **Bug Fixes** - Check GitHub issues for open bugs

---

## 🐛 Troubleshooting

### Daemon not processing files

```bash
# Check daemon status
spark status

# View logs
tail -f ~/.spark/logs/daemon.log

# Restart daemon
spark stop
spark start ~/Documents/Vault
```

### Commands not appearing in palette

1. Check `.spark/commands/` folder exists
2. Verify command files have proper frontmatter
3. Reload Obsidian plugin
4. Check plugin console for errors

### Claude API errors

```bash
# Verify API key
echo $ANTHROPIC_API_KEY

# Test API connection
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

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
