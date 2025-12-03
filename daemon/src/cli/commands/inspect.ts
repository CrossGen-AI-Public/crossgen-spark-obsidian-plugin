/**
 * Inspect Command
 * Inspect daemon configuration and state
 */

import type { Command } from 'commander';
import path from 'node:path';
import { ConfigLoader } from '../../config/ConfigLoader.js';
import { SecretsLoader } from '../../config/SecretsLoader.js';
import { validateVault } from '../helpers.js';

export function registerInspectCommand(program: Command): void {
  program
    .command('inspect')
    .description('Inspect daemon configuration and state')
    .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
    .action(async (vaultPath: string) => {
      const absolutePath = path.resolve(vaultPath);

      // Validate that this is an Obsidian vault
      validateVault(absolutePath, 'start');

      console.log(`Inspecting vault: ${absolutePath}`);
      console.log('');

      try {
        const configLoader = new ConfigLoader();
        const config = await configLoader.load(absolutePath);

        // Show vault info
        console.log('📁 Vault Information:');
        console.log(`  Path: ${absolutePath}`);
        console.log(`  Config file: ${absolutePath}/.spark/config.yaml`);
        console.log('');

        // Show configuration
        console.log('⚙️  Configuration:');
        console.log(`  Log level: ${config.logging.level}`);
        console.log(`  Console logging: ${config.logging.console ? 'enabled' : 'disabled'}`);
        console.log(`  Debounce: ${config.daemon.debounce_ms}ms`);
        console.log('');

        // Show watch patterns
        console.log('👁️  Watch Patterns:');
        config.daemon.watch.patterns.forEach((pattern) => {
          console.log(`  + ${pattern}`);
        });
        console.log('');

        // Show ignore patterns
        console.log('🚫 Ignore Patterns:');
        config.daemon.watch.ignore.forEach((pattern) => {
          console.log(`  - ${pattern}`);
        });
        console.log('');

        // Show AI config
        console.log('🤖 AI Configuration:');
        console.log(`  Default Provider: ${config.ai.defaultProvider}`);
        console.log(`  Available Providers:`);

        // Load secrets to check API key status
        const secretsLoader = new SecretsLoader(vaultPath);
        secretsLoader.load();

        for (const [name, providerConfig] of Object.entries(config.ai.providers || {})) {
          const isDefault = name === config.ai.defaultProvider;
          const hasApiKey = secretsLoader.hasApiKey(name);
          console.log(`    ${isDefault ? '→' : ' '} ${name}`);
          console.log(`      Type: ${providerConfig.type}`);
          console.log(`      Model: ${providerConfig.model}`);
          console.log(
            `      API Key: ${hasApiKey ? '✓ configured in ~/.spark/secrets.yaml' : '✗ missing'}`
          );
          console.log(`      Max Tokens: ${providerConfig.maxTokens}`);
          console.log(`      Temperature: ${providerConfig.temperature}`);
        }
      } catch (error) {
        console.error('❌ Inspection failed:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
