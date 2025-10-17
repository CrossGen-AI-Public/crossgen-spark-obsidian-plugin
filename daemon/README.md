# Spark Daemon

The intelligence layer for Spark Assistant. A Node.js daemon that watches your Obsidian vault, parses Spark syntax, loads context, calls Claude API, and writes results back to files.

## Architecture

**Design Principles:**
- Class-based architecture with clear responsibilities
- Composition over inheritance
- Design patterns throughout (Strategy, Observer, Factory, etc.)
- No `any` types - full TypeScript safety
- Small, focused files

## Project Structure

```
daemon/
├── src/
│   ├── index.ts              # Entry point
│   ├── SparkDaemon.ts        # Main daemon orchestrator
│   ├── types/                # All TypeScript type definitions
│   ├── config/               # Configuration management
│   ├── watcher/              # File system watching
│   ├── parser/               # Syntax parsing
│   ├── context/              # Context loading
│   ├── ai/                   # Claude API integration
│   ├── triggers/             # Automation triggers
│   ├── writer/               # Result writing
│   ├── notifications/        # Notification system
│   └── logger/               # Logging infrastructure
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Setup

```bash
# Install dependencies
npm install

# Run in dev mode (hot reload)
npm run dev

# Build
npm run build

# Start daemon
npm start -- /path/to/vault
```

### Quality Checks

```bash
# Run all checks (auto-fixes formatting & linting, then checks types & tests)
npm run check

# Individual checks
npm run format:check    # Check formatting only
npm run lint            # Check linting only
npm run type-check      # Check TypeScript types
npm test                # Run all tests (221 tests)

# Auto-fix issues
npm run format          # Auto-format code
npm run lint:fix        # Auto-fix linting issues
```

**Note:** `npm run check` automatically fixes formatting and linting issues, then validates types and tests. This is the command used by pre-commit hooks.

### Pre-Commit Hooks

The repository has automatic pre-commit hooks that:
1. **Auto-fix** formatting and linting issues
2. **Validate** all checks pass (format, lint, types, tests)
3. **Block commit** if any check fails

This ensures all committed code meets quality standards.

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

**Coverage Report:**
- Run `npm run test:coverage` to generate HTML report at `coverage/index.html`
- Current coverage: **79%** (threshold: 78%, passing ✅)
- **100% covered:** Logger, ConfigDefaults, ChangeDebouncer
- **Well-tested (>90%):** Config (95%), CommandDetector (94%)
- **Good coverage (>70%):** Parser (83%), Context (68%), FileParser (82%), FileWatcher (74%), Watcher (82%)

See [DEVELOPER_EXPERIENCE.md](../DEVELOPER_EXPERIENCE.md) for detailed test coverage and status.

## Installation

```bash
# Build and link globally
npm run build
npm link

# Start daemon
spark start ~/Documents/Obsidian
```

## Implementation Progress

See [DAEMON_PROGRESS.md](../DAEMON_PROGRESS.md) for detailed progress tracking.

**Current Phase:** Phase 1 - Project Setup & File Watching

## License

MIT

