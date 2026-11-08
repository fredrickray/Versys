import { AlertLevel, IncidentType } from '../enums';

/** Spec: all fire incidents start at Level 2. */
export function initialAlertLevel(type: IncidentType): AlertLevel {
  if (type === IncidentType.FIRE) return AlertLevel.MID;
  return AlertLevel.LOW;
}
