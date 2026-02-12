/**
 * Manual mock for @lmstudio/sdk
 * Prevents the real SDK from auto-connecting to LM Studio during tests.
 */

export class LMStudioClient {
  system = {
    listDownloadedModels: async () => [],
  };
  llm = {
    model: async () => ({
      respond: () => ({ result: async () => ({ content: '', stats: {} }) }),
    }),
  };
}

export class Chat {
  static from(messages: unknown[]) {
    return messages;
  }
}
