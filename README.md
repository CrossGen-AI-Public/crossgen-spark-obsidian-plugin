# Spark Assistant

[![Daemon Tests](https://img.shields.io/badge/daemon%20tests-264%20passing-brightgreen)](https://github.com/YOUR_USERNAME/crossgen-spark/actions/workflows/daemon-ci.yml)
[![Plugin Build](https://img.shields.io/badge/plugin-build%20passing-brightgreen)](https://github.com/YOUR_USERNAME/crossgen-spark/actions/workflows/plugin-ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-79%25-brightgreen)](#testing)

> **Note:** Replace `YOUR_USERNAME` with your GitHub username in workflow files. See [CI_CD_SETUP.md](CI_CD_SETUP.md) for setup.

**Transform Obsidian into an intelligent business operating system powered by AI.**

Spark Assistant enables "markdown files triggering AI agents" - turning your Obsidian vault into a living, automated workspace where notes become actions, and simple text triggers complex workflows.

---

## 🎯 What is Spark?

Spark provides two powerful interfaces for AI interaction in Obsidian:

1. **Command Palette** - Notion-style autocomplete for instant, atomic actions (`/summarize`, `@betty`)
2. **Chat Widget** - Persistent conversational AI with full vault context (Cmd+K)
3. **Automation Engine** - File changes trigger automated workflows (Kanban → Email)

**Key Innovation:** All powered by a file-based architecture. The plugin writes markdown, a daemon watches and processes, results appear automatically. No complex APIs, no fragile integrations—just files.

---

## 🚀 Quick Start

### Prerequisites

- **Obsidian** vault
- **Node.js** 18+ 
- **Claude API key** (from Anthropic)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/yourorg/spark.git
cd spark

# 2. Set up environment
export ANTHROPIC_API_KEY=your_key_here

# 3. Install daemon
cd spark-daemon
npm install
npm run build
npm link

# 4. Start daemon (points to your vault)
spark start ~/Documents/MyVault

# 5. Install Obsidian plugin
cd ../obsidian-spark
npm install
npm run build
# Copy to vault/.obsidian/plugins/spark/

# 6. Enable plugin in Obsidian settings
```

### First Steps

1. Open Obsidian
2. Type `/summarize` in any note
3. Watch as AI creates a summary
4. Press `Cmd+K` to open chat
5. Ask: `@betty what's in @finance/Q4/`

---

## 📁 Repository Structure

```
spark/
├── README.md                          # This file
├── PRD.md                             # Original product requirements
├── ARCHITECTURE_QUESTIONS.md          # Architectural decisions
├── DECISIONS_STATUS.md                # Decision tracking
│
├── specs/                             # Detailed specifications
│   ├── PRODUCT_ARCHITECTURE.md        # System architecture
│   ├── MENTION_PARSER.md              # Parsing @mentions and /commands
│   ├── CONFIGURATION.md               # Config system
│   ├── FILE_FORMATS.md                # Command/agent/trigger formats
│   ├── PLUGIN_UI_SPEC.md              # Plugin interface design
│   ├── RESULT_AND_ERROR_HANDLING.md   # Result/error handling
│   └── TRIGGER_SYSTEM_CLARIFIED.md    # Trigger automation
│
├── implementation-plans/              # Build guides
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
│   │   ├── command-palette/           # ✅ Complete
│   │   ├── chat-widget/               # 🚧 TODO
│   │   └── types/
│   ├── dist/                          # Build output
│   ├── PLUGIN_PROGRESS.md             # Detailed progress tracking
│   └── package.json
│
└── spark-daemon/                      # Node.js daemon (intelligence layer)
    ├── src/
    │   ├── watcher/
    │   ├── parser/
    │   ├── context/
    │   └── ai/
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
@betty review @finance/Q4/ comparing with $quickbooks, flag issues in @compliance-rules.md
```

**Available agents:**
- `@betty` - Senior Accountant (financial analysis, QuickBooks)
- `@analyst` - Business Analyst (data analysis, reporting)
- `@legal` - Legal Advisor (contract review, compliance)

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

You: @betty what's our burn rate for Q4?

Betty: Let me analyze @finance/Q4/...
       Your burn rate is $34,333/month
       That's a 9.2% reduction from Q3!

You: Create an email summary for investors

Betty: Draft created at @emails/investor-update.md
```

**How it works:**
1. Press `Cmd+K` to open chat
2. Full conversation history maintained
3. Access to entire vault + proximity context
4. Mentions work same as in documents
5. Can execute commands inline

### Automation Triggers

File changes trigger automated workflows:

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
| `@file.md` | File | `@report.md` |
| `@folder/` | Folder | `@finance/Q4/` |
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

**Clone and install:**
```bash
git clone https://github.com/yourorg/spark.git
cd spark

# Install dependencies for both projects
cd plugin && npm install
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

# In Obsidian: Enable "Developer Mode" in settings
# Reload plugin after changes (Cmd+R or Ctrl+R)
```

### Daemon Development

```bash
cd daemon
npm install
npm run dev         # Watch mode with hot reload

# Test with example vault
npm start -- ../example-vault

# Quality checks
npm run check       # Run all checks (format, lint, types, tests)
npm run format      # Auto-format code
npm run lint:fix    # Auto-fix linting issues
npm test            # Run all tests (81 tests)
npm run test:watch  # Watch mode for tests
```

### Quality Standards

The repository enforces strict quality standards through **automated checks**:

#### CI/CD Pipeline
✅ **Automated testing** on every PR and push to main
✅ **Multi-version testing** (Node 18.x and 20.x)
✅ **Coverage tracking** in CI logs (79% current)
✅ **Build validation** for both daemon and plugin
❌ **Blocks merging** if checks fail

See [CI_CD_SETUP.md](CI_CD_SETUP.md) for 2-minute setup.

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

**Note:** `npm run check` in both projects automatically fixes formatting and linting issues before running validation checks.

#### What Gets Checked

| Check | Plugin | Daemon |
|-------|--------|--------|
| **Format** | ✅ Prettier | ✅ Prettier |
| **Lint** | ✅ ESLint (strict) | ✅ ESLint (strict, no `any`) |
| **Types** | ✅ TypeScript | ✅ TypeScript (strict mode) |
| **Tests** | _(coming soon)_ | ✅ Jest (81 tests, must pass) |

### Testing

#### Daemon Tests
```bash
cd daemon

# Run all tests (221 tests)
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# With coverage report
npm run test:coverage

# Run specific test file
npm test MentionParser.test.ts
```

**Coverage:** 79% (threshold: 78%) - Run `npm run test:coverage` to view detailed report at `coverage/index.html`

See [DEVELOPER_EXPERIENCE.md](DEVELOPER_EXPERIENCE.md) for detailed test status and CI/CD logs for real-time coverage.

#### Plugin Tests
🚧 Coming soon - test infrastructure planned for Phase 4

### Debugging

#### Daemon Debugging
```bash
# View daemon logs
tail -f ~/.spark/logs/daemon.log

# Debug mode (verbose logging)
LOG_LEVEL=debug npm run dev

# Test with example vault
npm start -- ../example-vault
```

#### Plugin Debugging
1. Open Obsidian Developer Tools: `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows)
2. Console shows plugin logs
3. Sources tab for breakpoints
4. Reload plugin: `Cmd+R` or Settings → Reload Plugins

---

## 📚 Documentation

### Specifications

- **[Product Architecture](PRODUCT_ARCHITECTURE.md)** - System design and components
- **[Mention Parser](MENTION_PARSER.md)** - How mentions are parsed and resolved
- **[Configuration](CONFIGURATION.md)** - Config files and options
- **[File Formats](FILE_FORMATS.md)** - Command/agent/trigger format reference
- **[Plugin UI](PLUGIN_UI_SPEC.md)** - Plugin interface design
- **[Triggers](TRIGGER_SYSTEM_CLARIFIED.md)** - Automation system
- **[Error Handling](RESULT_AND_ERROR_HANDLING.md)** - Result and error handling

### Implementation

- **[Plugin Plan](specs/IMPLEMENTATION_PLAN_PLUGIN.md)** - 6 phases, 4-6 weeks
- **[Daemon Plan](specs/IMPLEMENTATION_PLAN_DAEMON.md)** - 7 phases, 6-8 weeks
- **[Plugin Progress](PLUGIN_PROGRESS.md)** - Detailed task tracking (Phase 2 ✅)
- **[Fuzzy Matching Analysis](FUZZY_MATCHING_IMPROVEMENTS.md)** - Algorithm review and improvements

### Examples

- **[Example Vault](example-vault/)** - Working example with all features
- Commands: `/summarize`, `/extract-tasks`, `/email-draft`
- Agents: `@betty` (accountant), `@analyst` (data analyst)
- Triggers: Email automation, task processing

---

## 🎯 Roadmap

### Phase 1: Foundation ✅
- [x] Architecture design
- [x] Specifications written
- [x] Implementation plans created
- [x] Example vault created

### Phase 2: Core Implementation (Current)
- [x] Plugin: Command palette ✅
- [ ] Plugin: Chat widget
- [ ] Daemon: File watching
- [ ] Daemon: Mention parser
- [ ] Daemon: Context loader
- [ ] Daemon: Claude integration

### Phase 3: Automation
- [ ] Trigger system
- [ ] SOP execution
- [ ] MCP service integration
- [ ] Error recovery

### Phase 4: Polish
- [ ] Performance optimization
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Installation automation

### Phase 5: Dogfooding
- [ ] Real-world usage testing
- [ ] Feedback iteration
- [ ] Bug fixes
- [ ] UX improvements

### Future Vision (Out of Scope)
- Bundle marketplace
- Security/sandboxing
- Multi-user support
- Enterprise features

---

## 🤝 Contributing

### Development Setup

1. **Fork the repository**
   ```bash
   git clone https://github.com/your-username/spark.git
   cd spark
   ```

2. **Install dependencies**
   ```bash
   cd plugin && npm install
   cd ../daemon && npm install
   ```

3. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Make your changes**
   - Write code following style guidelines
   - Add tests for new features
   - Run checks frequently: `npm run check`

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   # Pre-commit hooks run automatically
   # Commit is blocked if any check fails
   ```

6. **Push and create a pull request**
   ```bash
   git push origin feature/your-feature-name
   ```

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

### MCP services not working

```bash
# Test MCP server
npx -y @modelcontextprotocol/server-gmail --help

# Check configuration
cat .spark/integrations/gmail/config.yaml

# View daemon logs for MCP errors
grep "MCP" ~/.spark/logs/daemon.log
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- **Anthropic** - Claude AI platform
- **Obsidian** - Knowledge management platform
- **MCP Protocol** - Model Context Protocol for service integrations

---

## 📧 Contact

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@spark-assistant.dev (not active yet)

---

## ⚡ Status

**Current Phase:** Plugin Phase 2 Complete, Daemon Phase 3 In Progress

**Latest Updates:**

**Plugin:**
- ✅ Command palette complete with fuzzy search ✨
  - Slash commands (`/`) trigger detection
  - Mentions (`@`) for agents/files/folders
  - Keyboard navigation and auto-insertion
  - Smart fuzzy matching algorithm
- 🚧 Chat widget development next

**Daemon:**
- ✅ Phase 1: Project setup & file watching (complete)
  - Configuration system with YAML validation
  - File watcher with debouncing
  - Logger with structured output
- ✅ Phase 2: Syntax parsing (complete)
  - MentionParser - 32 tests passing
  - CommandDetector - 47 tests passing
  - FrontmatterParser - 32 tests passing
- ✅ Phase 3: Context loading (complete)
  - PathResolver for mention resolution
  - ProximityCalculator for file ranking
  - ContextLoader orchestration
- ✅ Testing infrastructure (complete)
  - Jest with ES modules support
  - 81 tests across 3 test suites
  - Pre-commit hooks enforcing quality
- 🚧 Phase 4: Claude integration (next)

**Next Milestones:**
- Week 4: Daemon Claude API integration
- Week 6: Trigger system implementation
- Week 8: Result writing & notifications
- Week 10: System service installation
- Week 12: Production-ready for dogfooding

---

**Transform your notes into actions. Turn your vault into an AI-powered operating system.**

Built with ❤️ for power users who want their tools to work *for* them.
