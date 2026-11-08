import { AlertLevel } from '../enums';

export const EscalationEvent = {
  PROMPT_DUE: 'escalation.prompt_due',
  AUTO_ESCALATED: 'escalation.auto_escalated',
  MANUAL_ESCALATED: 'escalation.manual_escalated',
  LEVEL4_RECORDED: 'escalation.level4_recorded',
  FROZEN: 'escalation.frozen',
} as const;

export type EscalationPromptDuePayload = {
  incidentId: string;
  assignmentId: string;
  currentLevel: AlertLevel;
  dueAt: string;
};

export type EscalationAutoPayload = {
  incidentId: string;
  fromLevel: AlertLevel;
  toLevel: AlertLevel;
  at: string;
};

export type EscalationManualPayload = {
  incidentId: string;
  fromLevel: AlertLevel;
  toLevel: AlertLevel;
  actorUserId: string;
  at: string;
};

export type EscalationLevel4Payload = {
  incidentId: string;
  actorUserId: string;
  externalContactId: string;
  agencyName: string;
  at: string;
};
