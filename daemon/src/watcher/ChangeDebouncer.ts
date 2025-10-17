/**
 * Change debouncer
 * Debounces rapid file changes to avoid excessive processing
 */

import type { IChangeDebouncer } from '../types/watcher.js';

export class ChangeDebouncer implements IChangeDebouncer {
  private timers: Map<string, NodeJS.Timeout>;
  private debounceMs: number;

  constructor(debounceMs: number) {
    this.timers = new Map();
    this.debounceMs = debounceMs;
  }

  public debounce(path: string, callback: () => void): void {
    // Cancel existing timer for this path
    this.cancel(path);

    // Create new timer
    const timer = setTimeout(() => {
      callback();
      this.timers.delete(path);
    }, this.debounceMs);

    this.timers.set(path, timer);
  }

  public cancel(path: string): void {
    const timer = this.timers.get(path);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(path);
    }
  }

  public cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
