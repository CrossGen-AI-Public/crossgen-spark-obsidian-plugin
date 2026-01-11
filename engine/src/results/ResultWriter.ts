/**
 * Result Writer
 * Writes AI results back to markdown files
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { Logger } from '../logger/Logger.js';
import { SparkError } from '../types/index.js';
import type {
  UpdateInlineChatStatusOptions,
  UpdateStatusOptions,
  WriteInlineChatResponseOptions,
  WriteInlineOptions,
} from '../types/results.js';

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
      // Match status emojis: ⏳ (pending), ✅ (completed), ❌ (error), ⚠️ (warning)
      // Use alternatives (not a character class) to avoid misleading character-class lint issues.
      const statusPrefixRegex = /^(?:⏳|✅|❌|⚠️)\s+/u;
      const cleanLine = currentLine.replace(statusPrefixRegex, '');
      lines[commandLine - 1] = `✅ ${cleanLine}`;

      // Insert result after command line with markers to prevent feedback loop
      const resultLines = addBlankLines
        ? ['', '<!-- spark-result-start -->', result, '<!-- spark-result-end -->']
        : ['<!-- spark-result-start -->', result, '<!-- spark-result-end -->'];
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

      // Match status emojis: ⏳ (pending), ✅ (completed), ❌ (error), ⚠️ (warning)
      // Use alternatives (not a character class) to avoid misleading character-class lint issues.
      const statusPrefixRegex = /^(?:⏳|✅|❌|⚠️)\s+/u;
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

  /**
   * Update inline chat status in marker
   */
  async updateInlineChatStatus(options: UpdateInlineChatStatusOptions): Promise<void> {
    const { filePath, chatId, startLine, endLine, status } = options;

    this.logger.debug('Updating inline chat status', { filePath, chatId, status });

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Find and update the opening marker
      for (let i = startLine - 1; i < endLine; i++) {
        const line = lines[i];
        if (line?.match(/<!--\s*spark-inline-chat:/)) {
          // Replace status in marker
          lines[i] = line.replace(
            /<!--\s*spark-inline-chat:(pending|processing|complete|error):([a-z0-9-]+)\s*-->/,
            `<!-- spark-inline-chat:${status}:$2 -->`
          );
          break;
        }
      }

      // Atomic write
      writeFileSync(filePath, lines.join('\n'), 'utf-8');

      this.logger.info('Inline chat status updated', { filePath, chatId, status });
    } catch (error) {
      this.logger.error('Failed to update inline chat status', { error, filePath, chatId });
      throw new SparkError('Failed to update inline chat status', 'STATUS_UPDATE_ERROR', {
        originalError: error,
      });
    }
  }

  /**
   * Write AI response to inline chat (replaces entire chat block with just the response)
   * Removes all markers to prevent feedback loops and keep document clean
   */
  async writeInlineChatResponse(options: WriteInlineChatResponseOptions): Promise<void> {
    const { filePath, chatId, startLine, endLine, response } = options;

    this.logger.debug('Writing inline chat response', {
      filePath,
      chatId,
      responseLength: response.length,
    });

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Validate line numbers
      if (startLine < 1 || endLine > lines.length) {
        throw new SparkError(
          `Invalid line numbers: ${startLine}-${endLine} (file has ${lines.length} lines)`,
          'INVALID_LINE_RANGE'
        );
      }

      // Replace entire chat block with just the AI response
      // No markers = no feedback loops, clean document
      lines.splice(startLine - 1, endLine - startLine + 1, response);

      // Atomic write
      writeFileSync(filePath, lines.join('\n'), 'utf-8');

      this.logger.info('Inline chat response written', {
        filePath,
        chatId,
        responseLength: response.length,
      });
    } catch (error) {
      this.logger.error('Failed to write inline chat response', { error, filePath, chatId });
      throw new SparkError('Failed to write inline chat response', 'RESPONSE_WRITE_ERROR', {
        originalError: error,
      });
    }
  }
}
