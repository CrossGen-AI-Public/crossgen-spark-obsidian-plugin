import { execSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import type { App, FileSystemAdapter } from 'obsidian';

interface EngineEntry {
	pid: number;
	vaultPath: string;
	startTime: number;
}

interface EngineRegistry {
	engines: EngineEntry[];
}

const INSTALL_SCRIPT_URL =
	'https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install-engine.sh';

export class EngineService {
	private static instance: EngineService;
	private app: App;
	private sparkPath: string | null = null;

	private constructor(app: App) {
		this.app = app;
	}

	public static getInstance(app?: App): EngineService {
		if (!EngineService.instance) {
			if (!app) {
				throw new Error('EngineService must be initialized with an App instance first.');
			}
			EngineService.instance = new EngineService(app);
		}
		return EngineService.instance;
	}

	/**
	 * Check if running on Windows
	 */
	private isWindows(): boolean {
		return platform() === 'win32';
	}

	/**
	 * Get the absolute path to the vault
	 */
	public getVaultPath(): string {
		const adapter = this.app.vault.adapter as FileSystemAdapter;
		return adapter.getBasePath();
	}

	/**
	 * Get common paths where spark might be installed on Unix systems
	 */
	private getCommonSparkPathsUnix(): string[] {
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

		// Standard Unix locations
		paths.push(
			`${home}/.npm-global/bin/spark`,
			`${home}/.local/bin/spark`,
			`${home}/.spark/engine/dist/cli.js`,
			'/usr/local/bin/spark',
			'/opt/homebrew/bin/spark'
		);

		return paths;
	}

	/**
	 * Get common paths where spark might be installed on Windows
	 */
	private getCommonSparkPathsWindows(): string[] {
		const appData = process.env.APPDATA || '';
		const localAppData = process.env.LOCALAPPDATA || '';
		const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
		const home = homedir();
		const paths: string[] = [];

		// npm global installs on Windows
		paths.push(
			join(appData, 'npm', 'spark.cmd'),
			join(appData, 'npm', 'spark.ps1'),
			join(appData, 'npm', 'spark'),
			join(localAppData, 'npm', 'spark.cmd'),
			join(localAppData, 'npm', 'spark.ps1'),
			// nvm for Windows
			join(localAppData, 'nvm', 'spark.cmd'),
			// node installed globally
			join(programFiles, 'nodejs', 'spark.cmd'),
			join(programFiles, 'nodejs', 'spark.ps1'),
			// npm-global prefix
			join(home, '.npm-global', 'spark.cmd'),
			join(home, '.npm-global', 'spark.ps1')
		);

		return paths;
	}

	/**
	 * Find the spark executable path using where.exe on Windows
	 */
	private findSparkWindows(): string | null {
		// Try where.exe (Windows equivalent of which)
		try {
			const result = execSync('where.exe spark', {
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe'],
			});
			// where.exe can return multiple lines, take the first valid one
			const lines = result
				.trim()
				.split('\n')
				.map(l => l.trim());
			for (const line of lines) {
				if (line && existsSync(line)) {
					return line;
				}
			}
		} catch {
			// where.exe failed, check common paths
		}

		// Check common Windows installation locations
		for (const path of this.getCommonSparkPathsWindows()) {
			if (existsSync(path)) {
				return path;
			}
		}

		return null;
	}

	/**
	 * Find the spark executable path using which on Unix
	 */
	private findSparkUnix(): string | null {
		// Try which command first
		try {
			const result = execSync('which spark', {
				encoding: 'utf8',
				stdio: ['pipe', 'pipe', 'pipe'],
			});
			const path = result.trim();
			if (path && existsSync(path)) {
				return path;
			}
		} catch {
			// which failed, check common paths
		}

		// Check common Unix installation locations
		for (const path of this.getCommonSparkPathsUnix()) {
			if (existsSync(path)) {
				return path;
			}
		}

		return null;
	}

	/**
	 * Find the spark executable path (cross-platform)
	 */
	public getSparkPath(): string | null {
		if (this.sparkPath) {
			return this.sparkPath;
		}

		const path = this.isWindows() ? this.findSparkWindows() : this.findSparkUnix();

		if (path) {
			this.sparkPath = path;
		}

		return path;
	}

	/**
	 * Check if the spark engine CLI is installed
	 */
	public isEngineInstalled(): boolean {
		return this.getSparkPath() !== null;
	}

	/**
	 * Get the engine registry file path (cross-platform)
	 */
	private getRegistryPath(): string {
		return join(homedir(), '.spark', 'registry.json');
	}

	/**
	 * Read the engine registry
	 */
	private getRegistry(): EngineRegistry {
		try {
			const registryPath = this.getRegistryPath();
			if (!existsSync(registryPath)) {
				return { engines: [] };
			}
			const content = readFileSync(registryPath, 'utf-8');
			return JSON.parse(content) as EngineRegistry;
		} catch {
			return { engines: [] };
		}
	}

	/**
	 * Check if a process is running by PID (cross-platform)
	 */
	private isProcessRunning(pid: number): boolean {
		try {
			if (this.isWindows()) {
				// On Windows, process.kill(pid, 0) may not work reliably
				// Use tasklist to check if the process exists
				const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
					encoding: 'utf8',
					stdio: ['pipe', 'pipe', 'pipe'],
				});
				return result.includes(String(pid));
			} else {
				process.kill(pid, 0);
				return true;
			}
		} catch {
			return false;
		}
	}

	/**
	 * Check if the engine is currently running for this vault
	 * Reads directly from ~/.spark/registry.json
	 */
	public isEngineRunning(): boolean {
		const vaultPath = this.getVaultPath();
		const registry = this.getRegistry();

		// Normalize paths for comparison (important on Windows)
		const normalizedVaultPath = vaultPath.replace(/\\/g, '/').toLowerCase();

		const engine = registry.engines.find(d => {
			const normalizedEntry = d.vaultPath.replace(/\\/g, '/').toLowerCase();
			return normalizedEntry === normalizedVaultPath;
		});

		if (!engine) {
			return false;
		}

		return this.isProcessRunning(engine.pid);
	}

	/**
	 * Get engine info for this vault (if running)
	 */
	public getEngineInfo(): EngineEntry | null {
		const vaultPath = this.getVaultPath();
		const registry = this.getRegistry();

		const normalizedVaultPath = vaultPath.replace(/\\/g, '/').toLowerCase();

		const engine = registry.engines.find(d => {
			const normalizedEntry = d.vaultPath.replace(/\\/g, '/').toLowerCase();
			return normalizedEntry === normalizedVaultPath;
		});

		if (engine && this.isProcessRunning(engine.pid)) {
			return engine;
		}

		return null;
	}

	/**
	 * Get the install command for the engine (platform-specific)
	 */
	public getInstallCommand(): string {
		if (this.isWindows()) {
			return `powershell -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/main/install.ps1' -OutFile install.ps1; .\\install.ps1"`;
		}
		return `curl -fsSL ${INSTALL_SCRIPT_URL} | bash`;
	}

	/**
	 * Get the start command for the engine
	 */
	public getStartCommand(): string {
		const vaultPath = this.getVaultPath();
		return `spark start "${vaultPath}"`;
	}

	/**
	 * Get the stop command for the engine
	 */
	public getStopCommand(): string {
		const vaultPath = this.getVaultPath();
		return `spark stop "${vaultPath}"`;
	}

	/**
	 * Open a terminal and run a command (cross-platform)
	 */
	public openTerminalWithCommand(command: string): void {
		const os = platform();

		switch (os) {
			case 'darwin': {
				const escapedCommand = command.replace(/"/g, '\\"');
				const script = `tell application "Terminal"
					activate
					do script "${escapedCommand}"
				end tell`;
				spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
				break;
			}

			case 'win32': {
				spawn('cmd', ['/c', 'start', 'cmd', '/k', command], {
					detached: true,
					stdio: 'ignore',
					shell: true,
				}).unref();
				break;
			}

			case 'linux': {
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

				console.warn('[Spark] No terminal emulator found, running command in background');
				spawn('bash', ['-c', command], { detached: true, stdio: 'ignore' }).unref();
				break;
			}

			default:
				console.error(`[Spark] Unsupported platform: ${os}`);
		}
	}

	/**
	 * Start the engine for the current vault
	 */
	public startEngine(): void {
		this.openTerminalWithCommand(this.getStartCommand());
	}

	/**
	 * Start the engine in background
	 */
	public async startEngineBackground(): Promise<boolean> {
		const sparkPath = this.getSparkPath();
		if (!sparkPath) {
			console.error('[Spark] Cannot start engine: spark not found');
			return false;
		}

		if (this.isEngineRunning()) {
			console.debug('[Spark] Engine is already running');
			return true;
		}

		const vaultPath = this.getVaultPath();

		try {
			console.debug(`[Spark] Starting engine: ${sparkPath} start "${vaultPath}"`);

			let child: ReturnType<typeof spawn>;

			if (this.isWindows()) {
				const ext = sparkPath.split('.').pop()?.toLowerCase();
				if (ext === 'ps1') {
					child = spawn(
						'powershell.exe',
						['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sparkPath, 'start', vaultPath],
						{ detached: true, stdio: 'ignore' }
					);
				} else if (ext === 'cmd' || ext === 'bat') {
					child = spawn('cmd.exe', ['/c', sparkPath, 'start', vaultPath], {
						detached: true,
						stdio: 'ignore',
					});
				} else {
					child = spawn(`"${sparkPath}" start "${vaultPath}"`, [], {
						detached: true,
						stdio: 'ignore',
						shell: true,
					});
				}
			} else {
				child = spawn(`"${sparkPath}" start "${vaultPath}"`, [], {
					detached: true,
					stdio: 'ignore',
					shell: true,
					env: {
						...process.env,
						PATH: `${process.env.PATH}:${this.buildUnixExtraPaths()}`,
					},
				});
			}

			child.unref();

			// Poll registry until engine registers
			const maxWait = 10000;
			const pollInterval = 500;
			let waited = 0;

			while (waited < maxWait) {
				await this.sleep(pollInterval);
				waited += pollInterval;

				if (this.isEngineRunning()) {
					console.debug('[Spark] Engine started successfully');
					return true;
				}
			}

			console.warn('[Spark] Engine did not register in time');
			return false;
		} catch (error) {
			console.error('[Spark] Failed to start engine:', error);
			return false;
		}
	}

	/**
	 * Stop the engine for the current vault
	 */
	public stopEngine(): boolean {
		const engine = this.getEngineInfo();

		if (!engine) {
			console.debug('[Spark] No engine running for this vault');
			return false;
		}

		try {
			if (this.isWindows()) {
				execSync(`taskkill /PID ${engine.pid} /F`, { stdio: 'ignore' });
			} else {
				process.kill(engine.pid, 'SIGTERM');
			}

			console.debug(`[Spark] Stopped engine (PID ${engine.pid})`);

			const maxWait = 3000;
			const pollInterval = 100;
			let waited = 0;

			while (waited < maxWait) {
				if (!this.isProcessRunning(engine.pid)) {
					console.debug('[Spark] Engine stopped successfully');
					return true;
				}
				const start = Date.now();
				while (Date.now() - start < pollInterval) {
					// spin
				}
				waited += pollInterval;
			}

			if (this.isProcessRunning(engine.pid)) {
				if (this.isWindows()) {
					execSync(`taskkill /PID ${engine.pid} /F`, { stdio: 'ignore' });
				} else {
					process.kill(engine.pid, 'SIGKILL');
				}
			}

			return true;
		} catch (error) {
			console.error('[Spark] Failed to stop engine:', error);
			return false;
		}
	}

	/**
	 * Build extra PATH entries for Unix systems (nvm, homebrew, local bin)
	 */
	private buildUnixExtraPaths(): string {
		const nvmBinPaths: string[] = [];
		const nvmVersionsDir = join(homedir(), '.nvm', 'versions', 'node');
		try {
			if (existsSync(nvmVersionsDir)) {
				const versions = readdirSync(nvmVersionsDir);
				for (const version of versions) {
					nvmBinPaths.push(join(nvmVersionsDir, version, 'bin'));
				}
			}
		} catch {
			// ignore
		}
		return [...nvmBinPaths, `${homedir()}/.local/bin`, '/usr/local/bin', '/opt/homebrew/bin'].join(
			':'
		);
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
	public installEngine(): void {
		this.openTerminalWithCommand(this.getInstallCommand());
	}
}
