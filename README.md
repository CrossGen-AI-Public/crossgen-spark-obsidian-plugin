# Spark Assistant

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

### Plugin Development

```bash
cd obsidian-spark
npm install
npm run dev  # Hot reload

# In Obsidian: Enable "Developer Mode" in settings
# Reload plugin after changes
```

### Daemon Development

```bash
cd spark-daemon
npm install
npm run dev  # Watch mode

# Test with example vault
npm start -- ../example-vault
```

### Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Watch mode
npm run test:watch
```

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

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit pull request

### Code Style

- TypeScript for all code
- ESLint + Prettier for formatting
- Conventional commits for messages
- Tests required for new features

### Areas to Contribute

- **Plugin UI/UX** - Improve command palette, chat widget
- **Daemon Performance** - Optimize file watching, parsing
- **Documentation** - Examples, tutorials, guides
- **Testing** - Unit tests, integration tests
- **Commands/Agents** - New default commands and personas

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

**Current Phase:** Plugin Phase 2 Complete, Chat Widget Next

**Latest Updates:**
- ✅ All architecture decisions finalized
- ✅ Complete specifications written
- ✅ Implementation plans created
- ✅ Example vault with working configs
- ✅ Command palette complete with fuzzy search ✨
  - Slash commands (`/`) trigger detection
  - Mentions (`@`) for agents/files/folders
  - Keyboard navigation and auto-insertion
  - Smart fuzzy matching algorithm
- 🚧 Chat widget development next
- 🚧 Daemon development starting soon

**Next Milestones:**
- Week 4: Chat widget functional
- Week 6: Daemon with file watching & parsing
- Week 8: Full daemon with triggers
- Week 10: System service installation
- Week 12: Production-ready for dogfooding

---

**Transform your notes into actions. Turn your vault into an AI-powered operating system.**

Built with ❤️ for power users who want their tools to work *for* them.
