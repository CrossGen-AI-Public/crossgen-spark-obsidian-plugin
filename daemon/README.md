# Spark Daemon

The intelligence layer for Spark Assistant. A Node.js daemon that watches your Obsidian vault, parses Spark syntax, loads context, calls Claude API, and writes results back to files.

## Architecture

**Design Principles:**
- Class-based architecture with clear responsibilities
- Composition over inheritance
- Design patterns throughout (Strategy, Observer, Factory)
- No `any` types - full TypeScript safety
- Small, focused files

## Project Structure

```
daemon/
├── src/
│   ├── cli.ts                # CLI entry point
│   ├── index.ts              # Main export point
│   ├── SparkDaemon.ts        # Main daemon orchestrator
│   ├── cli/                  # CLI utilities
│   │   ├── registry.ts       # Global daemon registry
│   │   └── DaemonInspector.ts # State inspection
│   ├── config/               # Configuration management
│   │   ├── ConfigDefaults.ts
│   │   ├── ConfigLoader.ts
│   │   └── ConfigValidator.ts
│   ├── watcher/              # File system watching
│   │   ├── FileWatcher.ts
│   │   ├── ChangeDebouncer.ts
│   │   └── PathMatcher.ts
│   ├── parser/               # Syntax parsing
│   │   ├── MentionParser.ts
│   │   ├── CommandDetector.ts
│   │   ├── FrontmatterParser.ts
│   │   └── FileParser.ts
│   ├── context/              # Context loading
│   │   ├── ContextLoader.ts
│   │   ├── PathResolver.ts
│   │   └── ProximityCalculator.ts
│   ├── logger/               # Logging infrastructure
│   │   ├── Logger.ts         # Base logger
│   │   └── DevLogger.ts      # Development logger with namespaces
│   ├── types/                # TypeScript type definitions
│   ├── ai/                   # Claude API integration (TODO)
│   ├── triggers/             # Automation triggers (TODO)
│   ├── writer/               # Result writing (TODO)
│   ├── notifications/        # Notification system (TODO)
│   └── utils/                # Utilities (TODO)
├── __tests__/                # Test suite (264 tests, 79% coverage)
├── package.json
├── tsconfig.json             # For type-checking (includes tests)
├── tsconfig.build.json       # For production builds (excludes tests)
└── README.md
```

## Installation

```bash
# Install dependencies
npm install

# Build and link globally
npm run build
npm link

# Now 'spark' command is available globally
spark --help
```

## CLI Commands

```bash
# Daemon control
spark start [vault-path]              # Start daemon (foreground)
spark start ~/vault &                 # Run in background
spark start ~/vault --debug &         # Background with debug logging
nohup spark start ~/vault > ~/.spark/daemon.log 2>&1 &  # Persistent background

spark status                          # Show all running daemons
spark status ~/vault                  # Check specific vault
spark stop ~/vault                    # Stop daemon gracefully
spark stop ~/vault --force            # Force stop (SIGKILL)

# Development mode (hot reload) 🔥
spark dev [vault-path]                # Start with hot reload
spark dev ~/vault --debug             # Debug mode with hot reload
spark dev ~/vault --no-restart        # Disable auto-restart on changes
spark dev ~/vault --run-tests         # Run tests on every change
spark dev ~/vault --no-config-reload  # Disable auto config reload

# Configuration
spark config [vault-path]             # Validate configuration
spark inspect [vault-path]            # Show vault info and config
spark reload [vault-path]             # Reload config without restarting 🔄

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

### Examples

```bash
# Start daemon in foreground (logs to console)
spark start ~/Documents/Obsidian --debug

# Start daemon in background (simple)
spark start ~/Documents/Obsidian &

# Start daemon in background (persistent, with logs)
nohup spark start ~/Documents/Obsidian > ~/.spark/daemon.log 2>&1 &

# Check all running daemons
spark status
# Output:
# Found 1 running daemon(s):
# 
# 1. /Users/you/Documents/Obsidian
#    PID: 12345 | Uptime: 2m

# View logs (if using nohup)
tail -f ~/.spark/daemon.log

# Stop the daemon
spark stop ~/Documents/Obsidian

# Reload config without restarting (useful for production!)
# The daemon validates the new config before applying it
# If validation fails, it keeps running with the old config
spark reload ~/Documents/Obsidian

# Test the parser
spark parse "/summarize @report.md"
```

## Development Mode 🔥

The `spark dev` command provides hot reload for rapid development iteration:

```bash
# Start with default settings (auto-restart enabled, config reload enabled)
spark dev ~/vault

# With debug logging
spark dev ~/vault --debug

# Disable auto-restart (manual restart required after rebuild)
spark dev ~/vault --no-restart

# Run tests on every source change
spark dev ~/vault --run-tests

# Disable config auto-reload
spark dev ~/vault --no-config-reload
```

### Features

**Auto-rebuild on source changes:**
- Watches `src/**/*.ts` (excluding tests)
- Debounced (300ms) to avoid rebuild storms
- Shows rebuild time and success/failure

**Auto-restart daemon (optional):**
- Enabled by default
- Restarts daemon after successful rebuild
- Preserves daemon state and configuration
- Use `--no-restart` to disable

**Auto-reload config (optional):**
- Watches `.spark/config.yaml` in vault
- Reloads config without full restart
- Restarts file watcher if watch patterns changed
- Enabled by default, use `--no-config-reload` to disable

**Run tests on changes (optional):**
- Watches test files
- Runs full test suite on changes
- Shows pass/fail status
- Use `--run-tests` to enable

### Dev Workflow

```bash
# Terminal 1: Start dev mode
cd daemon
spark dev ~/example-vault --debug

# Terminal 2: Make changes
vim src/parser/MentionParser.ts

# Watch Terminal 1:
# 📝 Source changed: src/parser/MentionParser.ts
# 🔨 Rebuilding...
# ✓ Rebuild complete (1234ms)
# 🔄 Restarting daemon...
# ✓ Daemon restarted

# Edit config
vim ~/example-vault/.spark/config.yaml

# Watch Terminal 1:
# ⚙️  Config changed, reloading...
# ✓ Config reloaded

# Press Ctrl+C to stop
# 🛑 Shutting down...
# 📊 Hot Reload Stats:
#    Rebuilds: 5
#    Restarts: 5
#    Config Reloads: 2
# ✓ Development mode stopped
```

### NPM Scripts

```bash
# Quick dev mode (using tsx watch)
npm run dev

# Full dev mode with daemon
npm run dev:daemon

# Debug mode
npm run dev:debug

# With test execution
npm run dev:full

# Build and watch (no daemon)
npm run build:watch
```

## Global Registry

The daemon maintains a global registry at `~/.spark/registry.json` that tracks all running daemons. This allows:
- `spark status` to show all running daemons across different vaults
- Detection of already-running daemons to prevent duplicates
- Auto-cleanup of stale entries when processes are no longer running

## Development

### Setup

```bash
# Install dependencies
npm install

# Run in dev mode (hot reload)
npm run dev

# Start daemon
npm start -- /path/to/vault
```

### Quality Checks

```bash
# Run all checks (auto-fixes formatting & linting, then validates)
npm run check

# Individual checks
npm run format:check    # Check formatting
npm run lint            # Check linting
npm run type-check      # Check TypeScript types
npm test                # Run tests (264 tests)

# Auto-fix issues
npm run format          # Auto-format code
npm run lint:fix        # Auto-fix linting issues
```

**Note:** `npm run check` is used by pre-commit hooks and automatically fixes formatting and linting issues before running validation.

### Testing

```bash
# Run all tests
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# With coverage report
npm run test:coverage

# Run specific test file
npm test MentionParser.test.ts
```

**Test Coverage:**
- **264 tests** across 15 test suites
- **79% coverage** (threshold: 78%)
- View HTML report: `npm run test:coverage` then open `coverage/index.html`
- See [DEVELOPER_EXPERIENCE.md](../specs/DEVELOPER_EXPERIENCE.md) for detailed breakdown

**Test Categories:**
- Parser tests (92 tests) - MentionParser, CommandDetector, FrontmatterParser, FileParser
- Context tests (48 tests) - PathResolver, ProximityCalculator, ContextLoader
- Config tests (58 tests) - ConfigDefaults, ConfigLoader, ConfigValidator
- Watcher tests (50 tests) - PathMatcher, ChangeDebouncer, FileWatcher
- Logger tests (12 tests) - Logger, DevLogger
- CLI tests (4 tests) - registry, DaemonInspector, cli

## TypeScript Configuration

The daemon uses two TypeScript configurations:

1. **`tsconfig.json`** - For type-checking (IDE, pre-commit)
   - Includes: `src/**/*` + `__tests__/**/*`
   - Used by: `npm run type-check`, IDE

2. **`tsconfig.build.json`** - For building production code
   - Includes: Only `src/**/*`
   - Excludes: `__tests__`, `**/*.test.ts`
   - Used by: `npm run build`

This split ensures tests are type-checked but not included in production builds.

## Pre-Commit Hooks

The repository has automatic pre-commit hooks that:
1. **Auto-fix** formatting and linting issues
2. **Validate** all checks pass (format, lint, types, tests)
3. **Block commit** if any check fails

Run `npm run check` before committing to ensure all checks pass locally.

## Code Standards

- **TypeScript** strict mode enforced
- **No `any` types** - All types must be explicit
- **ESLint** strict rules, no unused vars (use `_prefix` for intentionally unused)
- **Prettier** consistent formatting
- **Tests** required for new features
- **Coverage** threshold: 78% minimum

## Documentation

- **[Product Architecture](../specs/PRODUCT_ARCHITECTURE.md)** - Overall system design
- **[Daemon Spec](../specs/DAEMON_SPEC.md)** - Detailed daemon specification
- **[Developer Experience](../specs/DEVELOPER_EXPERIENCE.md)** - Testing infrastructure and DX improvements
- **[Configuration](../specs/CONFIGURATION.md)** - Configuration system details

## License

MIT
