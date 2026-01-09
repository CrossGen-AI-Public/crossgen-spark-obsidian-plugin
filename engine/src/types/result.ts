/**
 * Result handling type definitions
 */

/**
 * Command execution result
 */
export interface ExecutionResult {
  status: 'completed' | 'error' | 'warning';
  output: string;
  timestamp: number;
  error?: ExecutionError;
}

/**
 * Execution error details
 */
export interface ExecutionError {
  type: 'syntax_error' | 'file_not_found' | 'api_error' | 'permission_denied' | 'timeout';
  message: string;
  details?: string;
  recoverable: boolean;
  retryAfter?: number;
}

/**
 * Status indicator types
 */
export type StatusIndicator = 'pending' | 'processing' | 'completed' | 'error' | 'warning';

/**
 * Interface for status writers
 */
export interface IStatusWriter {
  updateStatus(filePath: string, lineNumber: number, status: StatusIndicator): Promise<void>;
}

/**
 * Interface for result writers
 */
export interface IResultWriter {
  writeResult(filePath: string, lineNumber: number, result: string): Promise<void>;
  writeInline(filePath: string, lineNumber: number, result: string): Promise<void>;
  writeToSeparateFile(result: string, outputFolder: string): Promise<string>;
}
