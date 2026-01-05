/**
 * Config Command
 * Validate and inspect configuration
 */

import path from 'node:path';
import type { Command } from 'commander';
import { ConfigLoader } from '../../config/ConfigLoader.js';
import { validateVault } from '../helpers.js';
import { print, printError } from '../output.js';

export function registerConfigCommand(program: Command): void {
  program
    .command('config')
    .description('Validate and inspect configuration')
    .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
    .option('-v, --verbose', 'Show detailed validation results', false)
    .action(async (vaultPath: string, options: { verbose: boolean }) => {
      const absolutePath = path.resolve(vaultPath);

      // Validate that this is an Obsidian vault
      validateVault(absolutePath, 'start');

      print(`Validating configuration at: ${absolutePath}`);

      try {
        const configLoader = new ConfigLoader();
        const config = await configLoader.load(absolutePath);

        print('✓ Configuration is valid');

        if (options.verbose) {
          print('\nConfiguration:');
          print(JSON.stringify(config, null, 2));
        } else {
          print('\nConfiguration summary:');
          print(`  Log level: ${config.logging.level}`);
          print(`  Console logging: ${config.logging.console ? 'enabled' : 'disabled'}`);
          print(`  Watch patterns: ${config.daemon.watch.patterns.join(', ')}`);
          print(`  Debounce: ${config.daemon.debounce_ms}ms`);
          print(`  Default AI Provider: ${config.ai.defaultProvider}`);
          const defaultProvider = config.ai.providers?.[config.ai.defaultProvider];
          print(`  AI Model: ${defaultProvider?.model || 'not configured'}`);
        }
      } catch (error) {
        printError('❌ Configuration validation failed:');
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
