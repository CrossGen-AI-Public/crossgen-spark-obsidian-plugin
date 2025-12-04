/**
 * Spark Crypto Module
 *
 * Machine-specific encryption for secrets storage.
 * Zero third-party dependencies - uses only Node.js built-ins.
 */

export { decryptSecrets, encryptSecrets, isEncrypted } from './encryption.js';
export { getMachineId } from './machineId.js';
