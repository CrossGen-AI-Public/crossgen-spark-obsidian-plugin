/**
 * Spark Daemon Main Export
 * Export all public APIs for external use
 */

export type { InspectorState, ProcessingEvent } from './cli/DaemonInspector.js';
// Export CLI tools
export { DaemonInspector } from './cli/DaemonInspector.js';
export {
  DEFAULT_SPARK_CONFIG,
  deepMerge,
  getDefaults,
  mergeConfig,
} from './config/ConfigDefaults.js';
// Export config
export { ConfigLoader } from './config/ConfigLoader.js';
export { ConfigValidator } from './config/ConfigValidator.js';
// Export context
export { ContextLoader } from './context/ContextLoader.js';
export { PathResolver } from './context/PathResolver.js';
export { ProximityCalculator } from './context/ProximityCalculator.js';
export { DevLogger } from './logger/DevLogger.js';

// Export logger
export { Logger } from './logger/Logger.js';
// Export core daemon
export { SparkDaemon } from './main.js';
export { CommandDetector } from './parser/CommandDetector.js';
export { FileParser } from './parser/FileParser.js';
export { FrontmatterParser } from './parser/FrontmatterParser.js';
// Export parsers
export { MentionParser } from './parser/MentionParser.js';
// Export all types
export * from './types/index.js';
export { ChangeDebouncer } from './watcher/ChangeDebouncer.js';
// Export watcher
export { FileWatcher } from './watcher/FileWatcher.js';
export { PathMatcher } from './watcher/PathMatcher.js';
