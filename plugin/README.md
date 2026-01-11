# Obsidian Spark Plugin

AI-powered automation for Obsidian with slash commands, chat widget, and intelligent workflows.

> **Desktop Only**: This plugin requires Node.js and is only available on desktop (macOS, Windows, Linux).

## Requirements

This plugin requires the **Spark Engine** to be running for AI features to work.

### Install & Start the Engine

**From Plugin (Recommended):**

The plugin handles engine installation and management automatically:
- On first launch, a setup modal prompts you to install the engine
- Go to **Settings → Spark → Engine** to install, start, or stop the engine
- Enable **Auto-launch engine** to start it automatically when Obsidian opens

**Manual Installation:**

```bash
# Install engine
curl -fsSL https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install-engine.sh | bash

# Start engine for your vault
spark start ~/path/to/your/vault
```

The engine watches your vault and processes AI requests from the plugin.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Development](#development)
- [Architecture](#architecture)
- [License](#license)

---

## Installation

1. Open Obsidian Settings → Community Plugins
2. Search for "Spark Assistant"
3. Install and enable the plugin
4. Follow the setup modal to install the engine (or go to Settings → Spark → Engine)
5. Configure your API key in plugin settings (Settings → Spark → API Key)

---

## Features

### ✅ Command Palette

- **Slash Commands (`/`)**: Type `/` anywhere to see available commands
- **Mentions (`@`)**: Type `@` to reference agents, files, or folders
- **Fuzzy Search**: Smart matching as you type
- **Keyboard Navigation**: Use ↑↓ arrows, Enter to select, Esc to close
- **Auto-insertion**: Selected items are inserted inline
- **Clickable Mentions**: All inserted mentions are clickable!
  - 🤖 **Agents** (purple) - Click to mention agent
  - 📝 **Files** (blue) - Click to open file
  - 📁 **Folders** (green) - Click to navigate to folder

### ✅ Chat Widget (MVP Complete)

- **Floating Chat**: Press `Cmd+K` to open the chat widget
- **Persistent Conversations**: Chat history saved in `.spark/conversations/`
- **Mention Support**: Use `@` and `/` in chat with auto-completion
- **Real-time Responses**: See agent responses as they're generated
- **Conversation Switching**: Switch between different conversations
- **Markdown Rendering**: Agent responses display with proper formatting

### ⏸️ Future Enhancements

- **Toast Notifications**: System notifications for non-critical events
- **Status Bar Integration**: Quick status indicators
- **Advanced Settings**: More customization options

## Development

### Initial Setup

**1. Install dependencies:**
```bash
npm install
```

**2. Hot Reload is pre-configured:**

The plugin uses [Hot Reload](https://github.com/pjeby/hot-reload) for automatic reloading during development. If you ran `./install.sh` from the root, Hot Reload is already set up. Otherwise:

```bash
# Clone Hot Reload plugin into example-vault (if not already done)
cd ../example-vault/.obsidian/plugins
git clone https://github.com/pjeby/hot-reload.git
cd -

# Open example-vault in Obsidian and enable both plugins
# Settings → Community Plugins → Enable "Hot Reload"
# Settings → Community Plugins → Enable "Spark Assistant"
```

**3. Start development:**
```bash
npm run dev
```

Now any changes you make will automatically rebuild and reload in Obsidian! 🔥

### Build Commands

```bash
# Development build with watch mode (outputs to example-vault)
npm run dev

# Production build (outputs to dist/, with lint + format checks)
npm run build

# Run all checks without building
npm run check
```

### Code Quality

```bash
# Lint code
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting (no changes)
npm run format:check
```

**Pre-commit Hook**: Automatically formats and lints code before every commit. TypeScript errors will block commits.

### Development Workflow

1. **Start dev build:** `npm run dev` (leave running)
2. **Make changes** to code in `src/`
3. **Save file** - esbuild rebuilds instantly
4. **Hot Reload auto-reloads** the plugin in Obsidian
5. **Test changes** immediately!

**Build Output:**
- **Dev mode:** `example-vault/.obsidian/plugins/spark/` (main.js, manifest.json, styles.css)
- **Production:** `plugin/dist/` (main.js, manifest.json, styles.css) - ready for distribution

**Alternative Reload Methods (if not using Hot Reload):**
- Command Palette → "Reload app without saving"
- Toggle plugin off/on in settings
- Developer console: `app.plugins.disablePlugin('spark').then(() => app.plugins.enablePlugin('spark'))`

### Project Structure

```
plugin/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings.ts          # Settings panel
│   ├── command-palette/     # Slash command UI ✅
│   │   ├── CommandPaletteManager.ts  # Main coordinator
│   │   ├── ItemLoader.ts             # Load commands/agents/files
│   │   ├── FuzzyMatcher.ts           # Search & ranking
│   │   ├── PaletteView.ts            # UI rendering
│   │   └── MentionDecorator.ts       # Clickable mentions
│   ├── chat/                # Chat interface ✅
│   │   ├── ChatWindow.ts             # Main chat window
│   │   ├── ChatManager.ts            # Chat state management
│   │   ├── ChatQueue.ts              # Queue messages to engine
│   │   ├── ChatResultWatcher.ts      # Watch for engine responses
│   │   ├── ChatMentionHandler.ts     # Mention support in chat
│   │   └── ConversationStorage.ts    # Persist conversations
│   ├── utils/               # Shared utilities
│   └── types/               # TypeScript types
│       ├── index.ts         # Core types
│       └── command-palette.ts  # Palette-specific types
├── dist/                    # Build output (gitignored)
│   └── main.js              # Compiled plugin
├── manifest.json            # Plugin metadata
├── styles.css               # Plugin styles
└── esbuild.config.mjs       # Build configuration
```

## Architecture

This plugin follows the Spark Assistant architecture:

- **Plugin (UI Layer)**: Pure UI, no business logic
- **Engine (Intelligence Layer)**: All AI processing and automation
- **Communication**: Via file system (markdown files)

The plugin's role:
- Display slash command palette
- Show chat widget UI
- Write user input to files
- Watch notification file
- Display toasts and status

The engine handles:
- Parsing Spark syntax
- Loading context
- AI API calls
- Executing commands
- Writing results

## Support

- **Issues**: [GitHub Issues](https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/issues)
- **Documentation**: [GitHub Wiki](https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/wiki)

## License

MIT - See [LICENSE](../LICENSE) for details.
