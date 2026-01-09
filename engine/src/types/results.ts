/**
 * Result writing types
 */

export type StatusIndicator = '⏳' | '✅' | '❌' | '⚠️';

export type ResultMode = 'auto' | 'inline' | 'separate';

export interface ResultsConfig {
  mode: ResultMode;
  inline_max_chars: number;
  separate_folder: string;
  add_blank_lines: boolean;
}

export interface WriteInlineOptions {
  filePath: string;
  commandLine: number;
  commandText: string;
  result: string;
  addBlankLines?: boolean;
}

export interface UpdateStatusOptions {
  filePath: string;
  commandLine: number;
  commandText: string;
  status: StatusIndicator;
}

export interface WriteInlineChatResponseOptions {
  filePath: string;
  chatId: string;
  startLine: number;
  endLine: number;
  response: string;
}

export interface UpdateInlineChatStatusOptions {
  filePath: string;
  chatId: string;
  startLine: number;
  endLine: number;
  status: 'processing' | 'complete' | 'error';
}
