import { RejectionReason } from '../enums';

export const AssignmentEvent = {
  CREATED: 'assignment.created',
  ACCEPTED: 'assignment.accepted',
  REJECTED: 'assignment.rejected',
  WITHDRAWN: 'assignment.withdrawn',
} as const;

export type AssignmentCreatedPayload = {
  assignmentId: string;
  incidentId: string;
  assigneeUserId: string;
  assignedByUserId: string | null;
  at: string;
};

export type AssignmentAcceptedPayload = {
  assignmentId: string;
  incidentId: string;
  assigneeUserId: string;
  at: string;
};

export type AssignmentRejectedPayload = {
  assignmentId: string;
  incidentId: string;
  assigneeUserId: string;
  reason: RejectionReason;
  note: string | null;
  at: string;
};

export type AssignmentWithdrawnPayload = {
  assignmentId: string;
  incidentId: string;
  assigneeUserId: string;
  reason: string;
  at: string;
};
