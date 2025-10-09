# Obsidian Spark Plugin

AI-powered automation for Obsidian with slash commands, chat widget, and intelligent workflows.

## Features

### ✅ Command Palette (Available Now)

- **Slash Commands (`/`)**: Type `/` anywhere to see available commands
- **Mentions (`@`)**: Type `@` to reference agents, files, or folders
- **Fuzzy Search**: Smart matching as you type
- **Keyboard Navigation**: Use ↑↓ arrows, Enter to select, Esc to close
- **Auto-insertion**: Selected items are inserted inline

### 🚧 Coming Soon

- **Chat Widget**: Floating AI chat with conversation history
- **Smart Notifications**: Real-time updates from the daemon
- **Enhanced Settings**: Customizable hotkeys and preferences

## Development

### Initial Setup

**1. Install dependencies:**
```bash
npm install
```

**2. Set up Hot Reload for instant development:**

The plugin uses [Hot Reload](https://github.com/pjeby/hot-reload) for automatic reloading during development. In dev mode, the build outputs directly to `example-vault/.obsidian/plugins/obsidian-spark/` instead of using symlinks (which Hot Reload doesn't support).

```bash
# Clone Hot Reload plugin into example-vault
cd ../example-vault/.obsidian/plugins
git clone https://github.com/pjeby/hot-reload.git
cd -

# Open example-vault in Obsidian
# Then in Obsidian:
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
- **Dev mode:** `example-vault/.obsidian/plugins/obsidian-spark/` (main.js, manifest.json, styles.css)
- **Production:** `plugin/dist/` (main.js, manifest.json, styles.css) - ready for distribution

**Alternative Reload Methods (if not using Hot Reload):**
- Command Palette → "Reload app without saving"
- Toggle plugin off/on in settings
- Developer console: `app.plugins.disablePlugin('obsidian-spark').then(() => app.plugins.enablePlugin('obsidian-spark'))`

### Project Structure

```
plugin/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings.ts          # Settings panel
│   ├── command-palette/     # Slash command UI 
│   │   ├── CommandPaletteManager.ts  # Main coordinator
│   │   ├── ItemLoader.ts             # Load commands/agents/files
│   │   ├── FuzzyMatcher.ts           # Search & ranking
│   │   └── PaletteView.ts            # UI rendering
│   ├── chat-widget/         # Chat interface (TODO)
│   ├── notifications/       # Notification watcher (TODO)
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

## Current Status

### ✅ Phase 1: Project Setup (Complete)

- [x] Plugin boilerplate
- [x] TypeScript configuration
- [x] Build pipeline (esbuild)
- [x] Basic plugin registration
- [x] Settings panel
- [x] Development environment

### ✅ Phase 2: Command Palette (Complete)

- [x] Trigger detection (`/`, `@`)
- [x] Fuzzy search interface
- [x] Command/agent/file listing
- [x] Selection and insertion
- [x] Keyboard navigation (↑↓ Enter Esc)
- [x] Cursor positioning
- [x] Cache management

### ⏸️ Phase 3: Chat Widget (Not Started)

- [ ] Floating chat window
- [ ] Message input/display
- [ ] Mention support in chat
- [ ] Conversation persistence

### ⏸️ Phase 4: Notification Watcher (Not Started)

- [ ] Watch `.spark/notifications.jsonl`
- [ ] Display toast notifications
- [ ] Update status bar

### ⏸️ Phase 5: Polish & Settings (Not Started)

- [ ] Enhanced settings panel
- [ ] Error handling
- [ ] Style improvements

## Architecture

This plugin follows the Spark Assistant architecture:

- **Plugin (UI Layer)**: Pure UI, no business logic
- **Daemon (Intelligence Layer)**: All AI processing and automation
- **Communication**: Via file system (markdown files)

The plugin's role:
- Display slash command palette
- Show chat widget UI
- Write user input to files
- Watch notification file
- Display toasts and status

The daemon handles:
- Parsing Spark syntax
- Loading context
- AI API calls
- Executing commands
- Writing results

## Documentation

- **[PLUGIN_PROGRESS.md](../PLUGIN_PROGRESS.md)**: Detailed implementation progress and task tracking
- **[FUZZY_MATCHING_IMPROVEMENTS.md](../FUZZY_MATCHING_IMPROVEMENTS.md)**: Fuzzy search algorithm analysis and future enhancements
- **[specs/](../specs/)**: Complete technical specifications

## License

MIT
