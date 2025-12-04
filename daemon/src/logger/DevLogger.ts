/**
 * Development Logger with enhanced debugging capabilities
 * Extends the base Logger with namespace support and performance timing
 *
 * Unlike the main Logger, DevLogger always writes directly to console
 * to avoid conflicts with the singleton Logger instance used by the daemon.
 */

import type { LoggingConfig } from '../types/config.js';
import { Logger, type LogLevel } from './Logger.js';

export class DevLogger {
  private logger: Logger;
  private namespace: string;
  private timers: Map<string, number> = new Map();
  private level: LogLevel;
  private consoleEnabled: boolean;

  constructor(namespace: string, config?: LoggingConfig) {
    this.namespace = namespace;
    this.level = config?.level || 'info';
    this.consoleEnabled = config?.console ?? true;
    this.logger = config ? Logger.getInstance(config) : Logger.getInstance();
  }

  /**
   * Log debug message with namespace context
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('debug') || !this.consoleEnabled) return;

    const formattedMessage = this.formatMessage('DEBUG', message, context);
    console.log(formattedMessage);
  }

  /**
   * Log info message with namespace context
   */
  public info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('info') || !this.consoleEnabled) return;

    const formattedMessage = this.formatMessage('INFO', message, context);
    console.log(formattedMessage);
  }

  /**
   * Log warning message with namespace context
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('warn') || !this.consoleEnabled) return;

    const formattedMessage = this.formatMessage('WARN', message, context);
    console.warn(formattedMessage);
  }

  /**
   * Log error message with namespace context
   */
  public error(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('error') || !this.consoleEnabled) return;

    const formattedMessage = this.formatMessage('ERROR', message, context);
    console.error(formattedMessage);
  }

  /**
   * Start a performance timer
   */
  public time(label: string): void {
    const timerKey = `${this.namespace}:${label}`;
    this.timers.set(timerKey, Date.now());
    this.debug(`Timer started: ${label}`);
  }

  /**
   * End a performance timer and log the duration
   */
  public timeEnd(label: string): void {
    const timerKey = `${this.namespace}:${label}`;
    const startTime = this.timers.get(timerKey);

    if (startTime === undefined) {
      this.warn(`Timer not found: ${label}`);
      return;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(timerKey);
    this.debug(`Timer ended: ${label}`, { duration: `${duration}ms` });
  }

  /**
   * Log with detailed context (useful for debugging complex objects)
   */
  public debugWithContext(message: string, context: Record<string, unknown>): void {
    const formattedMessage = this.formatWithNamespace(message);
    this.logger.debug(formattedMessage, {
      ...context,
      _namespace: this.namespace,
      _timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if a message at the given level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Format message with timestamp, level, and namespace
   */
  private formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level}] [${this.namespace}] ${message}`;

    if (context && Object.keys(context).length > 0) {
      formatted += ` ${JSON.stringify(context)}`;
    }

    return formatted;
  }

  /**
   * Format message with namespace prefix
   */
  private formatWithNamespace(message: string): string {
    return `[${this.namespace}] ${message}`;
  }

  /**
   * Create a child logger with a sub-namespace
   */
  public child(subNamespace: string): DevLogger {
    return new DevLogger(`${this.namespace}:${subNamespace}`, {
      level: this.level,
      console: this.consoleEnabled,
    });
  }
}
