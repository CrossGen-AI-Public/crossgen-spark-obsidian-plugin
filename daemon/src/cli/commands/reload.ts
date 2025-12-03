/**
 * Reload Command
 * Reload configuration without restarting daemon
 */

import type { Command } from 'commander';
import path from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { findDaemon } from '../registry.js';
import { validateVault } from '../helpers.js';

export function registerReloadCommand(program: Command): void {
  program
    .command('reload')
    .description('Reload configuration without restarting daemon')
    .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
    .action(async (vaultPath: string) => {
      const absolutePath = path.resolve(vaultPath);

      // Validate that this is an Obsidian vault
      validateVault(absolutePath, 'start');

      // Find the running daemon
      const daemon = findDaemon(absolutePath);
      if (!daemon) {
        console.error('❌ No daemon running for this vault');
        console.error(`   Run: spark start ${absolutePath}`);
        process.exit(1);
      }

      try {
        // Clear any old status file
        const statusFile = path.join(absolutePath, '.spark', 'reload-status.json');
        try {
          if (existsSync(statusFile)) {
            unlinkSync(statusFile);
          }
        } catch {
          // Ignore - status file might not exist
        }

        // Send SIGUSR1 signal to trigger config reload
        process.kill(daemon.pid, 'SIGUSR1');

        console.log('Reloading configuration...');

        // Wait for daemon to process reload and write status
        const maxWaitMs = 2000; // 2 seconds timeout
        const checkIntervalMs = 100;
        let waited = 0;
        let status = null;

        while (waited < maxWaitMs) {
          await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
          waited += checkIntervalMs;

          if (existsSync(statusFile)) {
            try {
              const content = readFileSync(statusFile, 'utf-8');
              status = JSON.parse(content);
              break;
            } catch {
              // File might be mid-write, try again
            }
          }
        }

        console.log('');

        if (status) {
          if (status.status === 'success') {
            console.log('✅ Configuration reloaded successfully');
            console.log('   All settings have been updated');
          } else {
            console.log('❌ Configuration reload failed');
            console.log(`   Error: ${status.message}`);
            console.log('');
            console.log('   The daemon is still running with the previous configuration.');
            console.log('   Fix the config file and try again: spark reload');
            process.exit(1);
          }
        } else {
          console.log('⚠️  Reload signal sent, but status unclear');
          console.log(`   PID: ${daemon.pid}`);
          console.log('');
          console.log('   The daemon may still be processing the reload.');
          console.log('   Check daemon logs to confirm:');
          console.log('   - Foreground: check console output');
          console.log('   - Background: tail -f ~/.spark/daemon.log');
        }
      } catch (error) {
        console.error('❌ Failed to send reload signal:', error);
        console.error('   The daemon process may have terminated');
        console.error('');
        console.error('   Check daemon status: spark status');
        process.exit(1);
      }
    });
}
