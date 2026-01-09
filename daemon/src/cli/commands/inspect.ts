/**
 * Inspect Command
 * Inspect daemon configuration and state
 */

import path from 'node:path';
import type { Command } from 'commander';
import { ConfigLoader } from '../../config/ConfigLoader.js';
import { SecretsLoader } from '../../config/SecretsLoader.js';
import { validateVault } from '../helpers.js';
import { print, printError } from '../output.js';

async function runInspectCommand(vaultPath: string): Promise<void> {
  const absolutePath = path.resolve(vaultPath);

  // Validate that this is an Obsidian vault
  validateVault(absolutePath, 'start');

  print(`Inspecting vault: ${absolutePath}`);
  print('');

  try {
    const configLoader = new ConfigLoader();
    const config = await configLoader.load(absolutePath);

    printVaultInfo(absolutePath);
    printConfigInfo(config);
    printWatchInfo(config);
    printAiInfo(config, vaultPath);
  } catch (error) {
    printError('❌ Inspection failed:');
    printError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function printVaultInfo(absolutePath: string): void {
  print('📁 Vault Information:');
  print(`  Path: ${absolutePath}`);
  print(`  Config file: ${absolutePath}/.spark/config.yaml`);
  print('');
}

function printConfigInfo(config: Awaited<ReturnType<ConfigLoader['load']>>): void {
  print('⚙️  Configuration:');
  print(`  Log level: ${config.logging.level}`);
  print(`  Console logging: ${config.logging.console ? 'enabled' : 'disabled'}`);
  print(`  Debounce: ${config.daemon.debounce_ms}ms`);
  print('');
}

function printWatchInfo(config: Awaited<ReturnType<ConfigLoader['load']>>): void {
  print('👁️  Watch Patterns:');
  config.daemon.watch.patterns.forEach((pattern) => {
    print(`  + ${pattern}`);
  });
  print('');

  print('🚫 Ignore Patterns:');
  config.daemon.watch.ignore.forEach((pattern) => {
    print(`  - ${pattern}`);
  });
  print('');
}

function printAiInfo(config: Awaited<ReturnType<ConfigLoader['load']>>, vaultPath: string): void {
  print('🤖 AI Configuration:');
  print(`  Default Provider: ${config.ai.defaultProvider}`);
  print(`  Available Providers:`);

  // Load secrets to check API key status
  const secretsLoader = new SecretsLoader(vaultPath);
  secretsLoader.load();

  for (const [name, providerConfig] of Object.entries(config.ai.providers || {})) {
    const isDefault = name === config.ai.defaultProvider;
    const hasApiKey = secretsLoader.hasApiKey(name);
    print(`    ${isDefault ? '→' : ' '} ${name}`);
    print(`      Type: ${providerConfig.type}`);
    print(`      Model: ${providerConfig.model}`);
    print(`      API Key: ${hasApiKey ? '✓ configured in ~/.spark/secrets.yaml' : '✗ missing'}`);
    print(`      Max Tokens: ${providerConfig.maxTokens}`);
    print(`      Temperature: ${providerConfig.temperature}`);
  }
}

export function registerInspectCommand(program: Command): void {
  program
    .command('inspect')
    .description('Inspect daemon configuration and state')
    .argument('[vault-path]', 'Path to Obsidian vault', process.cwd())
    .action(runInspectCommand);
}
