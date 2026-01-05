/**
 * Secrets Encryption
 *
 * Provides AES-256-GCM encryption using machine-derived keys.
 */
/**
 * Secrets Encryption
 *
 * Provides AES-256-GCM encryption/decryption using machine-derived keys.
 * Uses only Node.js built-in crypto module - no third-party dependencies.
 *
 * Security:
 * - AES-256-GCM (authenticated encryption)
 * - Machine-specific key derivation
 * - Random IV per encryption
 * - Authentication tag prevents tampering
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getMachineId } from './machineId';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'spark-secrets-v1'; // Application-specific salt
const IV_LENGTH = 16; // AES block size
const AUTH_TAG_LENGTH = 16; // GCM auth tag size

/**
 * Derive encryption key from machine ID
 * Both daemon and plugin derive the same key independently
 */
function deriveKey(): Buffer {
	const machineId = getMachineId();
	return createHash('sha256')
		.update(machineId + SALT)
		.digest();
}

/**
 * Encrypt plaintext secrets
 * @param plaintext String to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (hex-encoded)
 */
export function encryptSecrets(plaintext: string): string {
	const key = deriveKey();
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv);

	let encrypted = cipher.update(plaintext, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	const authTag = cipher.getAuthTag();

	// Format: iv:authTag:encryptedData
	return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt encrypted secrets
 * @param encrypted Encrypted string in format: iv:authTag:encryptedData
 * @returns Decrypted plaintext
 * @throws Error if decryption fails or data is tampered
 */
export function decryptSecrets(encrypted: string): string {
	const key = deriveKey();
	const parts = encrypted.split(':');

	if (parts.length !== 3) {
		throw new Error('Invalid encrypted data format');
	}

	const ivHex = parts[0];
	const authTagHex = parts[1];
	const encryptedData = parts[2];

	// Note: encryptedData can be empty string (when encrypting empty input)
	if (!ivHex || !authTagHex) {
		throw new Error('Invalid encrypted data format');
	}

	const iv = Buffer.from(ivHex, 'hex');
	const authTag = Buffer.from(authTagHex, 'hex');

	if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
		throw new Error('Invalid encrypted data format');
	}

	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	try {
		let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
		decrypted += decipher.final('utf8');
		return decrypted;
	} catch {
		throw new Error('Decryption failed - data may be corrupted or tampered');
	}
}

/**
 * Check if data appears to be encrypted
 * @param data String to check
 * @returns true if data matches encrypted format
 */
export function isEncrypted(data: string): boolean {
	const parts = data.split(':');
	if (parts.length !== 3) return false;

	const ivHex = parts[0];
	const authTagHex = parts[1];

	if (!ivHex || !authTagHex) return false;

	// Check if first two parts are valid hex strings of correct length
	return (
		/^[0-9a-f]+$/i.test(ivHex) &&
		/^[0-9a-f]+$/i.test(authTagHex) &&
		ivHex.length === IV_LENGTH * 2 && // Hex is 2 chars per byte
		authTagHex.length === AUTH_TAG_LENGTH * 2
	);
}
