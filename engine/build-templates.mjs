#!/usr/bin/env node
import { copyFile, mkdir, cp } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function buildTemplates() {
  try {
    console.log('Building init templates...');
    
    // Create templates directory
    const templatesDir = join(__dirname, 'dist', 'init', 'templates');
    await mkdir(templatesDir, { recursive: true });
    console.log('✓ Created templates directory');
    
    // Source paths
    const vaultDir = join(__dirname, '..', 'example-vault', '.spark');
    const configPath = join(vaultDir, 'config.yaml');
    const agentsDir = join(vaultDir, 'agents');
    const commandsDir = join(vaultDir, 'commands');
    
    // Check if source files exist
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
      console.warn('⚠ agents directory not found, skipping');
    }
    
    // Copy commands directory
    if (existsSync(commandsDir)) {
      await cp(commandsDir, join(templatesDir, 'commands'), { recursive: true });
      console.log('✓ Copied commands directory');
    } else {
      console.warn('⚠ commands directory not found, skipping');
    }
    
    console.log('✓ Build templates complete');
  } catch (error) {
    console.error('✗ Build templates failed:', error.message);
    process.exit(1);
  }
}

buildTemplates();