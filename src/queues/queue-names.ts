export const QueueName = {
  ESCALATION: 'escalation',
  NOTIFICATIONS: 'notifications',
  LOCATION_RETENTION: 'location-retention',
  ANALYTICS: 'analytics',
  OFFLINE_ALERTS: 'offline-alerts',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];
