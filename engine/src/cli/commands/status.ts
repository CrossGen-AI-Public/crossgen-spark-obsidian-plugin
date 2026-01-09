/**
 * Status Command
 * Check if engine is running
 */

import path from 'node:path';
import type { Command } from 'commander';
import { print } from '../output.js';
import { findEngine, getActiveEngines } from '../registry.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Check engine status')
    .argument('[vault-path]', 'Path to Obsidian vault (shows all if omitted)', '')
    .action((vaultPath: string) => {
      // If no vault specified, show all running engines
      if (!vaultPath) {
        const engines = getActiveEngines();

        if (engines.length === 0) {
          print('No engines are currently running');
          process.exit(0);
        }

        print(`Found ${engines.length} running engine(s):\n`);
        engines.forEach((engine, index) => {
          const uptime = Math.floor((Date.now() - engine.startTime) / 1000);
          const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`;
          print(`${index + 1}. ${engine.vaultPath}`);
          print(`   PID: ${engine.pid} | Uptime: ${uptimeStr}`);
        });
        process.exit(0);
      }

      // Check specific vault
      const absolutePath = path.resolve(vaultPath);
      const engine = findEngine(absolutePath);

      if (engine) {
        const uptime = Math.floor((Date.now() - engine.startTime) / 1000);
        const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`;
        print('✅ Engine is running');
        print(`   PID: ${engine.pid}`);
        print(`   Vault: ${engine.vaultPath}`);
        print(`   Uptime: ${uptimeStr}`);
      } else {
        print('❌ Engine is not running for this vault');
        print(`   Vault: ${absolutePath}`);
        process.exit(1);
      }
    });
}
