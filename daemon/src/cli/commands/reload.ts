/**
 * Reload Command
 * Reload configuration without restarting daemon
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { validateVault } from '../helpers.js';
import { print, printError } from '../output.js';
import { findDaemon } from '../registry.js';

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
        printError('❌ No daemon running for this vault');
        printError(`   Run: spark start ${absolutePath}`);
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

        print('Reloading configuration...');

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

        print('');

        if (status) {
          if (status.status === 'success') {
            print('✅ Configuration reloaded successfully');
            print('   All settings have been updated');
          } else {
            print('❌ Configuration reload failed');
            print(`   Error: ${status.message}`);
            print('');
            print('   The daemon is still running with the previous configuration.');
            print('   Fix the config file and try again: spark reload');
            process.exit(1);
          }
        } else {
          print('⚠️  Reload signal sent, but status unclear');
          print(`   PID: ${daemon.pid}`);
          print('');
          print('   The daemon may still be processing the reload.');
          print('   Check daemon logs to confirm:');
          print('   - Foreground: check console output');
          print('   - Background: tail -f ~/.spark/daemon.log');
        }
      } catch (error) {
        printError('❌ Failed to send reload signal:', error);
        printError('   The daemon process may have terminated');
        printError('');
        printError('   Check daemon status: spark status');
        process.exit(1);
      }
    });
}
