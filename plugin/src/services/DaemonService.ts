import type { App, FileSystemAdapter } from 'obsidian';
import { execSync, spawn } from 'node:child_process';
import { platform, homedir } from 'node:os';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface DaemonEntry {
	pid: number;
	vaultPath: string;
	startTime: number;
}

interface DaemonRegistry {
	daemons: DaemonEntry[];
}

const INSTALL_SCRIPT_URL =
	'https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install-daemon.sh';

export class DaemonService {
	private static instance: DaemonService;
	private app: App;
	private sparkPath: string | null = null;

	private constructor(app: App) {
		this.app = app;
	}

	public static getInstance(app?: App): DaemonService {
		if (!DaemonService.instance) {
			if (!app) {
				throw new Error('DaemonService must be initialized with an App instance first.');
			}
			DaemonService.instance = new DaemonService(app);
		}
		return DaemonService.instance;
	}

	/**
	 * Get the absolute path to the vault
	 */
	public getVaultPath(): string {
		const adapter = this.app.vault.adapter as FileSystemAdapter;
		return adapter.getBasePath();
	}

	/**
	 * Get common paths where spark might be installed
	 */
	private getCommonSparkPaths(): string[] {
		const home = process.env.HOME || '';
		const paths: string[] = [];

		// Check nvm installations dynamically
		const nvmVersionsDir = join(home, '.nvm', 'versions', 'node');
		try {
			if (existsSync(nvmVersionsDir)) {
				const versions = readdirSync(nvmVersionsDir);
				for (const version of versions) {
					paths.push(join(nvmVersionsDir, version, 'bin', 'spark'));
				}
			}
		} catch {
			// nvm directory not accessible
		}

		// Standard locations
		paths.push(
			`${home}/.npm-global/bin/spark`,
			`${home}/.local/bin/spark`,
			`${home}/.spark/daemon/dist/cli.js`,
			'/usr/local/bin/spark',
			'/opt/homebrew/bin/spark'
		);

		return paths;
	}

	/**
	 * Find the spark executable path
	 */
	public getSparkPath(): string | null {
		if (this.sparkPath) {
			return this.sparkPath;
		}

		// Try which command first
		try {
			const result = execSync('which spark', {
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe'],
			});
			const path = result.trim();
			if (path && existsSync(path)) {
				this.sparkPath = path;
				return path;
			}
		} catch {
			// which failed, check common paths
		}

		// Check common installation locations
		for (const path of this.getCommonSparkPaths()) {
			if (existsSync(path)) {
				this.sparkPath = path;
				return path;
			}
		}

		return null;
	}

	/**
	 * Check if the spark daemon CLI is installed
	 */
	public isDaemonInstalled(): boolean {
		return this.getSparkPath() !== null;
	}

	/**
	 * Get the daemon registry file path
	 */
	private getRegistryPath(): string {
		return join(homedir(), '.spark', 'registry.json');
	}

	/**
	 * Read the daemon registry
	 */
	private getRegistry(): DaemonRegistry {
		try {
			const registryPath = this.getRegistryPath();
			if (!existsSync(registryPath)) {
				return { daemons: [] };
			}
			const content = readFileSync(registryPath, 'utf-8');
			return JSON.parse(content) as DaemonRegistry;
		} catch {
			return { daemons: [] };
		}
	}

	/**
	 * Check if a process is running by PID
	 */
	private isProcessRunning(pid: number): boolean {
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Check if the daemon is currently running for this vault
	 * Reads directly from ~/.spark/registry.json
	 */
	public isDaemonRunning(): boolean {
		const vaultPath = this.getVaultPath();
		const registry = this.getRegistry();

		// Find daemon entry for this vault
		const daemon = registry.daemons.find(d => d.vaultPath === vaultPath);

		if (!daemon) {
			return false;
		}

		// Verify the process is actually running
		return this.isProcessRunning(daemon.pid);
	}

	/**
	 * Get daemon info for this vault (if running)
	 */
	public getDaemonInfo(): DaemonEntry | null {
		const vaultPath = this.getVaultPath();
		const registry = this.getRegistry();

		const daemon = registry.daemons.find(d => d.vaultPath === vaultPath);

		if (daemon && this.isProcessRunning(daemon.pid)) {
			return daemon;
		}

		return null;
	}

	/**
	 * Get the install command for the daemon
	 */
	public getInstallCommand(): string {
		return `curl -fsSL ${INSTALL_SCRIPT_URL} | bash`;
	}

	/**
	 * Get the start command for the daemon
	 */
	public getStartCommand(): string {
		const vaultPath = this.getVaultPath();
		return `spark start "${vaultPath}"`;
	}

	/**
	 * Get the stop command for the daemon
	 */
	public getStopCommand(): string {
		const vaultPath = this.getVaultPath();
		return `spark stop "${vaultPath}"`;
	}

	/**
	 * Open a terminal and run a command
	 * Platform-specific implementation
	 */
	public openTerminalWithCommand(command: string): void {
		const os = platform();

		switch (os) {
			case 'darwin': {
				// macOS: Use osascript to open Terminal.app
				const escapedCommand = command.replace(/"/g, '\\"');
				const script = `tell application "Terminal"
					activate
					do script "${escapedCommand}"
				end tell`;
				spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
				break;
			}

			case 'win32': {
				// Windows: Use start cmd
				spawn('cmd', ['/c', 'start', 'cmd', '/k', command], {
					detached: true,
					stdio: 'ignore',
					shell: true,
				}).unref();
				break;
			}

			case 'linux': {
				// Linux: Try common terminal emulators
				const terminals = [
					['gnome-terminal', '--', 'bash', '-c', `${command}; exec bash`],
					['konsole', '-e', 'bash', '-c', `${command}; exec bash`],
					['xfce4-terminal', '-e', `bash -c "${command}; exec bash"`],
					['x-terminal-emulator', '-e', `bash -c "${command}; exec bash"`],
				];

				for (const [terminal, ...args] of terminals) {
					try {
						execSync(`which ${terminal}`, { stdio: 'ignore' });
						spawn(terminal, args, { detached: true, stdio: 'ignore' }).unref();
						return;
					} catch {
						// Terminal not found, try next
					}
				}

				// Fallback: Just run in background
				console.warn('[Spark] No terminal emulator found, running command in background');
				spawn('bash', ['-c', command], { detached: true, stdio: 'ignore' }).unref();
				break;
			}

			default:
				console.error(`[Spark] Unsupported platform: ${os}`);
		}
	}

	/**
	 * Start the daemon for the current vault
	 * Opens a terminal with the start command
	 */
	public startDaemon(): void {
		this.openTerminalWithCommand(this.getStartCommand());
	}

	/**
	 * Start the daemon in background
	 * Used for auto-launch on startup and manual start from settings
	 * Returns a promise that resolves when daemon is confirmed running
	 */
	public async startDaemonBackground(): Promise<boolean> {
		const sparkPath = this.getSparkPath();
		if (!sparkPath) {
			console.error('[Spark] Cannot start daemon: spark not found');
			return false;
		}

		// Check if already running
		if (this.isDaemonRunning()) {
			console.log('[Spark] Daemon is already running');
			return true;
		}

		const vaultPath = this.getVaultPath();

		try {
			console.log(`[Spark] Starting daemon: ${sparkPath} start "${vaultPath}"`);

			// Start daemon as detached background process
			// Use shell: true to properly handle shebang scripts
			const child = spawn(`"${sparkPath}" start "${vaultPath}"`, [], {
				detached: true,
				stdio: 'ignore',
				shell: true,
				env: {
					...process.env,
					// Ensure PATH includes common Node locations
					PATH: `${process.env.PATH}:${homedir()}/.nvm/versions/node/v22.20.0/bin:${homedir()}/.local/bin:/usr/local/bin`,
				},
			});
			child.unref();

			console.log('[Spark] Daemon starting in background...');

			// Wait for daemon to register (poll registry)
			const maxWait = 10000; // 10 seconds max (daemon takes time to initialize)
			const pollInterval = 500;
			let waited = 0;

			while (waited < maxWait) {
				await this.sleep(pollInterval);
				waited += pollInterval;

				if (this.isDaemonRunning()) {
					console.log('[Spark] Daemon started successfully');
					return true;
				}
			}

			console.warn('[Spark] Daemon did not register in time - check console for errors');
			return false;
		} catch (error) {
			console.error('[Spark] Failed to start daemon:', error);
			return false;
		}
	}

	/**
	 * Stop the daemon for the current vault
	 * Sends SIGTERM to the daemon process
	 */
	public stopDaemon(): boolean {
		const daemon = this.getDaemonInfo();

		if (!daemon) {
			console.log('[Spark] No daemon running for this vault');
			return false;
		}

		try {
			// Send SIGTERM to gracefully stop the daemon
			process.kill(daemon.pid, 'SIGTERM');
			console.log(`[Spark] Sent SIGTERM to daemon (PID ${daemon.pid})`);

			// Give it a moment to shut down
			const maxWait = 3000;
			const pollInterval = 100;
			let waited = 0;

			while (waited < maxWait) {
				if (!this.isProcessRunning(daemon.pid)) {
					console.log('[Spark] Daemon stopped successfully');
					return true;
				}
				// Busy wait (sync)
				const start = Date.now();
				while (Date.now() - start < pollInterval) {
					// spin
				}
				waited += pollInterval;
			}

			// Still running, try SIGKILL
			if (this.isProcessRunning(daemon.pid)) {
				console.warn('[Spark] Daemon did not stop gracefully, sending SIGKILL');
				process.kill(daemon.pid, 'SIGKILL');
			}

			return true;
		} catch (error) {
			console.error('[Spark] Failed to stop daemon:', error);
			return false;
		}
	}

	/**
	 * Helper to sleep asynchronously
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Open terminal with install command
	 */
	public installDaemon(): void {
		this.openTerminalWithCommand(this.getInstallCommand());
	}
}
