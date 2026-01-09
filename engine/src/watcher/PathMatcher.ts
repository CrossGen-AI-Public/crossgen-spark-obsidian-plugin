/**
 * Path matcher
 * Matches file paths against glob patterns
 */

import { minimatch } from 'minimatch';
import type { IPathMatcher } from '../types/watcher.js';

export class PathMatcher implements IPathMatcher {
  private readonly options = { dot: true }; // Allow matching dotfiles/dotfolders

  public matches(path: string, patterns: string[], ignorePatterns?: string[]): boolean {
    // Check if path matches any include pattern
    const matchesInclude = patterns.some((pattern) => minimatch(path, pattern, this.options));

    if (!matchesInclude) {
      return false;
    }

    // If there are ignore patterns, check if path should be ignored
    if (ignorePatterns && ignorePatterns.length > 0) {
      const shouldBeIgnored = ignorePatterns.some((pattern) =>
        minimatch(path, pattern, this.options)
      );
      return !shouldBeIgnored;
    }

    return true;
  }

  public matchesAny(path: string, patterns: string[]): boolean {
    return patterns.some((pattern) => minimatch(path, pattern, this.options));
  }

  public shouldIgnore(path: string, ignorePatterns: string[]): boolean {
    return ignorePatterns.some((pattern) => minimatch(path, pattern, this.options));
  }
}
