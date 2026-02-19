/**
 * Path utilities for cross-platform path handling
 */

/**
 * Normalize path separators to forward slashes (/)
 * Windows uses backslashes (\), but we standardize to forward slashes
 * for consistent comparison and matching across platforms
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}
