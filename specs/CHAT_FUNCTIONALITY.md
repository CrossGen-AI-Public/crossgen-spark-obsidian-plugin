# Chat Functionality Specification

**Status:** MVP Complete - Polish & Bug Fixes Needed  
**Date:** October 26, 2025  
**Last Updated:** October 26, 2025  
**Related Docs:** AGENT_SDK_NEXT_STEPS.md, PRD.md, BUGS.md

---

## Implementation Status

### ✅ Completed (MVP)

**Phase 1: UI Implementation**
- ✅ ChatWindow - Floating overlay with drag/resize
- ✅ ChatInput - Contenteditable div with mention support
- ✅ ChatMessages - Message display with formatting
- ✅ ChatManager - Window state management
- ✅ ChatSelector - New chat creation and conversation switching
- ✅ Hotkey support (Cmd+K)
- ✅ Auto-scroll to latest messages
- ✅ Loading animation with jumping dots
- ✅ Multi-agent chat title support

**Phase 2: Conversation Management**
- ✅ ConversationStorage - JSON file persistence in `.spark/conversations/`
- ✅ Message history with conversation context
- ✅ Chat selector with dropdown
- ✅ New chat button and conversation switching
- ✅ Default to most recent conversation

**Phase 3: Agent Integration**
- ✅ ChatQueue - File-based plugin→daemon communication (`.spark/chat-queue/`)
- ✅ ChatResultWatcher - File-based daemon→plugin communication (`.spark/chat-results/`)
- ✅ ChatQueueHandler (daemon) - Process chat messages via CommandExecutor
- ✅ Integration with existing agent system
- ✅ Active file context tracking for vault proximity
- ✅ Mention parsing (@agent, @file, @folder/)
- ✅ ChatMentionHandler - Basic mention decoration in input

**File System Communication**
- ✅ Plugin writes to `.spark/chat-queue/*.md` with conversation context
- ✅ Daemon watches queue directory and processes messages
- ✅ Daemon writes results to `.spark/chat-results/*.jsonl`
- ✅ Plugin watches results and updates UI in real-time
- ✅ Active file path passed for proper vault context

### 🐛 Known Issues (See BUGS.md)

1. ✅ FIXED - Agent/file name confusion in chat titles
2. ✅ FIXED - Wrong agent attribution in multi-agent chats  
3. ✅ FIXED - Missing send button (arrow-up icon)
4. ✅ FIXED - Shift+Enter not creating new line
5. ✅ FIXED - Conversation text not selectable/copiable
6. ✅ FIXED - Agent responses not rendered as markdown
7. ✅ FIXED - Mentions not decorated in conversation history (decorated and clickable)
8. ✅ FIXED - Command palette integration in chat input

### 🔄 Not Yet Implemented

**Phase 3 Remaining:**
- File modification tracking and notifications (when agents create/edit files)

**Phase 4: Enhanced Features (Future)**
- Conversation search across all chats
- Export/import conversations
- Advanced multi-agent support
- Context preservation improvements
- Quick action shortcuts

---

## User Interface Design

### Chat Window
- **Floating overlay** positioned in bottom-right corner
- **Resizable window** with minimum/maximum dimensions
- **Dynamic chat titles** showing active agents (e.g., "Chat with betty and bob")
- **Title truncation** for conversations with many agents
- **Closeable** with ESC key or close button
- **Always on top** of other Obsidian elements

### Input Experience
- **Intuitive text input** with visual send button
- **Keyboard shortcuts**: Enter to send, Shift+Enter for new line
- **Auto-expanding input** that grows with content
- **Helpful placeholder**: "Type your message (@ for mentions)..."
- **Multi-line support** for longer messages
- **Smart positioning** of command palette above input

### Message Display
- **Rich formatting** for agent responses (code blocks, bold, lists)
- **Visual distinction** between user and agent messages
- **Clickable mentions** for quick navigation to agents, files, and folders
- **Selectable text** for copying important information
- **Auto-scroll** to keep latest messages visible
- **Loading indicators** during agent processing

---

## Agent Interaction

### Agent Communication
- **Smart conversation context** - agents remember previous messages
- **Persistent agent relationships** - continue with same agent across messages
- **Multi-agent conversations** - switch between agents seamlessly
- **Visual agent identification** in chat titles and message attribution
- **Agent file access** - agents can read and modify vault files when requested

### Mention System
- **Unified mention syntax** - same @ and / commands as command palette
- **Auto-completion** with visual suggestions
- **Color-coded mentions** for easy identification
- **File and folder support** - reference vault content directly
- **Agent discovery** - quickly find and mention available agents

### Conversation Flow
- **Contextual responses** - agents understand conversation history
- **Agent switching** - change conversation agents by mentioning others
- **Follow-up questions** - continue conversations without repeated mentions
- **File modification feedback** - see when agents create or edit files

---

## Visual Design Elements

### Styling and Layout
- **Chat version of the palette** that spans chat window width
- **Consistent color scheme** across all UI elements
- **Responsive design** - adapts to different window sizes
- **Clean typography** with proper hierarchy
- **Smooth animations** for loading and state changes

### Interactive Elements
- **Hover states** for clickable mentions and buttons
- **Focus indicators** for keyboard navigation
- **Visual feedback** for user actions
- **Accessible color contrast** for readability
- **Smooth transitions** between different states

### Information Architecture
- **Clear visual separation** between input area and conversation
- **Organized message flow** with timestamps and speaker labels
- **Intuitive chat selector** for conversation management
- **Contextual information** displayed when relevant

---

## Executive Summary

This specification outlines the implementation of a cursor-like floating chat window functionality for Spark. The chat system enables users to interact with AI agents through a persistent overlay in the bottom-right corner of the screen, with support for conversation history and file modification capabilities.

**Current State:** The MVP is functional with full plugin-daemon communication via file system, conversation persistence, and basic agent interaction. Polish and bug fixes needed before production-ready.

## Requirements Overview

Based on Linear task requirements:

1. **Floating chat window** triggered by Cmd+K hotkey
2. **Persistent conversation history** stored in .spark/conversations/
3. **Same mention system** as command palette (@agent, @file, @folder/)
4. **Agent file modification** capabilities for vault operations

## Architecture

### Components

1. **ChatWindowManager** - Plugin component for UI management
2. **ConversationManager** - Handles conversation persistence and loading
3. **ChatMessageHandler** - Processes messages through existing CommandExecutor
4. **ChatResultWriter** - Writes chat responses back to the chat UI

### Data Flow (Implemented)

```
User Input (Cmd+K) → ChatWindow → ChatQueue writes to .spark/chat-queue/ →
Daemon (ChatQueueHandler) → CommandExecutor → Agent SDK → AI Response →
Daemon writes to .spark/chat-results/ → ChatResultWatcher → 
ChatWindow updates UI → ConversationStorage persists
```

**Key Design Decision:** Plugin-daemon communication uses file system (not WebSockets/IPC):
- Plugin writes markdown files to `.spark/chat-queue/` with conversation context
- Daemon watches queue directory and processes via existing CommandExecutor
- Daemon writes JSONL responses to `.spark/chat-results/`
- Plugin watches results directory and updates UI in real-time
- Conversation JSON files remain separate for UI state management

## Implementation Plan

### Phase 1: Planning
- Define data structures for conversations
- Design storage format for .spark/conversations/
- Outline UI components and interactions
- Plan integration with existing architecture

### Phase 2: Decision Making
- Finalize UI/UX design decisions
- Confirm storage and persistence strategy
- Determine message processing flow
- Resolve any architectural questions

### Phase 3: Implementation
- Implement conversation storage system
- Create chat UI components
- Integrate with existing daemon communication
- Add hotkey support and window management
- Implement agent interaction capabilities

## Key Features

### 1. Floating Chat Window

- Triggered by Cmd+K hotkey
- Overlay in bottom-right corner
- Resizable with minimum/maximum dimensions
- Closeable with ESC key or close button
- Stays on top of other Obsidian elements
- Dynamic title showing mentioned agents with truncation

### 2. Conversation History

- Each conversation stored in separate JSON file
- File format: .spark/conversations/{timestamp}-{id}.json
- Includes messages, timestamps, agent information
- Searchable conversation history
- Export/import conversation capabilities

### 3. Agent Interaction

- Same mention syntax as command palette
- Agents can access and modify vault files
- File modification notifications
- Real-time feedback on agent actions

### 4. Integration Points

- Leverages existing CommandExecutor for processing
- Uses current agent configuration system
- Integrates with proximity-based context loading
- Supports existing provider abstraction

## Configuration

```yaml
features:
  chat:
    enabled: true
    hotkey: "Cmd+K"
    position: "bottom-right"
    default_width: 400px
    default_height: 500px
    max_width: 800px
    max_height: 90vh
    persist_conversations: true
    conversation_limit: 100
```

## Storage Format

Conversations stored in .spark/conversations/:

```json
{
  "id": "conv-12345",
  "created": "2025-10-24T10:00:00Z",
  "updated": "2025-10-24T10:15:00Z",
  "messages": [
    {
      "id": "msg-1",
      "timestamp": "2025-10-24T10:00:00Z",
      "type": "user",
      "content": "@betty review @finance/Q4/"
    },
    {
      "id": "msg-2", 
      "timestamp": "2025-10-24T10:01:00Z",
      "type": "agent",
      "agent": "betty",
      "content": "I've reviewed Q4 finances...",
      "files_modified": ["reports/Q4-summary.md"]
    }
  ]
}
```

## Agent File Modification Capabilities

### File Operations Through Chat

Agents in chat can perform the following file operations:

1. **Read Files** - Access any vault file (except system directories)
2. **Create Files** - Generate new files in specified locations
3. **Edit Files** - Modify existing files based on user requirements
4. **Multi-file Operations** - Work with multiple files simultaneously

### File Modification Workflow

```
User Request → Agent Processing → File Operations → 
Result Notification → Chat Feedback
```

### Permissions and Safety

- Sandboxed to vault directory (no access to system dirs)
- Restricted from .spark/, .obsidian/, .git/, node_modules/, .trash/
- User can configure additional restrictions
- All file modifications logged and reported back to user

### Notification System

When agents modify files, the chat interface displays:

```
📝 Betty modified 2 files:
  • reports/Q4-analysis.md (new)
  • finance/summary.md (edited)

[View Changes] [Dismiss]
```

## Next Steps

### ✅ Completed Bug Fixes

1. ✅ **Markdown Rendering** - Agent responses properly render markdown
2. ✅ **Send Button** - 20x20 arrow-up icon added
3. ✅ **Command Palette** - @mentions and /commands palette works in chat
4. ✅ **Shift+Enter** - Multi-line messages work properly
5. ✅ **Text Selection** - Conversation history is selectable/copiable
6. ✅ **Decorated Mentions** - Mentions styled and clickable in all messages
7. ✅ **Agent Attribution** - Primary agent tracked across conversation
8. ✅ **Folders in Palette** - Directories now appear in @ suggestions

### Enhancement Priorities

1. **File Modification Notifications** - Show when agents create/edit files
2. **Conversation Search** - Find messages across all conversations
3. **Export/Import** - Backup and restore functionality

## Resolved Questions

1. **Conversations scope:** Global - conversations can reference and modify multiple files across the vault
2. **Concurrent sessions:** Start with single session implementation, design for future multi-session support
3. **File modifications:** Agents can create files, directories, and modify existing files when requested
4. **Notification integration:** Use existing notifications.jsonl system, plan future UI notifications

## Implementation Plan

### Phase 1: UI Implementation (Starting Point)

**Plugin Components:**
1. **ChatWindow** - Floating overlay component
2. **ChatInput** - Message input with mention support and decoration
3. **ChatMessages** - Message display with formatting
4. **ChatManager** - Window state management
5. **ChatSelector** - Conversation management and selection

**UI Features:**
- Toggle visibility with Cmd+K
- Draggable and resizable window
- Auto-scroll to latest messages
- Message timestamps and agent indicators
- Loading animation with jumping dots during agent processing
- Keyboard shortcuts: Enter to send, Shift+Enter for new line
- Multi-agent chat title support with truncation (e.g., "Chat with betty and bob", "Chat with agent1, agent2 and 3 others")
- **Command palette integration**: @mentions and /commands in chat input
- **Mention decoration**: Visual styling for agents, files, folders, and commands
- **Chat selector**: New chat button and conversation list dropdown

**Integration Points:**
- Leverage existing mention system from command palette
- Use existing MentionDecorator for chat input styling
- Use Obsidian's CSS framework for styling
- Integrate with existing hotkey system

### Phase 2: Conversation Management

**Storage Components:**
1. **ConversationStorage** - Read/write .spark/conversations/
2. **ConversationManager** - Session state management
3. **MessageHistory** - Message persistence and retrieval
4. **ChatSelector** - New chat creation and conversation switching

**Chat Selector Features:**
- New Chat button (always creates fresh conversation)
- Conversation history dropdown showing recent conversations
- Conversation preview with first message or date
- Switch between conversations without losing context
- Default to most recent conversation on open

### Phase 3: Agent Integration & Command Palette

**Processing Components:**
1. **ChatMessageHandler** - Process messages through CommandExecutor
2. **ChatResultWriter** - Format and display agent responses
3. **FileModificationTracker** - Track and report file changes
4. **ChatMentionHandler** - Handle @mentions and /commands in chat

**Command Palette Integration:**
- Same @agent, @file, @folder/ syntax as command palette
- Same /command syntax for spark commands
- Mention decoration with visual styling (colors, icons)
- Clickable mentions for quick navigation
- Auto-completion suggestions for mentions

### Phase 4: Enhanced Features

**Advanced Chat Features:**
1. **Conversation Search** - Find messages across all conversations
2. **Export/Import** - Backup and restore conversations
3. **Multi-agent Support** - Simultaneous conversations with multiple agents
4. **Context Preservation** - Maintain file/folder context across messages
5. **Quick Actions** - Common commands via mention shortcuts
