/**
 * Result Writer
 * Writes AI results back to markdown files
 */

import { readFileSync, writeFileSync } from 'fs';
import type { WriteInlineOptions, UpdateStatusOptions } from '../types/results.js';
import { Logger } from '../logger/Logger.js';
import { SparkError } from '../types/index.js';

export class ResultWriter {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Write result inline below command with blank line separation
   */
  async writeInline(options: WriteInlineOptions): Promise<void> {
    const { filePath, commandLine, result, addBlankLines = true } = options;

    this.logger.debug('Writing inline result', { filePath, commandLine });

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Validate line number
      if (commandLine < 1 || commandLine > lines.length) {
        throw new SparkError(
          `Invalid line number: ${commandLine} (file has ${lines.length} lines)`,
          'INVALID_LINE_NUMBER'
        );
      }

      // Update command line with success indicator
      const currentLine = lines[commandLine - 1];
      if (!currentLine) {
        throw new SparkError('Command line is empty', 'EMPTY_LINE');
      }

      // If line already has a status indicator, replace it
      // eslint-disable-next-line no-misleading-character-class
      const statusPrefixRegex = /^[⏳✅❌⚠️]\s+/;
      const cleanLine = currentLine.replace(statusPrefixRegex, '');
      lines[commandLine - 1] = `✅ ${cleanLine}`;

      // Insert result after command line
      const resultLines = addBlankLines ? ['', result] : [result];
      lines.splice(commandLine, 0, ...resultLines);

      // Atomic write
      writeFileSync(filePath, lines.join('\n'), 'utf-8');

      this.logger.info('Result written', {
        filePath,
        resultLength: result.length,
        linesAdded: resultLines.length,
      });
    } catch (error) {
      this.logger.error('Failed to write result', { error, filePath });
      throw new SparkError('Failed to write result to file', 'RESULT_WRITE_ERROR', {
        originalError: error,
      });
    }
  }

  /**
   * Update status indicator only (no result content)
   */
  async updateStatus(options: UpdateStatusOptions): Promise<void> {
    const { filePath, commandLine, status } = options;

    this.logger.debug('Updating status', { filePath, commandLine, status });

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Validate line number
      if (commandLine < 1 || commandLine > lines.length) {
        throw new SparkError(
          `Invalid line number: ${commandLine} (file has ${lines.length} lines)`,
          'INVALID_LINE_NUMBER'
        );
      }

      // Update command line with new status
      const currentLine = lines[commandLine - 1];
      if (!currentLine) {
        throw new SparkError('Command line is empty', 'EMPTY_LINE');
      }

      // eslint-disable-next-line no-misleading-character-class
      const statusPrefixRegex = /^[⏳✅❌⚠️]\s+/;
      const cleanLine = currentLine.replace(statusPrefixRegex, '');
      lines[commandLine - 1] = `${status} ${cleanLine}`;

      // Atomic write
      writeFileSync(filePath, lines.join('\n'), 'utf-8');

      this.logger.debug('Status updated', { filePath, status });
    } catch (error) {
      this.logger.error('Failed to update status', { error, filePath });
      // Don't throw - status update is non-critical
    }
  }
}
