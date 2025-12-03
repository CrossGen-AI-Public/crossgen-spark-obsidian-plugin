/**
 * Version Command
 * Show version information
 */

import type { Command } from 'commander';

export function registerVersionCommand(program: Command, version: string): void {
  program
    .command('version')
    .description('Show version information')
    .action(() => {
      console.log(`Spark Daemon v${version}`);
      console.log(`Node.js ${process.version}`);
    });
}
