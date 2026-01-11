/**
 * Centralized Error Handler
 * Provides user-friendly error messages and logging without stack traces
 */

import { Logger } from '../logger/Logger.js';
import { ErrorWriter } from '../results/ErrorWriter.js';
import { SparkError } from '../types/index.js';

export interface ErrorHandlerOptions {
  vaultPath?: string;
  exitOnError?: boolean;
  logToFile?: boolean;
}

export class ErrorHandler {
  private logger: Logger;
  private errorWriter: ErrorWriter | null = null;

  constructor(private options: ErrorHandlerOptions = {}) {
    this.logger = Logger.getInstance();
    if (options.vaultPath && options.logToFile) {
      this.errorWriter = new ErrorWriter(options.vaultPath);
    }
  }

  /**
   * Handle an error with user-friendly output
   * Returns exit code (0 = success, 1 = error)
   */
  async handle(
    error: unknown,
    context?: { filePath?: string; operation?: string }
  ): Promise<number> {
    const sparkError = this.normalizeError(error);

    // Display user-friendly error message
    this.displayError(sparkError, context);

    // Log to file if configured (use operation as filePath for CLI errors)
    if (this.errorWriter) {
      try {
        await this.errorWriter.writeError({
          error: sparkError,
          filePath: context?.filePath || 'engine',
        });
      } catch (logError) {
        this.logger.error('Failed to write error log', { error: logError });
      }
    }

    // Exit if configured
    if (this.options.exitOnError) {
      process.exit(1);
    }

    return 1;
  }

  /**
   * Display user-friendly error message to console
   */
  private displayError(error: SparkError, context?: { operation?: string }): void {
    console.error('');
    console.error(`❌ Error${context?.operation ? `: ${context.operation}` : ''}`);
    console.error('');
    console.error(`   ${error.message}`);

    // Add suggestions based on error code
    const suggestions = ErrorHandler.getSuggestions(error.code, error);
    if (suggestions.length > 0) {
      console.error('');
      console.error('💡 Suggestions:');
      suggestions.forEach((suggestion, index) => {
        console.error(`   ${index + 1}. ${suggestion}`);
      });
    }

    console.error('');
  }

  /**
   * Get user-friendly suggestions based on error code
   */
  public static getSuggestions(errorCode: string, _error?: unknown): string[] {
    switch (errorCode) {
      case 'API_KEY_NOT_SET': {
        return [
          `Open Spark plugin settings and add your API key`,
          'Go to: Settings → Community Plugins → Spark → Advanced tab',
          'Get your API key from your AI provider dashboard',
          'Changes are applied automatically',
        ];
      }

      case 'CONFIG_ERROR':
      case 'CONFIG_LOAD_FAILED':
      case 'INVALID_CONFIG':
      case 'INVALID_CONFIG_ENGINE':
      case 'INVALID_CONFIG_WATCH':
      case 'INVALID_PATTERNS':
      case 'INVALID_IGNORE':
      case 'INVALID_DEBOUNCE':
      case 'INVALID_CONFIG_AI':
      case 'INVALID_AI_PROVIDER':
      case 'INVALID_CLAUDE_MODEL':
      case 'INVALID_CLAUDE_API_KEY_ENV':
      case 'INVALID_CLAUDE_MAX_TOKENS':
      case 'INVALID_CLAUDE_TEMPERATURE':
      case 'INVALID_CONFIG_LOGGING':
      case 'INVALID_CONFIG_FEATURES':
      case 'INVALID_FEATURE_FLAG':
        return [
          'Check your .spark/config.yaml file for syntax errors',
          'Run: spark inspect <vault> to see current configuration',
          'See example-vault/.spark/config.yaml for reference',
        ];

      case 'AI_NETWORK_ERROR':
        return [
          'Check your internet connection',
          'Verify you can reach the AI provider API endpoint',
          'Check if a firewall or VPN is blocking the connection',
          'The engine will retry automatically once connection is restored',
        ];

      case 'AI_CLIENT_ERROR': {
        return [
          'Check your API key is valid and not expired',
          'Update your API key in Spark plugin settings if needed',
          'Get a new key from your AI provider dashboard',
          'Changes are applied automatically',
        ];
      }

      case 'AI_SERVER_ERROR':
        return [
          'This is a temporary server issue',
          'The engine will retry automatically',
          'Check your AI provider status page for any outages',
          'If persists for >5 minutes, try restarting the engine',
        ];

      case 'ALREADY_RUNNING':
        return [
          'Run: spark stop <vault> to stop the existing engine',
          'Or run: spark status to see all running engines.',
          'To stop all engines, run: spark stop --all',
        ];

      case 'NOT_RUNNING':
        return [
          'Run: spark start <vault> to start the engine',
          'Or run: spark status to check all engine instances',
        ];

      case 'START_FAILED':
        return [
          'Check the error message above for specific details',
          'Verify your .spark/config.yaml is valid',
          'Ensure the vault path is correct and accessible',
        ];

      case 'RESULT_WRITE_ERROR':
        return [
          'Check file permissions in your vault',
          'Ensure the file still exists and is not deleted',
          'Check if file is open in another application',
          'Verify sufficient disk space is available',
        ];

      case 'EMPTY_LINE':
        return [
          'The command line appears to be empty',
          'Ensure your command includes the full instruction',
        ];

      case 'FILE_NOT_FOUND':
        return [
          'Verify the file path is correct',
          'Check if the file was moved or deleted',
          "Ensure you're in the correct vault directory",
        ];

      case 'PROVIDER_NOT_FOUND':
        return [
          'Check your .spark/config.yaml file',
          'Verify the provider name is correct',
          'Available providers are listed in the error message',
          'Make sure the provider is registered in the engine',
        ];

      case 'PROVIDER_INIT_FAILED':
        return [
          'Check the error details above for specific issues',
          'Add your API key in Spark plugin settings if missing',
          'Go to: Settings → Community Plugins → Spark → Advanced tab',
          'Changes are applied automatically',
        ];

      case 'PROVIDER_NOT_CONFIGURED':
        return [
          'Add the provider configuration to .spark/config.yaml',
          'Ensure ai.providers contains your desired provider',
          'Set ai.defaultProvider to match one of your configured providers',
          'See example-vault/.spark/config.yaml for reference',
        ];

      case 'PROVIDER_NOT_SPECIFIED':
        return [
          'Set ai.defaultProvider in .spark/config.yaml',
          'Or specify a provider in the agent configuration',
          'Available providers are listed in the error message',
        ];

      case 'INVALID_PROVIDER_CONFIG':
        return [
          'Check your provider configuration in .spark/config.yaml',
          'Ensure all required fields are present (type, model)',
          'Verify field types match the specification',
          'See example-vault/.spark/config.yaml for correct format',
        ];

      default:
        return [];
    }
  }

  /**
   * Normalize any error to SparkError
   */
  private normalizeError(error: unknown): SparkError {
    if (error instanceof SparkError) {
      return error;
    }

    if (error instanceof Error) {
      return new SparkError(error.message, 'UNKNOWN_ERROR', { originalError: error });
    }

    if (typeof error === 'string') {
      return new SparkError(error, 'UNKNOWN_ERROR');
    }

    return new SparkError('An unknown error occurred', 'UNKNOWN_ERROR');
  }
}

/**
 * Quick helper for CLI error handling
 */
export function handleCliError(error: unknown, operation?: string, vaultPath?: string): never {
  const handler = new ErrorHandler({
    exitOnError: true,
    vaultPath,
    logToFile: !!vaultPath, // Only log to file if vaultPath is provided
  });
  void handler.handle(error, { operation });
  // Never returns due to process.exit
  process.exit(1);
}
