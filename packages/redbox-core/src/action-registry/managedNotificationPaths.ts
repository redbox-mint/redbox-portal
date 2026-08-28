export const MANAGED_NOTIFICATION_FLAG_PATHS = Object.freeze(['notification.state'] as const);

export const MANAGED_NOTIFICATION_LOG_PATHS = Object.freeze([
  'notification.log',
  'notification.log.reviewing',
  'notification.log.published',
] as const);

export type ManagedNotificationFlagPath = (typeof MANAGED_NOTIFICATION_FLAG_PATHS)[number];
export type ManagedNotificationLogPath = (typeof MANAGED_NOTIFICATION_LOG_PATHS)[number];

export function isManagedNotificationFlagPath(value: string): value is ManagedNotificationFlagPath {
  return (MANAGED_NOTIFICATION_FLAG_PATHS as readonly string[]).includes(value);
}

export function isManagedNotificationLogPath(value: string): value is ManagedNotificationLogPath {
  return (MANAGED_NOTIFICATION_LOG_PATHS as readonly string[]).includes(value);
}
