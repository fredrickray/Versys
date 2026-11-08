import {
  AlertLevel,
  IncidentChannel,
  IncidentStatus,
  IncidentType,
} from '../enums';

export const IncidentEvent = {
  CREATED: 'incident.created',
  STATUS_CHANGED: 'incident.status_changed',
  RESOLVED: 'incident.resolved',
} as const;

export type IncidentCreatedPayload = {
  incidentId: string;
  type: IncidentType;
  alertLevel: AlertLevel;
  channel: IncidentChannel;
  reporterUserId: string | null;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

export type IncidentStatusChangedPayload = {
  incidentId: string;
  from: IncidentStatus;
  to: IncidentStatus;
  actorUserId: string | null;
  at: string;
};

export type IncidentResolvedPayload = {
  incidentId: string;
  resolvedByUserId: string | null;
  alertLevelAtClose: AlertLevel;
  at: string;
};
