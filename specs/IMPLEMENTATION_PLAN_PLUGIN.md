# Spark Plugin - Implementation Plan

**Target:** Obsidian Plugin (TypeScript)  
**Purpose:** UI layer for Spark Assistant  
**Timeline:** 4-6 weeks

---

## Overview

The Spark plugin provides two UI interfaces:
1. **Command Palette** - Notion-style autocomplete for `/` and `@` mentions
2. **Chat Widget** - Intercom-style floating chat (Cmd+K)

**Core principle:** Plugin writes raw user input to files. NO business logic.

---

## Phase 1: Project Setup (Week 1)

### Deliverables
- [ ] Obsidian plugin boilerplate
- [ ] TypeScript configuration
- [ ] Development environment
- [ ] Build pipeline

### Tasks

**1.1 Initialize Plugin Project**
```bash
npm init
npm install --save-dev @types/node typescript obsidian
```

**1.2 Create Plugin Structure**
```
spark/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── command-palette/     # Slash command UI
│   ├── chat-widget/         # Chat interface
│   ├── settings.ts          # Plugin settings
│   └── utils/               # Shared utilities
├── manifest.json
├── package.json
└── tsconfig.json
```

**1.3 Configure Build**
- Setup esbuild for bundling
- Hot reload during development
- Source maps for debugging

**1.4 Basic Plugin Registration**
```typescript
export default class SparkPlugin extends Plugin {
  async onload() {
    console.log('Spark plugin loaded');
    // Register commands and UI
  }

  async onunload() {
    console.log('Spark plugin unloaded');
  }
}
```

**Success Criteria:**
- ✅ Plugin loads in Obsidian
- ✅ Shows in plugin list
- ✅ Can be enabled/disabled
- ✅ Console logs appear

---

## Phase 2: Command Palette (Week 2-3)

### Deliverables
- [ ] Trigger detection (`/`, `@`)
- [ ] Fuzzy search interface
- [ ] Command/agent/file listing
- [ ] Selection and insertion

### Tasks

**2.1 Detect Trigger Characters**
```typescript
class CommandPaletteManager {
  registerEditorExtension() {
    // Listen for '/' or '@' typed in editor
    this.app.workspace.on('editor-change', (editor) => {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const before = line.substring(0, cursor.ch);
      
      // Check if last char is trigger
      if (before.endsWith('/') || before.endsWith('@')) {
        this.showPalette(editor, cursor);
      }
    });
  }
}
```

**2.2 Load Available Items**
```typescript
interface PaletteItem {
  type: 'command' | 'agent' | 'file' | 'folder';
  id: string;
  name: string;
  description?: string;
  path?: string;
}

async loadCommands(): Promise<PaletteItem[]> {
  const commandsFolder = this.app.vault.getAbstractFileByPath('.spark/commands');
  // Read all .md files in .spark/commands/
  // Parse frontmatter
  // Return list of commands
}

async loadAgents(): Promise<PaletteItem[]> {
  // Similar for .spark/agents/
}

async loadFiles(): Promise<PaletteItem[]> {
  // Get all markdown files in vault
  // Filter by proximity to current file
}
```

**2.3 Fuzzy Search**
```typescript
class FuzzyMatcher {
  match(query: string, items: PaletteItem[]): PaletteItem[] {
    return items
      .map(item => ({
        item,
        score: this.calculateScore(query, item.name)
      }))
      .filter(result => result.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .map(result => result.item);
  }
  
  calculateScore(query: string, text: string): number {
    // Implement fuzzy matching algorithm
    // Exact match: 1.0
    // Prefix match: 0.9
    // Contains: 0.7
    // Fuzzy: 0.5
  }
}
```

**2.4 Render Palette UI**
```typescript
class PaletteView {
  createDOM(items: PaletteItem[]): HTMLElement {
    const container = document.createElement('div');
    container.addClass('spark-palette');
    
    items.forEach(item => {
      const row = container.createDiv('spark-palette-item');
      row.createDiv('spark-palette-icon', el => el.textContent = this.getIcon(item.type));
      row.createDiv('spark-palette-name', el => el.textContent = item.name);
      if (item.description) {
        row.createDiv('spark-palette-desc', el => el.textContent = item.description);
      }
      
      row.addEventListener('click', () => this.selectItem(item));
    });
    
    return container;
  }
}
```

**2.5 Keyboard Navigation**
```typescript
handleKeydown(event: KeyboardEvent) {
  switch(event.key) {
    case 'ArrowDown':
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.items.length - 1);
      break;
    case 'ArrowUp':
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      break;
    case 'Enter':
      this.selectCurrentItem();
      break;
    case 'Escape':
      this.closePalette();
      break;
  }
  this.updateSelection();
}
```

**2.6 Insert Selection**
```typescript
insertItem(editor: Editor, item: PaletteItem) {
  // Get current cursor position
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line);
  
  // Remove trigger character
  const newLine = line.substring(0, cursor.ch - 1) + item.id;
  editor.setLine(cursor.line, newLine);
  
  // Move cursor after inserted text
  editor.setCursor({
    line: cursor.line,
    ch: cursor.ch - 1 + item.id.length
  });
  
  // Close palette
  this.closePalette();
}
```

**Success Criteria:**
- ✅ Type `/` shows command list
- ✅ Type `@` shows agents/files
- ✅ Fuzzy search filters as you type
- ✅ Arrow keys navigate
- ✅ Enter selects and inserts
- ✅ Esc closes palette

---

## Phase 3: Chat Widget (Week 4-5)

### Deliverables
- [ ] Floating chat window
- [ ] Message input/display
- [ ] Mention support in chat
- [ ] Conversation persistence

### Tasks

**3.1 Create Chat View**
```typescript
class ChatView extends ItemView {
  getViewType(): string {
    return 'spark-chat';
  }
  
  getDisplayText(): string {
    return 'Spark Assistant';
  }
  
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('spark-chat-container');
    
    // Header
    const header = container.createDiv('spark-chat-header');
    header.createEl('h3', { text: 'Spark Assistant' });
    
    // Messages area
    this.messagesEl = container.createDiv('spark-chat-messages');
    
    // Input area
    this.createInputArea(container);
    
    // Load conversation history
    await this.loadConversation();
  }
}
```

**3.2 Register Hotkey**
```typescript
this.addCommand({
  id: 'open-spark-chat',
  name: 'Open Spark Chat',
  hotkeys: [{ modifiers: ['Mod'], key: 'k' }],
  callback: () => {
    this.activateView();
  }
});

async activateView() {
  // Open or focus chat view
  const leaf = this.app.workspace.getRightLeaf(false);
  await leaf.setViewState({
    type: 'spark-chat',
    active: true
  });
  this.app.workspace.revealLeaf(leaf);
}
```

**3.3 Message Input with Mentions**
```typescript
class ChatInput {
  createInput(container: HTMLElement) {
    this.inputEl = container.createEl('textarea', {
      cls: 'spark-chat-input',
      attr: {
        placeholder: 'Type a message... (use @ for mentions)'
      }
    });
    
    // Enable mention autocomplete in input
    this.inputEl.addEventListener('input', () => {
      this.checkForMentions();
    });
    
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }
  
  checkForMentions() {
    const text = this.inputEl.value;
    const cursor = this.inputEl.selectionStart;
    const before = text.substring(0, cursor);
    
    // Check if typing a mention
    const mentionMatch = before.match(/@([\w-]*)$/);
    if (mentionMatch) {
      this.showMentionPalette(mentionMatch[1]);
    }
  }
}
```

**3.4 Send Message**
```typescript
async sendMessage() {
  const message = this.inputEl.value.trim();
  if (!message) return;
  
  // Display user message
  this.displayMessage({
    role: 'user',
    content: message,
    timestamp: Date.now()
  });
  
  // Write to conversation file
  await this.writeToConversationFile(message);
  
  // Clear input
  this.inputEl.value = '';
  
  // Show "thinking" indicator
  this.showThinking();
  
  // Daemon will process and write response
  // We watch the conversation file for updates
}
```

**3.5 Watch Conversation File**
```typescript
async watchConversationFile() {
  const conversationPath = this.getCurrentConversationPath();
  
  // Watch for file changes
  this.registerEvent(
    this.app.vault.on('modify', (file) => {
      if (file.path === conversationPath) {
        this.loadLatestMessages();
      }
    })
  );
}

async loadLatestMessages() {
  const file = this.app.vault.getAbstractFileByPath(this.conversationPath);
  const content = await this.app.vault.read(file);
  
  // Parse conversation markdown
  const messages = this.parseConversation(content);
  
  // Display new messages
  messages.forEach(msg => {
    if (!this.hasDisplayed(msg)) {
      this.displayMessage(msg);
    }
  });
  
  // Remove thinking indicator
  this.hideThinking();
}
```

**3.6 Write to Conversation File**
```typescript
async writeToConversationFile(message: string) {
  const sessionId = this.getCurrentSessionId();
  const conversationPath = `.spark/conversations/${sessionId}.md`;
  
  // Append message
  const timestamp = new Date().toISOString();
  const content = `\n\n**User:** ${message}\n\n`;
  
  await this.app.vault.adapter.append(conversationPath, content);
}
```

**Success Criteria:**
- ✅ Cmd+K opens chat widget
- ✅ Can type and send messages
- ✅ @ mentions work in chat
- ✅ Messages persist to conversation file
- ✅ Daemon responses appear automatically
- ✅ Conversation history loads on reopen

---

## Phase 4: Notification Watcher (Week 5)

### Deliverables
- [ ] Watch `.spark/notifications.jsonl`
- [ ] Display toast notifications
- [ ] Update status bar

### Tasks

**4.1 Watch Notification File**
```typescript
class NotificationWatcher {
  private lastPosition: number = 0;
  
  async startWatching() {
    const notifPath = '.spark/notifications.jsonl';
    
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (file.path === notifPath) {
          await this.readNewNotifications();
        }
      })
    );
    
    // Initial position
    this.lastPosition = await this.getFileSize(notifPath);
  }
  
  async readNewNotifications() {
    const file = this.app.vault.getAbstractFileByPath('.spark/notifications.jsonl');
    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    
    // Read only new lines since last position
    const newLines = lines.slice(this.lastPosition);
    
    for (const line of newLines) {
      if (line.trim()) {
        const notif = JSON.parse(line);
        this.showNotification(notif);
      }
    }
    
    this.lastPosition = lines.length;
  }
}
```

**4.2 Display Notifications**
```typescript
showNotification(notif: Notification) {
  const icon = this.getIcon(notif.type);
  const message = `${icon} ${notif.message}`;
  
  // Show Obsidian toast
  new Notice(message, notif.type === 'error' ? 10000 : 3000);
  
  // If has link to error log, add click handler
  if (notif.link) {
    // Show notification with clickable link
    this.showClickableNotification(message, notif.link);
  }
}

getIcon(type: string): string {
  switch(type) {
    case 'success': return '✓';
    case 'error': return '✗';
    case 'warning': return '⚠';
    case 'info': return 'ℹ';
    default: return '';
  }
}
```

**Success Criteria:**
- ✅ Daemon notifications appear as toasts
- ✅ Success notifications auto-dismiss
- ✅ Error notifications stay longer
- ✅ Can click to open error logs

---

## Phase 5: Polish & Settings (Week 6)

### Deliverables
- [ ] Settings panel
- [ ] Keyboard shortcuts
- [ ] Style improvements
- [ ] Error handling

### Tasks

**5.1 Settings Panel**
```typescript
class SparkSettingTab extends PluginSettingTab {
  display() {
    const { containerEl } = this;
    containerEl.empty();
    
    containerEl.createEl('h2', { text: 'Spark Assistant Settings' });
    
    // Chat hotkey
    new Setting(containerEl)
      .setName('Chat hotkey')
      .setDesc('Hotkey to open chat widget')
      .addText(text => text
        .setValue(this.plugin.settings.chatHotkey)
        .onChange(async (value) => {
          this.plugin.settings.chatHotkey = value;
          await this.plugin.saveSettings();
        }));
    
    // Enable features
    new Setting(containerEl)
      .setName('Enable command palette')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enablePalette)
        .onChange(async (value) => {
          this.plugin.settings.enablePalette = value;
          await this.plugin.saveSettings();
        }));
  }
}
```

**5.2 Error Handling**
```typescript
try {
  await this.sendMessage(message);
} catch (error) {
  console.error('Spark plugin error:', error);
  new Notice('❌ Error: ' + error.message);
  
  // Optionally write error to file
  await this.logError(error);
}
```

**5.3 Styling**
```css
/* styles.css */
.spark-palette {
  position: absolute;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  max-height: 300px;
  overflow-y: auto;
  z-index: 1000;
}

.spark-palette-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.spark-palette-item:hover,
.spark-palette-item.selected {
  background: var(--background-modifier-hover);
}

.spark-chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.spark-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.spark-message-user {
  text-align: right;
  margin: 8px 0;
}

.spark-message-assistant {
  text-align: left;
  margin: 8px 0;
}
```

**Success Criteria:**
- ✅ Settings panel accessible
- ✅ Customizable hotkeys
- ✅ Clean, polished UI
- ✅ Errors handled gracefully

---

## Testing Strategy

### Unit Tests
- Fuzzy matcher logic
- Message parsing
- Notification parsing

### Integration Tests
- Command palette workflow
- Chat message flow
- File watching

### Manual Testing
- Test in actual Obsidian vault
- Various keyboard shortcuts
- Edge cases (empty files, long text)

---

## Deployment

### Distribution
1. Build release version
2. Create GitHub release
3. Submit to Obsidian community plugins (optional)
4. Manual installation instructions

### Installation
```bash
# Clone into vault plugins directory
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/yourorg/spark.git
cd spark
npm install
npm run build

# Enable in Obsidian settings
```

---

## Success Metrics

- ✅ Command palette responds < 100ms
- ✅ Chat widget opens < 200ms
- ✅ No UI blocking operations
- ✅ Works with large vaults (10,000+ files)
- ✅ Memory usage < 50MB

---

## Dependencies

```json
{
  "dependencies": {
    "obsidian": "latest"
  },
  "devDependencies": {
    "@types/node": "^16.x",
    "typescript": "^4.x",
    "esbuild": "^0.17.x"
  }
}
```

---

## Next Steps

Once plugin is complete:
1. Test with daemon integration
2. Gather feedback from dogfooding
3. Iterate on UX
4. Add advanced features (inline command results, etc.)
