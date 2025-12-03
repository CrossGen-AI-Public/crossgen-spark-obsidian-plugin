#!/usr/bin/env node
/**
 * Spark CLI
 * Command-line interface for the Spark daemon
 */

import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import {
  registerStartCommand,
  registerStopCommand,
  registerStatusCommand,
  registerConfigCommand,
  registerInspectCommand,
  registerHistoryCommand,
  registerReloadCommand,
  registerVersionCommand,
} from './cli/commands/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('spark')
  .description('Spark Assistant Daemon - Intelligence layer for Obsidian')
  .version(packageJson.version);

// Register all commands
registerStartCommand(program);
registerStopCommand(program);
registerStatusCommand(program);
registerConfigCommand(program);
registerInspectCommand(program);
registerHistoryCommand(program);
registerReloadCommand(program);
registerVersionCommand(program, packageJson.version);

// Parse command line arguments
program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
