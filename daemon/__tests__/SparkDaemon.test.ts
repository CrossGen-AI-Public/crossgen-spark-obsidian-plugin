import { SparkDaemon } from '../src/SparkDaemon.js';
import { TestVault } from './utils/TestVault.js';
import { Logger } from '../src/logger/Logger.js';

describe('SparkDaemon', () => {
    let vault: TestVault;
    let daemon: SparkDaemon;

    beforeEach(async () => {
        // Reset logger singleton
        (Logger as any).instance = null;

        vault = new TestVault();
        await vault.create();

        // Create basic config
        await vault.writeConfig(`
version: "1.0"
daemon:
  watch:
    patterns:
      - "**/*.md"
    ignore:
      - ".git/**"
  debounce_ms: 50
ai:
  provider: "claude"
logging:
  level: "error"
  console: false
`);

        daemon = new SparkDaemon(vault.root);
    });

    afterEach(async () => {
        try {
            if (daemon.isRunning()) {
                await daemon.stop();
            }
        } catch (_error) {
            // Ignore cleanup errors
        }
        await vault.cleanup();
    });

    describe('constructor', () => {
        it('should create daemon instance', () => {
            expect(daemon).toBeInstanceOf(SparkDaemon);
        });

        it('should initialize in stopped state', () => {
            expect(daemon.isRunning()).toBe(false);
        });
    });

    describe('lifecycle', () => {
        it('should start and stop daemon', async () => {
            await daemon.start();
            expect(daemon.isRunning()).toBe(true);

            await daemon.stop();
            expect(daemon.isRunning()).toBe(false);
        }, 5000);

        it('should throw error if starting when already running', async () => {
            await daemon.start();
            await expect(daemon.start()).rejects.toThrow('already running');
            await daemon.stop();
        }, 5000);

        it('should handle stop when not running', async () => {
            await expect(daemon.stop()).resolves.not.toThrow();
            expect(daemon.isRunning()).toBe(false);
        });
    });

    describe('isRunning', () => {
        it('should return false initially', () => {
            expect(daemon.isRunning()).toBe(false);
        });

        it('should return correct state after start/stop', async () => {
            expect(daemon.isRunning()).toBe(false);

            await daemon.start();
            expect(daemon.isRunning()).toBe(true);

            await daemon.stop();
            expect(daemon.isRunning()).toBe(false);
        }, 5000);
    });

    describe('configuration', () => {
        it('should handle missing config file with defaults', async () => {
            const vault2 = new TestVault();
            await vault2.create();

            const daemon2 = new SparkDaemon(vault2.root);

            await daemon2.start();
            expect(daemon2.isRunning()).toBe(true);

            await daemon2.stop();
            await vault2.cleanup();
        }, 5000);

    });
});
