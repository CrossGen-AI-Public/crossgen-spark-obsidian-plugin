/**
 * Machine ID Reader
 *
 * Reads machine-unique identifiers from OS-level sources.
 * Used for deriving encryption keys - no third-party dependencies.
 *
 * Sources:
 * - Linux: /etc/machine-id or /var/lib/dbus/machine-id
 * - macOS: IOPlatformUUID from ioreg
 * - Windows: MachineGuid from registry
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { platform } from 'node:os';

/**
 * Get a unique machine identifier from the OS
 * @throws Error if unable to retrieve machine ID
 */
export function getMachineId(): string {
	try {
		switch (platform()) {
			case 'linux':
				// Linux: Read from standard locations
				try {
					return readFileSync('/etc/machine-id', 'utf8').trim();
				} catch {
					return readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
				}

			case 'darwin': {
				// macOS: Get hardware UUID
				const output = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', {
					encoding: 'utf8',
				});
				const match = output.match(/"IOPlatformUUID"\s*=\s*"(.+?)"/);
				if (!match || !match[1]) {
					throw new Error('Failed to parse IOPlatformUUID');
				}
				return match[1];
			}

			case 'win32': {
				// Windows: Read MachineGuid from registry
				const result = execSync(
					'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
					{ encoding: 'utf8' }
				);
				const winMatch = result.match(/MachineGuid\s+REG_SZ\s+(.+)/);
				if (!winMatch || !winMatch[1]) {
					throw new Error('Failed to parse MachineGuid');
				}
				return winMatch[1].trim();
			}

			default:
				throw new Error(`Unsupported platform: ${platform()}`);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to get machine ID: ${errorMessage}`);
	}
}
