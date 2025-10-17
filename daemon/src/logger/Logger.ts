/**
 * Logger class for Spark Daemon
 * Handles console and file logging with different levels
 */

import type { LoggingConfig } from '../types/config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private static instance: Logger;
  private config: LoggingConfig;

  private constructor(config: LoggingConfig) {
    this.config = config;
  }

  public static getInstance(config?: LoggingConfig): Logger {
    if (!Logger.instance && config) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  public debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  public info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  public error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedMessage = this.formatMessage(timestamp, level, message, ...args);

    if (this.config.console) {
      this.logToConsole(level, formattedMessage);
    }

    // File logging would be implemented here
    // For now, we'll keep it simple
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const configLevel = this.config.level;
    return levels.indexOf(level) >= levels.indexOf(configLevel);
  }

  private formatMessage(
    timestamp: string,
    level: LogLevel,
    message: string,
    ...args: unknown[]
  ): string {
    const argsStr = args.length > 0 ? ' ' + JSON.stringify(args) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${argsStr}`;
  }

  private logToConsole(level: LogLevel, message: string): void {
    switch (level) {
      case 'debug':
      case 'info':
        console.log(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
        console.error(message);
        break;
    }
  }
}
