/**
 * CLI Output Utilities
 * Use process.stdout/stderr for CLI output instead of console.log
 * This satisfies the Obsidian linter while maintaining proper CLI behavior
 */

/**
 * Print a line to stdout (equivalent to console.log)
 */
export function print(...args: unknown[]): void {
  const message = args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join(' ');
  process.stdout.write(`${message}\n`);
}

/**
 * Print an error to stderr (equivalent to console.error)
 */
export function printError(...args: unknown[]): void {
  const message = args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join(' ');
  process.stderr.write(`${message}\n`);
}

/**
 * Print a warning to stderr
 */
export function printWarn(...args: unknown[]): void {
  const message = args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join(' ');
  process.stderr.write(`${message}\n`);
}
