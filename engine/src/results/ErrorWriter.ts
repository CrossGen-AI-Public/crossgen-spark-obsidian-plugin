/**
 * Error Writer
 * Writes detailed error reports to .spark/logs/ and notification queue
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Logger } from '../logger/Logger.js';
import { SparkError } from '../types/index.js';

export interface ErrorDetails {
  error: unknown;
  filePath: string;
  commandLine?: number;
  commandText?: string;
  context?: Record<string, unknown>;
}

export interface NotificationData {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'progress';
  message: string;
  timestamp: number;
  file?: string;
  line?: number;
  link?: string;
}

export class ErrorWriter {
  private logger: Logger;
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.logger = Logger.getInstance();
  }

  /**
   * Write a detailed error report to disk and notification queue
   * Returns the path to the error log file
   */
  async writeError(details: ErrorDetails): Promise<string> {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();

    // Ensure logs directory exists
    const logsDir = join(this.vaultPath, '.spark', 'logs');
    if (!existsSync(logsDir)) {
      try {
        mkdirSync(logsDir, { recursive: true });
      } catch (error) {
        this.logger.error('Failed to create logs directory', { error });
        // Continue anyway, we'll try to write the file
      }
    }

    // Create error log file
    const errorFileName = `error-${this.formatTimestamp()}-${errorId}.md`;
    const errorFilePath = join(logsDir, errorFileName);
    const errorLogRelative = `.spark/logs/${errorFileName}`;

    // Format error details
    const errorContent = this.formatErrorLog(details, timestamp, errorId);

    try {
      writeFileSync(errorFilePath, errorContent, 'utf-8');
      this.logger.debug('Error log written', { path: errorLogRelative });
    } catch (writeError) {
      this.logger.error('Failed to write error log file', { writeError, path: errorFilePath });
      // Continue to write notification even if file write fails
    }

    // Write notification
    try {
      await this.writeNotification({
        id: errorId,
        type: 'error',
        message: this.getErrorMessage(details.error),
        timestamp: Date.now(),
        file: details.filePath,
        line: details.commandLine,
        link: errorLogRelative,
      });
    } catch (notifError) {
      this.logger.error('Failed to write notification', { error: notifError });
    }

    // Also log to console for immediate visibility
    this.logger.error('Command execution failed', {
      errorId,
      file: details.filePath,
      line: details.commandLine,
      errorLog: errorLogRelative,
      error: this.getErrorMessage(details.error),
    });

    return errorFilePath;
  }

  /**
   * Format error details as a markdown report
   */
  private formatErrorLog(details: ErrorDetails, timestamp: string, errorId: string): string {
    const { error, filePath, commandLine, commandText, context } = details;

    const lines: string[] = [
      '# Error Report',
      '',
      `**ID:** ${errorId}`,
      `**Time:** ${new Date(timestamp).toLocaleString()}`,
      `**File:** ${basename(filePath)}`,
      `**Full Path:** ${filePath}`,
    ];

    if (commandLine !== undefined) {
      lines.push(`**Line:** ${commandLine}`);
    }

    lines.push('');
    lines.push('## Error');

    const errorMessage = this.getErrorMessage(error);
    lines.push(errorMessage);

    // Add error code if available
    if (error instanceof SparkError && error.code) {
      lines.push('');
      lines.push(`**Error Code:** ${error.code}`);
    }

    // Add stack trace for development
    if (error instanceof Error && error.stack) {
      lines.push('');
      lines.push('## Stack Trace');
      lines.push('```');
      lines.push(error.stack);
      lines.push('```');
    }

    // Add suggestions based on error code
    const suggestions = this.getSuggestions(error);
    if (suggestions) {
      lines.push('');
      lines.push('## Suggestions');
      lines.push(suggestions);
    }

    // Add command if available
    if (commandText) {
      lines.push('');
      lines.push('## Command');
      lines.push('```markdown');
      lines.push(commandText);
      lines.push('```');
    }

    // Add context details
    if (error instanceof SparkError && error.context) {
      lines.push('');
      lines.push('## Details');
      lines.push('```json');
      lines.push(JSON.stringify(error.context, null, 2));
      lines.push('```');
    } else if (context && Object.keys(context).length > 0) {
      lines.push('');
      lines.push('## Context');
      lines.push('```json');
      lines.push(JSON.stringify(context, null, 2));
      lines.push('```');
    }

    return lines.join('\n');
  }

  /**
   * Extract error message from various error types
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }

  /**
   * Generate contextual suggestions based on error type
   */
  private getSuggestions(error: unknown): string | null {
    if (!(error instanceof SparkError)) {
      return null;
    }

    switch (error.code) {
      case 'API_KEY_NOT_SET': {
        return [
          `1. Open Spark plugin settings`,
          '2. Go to: Settings → Community Plugins → Spark → Advanced tab',
          '3. Add your API key in the provider settings',
          `4. Get your API key from your AI provider dashboard`,
        ].join('\n');
      }

      case 'CONFIG_ERROR':
      case 'CONFIG_LOAD_FAILED':
      case 'INVALID_CONFIG':
        return [
          '1. Check your `.spark/config.yaml` file for syntax errors',
          '2. Run: `spark inspect <vault>` to see current configuration',
          '3. See example-vault/.spark/config.yaml for reference',
        ].join('\n');

      case 'AI_NETWORK_ERROR':
        return [
          '1. Check your internet connection',
          '2. Verify you can reach the AI provider API endpoint',
          '3. Check if a firewall or VPN is blocking the connection',
          '4. The engine will retry automatically once connection is restored',
        ].join('\n');

      case 'AI_CLIENT_ERROR': {
        return [
          '1. Check your API key is valid and not expired',
          `2. Update your API key in Spark plugin settings if needed`,
          '3. Get a new key from your AI provider dashboard',
          '4. Ensure the API key format is correct',
        ].join('\n');
      }

      case 'LOCAL_CONTEXT_LENGTH':
        return [
          '1. Try a shorter message or clear conversation history',
          '2. Reduce context by using fewer or smaller files',
          '3. Use a model with a larger context window',
          '4. Increase context length in LM Studio model settings',
        ].join('\n');

      case 'LOCAL_MODEL_NOT_FOUND':
        return [
          '1. Open LM Studio and download the model',
          '2. Check the model name in your .spark/config.yaml matches LM Studio',
          '3. Run `lms ls` to see available models',
        ].join('\n');

      case 'LOCAL_CONNECTION_ERROR':
        return [
          '1. Make sure LM Studio is running',
          '2. Check that the LM Studio local server is started',
          '3. Verify LM Studio is listening on the default port (1234)',
        ].join('\n');

      case 'LOCAL_MODEL_ERROR':
        return [
          '1. Check LM Studio is running and the local server is started',
          '2. Verify the model is downloaded and loaded in LM Studio',
          '3. Check LM Studio logs for details',
        ].join('\n');

      case 'AI_SERVER_ERROR':
        return [
          '1. This is a temporary server issue - the engine will retry automatically',
          '2. Check your AI provider status page for any outages',
          '3. If persists for >5 minutes, try restarting the engine',
        ].join('\n');

      case 'RESULT_WRITE_ERROR':
        return [
          '1. Check file permissions in your vault',
          '2. Ensure the file still exists and is not deleted',
          '3. Check if file is open in another application',
          '4. Verify sufficient disk space is available',
        ].join('\n');

      case 'EMPTY_LINE':
        return [
          '1. The command line appears to be empty',
          '2. Ensure your command includes the full instruction',
        ].join('\n');

      default:
        return null;
    }
  }

  /**
   * Write notification to .spark/notifications.jsonl
   */
  private async writeNotification(notification: NotificationData): Promise<void> {
    const notificationsFile = join(this.vaultPath, '.spark', 'notifications.jsonl');
    const notificationLine = `${JSON.stringify(notification)}\n`;

    try {
      // Append to JSONL file
      const { appendFileSync } = await import('node:fs');
      appendFileSync(notificationsFile, notificationLine, 'utf-8');
    } catch {
      // If file doesn't exist, create it
      try {
        writeFileSync(notificationsFile, notificationLine, 'utf-8');
      } catch (writeError) {
        this.logger.error('Failed to write notification file', { error: writeError });
        throw writeError;
      }
    }
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return Math.random().toString(36).substring(2, 11);
  }

  /**
   * Format timestamp for filename (YYYY-MM-DD-HHMMSS)
   */
  private formatTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
  }
}
