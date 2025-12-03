/**
 * Event system type definitions
 */

/**
 * Event listener callback type
 */
export type EventListener<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Event emitter interface
 */
export interface IEventEmitter<Events extends Record<string, unknown>> {
  on<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void;
  off<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void;
  emit<K extends keyof Events>(event: K, data: Events[K]): void;
  removeAllListeners(): void;
}

/**
 * Daemon events map
 */
export interface DaemonEvents {
  started: undefined;
  stopped: undefined;
  error: Error;
  fileChange: {
    path: string;
    type: 'add' | 'change' | 'unlink';
  };
  commandDetected: {
    file: string;
    line: number;
    command: string;
  };
  commandCompleted: {
    file: string;
    line: number;
    command: string;
  };
  commandFailed: {
    file: string;
    line: number;
    command: string;
    error: Error;
  };
}
