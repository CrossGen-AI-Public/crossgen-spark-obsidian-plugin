#!/usr/bin/env node
import { copyFile, mkdir, cp, chmod } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { platform } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function buildTemplates() {
  try {
    console.log('Building init templates...');

    // Create templates directory in dist
    const templatesDir = join(__dirname, 'dist', 'init', 'templates');
    await mkdir(templatesDir, { recursive: true });
    console.log('✓ Created templates directory');

    // Source paths - copy from example-vault (single source of truth)
    const exampleVaultSparkDir = join(__dirname, '..', 'example-vault', '.spark');
    const configPath = join(exampleVaultSparkDir, 'config.yaml');
    const agentsDir = join(exampleVaultSparkDir, 'agents');
    const commandsDir = join(exampleVaultSparkDir, 'commands');

    // Check if source directory exists
    if (!existsSync(exampleVaultSparkDir)) {
      throw new Error(`Example vault .spark directory not found: ${exampleVaultSparkDir}`);
    }

    // Check if config file exists
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    // Copy config.yaml
    await copyFile(configPath, join(templatesDir, 'config.yaml'));
    console.log('✓ Copied config.yaml');

    // Copy agents directory
    if (existsSync(agentsDir)) {
      await cp(agentsDir, join(templatesDir, 'agents'), { recursive: true });
      console.log('✓ Copied agents directory');
    } else {
      console.warn('! agents directory not found, skipping');
    }

    // Copy commands directory
    if (existsSync(commandsDir)) {
      await cp(commandsDir, join(templatesDir, 'commands'), { recursive: true });
      console.log('✓ Copied commands directory');
    } else {
      console.warn('! commands directory not found, skipping');
    }

    // Make cli.js executable on Unix systems (for local dev)
    if (platform() !== 'win32') {
      const cliPath = join(__dirname, 'dist', 'cli.js');
      if (existsSync(cliPath)) {
        await chmod(cliPath, 0o755); // rwxr-xr-x
        console.log('✓ Made cli.js executable');
      }
    }

    console.log('✓ Build templates complete');
  } catch (error) {
    console.error('✗ Build templates failed:', error.message);
    process.exit(1);
  }
}

buildTemplates();
