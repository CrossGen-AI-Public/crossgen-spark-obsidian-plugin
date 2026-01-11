/**
 * Version Command
 * Show version information
 */

import type { Command } from 'commander';
import { print } from '../output.js';

export function registerVersionCommand(program: Command, version: string): void {
  program
    .command('version')
    .description('Show version information')
    .action(() => {
      print(`Spark Engine v${version}`);
      print(`Node.js ${process.version}`);
    });
}
