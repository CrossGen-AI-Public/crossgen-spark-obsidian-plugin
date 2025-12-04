/**
 * Config Command
 * Validate and inspect configuration
 */

import path from 'node:path';
import type { Command } from 'commander';
import { ConfigLoader } from '../../config/ConfigLoader.js';
import { validateVault } from '../helpers.js';

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

      console.log(`Validating configuration at: ${absolutePath}`);

      try {
        const configLoader = new ConfigLoader();
        const config = await configLoader.load(absolutePath);

        console.log('✓ Configuration is valid');

        if (options.verbose) {
          console.log('\nConfiguration:');
          console.log(JSON.stringify(config, null, 2));
        } else {
          console.log('\nConfiguration summary:');
          console.log(`  Log level: ${config.logging.level}`);
          console.log(`  Console logging: ${config.logging.console ? 'enabled' : 'disabled'}`);
          console.log(`  Watch patterns: ${config.daemon.watch.patterns.join(', ')}`);
          console.log(`  Debounce: ${config.daemon.debounce_ms}ms`);
          console.log(`  Default AI Provider: ${config.ai.defaultProvider}`);
          const defaultProvider = config.ai.providers?.[config.ai.defaultProvider];
          console.log(`  AI Model: ${defaultProvider?.model || 'not configured'}`);
        }
      } catch (error) {
        console.error('❌ Configuration validation failed:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
