/**
 * Notification system type definitions
 */

/**
 * Notification types
 */
export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'progress';

/**
 * Notification structure
 */
export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
  file?: string;
  line?: number;
  link?: string;
  progress?: number;
  retry_at?: number;
  details?: string;
  action?: NotificationAction;
}

/**
 * Notification action button
 */
export interface NotificationAction {
  label: string;
  command: string;
}

/**
 * Interface for notifiers
 */
export interface INotifier {
  send(notification: Omit<Notification, 'id' | 'timestamp'>): Promise<void>;
}
