# Example Spark Vault

This is an example of an Obsidian vault configured with Spark Assistant.

## Current Status

✅ **Command Palette Working** - Try typing `/` or `@` in any note!  
🚧 **Chat Widget Coming Soon** - Cmd+K will open conversational AI  
🚧 **Daemon In Development** - Automation triggers pending


## Directory Structure

- `/emails/` - Email drafts (Kanban integration)
- `/tasks/` - Tasks and to-dos
- `/finance/` - Financial documents
- `/invoices/` - Invoice files
- `/.spark/` - Spark configuration

## Try It Out

### Slash Commands
```markdown
/summarize
```

### Agent Mentions
```markdown
@betty review @finance/Q4/ and compare with $quickbooks
```

### Chat (Cmd+K)
```
You: @betty what's our burn rate?
```

### Automatic Triggers

1. Create email in `/emails/` with `status: draft`
2. Change to `status: sent`
3. Email automatically sent!

See `.spark/` directory for all configuration.
