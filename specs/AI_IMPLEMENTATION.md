# Phase 4: Claude Integration

**Goal:** Enable AI command execution with results written back to files  
**Approach:** Direct API integration following Phase 1-3 patterns  
**Time:** 1-2 days

**Status:**  
- ✅ Phase 4A: Claude API Integration (DONE - responses in console)
- 🔨 Phase 4B: Result Writing (NEXT - write responses to files)
- ⏸️ Phase 4C: Notifications (AFTER - notify plugin)

---

## Architecture

```
FileChange → Parse → LoadContext → BuildPrompt → CallClaude → [Phase 4B] WriteResult
                     [Phase 3 ✅]    [NEW]         [NEW]
```

**New:**
- `ClaudeClient` implements `IAIClient` (types already exist)
- `PromptBuilder` implements `IPromptBuilder` (types already exist)
- `SparkDaemon.executeCommand()` orchestrates execution

---

## 1. ClaudeClient

**File:** `daemon/src/ai/ClaudeClient.ts`

```typescript
/**
 * Claude API client
 * Adapter pattern - wraps @anthropic-ai/sdk
 */
import Anthropic from '@anthropic-ai/sdk';
import type { IAIClient, AICompletionOptions, AICompletionResult } from '../types/ai.js';
import { Logger } from '../logger/Logger.js';
import { SparkError } from '../types/index.js';

export class ClaudeClient implements IAIClient {
  private client: Anthropic;
  private logger: Logger;
  
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
    this.logger = Logger.getInstance();
    this.logger.info('ClaudeClient initialized');
  }
  
  async complete(
    prompt: string, 
    options: AICompletionOptions = {}
  ): Promise<AICompletionResult> {
    this.logger.debug('Claude API call', { 
      promptLength: prompt.length,
      model: options.model 
    });
    
    try {
      const response = await this.client.messages.create({
        model: options.model || 'claude-3-5-sonnet-20241022',
        max_tokens: options.max_tokens || 4096,
        temperature: options.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }]
      });
      
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new SparkError('Unexpected response type', 'AI_ERROR');
      }
      
      this.logger.debug('Claude API response', {
        outputLength: content.text.length,
        stopReason: response.stop_reason
      });
      
      return {
        content: content.text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      };
      
    } catch (error: any) {
      // Server errors are retryable, client errors are not
      const isServerError = error.status && error.status >= 500;
      
      this.logger.error('Claude API error', { 
        error, 
        retryable: isServerError 
      });
      
      throw new SparkError(
        `Claude API error: ${error.message}`,
        isServerError ? 'AI_SERVER_ERROR' : 'AI_CLIENT_ERROR',
        error
      );
    }
  }
}
```

---

## 2. PromptBuilder

**File:** `daemon/src/ai/PromptBuilder.ts`

```typescript
/**
 * Prompt builder
 * Structures prompts with context priority
 */
import type { IPromptBuilder } from '../types/ai.js';
import type { ParsedCommand } from '../types/parser.js';
import type { LoadedContext } from '../types/context.js';

export class PromptBuilder implements IPromptBuilder {
  build(command: ParsedCommand, context: LoadedContext): string {
    const sections: string[] = [];
    
    // Agent persona (if present)
    if (context.agent) {
      sections.push(
        '<agent_persona>',
        context.agent.persona,
        '</agent_persona>',
        ''
      );
    }
    
    // Instructions
    sections.push(
      '<instructions>',
      this.extractInstructions(command),
      '</instructions>',
      ''
    );
    
    // HIGH priority: Explicitly mentioned files
    if (context.mentionedFiles.length > 0) {
      sections.push('<context priority="high">');
      context.mentionedFiles.forEach(file => {
        sections.push(
          `<file path="${file.path}">`,
          file.content,
          '</file>',
          ''
        );
      });
      sections.push('</context>', '');
    }
    
    // MEDIUM priority: Current file (where command was typed)
    sections.push(
      '<context priority="medium">',
      `<file path="${context.currentFile.path}" note="Command was typed here">`,
      context.currentFile.content,
      '</file>',
      '</context>',
      ''
    );
    
    // LOW priority: Nearby files (summaries only)
    if (context.nearbyFiles.length > 0) {
      sections.push('<context priority="low">');
      context.nearbyFiles.forEach(file => {
        sections.push(
          `<file path="${file.path}" distance="${file.distance}">`,
          file.summary,
          '</file>',
          ''
        );
      });
      sections.push('</context>', '');
    }
    
    sections.push('Please execute the instructions above.');
    
    return sections.join('\n');
  }
  
  private extractInstructions(command: ParsedCommand): string {
    // Use raw command line
    // Future: Load from .spark/commands/ if /command detected
    return command.raw;
  }
  
  estimateTokens(prompt: string): number {
    return Math.ceil(prompt.length / 4);
  }
}
```

---

## 3. Integration into SparkDaemon

**File:** `daemon/src/SparkDaemon.ts`

**Note:** ContextLoader already exists and is fully implemented with ProximityCalculator! Just need to initialize it.

Add imports:
```typescript
import { ClaudeClient } from './ai/ClaudeClient.js';
import { PromptBuilder } from './ai/PromptBuilder.js';
import { ContextLoader } from './context/ContextLoader.js';
```

Add properties:
```typescript
export class SparkDaemon implements ISparkDaemon {
  // ... existing properties
  private claudeClient: ClaudeClient | null;
  private promptBuilder: PromptBuilder | null;
  private contextLoader: ContextLoader | null;  // Phase 3 class - just needs initialization
  
  constructor(vaultPath: string) {
    // ... existing initialization
    this.claudeClient = null;
    this.promptBuilder = null;
    this.contextLoader = null;
  }
```

Initialize in `start()` method (after line 64 where fileParser is initialized):
```typescript
// After: this.fileParser = new FileParser();

// Initialize AI components
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new SparkError(
    'ANTHROPIC_API_KEY environment variable not set',
    'CONFIG_ERROR'
  );
}

this.claudeClient = new ClaudeClient(apiKey);
this.promptBuilder = new PromptBuilder();
this.contextLoader = new ContextLoader(this.vaultPath);  // Uses ProximityCalculator internally!

this.logger.debug('AI components initialized');
```

Update `handleFileChange` to detect and execute commands:
```typescript
private async handleFileChange(change: FileChange): Promise<void> {
  this.logger?.debug('File changed', { path: change.path, type: change.type });
  
  // ... existing parsing
  
  const content = readFileSync(change.path, 'utf-8');
  const parsed = this.fileParser!.parse(change.path, content);
  
  // Execute detected commands
  for (const command of parsed.detectedCommands) {
    if (!command.isCommand) continue;
    if (command.raw.startsWith('✅')) continue; // Skip processed
    
    await this.executeCommand(command, change.path).catch(error => {
      this.logger?.error('Command execution failed', { error, command: command.raw });
    });
  }
}
```

Add new `executeCommand` method:
```typescript
private async executeCommand(
  command: ParsedCommand,
  filePath: string
): Promise<void> {
  this.logger?.info('Executing command', {
    command: command.raw.substring(0, 100),
    file: filePath
  });
  
  try {
    // 1. Load context (Phase 3 - already implemented!)
    //    ContextLoader internally:
    //    - Uses PathResolver to resolve mentions
    //    - Uses ProximityCalculator.rankFilesByProximity() to find nearby files
    //    - Returns top 10 nearest files with summaries
    const context = await this.contextLoader!.load(filePath, command.mentions);
    
    this.logger?.debug('Context loaded', {
      mentionedFiles: context.mentionedFiles.length,
      nearbyFiles: context.nearbyFiles.length,  // Ranked by proximity!
      hasAgent: !!context.agent
    });
    
    // 2. Build prompt
    const prompt = this.promptBuilder!.build(command, context);
    
    this.logger?.debug('Prompt built', {
      length: prompt.length,
      estimatedTokens: this.promptBuilder!.estimateTokens(prompt)
    });
    
    // 3. Call Claude
    const result = await this.claudeClient!.complete(prompt);
    
    this.logger?.info('Command executed', {
      outputTokens: result.usage.outputTokens,
      inputTokens: result.usage.inputTokens
    });
    
    // 4. Log response (Phase 4B will write to file)
    console.log('\n=== CLAUDE RESPONSE ===');
    console.log(result.content);
    console.log('=======================\n');
    
  } catch (error) {
    this.logger?.error('Command execution failed', error);
    throw error; // Re-throw for caller to handle
  }
}
```

---

## Testing

### Setup
```bash
export ANTHROPIC_API_KEY=sk-ant-...
cd daemon
npm run dev:debug
```

### Test File
```bash
cd example-vault
cat > test-phase4.md << 'EOF'
# Phase 4 Test

/summarize the following in one sentence:

Spark Assistant is a daemon that watches markdown files,
detects commands, loads context based on file proximity,
and calls Claude API to generate AI responses.
EOF
```

### Expected Output
```
[info] Starting Spark daemon
[info] ClaudeClient initialized
[debug] AI components initialized
[info] File changed: test-phase4.md
[info] Executing command: /summarize
[debug] Context loaded: mentionedFiles=0, nearbyFiles=10
[debug] Prompt built: length=1243, estimatedTokens=310
[debug] Claude API call
[debug] Claude API response
[info] Command executed: outputTokens=45, inputTokens=310

=== CLAUDE RESPONSE ===
Spark Assistant is a daemon that monitors markdown files for commands
and uses Claude AI to generate responses based on file proximity context.
=======================
```

---

## Phase 4A Success Criteria ✅

- ✅ ClaudeClient calls API successfully
- ✅ PromptBuilder creates structured prompts with context
- ✅ executeCommand() works end-to-end
- ✅ Console shows Claude responses
- ✅ Error handling doesn't crash daemon
- ✅ Types match existing interfaces

---

## Phase 4B: Result Writing (NEXT)

### User Experience (from RESULT_AND_ERROR_HANDLING.md)

**Before execution:**
```markdown
/summarize What is the purpose of this vault?
```

**After execution:**
```markdown
✅ /summarize What is the purpose of this vault?

This vault serves as an example demonstration for Spark Assistant,
showing how to structure tasks, emails, and other work documents
for AI-powered automation.
```

**Key points:**
1. Add ✅ emoji to the command line
2. Write Claude's response below the command (separated by blank line)
3. Use atomic file operations (read → modify → write)
4. Respect config `results.mode` setting

### Result Modes (from config.yaml)

```yaml
daemon:
  results:
    mode: auto           # auto, inline, separate_file
    inline_max_chars: 500
    separate_folder: reports/
    add_blank_lines: true
```

**Modes:**
- `auto`: Inline for short responses (<500 chars), separate file for longer
- `inline`: Always write inline below command
- `separate_file`: Create new file in `reports/` folder

### Implementation: ResultWriter

**File:** `daemon/src/results/ResultWriter.ts`

```typescript
/**
 * Writes AI results back to files
 */
import { readFileSync, writeFileSync } from 'fs';
import type { ResultWriteOptions } from '../types/results.js';
import { Logger } from '../logger/Logger.js';

export class ResultWriter {
  private logger = Logger.getInstance();
  
  /**
   * Write result inline below command
   */
  async writeInline(
    filePath: string,
    commandLine: number,
    commandText: string,
    result: string,
    addBlankLines = true
  ): Promise<void> {
    this.logger.debug('Writing inline result', { filePath, commandLine });
    
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Update command line with ✅
    lines[commandLine - 1] = `✅ ${commandText}`;
    
    // Insert blank line + result
    const resultLines = addBlankLines 
      ? ['', result]
      : [result];
    
    lines.splice(commandLine, 0, ...resultLines);
    
    // Atomic write
    writeFileSync(filePath, lines.join('\n'), 'utf-8');
    
    this.logger.info('Result written', { 
      filePath, 
      resultLength: result.length 
    });
  }
  
  /**
   * Update status indicator only (no result)
   */
  async updateStatus(
    filePath: string,
    commandLine: number,
    commandText: string,
    status: '✅' | '❌' | '⚠️'
  ): Promise<void> {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    lines[commandLine - 1] = `${status} ${commandText}`;
    
    writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }
}
```

### Integration into SparkDaemon

Update `executeCommand()` to write results:

```typescript
private async executeCommand(
  command: ParsedCommand,
  filePath: string
): Promise<void> {
  this.logger?.info('Executing command', {
    command: command.raw.substring(0, 100),
    file: filePath
  });
  
  try {
    // 1. Load context
    const context = await this.contextLoader!.load(filePath, command.mentions);
    
    // 2. Build prompt
    const prompt = this.promptBuilder!.build(command, context);
    
    // 3. Call Claude
    const result = await this.claudeClient!.complete(prompt);
    
    this.logger?.info('Command executed', {
      outputTokens: result.usage.outputTokens,
      inputTokens: result.usage.inputTokens
    });
    
    // 4. Write result back to file (NEW!)
    await this.resultWriter!.writeInline(
      filePath,
      command.line,
      command.raw,
      result.content,
      this.config!.daemon.results.add_blank_lines
    );
    
    this.logger?.info('Result written to file', { filePath });
    
  } catch (error) {
    this.logger?.error('Command execution failed', error);
    
    // Write error status
    await this.resultWriter!.updateStatus(
      filePath,
      command.line,
      command.raw,
      '❌'
    );
    
    throw error;
  }
}
```

### Phase 4B Tasks

- [ ] Create `ResultWriter` class
- [ ] Add result writing types to `types/results.ts`
- [ ] Initialize `ResultWriter` in `SparkDaemon.start()`
- [ ] Update `executeCommand()` to write results
- [ ] Handle errors with ❌ status
- [ ] Test with inline results
- [ ] Verify atomic file operations

---

## Phase 4C: Notifications (AFTER 4B)

**File:** `daemon/src/notifications/Notifier.ts`

Write to `.spark/notifications.jsonl`:

```typescript
{
  "id": "abc123",
  "type": "success",
  "message": "Command completed",
  "timestamp": 1234567890,
  "file": "test-claude.md",
  "line": 5
}
```

Plugin watches this file and shows toast notifications in Obsidian.

---

## Leveraging Existing Functionality

**Phase 3 Components (Already Built):**

✅ **ContextLoader** (`src/context/ContextLoader.ts`)
- Loads agent personas from `.spark/agents/`
- Resolves file and folder mentions
- **Uses ProximityCalculator internally**
- Returns top 10 nearby files ranked by distance
- Generates 500-char summaries
- All ready to use!

✅ **ProximityCalculator** (`src/context/ProximityCalculator.ts`)
- `calculateDistance(file1, file2)` - Directory-based distance
- `rankFilesByProximity(current, files)` - Sorts by proximity
- `getFilesWithinDistance(current, files, maxDist)` - Filters by distance
- Already integrated in ContextLoader!

✅ **PathResolver** (`src/context/PathResolver.ts`)
- Resolves agents, files, folders, commands
- Used by ContextLoader

**What Phase 4 Adds:**
- ClaudeClient - API wrapper
- PromptBuilder - Structures the prompt
- Integration in SparkDaemon - Orchestrates execution

**No need to reimplement context loading - it's done!**

---

## Notes

- Follows established patterns from Phases 1-3
- IAIClient and IPromptBuilder interfaces already exist in types/
- No forking, no abstractions - clean direct integration
- Error handling uses SparkError for consistency
- Logger integration matches existing components
- Composition pattern: daemon composes AI components
- **Uses existing ContextLoader with ProximityCalculator - no duplication!**
