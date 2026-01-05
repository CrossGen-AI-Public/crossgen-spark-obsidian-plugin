/**
 * Status Command
 * Check if daemon is running
 */

import path from 'node:path';
import type { Command } from 'commander';
import { print } from '../output.js';
import { findDaemon, getActiveDaemons } from '../registry.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Check daemon status')
    .argument('[vault-path]', 'Path to Obsidian vault (shows all if omitted)', '')
    .action((vaultPath: string) => {
      // If no vault specified, show all running daemons
      if (!vaultPath) {
        const daemons = getActiveDaemons();

        if (daemons.length === 0) {
          print('No daemons are currently running');
          process.exit(0);
        }

        print(`Found ${daemons.length} running daemon(s):\n`);
        daemons.forEach((daemon, index) => {
          const uptime = Math.floor((Date.now() - daemon.startTime) / 1000);
          const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`;
          print(`${index + 1}. ${daemon.vaultPath}`);
          print(`   PID: ${daemon.pid} | Uptime: ${uptimeStr}`);
        });
        process.exit(0);
      }

      // Check specific vault
      const absolutePath = path.resolve(vaultPath);
      const daemon = findDaemon(absolutePath);

      if (daemon) {
        const uptime = Math.floor((Date.now() - daemon.startTime) / 1000);
        const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`;
        print('✅ Daemon is running');
        print(`   PID: ${daemon.pid}`);
        print(`   Vault: ${daemon.vaultPath}`);
        print(`   Uptime: ${uptimeStr}`);
      } else {
        print('❌ Daemon is not running for this vault');
        print(`   Vault: ${absolutePath}`);
        process.exit(1);
      }
    });
}
