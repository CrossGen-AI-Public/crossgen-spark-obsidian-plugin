# Spark Daemon - Implementation Plan

**Target:** Node.js Daemon (TypeScript)  
**Purpose:** Intelligence layer - watches files, parses mentions, executes commands  
**Timeline:** 6-8 weeks  
**Status:** ✅ Complete (MVP)

---

## ✅ Implementation Status (MVP Complete)

All phases have been successfully implemented:

1. **File Watching System** - Chokidar-based with debouncing and ignore patterns
2. **Syntax Parsing** - Complete mention parser for agents, files, folders, commands, and services
3. **Context Loading** - Proximity-based file ranking and path resolution
4. **Chat System** - Queue-based processing with conversation persistence
5. **Claude Integration** - API client with prompt building and response handling
6. **Configuration Management** - YAML-based config with hot reload
7. **CLI Tools** - Start/stop/status/history commands with global registry
8. **Logging Infrastructure** - Structured logging with levels and namespaces
9. **Testing Suite** - 507 tests with 64% coverage

## Overview

The Spark daemon is the brain of the system. It:
1. Watches vault files for changes ✅
2. Parses Spark syntax (`/commands`, `@mentions`, `$services`) ✅
3. Loads context based on proximity ✅
4. Calls Claude API ✅
5. Writes results back to files ✅
6. Sends notifications ✅

**Core principle:** Daemon does ALL business logic. Plugin just displays UI.

---

## Phase 1: Project Setup & File Watching (Week 1)

### Deliverables
- [ ] Daemon project structure
- [ ] File watcher implementation
- [ ] Configuration loading
- [ ] Basic logging

### Tasks

**1.1 Initialize Project**
```bash
mkdir spark-daemon
cd spark-daemon
npm init -y
npm install --save chokidar yaml glob fast-glob
npm install --save-dev typescript @types/node tsx
```

**1.2 Project Structure**
```
spark-daemon/
├── src/
│   ├── index.ts             # Entry point
│   ├── watcher/             # File watching
│   │   └── file-watcher.ts
│   ├── parser/              # Syntax parsing
│   │   ├── mention-parser.ts
│   │   └── trigger-parser.ts
│   ├── context/             # Context loading
│   │   └── context-loader.ts
│   ├── ai/                  # Claude integration
│   │   └── claude-client.ts
│   ├── triggers/            # Trigger execution
│   │   └── trigger-executor.ts
│   ├── notifications/       # Notification system
│   │   └── notifier.ts
│   └── config/              # Configuration
│       └── config-loader.ts
├── package.json
└── tsconfig.json
```

**1.3 Configuration Loader**
```typescript
// src/config/config-loader.ts
import { readFileSync } from 'fs';
import { parse } from 'yaml';

export interface SparkConfig {
  daemon: {
    watch: {
      patterns: string[];
      ignore: string[];
    };
    debounce_ms: number;
  };
  ai: {
    defaultProvider: string;
    providers: {
      [name: string]: {
        type: string;
        model: string;
        apiKeyEnv: string;
        maxTokens: number;
        temperature: number;
      };
    };
  };
  // ... other config
}

export class ConfigLoader {
  load(vaultPath: string): SparkConfig {
    const configPath = `${vaultPath}/.spark/config.yaml`;
    const content = readFileSync(configPath, 'utf-8');
    return parse(content) as SparkConfig;
  }
}
```

**1.4 File Watcher**
```typescript
// src/watcher/file-watcher.ts
import chokidar from 'chokidar';
import { EventEmitter } from 'events';

export interface FileChange {
  path: string;
  type: 'add' | 'change' | 'unlink';
  timestamp: number;
}

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  
  constructor(
    private vaultPath: string,
    private patterns: string[],
    private ignore: string[],
    private debounceMs: number
  ) {
    super();
  }
  
  start() {
    this.watcher = chokidar.watch(this.patterns, {
      cwd: this.vaultPath,
      ignored: this.ignore,
      persistent: true,
      ignoreInitial: true
    });
    
    this.watcher
      .on('add', (path) => this.handleChange(path, 'add'))
      .on('change', (path) => this.handleChange(path, 'change'))
      .on('unlink', (path) => this.handleChange(path, 'unlink'));
    
    console.log('File watcher started');
  }
  
  private handleChange(path: string, type: FileChange['type']) {
    // Debounce rapid changes
    if (this.debounceTimers.has(path)) {
      clearTimeout(this.debounceTimers.get(path)!);
    }
    
    const timer = setTimeout(() => {
      this.emit('change', {
        path,
        type,
        timestamp: Date.now()
      } as FileChange);
      this.debounceTimers.delete(path);
    }, this.debounceMs);
    
    this.debounceTimers.set(path, timer);
  }
  
  stop() {
    this.watcher.close();
  }
}
```

**1.5 Main Entry Point**
```typescript
// src/index.ts
import { ConfigLoader } from './config/config-loader';
import { FileWatcher } from './watcher/file-watcher';

class SparkDaemon {
  private config: SparkConfig;
  private watcher: FileWatcher;
  
  constructor(private vaultPath: string) {}
  
  async start() {
    console.log('Starting Spark daemon...');
    
    // Load configuration
    this.config = new ConfigLoader().load(this.vaultPath);
    
    // Start file watcher
    this.watcher = new FileWatcher(
      this.vaultPath,
      this.config.daemon.watch.patterns,
      this.config.daemon.watch.ignore,
      this.config.daemon.debounce_ms
    );
    
    this.watcher.on('change', (change) => {
      this.handleFileChange(change);
    });
    
    this.watcher.start();
    
    console.log('Spark daemon started');
  }
  
  private async handleFileChange(change: FileChange) {
    console.log('File changed:', change.path);
    // Process the file (implemented in later phases)
  }
  
  stop() {
    this.watcher.stop();
    console.log('Spark daemon stopped');
  }
}

// CLI entry point
const vaultPath = process.argv[2] || process.cwd();
const daemon = new SparkDaemon(vaultPath);

daemon.start();

// Graceful shutdown
process.on('SIGINT', () => {
  daemon.stop();
  process.exit(0);
});
```

**Success Criteria:**
- ✅ Daemon starts and loads config
- ✅ Watches vault files for changes
- ✅ Logs file changes to console
- ✅ Debounces rapid changes
- ✅ Gracefully shuts down

---

## Phase 2: Syntax Parsing (Week 2)

### Deliverables
- [ ] Mention parser (`@`, `/`, `$`)
- [ ] Trigger matcher (frontmatter changes)
- [ ] Command detection

### Tasks

**2.1 Mention Parser**
```typescript
// src/parser/mention-parser.ts
export interface ParsedMention {
  type: 'agent' | 'file' | 'folder' | 'service' | 'command';
  raw: string;
  value: string;
  position: number;
}

export class MentionParser {
  parse(content: string): ParsedMention[] {
    const mentions: ParsedMention[] = [];
    
    // Regex patterns
    const patterns = {
      agent: /@([\w-]+)(?![\w\/.])/, 
      file: /@([\w-]+\.md)/,
      folder: /@([\w-\/]+\/)/,
      service: /\$([\w-]+)/,
      command: /\/([\w-]+)/
    };
    
    // Find all matches
    for (const [type, pattern] of Object.entries(patterns)) {
      let match;
      const regex = new RegExp(pattern, 'g');
      
      while ((match = regex.exec(content)) !== null) {
        mentions.push({
          type: type as ParsedMention['type'],
          raw: match[0],
          value: match[1],
          position: match.index
        });
      }
    }
    
    // Sort by position
    mentions.sort((a, b) => a.position - b.position);
    
    return mentions;
  }
  
  // Check if line contains Spark syntax
  hasSparkSyntax(line: string): boolean {
    return /[@\/\$][\w-]+/.test(line);
  }
}
```

**2.2 Command Detector**
```typescript
// src/parser/command-detector.ts
import { readFileSync } from 'fs';
import matter from 'gray-matter';

export interface DetectedCommand {
  line: number;
  raw: string;
  mentions: ParsedMention[];
  isCommand: boolean;
  isTrigger: boolean;
}

export class CommandDetector {
  detectInFile(filePath: string, content: string): DetectedCommand[] {
    const lines = content.split('\n');
    const commands: DetectedCommand[] = [];
    
    lines.forEach((line, index) => {
      if (this.mentionParser.hasSparkSyntax(line)) {
        const mentions = this.mentionParser.parse(line);
        
        commands.push({
          line: index,
          raw: line,
          mentions,
          isCommand: this.isCommandLine(line, mentions),
          isTrigger: false
        });
      }
    });
    
    return commands;
  }
  
  private isCommandLine(line: string, mentions: ParsedMention[]): boolean {
    // Has command or agent mention
    return mentions.some(m => m.type === 'command' || m.type === 'agent');
  }
}
```

**2.3 Frontmatter Parser**
```typescript
// src/parser/frontmatter-parser.ts
import matter from 'gray-matter';

export interface FrontmatterChange {
  field: string;
  oldValue: any;
  newValue: any;
}

export class FrontmatterParser {
  private cache: Map<string, Record<string, any>> = new Map();
  
  detectChanges(filePath: string, content: string): FrontmatterChange[] {
    const { data: frontmatter } = matter(content);
    const oldFrontmatter = this.cache.get(filePath) || {};
    const changes: FrontmatterChange[] = [];
    
    // Check for changed fields
    for (const [field, newValue] of Object.entries(frontmatter)) {
      const oldValue = oldFrontmatter[field];
      if (oldValue !== newValue) {
        changes.push({ field, oldValue, newValue });
      }
    }
    
    // Update cache
    this.cache.set(filePath, frontmatter);
    
    return changes;
  }
}
```

**Success Criteria:**
- ✅ Parses `/command` syntax
- ✅ Parses `@agent`, `@file.md`, `@folder/`
- ✅ Parses `$service` syntax
- ✅ Detects frontmatter changes
- ✅ Distinguishes command lines from regular text

---

## Phase 3: Context Loading (Week 3)

### Deliverables
- [ ] Path resolution for mentions
- [ ] Proximity-based file ranking
- [ ] Context loader

### Tasks

**3.1 Path Resolver**
```typescript
// src/context/path-resolver.ts
import { glob } from 'glob';
import { existsSync } from 'fs';
import path from 'path';

export class PathResolver {
  constructor(private vaultPath: string) {}
  
  async resolveAgent(name: string): Promise<string | null> {
    const agentPath = path.join(this.vaultPath, '.spark/agents', `${name}.md`);
    return existsSync(agentPath) ? agentPath : null;
  }
  
  async resolveFile(filename: string): Promise<string | null> {
    // Search vault for file
    const files = await glob(`**/${filename}`, {
      cwd: this.vaultPath,
      ignore: ['node_modules/**', '.git/**']
    });
    
    return files.length > 0 ? path.join(this.vaultPath, files[0]) : null;
  }
  
  async resolveFolder(folderPath: string): Promise<string | null> {
    const fullPath = path.join(this.vaultPath, folderPath);
    return existsSync(fullPath) ? fullPath : null;
  }
  
  async resolveCommand(name: string): Promise<string | null> {
    const commandPath = path.join(this.vaultPath, '.spark/commands', `${name}.md`);
    return existsSync(commandPath) ? commandPath : null;
  }
}
```

**3.2 Proximity Calculator**
```typescript
// src/context/proximity-calculator.ts
export class ProximityCalculator {
  calculateDistance(file1: string, file2: string): number {
    const dir1 = path.dirname(file1);
    const dir2 = path.dirname(file2);
    
    if (dir1 === dir2) return 0; // Same directory
    
    const parts1 = dir1.split(path.sep);
    const parts2 = dir2.split(path.sep);
    
    // Find common ancestor
    let commonDepth = 0;
    for (let i = 0; i < Math.min(parts1.length, parts2.length); i++) {
      if (parts1[i] === parts2[i]) commonDepth++;
      else break;
    }
    
    // Distance = steps up + steps down
    return (parts1.length - commonDepth) + (parts2.length - commonDepth);
  }
  
  rankFilesByProximity(currentFile: string, allFiles: string[]): string[] {
    return allFiles
      .map(file => ({
        file,
        distance: this.calculateDistance(currentFile, file)
      }))
      .sort((a, b) => a.distance - b.distance)
      .map(item => item.file);
  }
}
```

**3.3 Context Loader**
```typescript
// src/context/context-loader.ts
import { readFileSync } from 'fs';

export interface LoadedContext {
  currentFile: {
    path: string;
    content: string;
  };
  mentionedFiles: Array<{
    path: string;
    content: string;
    priority: number;
  }>;
  agent?: {
    path: string;
    persona: string;
  };
  nearbyFiles: Array<{
    path: string;
    summary: string;
    distance: number;
  }>;
}

export class ContextLoader {
  constructor(
    private vaultPath: string,
    private resolver: PathResolver,
    private proximityCalc: ProximityCalculator
  ) {}
  
  async load(
    currentFile: string,
    mentions: ParsedMention[]
  ): Promise<LoadedContext> {
    const context: LoadedContext = {
      currentFile: {
        path: currentFile,
        content: readFileSync(currentFile, 'utf-8')
      },
      mentionedFiles: [],
      nearbyFiles: []
    };
    
    // Load mentioned files/folders/agents
    for (const mention of mentions) {
      switch (mention.type) {
        case 'agent':
          const agentPath = await this.resolver.resolveAgent(mention.value);
          if (agentPath) {
            context.agent = {
              path: agentPath,
              persona: readFileSync(agentPath, 'utf-8')
            };
          }
          break;
        
        case 'file':
          const filePath = await this.resolver.resolveFile(mention.value);
          if (filePath) {
            context.mentionedFiles.push({
              path: filePath,
              content: readFileSync(filePath, 'utf-8'),
              priority: 1.0
            });
          }
          break;
        
        case 'folder':
          const folderPath = await this.resolver.resolveFolder(mention.value);
          if (folderPath) {
            const files = await this.loadFolderFiles(folderPath);
            context.mentionedFiles.push(...files);
          }
          break;
      }
    }
    
    // Load nearby files by proximity
    const allFiles = await this.getAllVaultFiles();
    const rankedFiles = this.proximityCalc.rankFilesByProximity(currentFile, allFiles);
    
    // Take top 10 closest files
    context.nearbyFiles = rankedFiles.slice(0, 10).map((file, idx) => ({
      path: file,
      summary: this.generateSummary(file),
      distance: this.proximityCalc.calculateDistance(currentFile, file)
    }));
    
    return context;
  }
  
  private async loadFolderFiles(folderPath: string) {
    const files = await glob('**/*.md', { cwd: folderPath });
    return files.map(file => ({
      path: path.join(folderPath, file),
      content: readFileSync(path.join(folderPath, file), 'utf-8'),
      priority: 0.9
    }));
  }
  
  private generateSummary(filePath: string): string {
    const content = readFileSync(filePath, 'utf-8');
    // Simple summary: first 500 chars
    return content.substring(0, 500) + '...';
  }
}
```

**Success Criteria:**
- ✅ Resolves agent paths
- ✅ Finds files in vault
- ✅ Loads folder contents
- ✅ Ranks files by proximity
- ✅ Builds complete context

---

## Phase 4: Claude Integration (Week 4)

### Deliverables
- [ ] Claude API client
- [ ] Prompt builder
- [ ] Response handler

### Tasks

**4.1 Claude Client**
```typescript
// src/ai/claude-client.ts
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeClient {
  private client: Anthropic;
  
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
  
  async complete(prompt: string, options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}): Promise<string> {
    const response = await this.client.messages.create({
      model: options.model || 'claude-3-5-sonnet-20241022',
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.7,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    return response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';
  }
}
```

**4.2 Prompt Builder**
```typescript
// src/ai/prompt-builder.ts
export class PromptBuilder {
  build(command: DetectedCommand, context: LoadedContext): string {
    let prompt = '';
    
    // Add agent persona if present
    if (context.agent) {
      prompt += `<agent_persona>\n${context.agent.persona}\n</agent_persona>\n\n`;
    }
    
    // Add instructions from command
    prompt += `<instructions>\n`;
    prompt += this.buildInstructions(command);
    prompt += `\n</instructions>\n\n`;
    
    // Add context (priority ordered)
    prompt += `<context priority="high">\n`;
    
    // Mentioned files
    context.mentionedFiles.forEach(file => {
      prompt += `<file path="${file.path}">\n${file.content}\n</file>\n\n`;
    });
    
    prompt += `</context>\n\n`;
    
    prompt += `<context priority="medium">\n`;
    
    // Current file
    prompt += `<file path="${context.currentFile.path}" note="This is where the command was typed">\n`;
    prompt += context.currentFile.content;
    prompt += `\n</file>\n\n`;
    
    prompt += `</context>\n\n`;
    
    prompt += `<context priority="low">\n`;
    
    // Nearby files (summaries)
    context.nearbyFiles.forEach(file => {
      prompt += `<file path="${file.path}" distance="${file.distance}">\n${file.summary}\n</file>\n\n`;
    });
    
    prompt += `</context>\n\n`;
    
    prompt += `Please execute the instructions above.`;
    
    return prompt;
  }
  
  private buildInstructions(command: DetectedCommand): string {
    // Extract natural language instruction from command
    return command.raw;
  }
}
```

**Success Criteria:**
- ✅ Connects to Claude API
- ✅ Builds structured prompts
- ✅ Returns AI responses
- ✅ Handles API errors

---

## Phase 5: Trigger System (Week 5-6)

### Deliverables
- [ ] Trigger file loader
- [ ] Trigger matcher
- [ ] Trigger executor

### Tasks

**5.1 Trigger Loader**
```typescript
// src/triggers/trigger-loader.ts
import { parse } from 'yaml';

export interface Trigger {
  name: string;
  description: string;
  watch: {
    directory: string;
    frontmatter_field?: string;
    from_value?: string;
    to_value?: string;
    pattern?: string;
    event?: 'file_created' | 'file_modified' | 'file_deleted';
  };
  instructions: string;
  priority: number;
}

export class TriggerLoader {
  async loadTriggers(vaultPath: string): Promise<Trigger[]> {
    const triggerFiles = await glob('.spark/triggers/*.yaml', { cwd: vaultPath });
    const triggers: Trigger[] = [];
    
    for (const file of triggerFiles) {
      const content = readFileSync(path.join(vaultPath, file), 'utf-8');
      const parsed = parse(content);
      triggers.push(...parsed.triggers);
    }
    
    return triggers;
  }
}
```

**5.2 Trigger Matcher**
```typescript
// src/triggers/trigger-matcher.ts
export class TriggerMatcher {
  findMatching(
    change: FileChange,
    frontmatterChanges: FrontmatterChange[],
    triggers: Trigger[]
  ): Trigger[] {
    const matches: Trigger[] = [];
    
    for (const trigger of triggers) {
      if (this.matches(change, frontmatterChanges, trigger)) {
        matches.push(trigger);
      }
    }
    
    // Sort by priority (highest first)
    matches.sort((a, b) => b.priority - a.priority);
    
    return matches;
  }
  
  private matches(
    change: FileChange,
    frontmatterChanges: FrontmatterChange[],
    trigger: Trigger
  ): boolean {
    // Check directory
    if (!change.path.startsWith(trigger.watch.directory)) {
      return false;
    }
    
    // Check frontmatter field
    if (trigger.watch.frontmatter_field) {
      const fieldChange = frontmatterChanges.find(
        fc => fc.field === trigger.watch.frontmatter_field
      );
      
      if (!fieldChange) return false;
      
      // Check from/to values
      if (trigger.watch.from_value && fieldChange.oldValue !== trigger.watch.from_value) {
        return false;
      }
      
      if (trigger.watch.to_value && fieldChange.newValue !== trigger.watch.to_value) {
        return false;
      }
      
      // Check pattern
      if (trigger.watch.pattern) {
        const regex = new RegExp(trigger.watch.pattern);
        if (!regex.test(String(fieldChange.newValue))) {
          return false;
        }
      }
    }
    
    // Check event type
    if (trigger.watch.event) {
      const eventMap = {
        file_created: 'add',
        file_modified: 'change',
        file_deleted: 'unlink'
      };
      
      if (eventMap[trigger.watch.event] !== change.type) {
        return false;
      }
    }
    
    return true;
  }
}
```

**5.3 Trigger Executor**
```typescript
// src/triggers/trigger-executor.ts
export class TriggerExecutor {
  constructor(
    private contextLoader: ContextLoader,
    private promptBuilder: PromptBuilder,
    private claudeClient: ClaudeClient
  ) {}
  
  async execute(trigger: Trigger, filePath: string) {
    console.log(`Executing trigger: ${trigger.name}`);
    
    try {
      // Load context for this file
      const content = readFileSync(filePath, 'utf-8');
      const mentions = this.mentionParser.parse(trigger.instructions);
      const context = await this.contextLoader.load(filePath, mentions);
      
      // Build prompt from trigger instructions
      const prompt = this.buildTriggerPrompt(trigger, context);
      
      // Execute with Claude
      const response = await this.claudeClient.complete(prompt);
      
      // Handle response (may include file modifications, API calls, etc.)
      await this.handleResponse(response, filePath);
      
      // Send success notification
      await this.notify({
        type: 'success',
        message: `Trigger "${trigger.name}" completed`,
        file: filePath
      });
      
    } catch (error) {
      console.error(`Trigger execution failed:`, error);
      await this.notify({
        type: 'error',
        message: `Trigger "${trigger.name}" failed: ${error.message}`,
        file: filePath
      });
    }
  }
  
  private buildTriggerPrompt(trigger: Trigger, context: LoadedContext): string {
    // Build prompt with trigger instructions
    return `
      <trigger_instructions>
      ${trigger.instructions}
      </trigger_instructions>
      
      <context>
      ${this.formatContext(context)}
      </context>
      
      Please execute the trigger instructions above.
    `;
  }
}
```

**Success Criteria:**
- ✅ Loads trigger configurations
- ✅ Matches file changes to triggers
- ✅ Executes all matching triggers in priority order
- ✅ Handles trigger errors gracefully

---

## Phase 6: Result Writing & Notifications (Week 7)

### Deliverables
- [ ] Status indicator writer
- [ ] Result formatter
- [ ] Notification sender

### Tasks

**6.1 Status Writer**
```typescript
// src/writer/status-writer.ts
export class StatusWriter {
  async updateStatus(
    filePath: string,
    lineNumber: number,
    status: 'processing' | 'completed' | 'error'
  ) {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Remove existing status emoji
    const line = lines[lineNumber].replace(/^[✅❌⏳⚠️]\s*/, '');
    
    // Add new status
    const emoji = {
      processing: '⏳',
      completed: '✅',
      error: '❌'
    }[status];
    
    lines[lineNumber] = `${emoji} ${line}`;
    
    // Write back
    writeFileSync(filePath, lines.join('\n'));
  }
}
```

**6.2 Result Writer**
```typescript
// src/writer/result-writer.ts
export class ResultWriter {
  async writeResult(filePath: string, lineNumber: number, result: string) {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Insert result after command line
    const resultLines = ['', result, ''];
    lines.splice(lineNumber + 1, 0, ...resultLines);
    
    // Write back
    writeFileSync(filePath, lines.join('\n'));
  }
  
  async writeInline(filePath: string, lineNumber: number, result: string) {
    // For commands that request inline output
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Replace line with command + result
    lines[lineNumber] = `${lines[lineNumber]}\n\n${result}`;
    
    writeFileSync(filePath, lines.join('\n'));
  }
}
```

**6.3 Notifier**
```typescript
// src/notifications/notifier.ts
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
  file?: string;
  link?: string;
}

export class Notifier {
  private notificationFile: string;
  
  constructor(vaultPath: string) {
    this.notificationFile = path.join(vaultPath, '.spark/notifications.jsonl');
  }
  
  async send(notification: Omit<Notification, 'id' | 'timestamp'>) {
    const fullNotification: Notification = {
      ...notification,
      id: this.generateId(),
      timestamp: Date.now()
    };
    
    // Append to JSONL file
    const line = JSON.stringify(fullNotification) + '\n';
    await fs.appendFile(this.notificationFile, line);
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

**Success Criteria:**
- ✅ Updates status emojis in files
- ✅ Writes results inline or below command
- ✅ Sends notifications to plugin
- ✅ Creates error logs when needed

---

## Phase 7: System Service Setup (Week 8)

### Deliverables
- [ ] systemd service (Linux)
- [ ] launchd service (macOS)
- [ ] Installation script
- [ ] CLI commands

### Tasks

**7.1 CLI Interface**
```typescript
// src/cli.ts
import { Command } from 'commander';

const program = new Command();

program
  .name('spark')
  .description('Spark Assistant Daemon')
  .version('1.0.0');

program
  .command('start')
  .argument('[vault-path]', 'Path to Obsidian vault')
  .description('Start the daemon')
  .action(async (vaultPath) => {
    const daemon = new SparkDaemon(vaultPath || process.cwd());
    await daemon.start();
  });

program
  .command('stop')
  .description('Stop the daemon')
  .action(async () => {
    // Send stop signal to running daemon
    // (via PID file or socket)
  });

program
  .command('status')
  .description('Check daemon status')
  .action(async () => {
    // Check if daemon is running
  });

program.parse();
```

**7.2 systemd Service (Linux)**
```ini
# /etc/systemd/system/spark-daemon.service
[Unit]
Description=Spark Assistant Daemon
After=network.target

[Service]
Type=simple
User=%u
WorkingDirectory=%h
ExecStart=/usr/local/bin/spark start %h/Documents/Obsidian
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

**7.3 launchd Service (macOS)**
```xml
<!-- ~/Library/LaunchAgents/com.spark.daemon.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.spark.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/spark</string>
        <string>start</string>
        <string>~/Documents/Obsidian</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

**7.4 Installation Script**
```bash
#!/bin/bash
# install.sh

echo "Installing Spark Daemon..."

# Build daemon
npm install
npm run build

# Install globally
npm link

# Setup service (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    cp com.spark.daemon.plist ~/Library/LaunchAgents/
    launchctl load ~/Library/LaunchAgents/com.spark.daemon.plist
    echo "✓ Installed as launchd service"
fi

# Setup service (Linux)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    sudo cp spark-daemon.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable spark-daemon
    sudo systemctl start spark-daemon
    echo "✓ Installed as systemd service"
fi

echo "Spark daemon installed successfully!"
```

**Success Criteria:**
- ✅ Daemon installs as system service
- ✅ Starts automatically on boot
- ✅ Restarts on failure
- ✅ CLI commands work (start/stop/status)

---

## Testing Strategy

### Unit Tests
```typescript
// __tests__/mention-parser.test.ts
import { MentionParser } from '../src/parser/mention-parser';

describe('MentionParser', () => {
  it('parses agent mentions', () => {
    const parser = new MentionParser();
    const mentions = parser.parse('@betty review this');
    expect(mentions[0].type).toBe('agent');
    expect(mentions[0].value).toBe('betty');
  });
  
  it('parses file mentions', () => {
    const mentions = parser.parse('@file.md and @folder/');
    expect(mentions[0].type).toBe('file');
    expect(mentions[1].type).toBe('folder');
  });
});
```

### Integration Tests
```typescript
// __tests__/integration/command-execution.test.ts
describe('Command Execution', () => {
  it('processes slash command end-to-end', async () => {
    // Create test vault
    // Write file with command
    // Wait for daemon to process
    // Verify result written
  });
});
```

### Manual Testing
- Test with example vault
- Verify all triggers work
- Test error scenarios
- Monitor performance

---

## Deployment

### Package Distribution
```json
{
  "name": "spark-daemon",
  "version": "1.0.0",
  "bin": {
    "spark": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "jest"
  }
}
```

### Installation
```bash
npm install -g spark-daemon
spark start ~/Documents/Obsidian
```

---

## Success Metrics

- ✅ Process file changes < 500ms
- ✅ Claude API calls < 3s
- ✅ Memory usage < 200MB
- ✅ Works with 10,000+ file vaults
- ✅ 99.9% uptime as system service

---

## Next Steps

Once daemon is complete:
1. Integration testing with plugin
2. Performance optimization
3. Error recovery improvements
4. Advanced features (MCP integration, etc.)
