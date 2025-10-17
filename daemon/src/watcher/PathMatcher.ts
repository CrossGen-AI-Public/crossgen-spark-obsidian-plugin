/**
 * Path matcher
 * Matches file paths against glob patterns
 */

import { minimatch } from 'minimatch';
import type { IPathMatcher } from '../types/watcher.js';

export class PathMatcher implements IPathMatcher {
  public matches(path: string, patterns: string[]): boolean {
    return patterns.some((pattern) => minimatch(path, pattern));
  }

  public shouldIgnore(path: string, ignorePatterns: string[]): boolean {
    return ignorePatterns.some((pattern) => minimatch(path, pattern));
  }
}
