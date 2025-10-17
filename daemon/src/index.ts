/**
 * Spark Daemon Entry Point
 * Starts the daemon and handles graceful shutdown
 */

import { SparkDaemon } from './SparkDaemon.js';

async function main(): Promise<void> {
  // Get vault path from command line or use current directory
  const vaultPath = process.argv[2] || process.cwd();

  console.log(`Starting Spark daemon for vault: ${vaultPath}`);

  // Create and start daemon
  const daemon = new SparkDaemon(vaultPath);

  try {
    await daemon.start();
  } catch (error) {
    console.error('Failed to start daemon:', error);
    process.exit(1);
  }

  // Graceful shutdown handlers
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    try {
      await daemon.stop();
      console.log('Daemon stopped successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    void shutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    void shutdown('UNHANDLED_REJECTION');
  });
}

// Run the daemon
void main();
