/**
 * Spark Daemon Main Export
 * Export all public APIs for external use
 */

// Export core daemon
export { SparkDaemon } from './main.js';

// Export all types
export * from './types/index.js';

// Export parsers
export { MentionParser } from './parser/MentionParser.js';
export { CommandDetector } from './parser/CommandDetector.js';
export { FrontmatterParser } from './parser/FrontmatterParser.js';
export { FileParser } from './parser/FileParser.js';

// Export config
export { ConfigLoader } from './config/ConfigLoader.js';
export { ConfigValidator } from './config/ConfigValidator.js';
export { ConfigDefaults, DEFAULT_SPARK_CONFIG, deepMerge } from './config/ConfigDefaults.js';

// Export logger
export { Logger } from './logger/Logger.js';
export { DevLogger } from './logger/DevLogger.js';

// Export watcher
export { FileWatcher } from './watcher/FileWatcher.js';
export { PathMatcher } from './watcher/PathMatcher.js';
export { ChangeDebouncer } from './watcher/ChangeDebouncer.js';

// Export context
export { ContextLoader } from './context/ContextLoader.js';
export { PathResolver } from './context/PathResolver.js';
export { ProximityCalculator } from './context/ProximityCalculator.js';

// Export CLI tools
export { DaemonInspector } from './cli/DaemonInspector.js';
export type { InspectorState, ProcessingEvent } from './cli/DaemonInspector.js';
