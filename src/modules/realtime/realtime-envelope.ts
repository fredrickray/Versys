import type { RealtimeEventType } from './entities/realtime-outbox.entity';

export type RealtimeEnvelope = {
  schemaVersion: 1;
  eventId: string;
  type: RealtimeEventType;
  incidentId: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export const REALTIME_EVENT_TYPES = new Set<RealtimeEventType>([
  'incident.created',
  'incident.updated',
  'assignment.accepted',
  'assignment.rejected',
  'authz.changed',
]);

export function realtimeChannel(appName: string, nodeEnv: string): string {
  return `${appName}:${nodeEnv}:realtime-events`;
}

export function isRealtimeEnvelope(value: unknown): value is RealtimeEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<RealtimeEnvelope>;
  return (
    envelope.schemaVersion === 1 &&
    typeof envelope.eventId === 'string' &&
    typeof envelope.type === 'string' &&
    REALTIME_EVENT_TYPES.has(envelope.type) &&
    (envelope.incidentId === null || typeof envelope.incidentId === 'string') &&
    typeof envelope.occurredAt === 'string' &&
    !!envelope.payload &&
    typeof envelope.payload === 'object'
  );
}
