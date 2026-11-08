import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AssignmentEvent,
  type AssignmentAcceptedPayload,
} from '../../../common/events/assignment.events';
import { EscalationService } from '../escalation.service';

@Injectable()
export class AssignmentAcceptedListener {
  constructor(private readonly escalation: EscalationService) {}

  @OnEvent(AssignmentEvent.ACCEPTED)
  async handle(payload: AssignmentAcceptedPayload): Promise<void> {
    await this.escalation.onAssignmentAccepted(
      payload.incidentId,
      payload.assignmentId,
    );
  }
}
