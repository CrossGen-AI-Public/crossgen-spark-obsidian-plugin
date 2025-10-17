/**
 * Trigger system type definitions
 */

import type { FileChange, FrontmatterChange } from './watcher.js';

/**
 * Trigger configuration
 */
export interface Trigger {
  name: string;
  description: string;
  watch: TriggerWatch;
  instructions: string;
  priority: number;
}

/**
 * Trigger watch configuration
 */
export interface TriggerWatch {
  directory: string;
  frontmatter_field?: string;
  from_value?: string;
  to_value?: string;
  pattern?: string;
  event?: 'file_created' | 'file_modified' | 'file_deleted';
}

/**
 * Interface for trigger loaders
 */
export interface ITriggerLoader {
  loadTriggers(vaultPath: string): Promise<Trigger[]>;
}

/**
 * Interface for trigger matchers
 */
export interface ITriggerMatcher {
  findMatching(
    change: FileChange,
    frontmatterChanges: FrontmatterChange[],
    triggers: Trigger[]
  ): Trigger[];
}

/**
 * Interface for trigger executors
 */
export interface ITriggerExecutor {
  execute(trigger: Trigger, filePath: string): Promise<void>;
}
