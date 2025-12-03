/**
 * History Command
 * Show daemon processing history and statistics
 */

import type { Command } from 'commander';
import path from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { validateVault } from '../helpers.js';

interface HistoryEvent {
  timestamp: number;
  type: string;
  path?: string;
  details?: Record<string, unknown>;
}

export function registerHistoryCommand(program: Command): void {
  program
    .command('history')
    .description('Show daemon processing history and statistics')
    .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
    .option('-l, --limit <number>', 'Limit number of events shown', '50')
    .option('-s, --stats', 'Show statistics only', false)
    .option('-c, --clear', 'Clear history', false)
    .action(
      async (vaultPath: string, options: { limit: string; stats: boolean; clear: boolean }) => {
        const absolutePath = path.resolve(vaultPath);

        // Validate that this is an Obsidian vault
        validateVault(absolutePath, 'start');

        const historyFile = path.join(absolutePath, '.spark', 'history.json');

        // Clear history if requested
        if (options.clear) {
          try {
            if (existsSync(historyFile)) {
              unlinkSync(historyFile);
              console.log('✅ History cleared');
            } else {
              console.log('ℹ️  No history to clear');
            }
            return;
          } catch (error) {
            console.error('❌ Failed to clear history:', error);
            process.exit(1);
          }
        }

        // Read history file
        let history: HistoryEvent[] = [];

        try {
          if (existsSync(historyFile)) {
            const data = readFileSync(historyFile, 'utf-8');
            history = JSON.parse(data);
          }
        } catch (error) {
          console.error('❌ Failed to read history file:', error);
          process.exit(1);
        }

        if (history.length === 0) {
          console.log('ℹ️  No history available');
          console.log('   Start the daemon to begin recording events:');
          console.log(`   spark start ${absolutePath}`);
          return;
        }

        // Show statistics
        const stats = {
          total: history.length,
          fileChanges: history.filter((e) => e.type === 'file_change').length,
          commandsDetected: history.filter((e) => e.type === 'command_detected').length,
          frontmatterChanges: history.filter((e) => e.type === 'frontmatter_change').length,
          errors: history.filter((e) => e.type === 'error').length,
        };

        console.log('📊 Processing Statistics:');
        console.log(`  Total events: ${stats.total}`);
        console.log(`  File changes: ${stats.fileChanges}`);
        console.log(`  Commands detected: ${stats.commandsDetected}`);
        console.log(`  Frontmatter changes: ${stats.frontmatterChanges}`);
        console.log(`  Errors: ${stats.errors}`);
        console.log('');

        // Show events if not stats-only
        if (!options.stats) {
          const limit = parseInt(options.limit, 10);
          const recentEvents = history.slice(-limit).reverse();

          console.log(`📜 Recent Events (last ${Math.min(limit, history.length)}):`);
          console.log('');

          recentEvents.forEach((event, i) => {
            const date = new Date(event.timestamp);
            const timeStr = date.toLocaleTimeString();
            const typeEmoji =
              {
                file_change: '📝',
                command_detected: '⚡',
                frontmatter_change: '📋',
                error: '❌',
              }[event.type] || '•';

            console.log(`${i + 1}. ${typeEmoji} ${event.type} - ${timeStr}`);
            if (event.path) {
              console.log(`   Path: ${event.path}`);
            }
            if (event.details && Object.keys(event.details).length > 0) {
              console.log(
                `   Details: ${JSON.stringify(event.details, null, 2).replace(/\n/g, '\n   ')}`
              );
            }
            console.log('');
          });
        }
      }
    );
}
