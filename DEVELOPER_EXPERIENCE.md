# Developer Experience Improvements

**Goal:** Make Spark maintainable, debuggable, and easy to extend for both current and future developers.

---

## Current State Assessment

### ✅ What's Good
- **Strong type safety** - No `any` types, strict TypeScript
- **Clear architecture** - Separation of concerns, well-organized files
- **Comprehensive specs** - All major decisions documented
- **Design patterns** - Consistent use of patterns throughout
- **Progress tracking** - Clear documentation of what's built

### ❌ What's Missing
- **No tests** - Zero test coverage
- **Limited debugging** - No dev tools for inspection
- **Sparse inline docs** - Not enough JSDoc comments
- **No examples** - Hard to see how to extend
- **No contributing guide** - Unclear how to add features
- **No error diagnostics** - Hard to debug issues
- **No development mode tools** - Basic npm scripts only

---

## DX Improvement Roadmap

### Priority 1: Testing Infrastructure (Essential)

#### Unit Tests
```typescript
// daemon/__tests__/parser/MentionParser.test.ts
import { MentionParser } from '../../src/parser/MentionParser';

describe('MentionParser', () => {
  const parser = new MentionParser();
  
  describe('agent mentions', () => {
    it('should parse @agent syntax', () => {
      const mentions = parser.parse('@betty review this');
      expect(mentions).toHaveLength(1);
      expect(mentions[0]).toMatchObject({
        type: 'agent',
        value: 'betty',
        raw: '@betty'
      });
    });
    
    it('should distinguish agent from file', () => {
      const mentions = parser.parse('@betty @report.md');
      expect(mentions[0].type).toBe('agent');
      expect(mentions[1].type).toBe('file');
    });
  });
  
  describe('folder mentions', () => {
    it('should parse @folder/ syntax', () => {
      const mentions = parser.parse('@finance/Q4/');
      expect(mentions[0]).toMatchObject({
        type: 'folder',
        value: 'finance/Q4/'
      });
    });
  });
});
```

#### Integration Tests
```typescript
// daemon/__tests__/integration/file-processing.test.ts
describe('File Processing Integration', () => {
  let testVault: TestVault;
  let daemon: SparkDaemon;
  
  beforeEach(async () => {
    testVault = await TestVault.create();
    daemon = new SparkDaemon(testVault.path);
    await daemon.start();
  });
  
  afterEach(async () => {
    await daemon.stop();
    await testVault.cleanup();
  });
  
  it('should detect and parse commands in files', async () => {
    // Write a file with a command
    await testVault.writeFile('test.md', '/summarize this content');
    
    // Wait for daemon to process
    await testVault.waitForProcessing();
    
    // Verify command was detected
    const logs = daemon.getProcessingLogs();
    expect(logs).toContainEqual(
      expect.objectContaining({
        type: 'command_detected',
        command: 'summarize'
      })
    );
  });
});
```

#### Test Utilities
```typescript
// daemon/__tests__/utils/TestVault.ts
export class TestVault {
  private tempDir: string;
  
  static async create(): Promise<TestVault> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'spark-test-'));
    await fs.mkdir(path.join(tempDir, '.spark'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.spark', 'config.yaml'),
      TestVault.defaultConfig()
    );
    return new TestVault(tempDir);
  }
  
  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.tempDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }
  
  async readFile(relativePath: string): Promise<string> {
    return fs.readFile(path.join(this.tempDir, relativePath), 'utf-8');
  }
  
  async cleanup(): Promise<void> {
    await fs.rm(this.tempDir, { recursive: true, force: true });
  }
}
```

#### Package.json Scripts
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest --testPathPattern=__tests__/(?!integration)",
    "test:integration": "jest --testPathPattern=__tests__/integration"
  }
}
```

---

### Priority 2: Debugging Tools

#### Development Logger with Levels
```typescript
// daemon/src/logger/DevLogger.ts
export class DevLogger extends Logger {
  private namespace: string;
  
  constructor(namespace: string, config: LoggingConfig) {
    super(config);
    this.namespace = namespace;
  }
  
  // Enhanced debug with context
  debugWithContext(message: string, context: Record<string, unknown>): void {
    if (this.config.level === 'debug') {
      console.log(
        chalk.gray(`[${new Date().toISOString()}]`),
        chalk.blue(`[${this.namespace}]`),
        message,
        chalk.gray(JSON.stringify(context, null, 2))
      );
    }
  }
  
  // Performance timing
  time(label: string): void {
    console.time(`${this.namespace}:${label}`);
  }
  
  timeEnd(label: string): void {
    console.timeEnd(`${this.namespace}:${label}`);
  }
}
```

#### Daemon Inspector
```typescript
// daemon/src/dev/DaemonInspector.ts
export class DaemonInspector {
  constructor(private daemon: SparkDaemon) {}
  
  // Get current state
  getState(): DaemonState {
    return {
      isRunning: this.daemon.isRunning(),
      config: this.daemon.getConfig(),
      watchedFiles: this.daemon.getWatcher()?.getWatchedFiles() || [],
      lastProcessed: this.daemon.getLastProcessedFiles(),
      cacheSize: this.daemon.getCacheSize(),
    };
  }
  
  // Force process a file
  async processFile(filePath: string): Promise<void> {
    await this.daemon.handleFileChange({
      path: filePath,
      type: 'change',
      timestamp: Date.now(),
    });
  }
  
  // Clear caches
  clearCaches(): void {
    this.daemon.clearAllCaches();
  }
  
  // Get processing history
  getHistory(limit = 50): ProcessingEvent[] {
    return this.daemon.getProcessingHistory(limit);
  }
}
```

#### CLI Debug Commands
```bash
# Start daemon with debug mode
spark start ~/vault --debug

# Inspect daemon state
spark inspect

# Process file manually
spark process ~/vault/test.md

# Show processing history
spark history --last 20

# Validate configuration
spark config validate --verbose

# Test parsers
spark test parse "@betty review @folder/"
```

---

### Priority 3: Inline Documentation

#### JSDoc Comments
```typescript
// daemon/src/parser/MentionParser.ts

/**
 * Parses Spark syntax mentions from markdown content.
 * 
 * Supports:
 * - @agent - Agent references (e.g., @betty)
 * - @file.md - File references (e.g., @report.md)
 * - @folder/ - Folder references (e.g., @finance/Q4/)
 * - /command - Slash commands (e.g., /summarize)
 * - $service - Service references (e.g., $quickbooks)
 * 
 * @example
 * ```typescript
 * const parser = new MentionParser();
 * const mentions = parser.parse('@betty review @finance/Q4/');
 * // Returns: [
 * //   { type: 'agent', value: 'betty', ... },
 * //   { type: 'folder', value: 'finance/Q4/', ... }
 * // ]
 * ```
 */
export class MentionParser implements IMentionParser {
  /**
   * Parse content and extract all mentions.
   * 
   * @param content - Raw markdown content to parse
   * @returns Array of parsed mentions, sorted by position
   * 
   * @remarks
   * Mentions are matched in priority order:
   * 1. Commands (/)
   * 2. Services ($)
   * 3. Folders (@.../)
   * 4. Files (@....md)
   * 5. Agents (@...)
   */
  public parse(content: string): ParsedMention[] {
    // Implementation...
  }
}
```

#### README Examples
```typescript
// daemon/README.md - Add practical examples

## Examples

### Parsing Mentions
```typescript
import { MentionParser } from './src/parser/MentionParser';

const parser = new MentionParser();
const mentions = parser.parse('@betty review @finance/Q4/');

console.log(mentions);
// [
//   { type: 'agent', value: 'betty', raw: '@betty', position: 0 },
//   { type: 'folder', value: 'finance/Q4/', raw: '@finance/Q4/', position: 14 }
// ]
```

### Creating a Custom Command
```typescript
// .spark/commands/my-command.md
---
id: my-command
name: My Custom Command
description: What it does
---

Your prompt instructions here...
```

### Adding a Trigger
```yaml
# .spark/triggers/my-trigger.yaml
triggers:
  - name: my_trigger
    watch:
      directory: "tasks/"
      frontmatter_field: status
      to_value: done
    instructions: |
      Move completed task to archive
```
```

---

### Priority 4: Development Workflow

#### Hot Reload with Context
```typescript
// daemon/src/dev/HotReload.ts
export class HotReloadManager {
  private watchers: Map<string, FSWatcher> = new Map();
  
  watchForChanges(daemon: SparkDaemon): void {
    // Watch source files
    const sourceWatcher = chokidar.watch('src/**/*.ts', {
      ignored: ['**/*.test.ts']
    });
    
    sourceWatcher.on('change', async (path) => {
      console.log(chalk.yellow(`Source changed: ${path}`));
      console.log(chalk.yellow('Rebuilding...'));
      
      // Rebuild
      execSync('npm run build', { stdio: 'inherit' });
      
      console.log(chalk.green('✓ Rebuild complete'));
      console.log(chalk.yellow('Restart daemon to apply changes'));
    });
    
    // Watch config
    const configWatcher = chokidar.watch('.spark/config.yaml');
    configWatcher.on('change', async () => {
      console.log(chalk.yellow('Config changed, reloading...'));
      await daemon.reloadConfig();
      console.log(chalk.green('✓ Config reloaded'));
    });
  }
}
```

#### Development Scripts
```json
// package.json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "dev:debug": "tsx watch --inspect src/index.ts",
    "dev:test": "nodemon --watch src --exec 'npm test'",
    "dev:lint": "nodemon --watch src --exec 'npm run lint'",
    "build:watch": "tsc --watch",
    "clean": "rm -rf dist",
    "reset": "npm run clean && npm install && npm run build"
  }
}
```

---

### Priority 5: Error Diagnostics

#### Better Error Messages
```typescript
// daemon/src/errors/SparkError.ts
export class SparkError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
    public readonly suggestions?: string[]
  ) {
    super(message);
    this.name = 'SparkError';
  }
  
  // Format for CLI display
  toCLIString(): string {
    let output = chalk.red(`\n❌ ${this.message}\n`);
    
    if (this.code) {
      output += chalk.gray(`   Code: ${this.code}\n`);
    }
    
    if (this.context) {
      output += chalk.gray('\n   Context:\n');
      for (const [key, value] of Object.entries(this.context)) {
        output += chalk.gray(`   - ${key}: ${JSON.stringify(value)}\n`);
      }
    }
    
    if (this.suggestions && this.suggestions.length > 0) {
      output += chalk.yellow('\n   Suggestions:\n');
      for (const suggestion of this.suggestions) {
        output += chalk.yellow(`   • ${suggestion}\n`);
      }
    }
    
    return output;
  }
}

// Usage
throw new SparkError(
  'Failed to parse configuration',
  'CONFIG_PARSE_ERROR',
  { file: configPath, line: 23 },
  [
    'Check YAML syntax at line 23',
    'Ensure all keys are properly indented',
    'Run: spark config validate'
  ]
);
```

#### Validation with Context
```typescript
// daemon/src/config/ConfigValidator.ts
export class ConfigValidator implements IConfigValidator {
  validate(config: unknown): SparkConfig {
    // Enhanced validation with helpful errors
    if (!config || typeof config !== 'object') {
      throw new SparkError(
        'Configuration must be an object',
        'INVALID_CONFIG_TYPE',
        { received: typeof config },
        [
          'Ensure config.yaml is valid YAML',
          'Check for syntax errors',
          'Example: https://github.com/spark/examples/config.yaml'
        ]
      );
    }
    
    // ... more validation
  }
}
```

---

### Priority 6: Code Examples & Templates

#### Example Extensions
```typescript
// examples/custom-parser/README.md
# Custom Parser Example

This example shows how to create a custom mention parser.

## Files
- `CustomMentionParser.ts` - Parser implementation
- `custom-parser.test.ts` - Tests
- `integration.ts` - How to integrate with daemon

## Usage
```typescript
import { CustomMentionParser } from './CustomMentionParser';

const parser = new CustomMentionParser();
const mentions = parser.parse('!important #tag');
```

See full example in `examples/custom-parser/`
```

#### Templates
```
templates/
├── command.md              # Command template
├── agent.md                # Agent template
├── trigger.yaml            # Trigger template
├── parser-class.ts         # Parser class template
└── integration-test.ts     # Integration test template
```

---

### Priority 7: Contributing Guide

#### CONTRIBUTING.md
```markdown
# Contributing to Spark

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm test`

## Project Structure

- `src/types/` - All TypeScript types
- `src/config/` - Configuration management
- `src/parser/` - Syntax parsing
- `src/context/` - Context loading
- `src/watcher/` - File watching

## Adding a New Feature

### 1. Define Types First
```typescript
// src/types/my-feature.ts
export interface MyFeature {
  // ...
}
```

### 2. Implement Class
```typescript
// src/my-feature/MyFeatureClass.ts
export class MyFeatureClass {
  // ...
}
```

### 3. Write Tests
```typescript
// __tests__/my-feature/MyFeatureClass.test.ts
describe('MyFeatureClass', () => {
  // ...
});
```

### 4. Integrate
```typescript
// src/SparkDaemon.ts
private myFeature: MyFeatureClass;
```

### 5. Document
- Add JSDoc comments
- Update README
- Add example if needed

## Code Style

- TypeScript strict mode
- No `any` types
- Classes over functions
- Composition over inheritance

## Testing

- Unit tests required for new features
- Integration tests for major features
- Aim for >80% coverage

## Pull Requests

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes
3. Add tests
4. Run `npm test` and `npm run lint`
5. Commit: `git commit -m "feat: add my feature"`
6. Push and create PR
```

---

## Implementation Priority

### Week 1: Critical
1. ✅ Testing infrastructure setup (Jest, test utilities)
2. ✅ Unit tests for parsers (highest risk area)
3. ✅ Debug mode and better logging

### Week 2: Important
4. ✅ Integration tests for file processing
5. ✅ JSDoc comments for all public APIs
6. ✅ Error diagnostics improvements

### Week 3: Nice-to-Have
7. ✅ Development workflow tools
8. ✅ Examples and templates
9. ✅ Contributing guide

---

## Quick Wins (Do Now)

### 1. Add Debug Script
```json
// package.json
"scripts": {
  "dev:debug": "DEBUG=spark:* tsx watch src/index.ts"
}
```

### 2. Add .nvmrc
```
18.0.0
```

### 3. Add .editorconfig
```
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
```

### 4. Add Detailed Error Logging
```typescript
// Wrap all async operations
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', {
    operation: 'riskyOperation',
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context: { /* relevant context */ }
  });
  throw error; // Re-throw after logging
}
```

### 5. Add Type Exports Index
```typescript
// daemon/src/index.ts
// Export everything for external use
export * from './types';
export { SparkDaemon } from './SparkDaemon';
export { MentionParser } from './parser/MentionParser';
// ... etc
```

---

## Metrics to Track

1. **Test Coverage** - Aim for >80%
2. **Build Time** - Keep under 5 seconds
3. **Startup Time** - Keep under 1 second
4. **Memory Usage** - Stay under 200MB
5. **Time to Debug** - How long to identify issues

---

## Tools to Add

1. **Debugger Support** - VS Code launch configs
2. **Performance Profiler** - Track slow operations
3. **Memory Profiler** - Detect leaks
4. **Log Viewer** - Better than tail -f
5. **Config Validator CLI** - Interactive validation

---

## Documentation Checklist

- [ ] API documentation (TypeDoc)
- [ ] Architecture diagrams
- [ ] Sequence diagrams for key flows
- [ ] Troubleshooting guide
- [ ] FAQ
- [ ] Video walkthrough (optional)

---

## Next Steps

**Immediate (This Session):**
1. Set up Jest configuration
2. Write first 5 unit tests
3. Add debug logging to SparkDaemon

**This Week:**
4. Complete parser test coverage
5. Add integration test framework
6. Improve error messages

**This Month:**
7. Full test coverage
8. Complete documentation
9. Contributing guide

---

**The goal: Make Spark as easy to debug and extend as it is well-architected!**

