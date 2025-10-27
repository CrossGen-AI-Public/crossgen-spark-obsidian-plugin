# Test Suite

## 📑 Table of Contents

- [Overview](#overview)
- [Test Safety](#test-safety)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Writing New Tests](#writing-new-tests)
- [CI/CD](#cicd)
- [Cost Safety Guarantee](#cost-safety-guarantee)

---

## Overview

This directory contains comprehensive tests for the Spark daemon. All tests are designed to run without making actual API calls or incurring costs.

## Test Safety

### API Mocking

**All tests mock the Anthropic SDK to prevent actual API calls and budget drainage.**

Tests use `jest.mock('@anthropic-ai/sdk')` which automatically creates mocks without needing manual implementation files.

### How It Works

1. **Automatic Mocking**: `jest.mock('@anthropic-ai/sdk')` tells Jest to auto-mock the SDK
2. **No Real Implementation**: Mock returns undefined by default, preventing any API calls
3. **Test API Key**: Tests use `'test-api-key-for-tests'` which never reaches the real API
4. **Zero Cost**: No actual API calls are made, no tokens consumed, no budget used

### Files Protected

- `SparkDaemon.test.ts` - Mocks all daemon operations including AI calls
- `DaemonInspector.test.ts` - Mocks AI integration
- `ai/ClaudeClient.test.ts` - Tests ClaudeClient initialization only

All tests that involve AI components use the shared mock.

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- SparkDaemon.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Full check (format, lint, typecheck, test)
npm run check
```

## Test Structure

```
__tests__/
├── ai/                     # AI component tests
│   └── ClaudeClient.test.ts
├── cli/                    # CLI tests
│   ├── DaemonInspector.test.ts
│   ├── cli.test.ts
│   └── registry.test.ts
├── config/                 # Configuration tests
│   ├── ConfigDefaults.test.ts
│   ├── ConfigLoader.test.ts
│   └── ConfigValidator.test.ts
├── context/                # Context loading tests
│   ├── ContextLoader.test.ts
│   ├── PathResolver.test.ts
│   └── ProximityCalculator.test.ts
├── logger/                 # Logger tests
│   ├── DevLogger.test.ts
│   └── Logger.test.ts
├── parser/                 # Parser tests
│   ├── CommandDetector.test.ts
│   ├── FileParser.test.ts
│   ├── FrontmatterParser.test.ts
│   └── MentionParser.test.ts
├── watcher/                # File watcher tests
│   ├── ChangeDebouncer.test.ts
│   ├── FileWatcher.test.ts
│   └── PathMatcher.test.ts
├── utils/                  # Test utilities
│   └── TestVault.ts        # Helper for creating temporary test vaults
├── SparkDaemon.test.ts     # Main daemon tests
└── README.md               # This file
```

## Writing New Tests

When adding tests that involve AI components:

```typescript
import { jest } from '@jest/globals';

// Add this at the top of your test file
jest.mock('@anthropic-ai/sdk');

describe('YourComponent', () => {
    // Your tests here
    // AI calls will be automatically mocked
});
```

### Test Utilities

**TestVault** - Creates temporary Obsidian vaults for testing:

```typescript
import { TestVault } from './utils/TestVault.js';

const vault = new TestVault();
await vault.create();
await vault.writeFile('test.md', '# Test');
// ... run tests ...
await vault.cleanup();
```

### Logger in Tests

Always initialize the logger in tests:

```typescript
beforeEach(() => {
    Logger.resetInstance();
    Logger.getInstance({ level: 'error', console: false });
});
```

## CI/CD

Tests run automatically on:
- Every pull request
- Every push to main
- Before deployment

All tests must pass before code can be merged.

## Cost Safety Guarantee

**The test suite will NEVER:**
- Make real API calls to Anthropic
- Consume tokens from your API quota
- Incur any API costs
- Use your actual API key

Jest's automatic mocking via `jest.mock('@anthropic-ai/sdk')` ensures complete isolation from the real API.

