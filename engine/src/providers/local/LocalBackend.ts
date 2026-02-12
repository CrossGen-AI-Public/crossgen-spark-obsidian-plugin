/**
 * Local AI Backend interface and types
 * Abstraction layer for local model servers (LM Studio, Ollama, etc.)
 */

export interface LocalMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LocalCompletionOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LocalCompletionResult {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LocalModelInfo {
  path: string;
  displayName: string;
  paramsString: string;
  sizeBytes: number;
  trainedForToolUse: boolean;
  maxContextLength: number;
}

export interface LocalBackend {
  readonly name: string;
  complete(
    messages: LocalMessage[],
    options: LocalCompletionOptions
  ): Promise<LocalCompletionResult>;
  listModels(): Promise<LocalModelInfo[]>;
  isAvailable(): Promise<boolean>;
}
