import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AssignmentStatus,
  AuditAction,
  IncidentStatus,
  Permission,
  RejectionReason,
} from '../../common/enums';
import {
  AssignmentEvent,
  type AssignmentAcceptedPayload,
  type AssignmentRejectedPayload,
} from '../../common/events/assignment.events';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { IncidentsService } from '../incidents/incidents.service';
import { AssignmentEntity } from './entities/assignment.entity';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    private readonly incidents: IncidentsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async createOrSelfAssign(
    incidentId: string,
    actor: AuthUser,
    assigneeUserId?: string,
  ): Promise<AssignmentEntity> {
    const incident = await this.incidents.findById(incidentId);
    if (!incident) throw new NotFoundException('incident_not_found');
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestException('incident_resolved');
    }

    const targetId = assigneeUserId ?? actor.userId;
    const isSelf = targetId === actor.userId;
    const canDispatch = actor.permissions.includes(Permission.DISPATCH_ASSIGN);
    const canAccept = actor.permissions.includes(
      Permission.ACCEPT_REJECT_INTERVENTION,
    );

    if (!isSelf && !canDispatch) {
      throw new ForbiddenException('cannot_assign_others');
    }
    if (isSelf && !canAccept && !canDispatch) {
      throw new ForbiddenException('cannot_accept_intervention');
    }

    let row = await this.assignments.findOne({
      where: { incidentId, assigneeUserId: targetId },
    });
    if (!row) {
      row = this.assignments.create({
        incidentId,
        assigneeUserId: targetId,
        assignedByUserId: isSelf ? null : actor.userId,
        status: AssignmentStatus.PENDING,
      });
    }

    // Self-create implies accept
    if (isSelf) {
      row.status = AssignmentStatus.ACCEPTED;
      row.acceptedAt = new Date();
      row.rejectionReason = null;
      row.rejectionNote = null;
    }

    const saved = await this.assignments.save(row);

    await this.audit.append({
      action: isSelf
        ? AuditAction.ASSIGNMENT_ACCEPTED
        : AuditAction.ASSIGNMENT_CREATED,
      actorUserId: actor.userId,
      incidentId,
      resourceType: 'assignment',
      resourceId: saved.id,
      metadata: { assigneeUserId: targetId },
    });

    if (isSelf) {
      await this.incidents.markInterventionOngoing(incidentId);
      const payload: AssignmentAcceptedPayload = {
        assignmentId: saved.id,
        incidentId,
        assigneeUserId: targetId,
        at: new Date().toISOString(),
      };
      this.events.emit(AssignmentEvent.ACCEPTED, payload);
      this.events.emit('realtime.incident_updated', { incidentId });
    }

    return saved;
  }

  async accept(
    assignmentId: string,
    actor: AuthUser,
  ): Promise<AssignmentEntity> {
    const row = await this.requireOwnPending(assignmentId, actor);
    row.status = AssignmentStatus.ACCEPTED;
    row.acceptedAt = new Date();
    const saved = await this.assignments.save(row);

    await this.incidents.markInterventionOngoing(saved.incidentId);
    await this.audit.append({
      action: AuditAction.ASSIGNMENT_ACCEPTED,
      actorUserId: actor.userId,
      incidentId: saved.incidentId,
      resourceType: 'assignment',
      resourceId: saved.id,
    });

    const payload: AssignmentAcceptedPayload = {
      assignmentId: saved.id,
      incidentId: saved.incidentId,
      assigneeUserId: actor.userId,
      at: new Date().toISOString(),
    };
    this.events.emit(AssignmentEvent.ACCEPTED, payload);
    this.events.emit('realtime.incident_updated', {
      incidentId: saved.incidentId,
    });
    return saved;
  }

  async reject(
    assignmentId: string,
    actor: AuthUser,
    reason: RejectionReason,
    note?: string,
  ): Promise<AssignmentEntity> {
    const row = await this.requireOwnPending(assignmentId, actor);
    row.status = AssignmentStatus.REJECTED;
    row.rejectedAt = new Date();
    row.rejectionReason = reason;
    row.rejectionNote = note ?? null;
    const saved = await this.assignments.save(row);

    await this.audit.append({
      action: AuditAction.ASSIGNMENT_REJECTED,
      actorUserId: actor.userId,
      incidentId: saved.incidentId,
      resourceType: 'assignment',
      resourceId: saved.id,
      metadata: { reason, note: note ?? null },
    });

    const payload: AssignmentRejectedPayload = {
      assignmentId: saved.id,
      incidentId: saved.incidentId,
      assigneeUserId: actor.userId,
      reason,
      note: note ?? null,
      at: new Date().toISOString(),
    };
    this.events.emit(AssignmentEvent.REJECTED, payload);
    this.events.emit('realtime.incident_updated', {
      incidentId: saved.incidentId,
    });
    return saved;
  }

  private async requireOwnPending(
    assignmentId: string,
    actor: AuthUser,
  ): Promise<AssignmentEntity> {
    if (!actor.permissions.includes(Permission.ACCEPT_REJECT_INTERVENTION)) {
      throw new ForbiddenException('cannot_accept_reject');
    }
    const row = await this.assignments.findOne({ where: { id: assignmentId } });
    if (!row) throw new NotFoundException('assignment_not_found');
    if (row.assigneeUserId !== actor.userId) {
      throw new ForbiddenException('not_assignee');
    }
    if (row.status !== AssignmentStatus.PENDING) {
      throw new BadRequestException('assignment_not_pending');
    }
    return row;
  }
}
