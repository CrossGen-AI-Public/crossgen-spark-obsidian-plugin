/**
 * Development Logger with enhanced debugging capabilities
 * Extends the base Logger with namespace support and performance timing
 */

import { Logger } from './Logger.js';
import type { LoggingConfig } from '../types/config.js';

export class DevLogger {
  private logger: Logger;
  private namespace: string;
  private timers: Map<string, number> = new Map();

  constructor(namespace: string, config?: LoggingConfig) {
    this.namespace = namespace;
    this.logger = config ? Logger.getInstance(config) : Logger.getInstance();
  }

  /**
   * Log debug message with namespace context
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    const formattedMessage = this.formatWithNamespace(message);
    if (context) {
      this.logger.debug(formattedMessage, context);
    } else {
      this.logger.debug(formattedMessage);
    }
  }

  /**
   * Log info message with namespace context
   */
  public info(message: string, context?: Record<string, unknown>): void {
    const formattedMessage = this.formatWithNamespace(message);
    if (context) {
      this.logger.info(formattedMessage, context);
    } else {
      this.logger.info(formattedMessage);
    }
  }

  /**
   * Log warning message with namespace context
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    const formattedMessage = this.formatWithNamespace(message);
    if (context) {
      this.logger.warn(formattedMessage, context);
    } else {
      this.logger.warn(formattedMessage);
    }
  }

  /**
   * Log error message with namespace context
   */
  public error(message: string, context?: Record<string, unknown>): void {
    const formattedMessage = this.formatWithNamespace(message);
    if (context) {
      this.logger.error(formattedMessage, context);
    } else {
      this.logger.error(formattedMessage);
    }
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
   * Format message with namespace prefix
   */
  private formatWithNamespace(message: string): string {
    return `[${this.namespace}] ${message}`;
  }

  /**
   * Create a child logger with a sub-namespace
   */
  public child(subNamespace: string): DevLogger {
    return new DevLogger(`${this.namespace}:${subNamespace}`);
  }
}
