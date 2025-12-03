/**
 * Status Command
 * Check if daemon is running
 */

import type { Command } from 'commander';
import path from 'node:path';
import { getActiveDaemons, findDaemon } from '../registry.js';

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
          console.log('No daemons are currently running');
          process.exit(0);
        }

        console.log(`Found ${daemons.length} running daemon(s):\n`);
        daemons.forEach((daemon, index) => {
          const uptime = Math.floor((Date.now() - daemon.startTime) / 1000);
          const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`;
          console.log(`${index + 1}. ${daemon.vaultPath}`);
          console.log(`   PID: ${daemon.pid} | Uptime: ${uptimeStr}`);
        });
        process.exit(0);
      }

      // Check specific vault
      const absolutePath = path.resolve(vaultPath);
      const daemon = findDaemon(absolutePath);

      if (daemon) {
        const uptime = Math.floor((Date.now() - daemon.startTime) / 1000);
        const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m`;
        console.log('✅ Daemon is running');
        console.log(`   PID: ${daemon.pid}`);
        console.log(`   Vault: ${daemon.vaultPath}`);
        console.log(`   Uptime: ${uptimeStr}`);
      } else {
        console.log('❌ Daemon is not running for this vault');
        console.log(`   Vault: ${absolutePath}`);
        process.exit(1);
      }
    });
}
