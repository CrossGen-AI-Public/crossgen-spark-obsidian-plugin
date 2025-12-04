/**
 * Frontmatter Parser
 * Parses and tracks changes in YAML frontmatter
 */

import matter from 'gray-matter';
import type { FrontmatterChange, IFrontmatterParser } from '../types/parser.js';

export class FrontmatterParser implements IFrontmatterParser {
  private cache: Map<string, Record<string, unknown>>;

  constructor() {
    this.cache = new Map();
  }

  public detectChanges(filePath: string, content: string): FrontmatterChange[] {
    const frontmatter = this.extractFrontmatter(content);
    const changes: FrontmatterChange[] = [];

    // If this is the first time we're seeing this file, just cache it
    // Don't report changes on first parse
    if (!this.cache.has(filePath)) {
      this.cache.set(filePath, frontmatter);
      return changes;
    }

    const oldFrontmatter = this.cache.get(filePath) || {};

    // Check for changed or added fields
    for (const [field, newValue] of Object.entries(frontmatter)) {
      const oldValue = oldFrontmatter[field];
      if (!this.valuesEqual(oldValue, newValue)) {
        changes.push({
          field,
          oldValue,
          newValue,
        });
      }
    }

    // Check for removed fields
    for (const field of Object.keys(oldFrontmatter)) {
      if (!(field in frontmatter)) {
        changes.push({
          field,
          oldValue: oldFrontmatter[field],
          newValue: undefined,
        });
      }
    }

    // Update cache
    this.cache.set(filePath, frontmatter);

    return changes;
  }

  public extractFrontmatter(content: string): Record<string, unknown> {
    try {
      // Parse with gray-matter
      const result = matter(content);

      // Convert Date objects to strings, but keep numbers/booleans as-is
      // This provides the best of both worlds: dates are consistent strings,
      // but numbers can be used for comparisons (e.g., priority > 5)
      const normalizeDates = (obj: unknown): unknown => {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'string') return obj;
        if (typeof obj === 'boolean') return obj;
        if (typeof obj === 'number') return obj; // Keep numbers as-is
        if (obj instanceof Date) return obj.toISOString().split('T')[0]; // YYYY-MM-DD
        if (Array.isArray(obj)) return obj.map(normalizeDates);
        if (typeof obj === 'object') {
          const result: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = normalizeDates(value);
          }
          return result;
        }
        return obj;
      };

      return normalizeDates(result.data) as Record<string, unknown>;
    } catch (_error) {
      // Invalid frontmatter, return empty object
      return {};
    }
  }

  /**
   * Get the content without frontmatter
   */
  public getContent(content: string): string {
    try {
      const result = matter(content);
      return result.content;
    } catch (_error) {
      return content;
    }
  }

  /**
   * Clear cached frontmatter for a file
   */
  public clearCache(filePath: string): void {
    this.cache.delete(filePath);
  }

  /**
   * Clear all cached frontmatter
   */
  public clearAllCache(): void {
    this.cache.clear();
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    // Simple equality check
    if (a === b) return true;

    // Both null/undefined
    if (a == null && b == null) return true;

    // Different types
    if (typeof a !== typeof b) return false;

    // Arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.valuesEqual(val, b[idx]));
    }

    // Objects
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every((key) =>
        this.valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      );
    }

    return false;
  }
}
