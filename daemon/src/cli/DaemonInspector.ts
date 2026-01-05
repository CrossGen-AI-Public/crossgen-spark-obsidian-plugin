/**
 * Daemon Inspector
 * Provides debugging and inspection capabilities for the Spark daemon
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SparkDaemon } from '../main.js';
import type { DaemonState, FileChange, SparkConfig } from '../types/index.js';

export interface InspectorState {
  state: DaemonState;
  vaultPath: string;
  config: SparkConfig | null;
  isRunning: boolean;
  uptime?: number;
}

export interface ProcessingEvent {
  timestamp: number;
  type: 'file_change' | 'command_detected' | 'frontmatter_change' | 'error';
  path?: string;
  details?: Record<string, unknown>;
}

export class DaemonInspector {
  private daemon: SparkDaemon;
  private startTime: number | null = null;
  private processingHistory: ProcessingEvent[] = [];
  private maxHistorySize = 1000;
  private historyFile: string;

  constructor(daemon: SparkDaemon) {
    this.daemon = daemon;
    this.historyFile = path.join(daemon.getVaultPath(), '.spark', 'history.json');
    this.loadHistory();
  }

  /**
   * Get current daemon state
   */
  public getState(): InspectorState {
    // Access daemon internals (would need getters on SparkDaemon)
    return {
      state: this.getDaemonState(),
      vaultPath: this.getVaultPath(),
      config: this.getConfig(),
      isRunning: this.daemon.isRunning(),
      uptime: this.startTime ? Date.now() - this.startTime : undefined,
    };
  }

  /**
   * Record daemon start
   */
  public recordStart(): void {
    this.startTime = Date.now();
  }

  /**
   * Record daemon stop
   */
  public recordStop(): void {
    this.startTime = null;
  }

  /**
   * Record a file change event
   */
  public recordFileChange(change: FileChange): void {
    this.addToHistory({
      timestamp: Date.now(),
      type: 'file_change',
      path: change.path,
      details: { changeType: change.type },
    });
  }

  /**
   * Record a command detection
   */
  public recordCommandDetected(
    filePath: string,
    command: string,
    details?: Record<string, unknown>
  ): void {
    this.addToHistory({
      timestamp: Date.now(),
      type: 'command_detected',
      path: filePath,
      details: { command, ...details },
    });
  }

  /**
   * Record a frontmatter change
   */
  public recordFrontmatterChange(
    filePath: string,
    field: string,
    oldValue: unknown,
    newValue: unknown
  ): void {
    this.addToHistory({
      timestamp: Date.now(),
      type: 'frontmatter_change',
      path: filePath,
      details: { field, oldValue, newValue },
    });
  }

  /**
   * Record an error
   */
  public recordError(error: Error, context?: Record<string, unknown>): void {
    this.addToHistory({
      timestamp: Date.now(),
      type: 'error',
      details: {
        message: error.message,
        stack: error.stack,
        ...context,
      },
    });
  }

  /**
   * Get processing history
   */
  public getHistory(limit?: number): ProcessingEvent[] {
    const events = [...this.processingHistory].reverse(); // Most recent first
    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Clear processing history
   */
  public clearHistory(): void {
    this.processingHistory = [];
    // Delete history file
    try {
      if (existsSync(this.historyFile)) {
        unlinkSync(this.historyFile);
      }
    } catch {
      // Ignore deletion errors
    }
  }

  /**
   * Get statistics about processing
   */
  public getStats(): {
    totalEvents: number;
    fileChanges: number;
    commandsDetected: number;
    frontmatterChanges: number;
    errors: number;
  } {
    return {
      totalEvents: this.processingHistory.length,
      fileChanges: this.processingHistory.filter((e) => e.type === 'file_change').length,
      commandsDetected: this.processingHistory.filter((e) => e.type === 'command_detected').length,
      frontmatterChanges: this.processingHistory.filter((e) => e.type === 'frontmatter_change')
        .length,
      errors: this.processingHistory.filter((e) => e.type === 'error').length,
    };
  }

  /**
   * Add event to history (with size limit)
   */
  private addToHistory(event: ProcessingEvent): void {
    this.processingHistory.push(event);

    // Keep history size under control
    if (this.processingHistory.length > this.maxHistorySize) {
      this.processingHistory.shift();
    }

    // Persist to file
    this.saveHistory();
  }

  /**
   * Load history from file
   */
  private loadHistory(): void {
    try {
      if (existsSync(this.historyFile)) {
        const data = readFileSync(this.historyFile, 'utf-8');
        this.processingHistory = JSON.parse(data);
      }
    } catch {
      // Ignore load errors, start with empty history
      this.processingHistory = [];
    }
  }

  /**
   * Save history to file
   */
  private saveHistory(): void {
    try {
      const sparkDir = path.dirname(this.historyFile);
      mkdirSync(sparkDir, { recursive: true });
      writeFileSync(this.historyFile, JSON.stringify(this.processingHistory, null, 2));
    } catch {
      // Ignore save errors (daemon continues working)
    }
  }

  /**
   * Get daemon state
   */
  private getDaemonState(): DaemonState {
    return this.daemon.getState();
  }

  /**
   * Get vault path
   */
  private getVaultPath(): string {
    return this.daemon.getVaultPath();
  }

  /**
   * Get config
   */
  private getConfig(): SparkConfig | null {
    return this.daemon.getConfig();
  }
}
