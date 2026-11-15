import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  resolveEscalationTimers,
  type EscalationTimers,
} from '../../common/constants/escalation';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
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
import { AuditService } from '../audit/audit.service';
import { EscalationDeadlineEntity } from '../escalation/entities/escalation-deadline.entity';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { RealtimeOutboxService } from '../realtime/realtime-outbox.service';
import { AssignmentEntity } from './entities/assignment.entity';

type AssignmentResult = {
  assignment: AssignmentEntity;
  acceptedPayload?: AssignmentAcceptedPayload;
  rejectedPayload?: AssignmentRejectedPayload;
};

@Injectable()
export class AssignmentsService {
  private readonly timers: EscalationTimers;

  constructor(
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly realtimeOutbox: RealtimeOutboxService,
    private readonly events: EventEmitter2,
  ) {
    this.timers = resolveEscalationTimers(
      config.get<Partial<EscalationTimers>>('escalationTimers') ?? {},
    );
  }

  async createOrSelfAssign(
    incidentId: string,
    actor: AuthUser,
    assigneeUserId?: string,
  ): Promise<AssignmentEntity> {
    const targetId = assigneeUserId ?? actor.userId;
    const isSelf = targetId === actor.userId;
    this.assertCanAssign(actor, isSelf);

    const result = await this.dataSource.transaction((manager) =>
      this.createOrUpdateLocked(manager, incidentId, actor, targetId, isSelf),
    );
    this.publish(result);
    return result.assignment;
  }

  async accept(
    assignmentId: string,
    actor: AuthUser,
  ): Promise<AssignmentEntity> {
    this.assertCanRespond(actor);
    const incidentId = await this.incidentIdFor(assignmentId);
    const result = await this.dataSource.transaction((manager) =>
      this.respondLocked(manager, incidentId, assignmentId, actor, true),
    );
    this.publish(result);
    return result.assignment;
  }

  async reject(
    assignmentId: string,
    actor: AuthUser,
    reason: RejectionReason,
    note?: string,
  ): Promise<AssignmentEntity> {
    this.assertCanRespond(actor);
    const incidentId = await this.incidentIdFor(assignmentId);
    const result = await this.dataSource.transaction((manager) =>
      this.respondLocked(
        manager,
        incidentId,
        assignmentId,
        actor,
        false,
        reason,
        note,
      ),
    );
    this.publish(result);
    return result.assignment;
  }

  private async createOrUpdateLocked(
    manager: EntityManager,
    incidentId: string,
    actor: AuthUser,
    targetId: string,
    isSelf: boolean,
  ): Promise<AssignmentResult> {
    const incident = await this.lockIncident(manager, incidentId);
    const rows = await this.lockAssignments(manager, incidentId);
    const repo = manager.getRepository(AssignmentEntity);
    let assignment = rows.find((row) => row.assigneeUserId === targetId);

    if (!assignment) {
      assignment = repo.create({
        incidentId,
        assigneeUserId: targetId,
        assignedByUserId: isSelf ? null : actor.userId,
        status: AssignmentStatus.PENDING,
        generation: incident.escalationGeneration,
        withdrawnAt: null,
      });
    } else if (
      assignment.generation !== incident.escalationGeneration ||
      (!isSelf &&
        assignment.status !== AssignmentStatus.PENDING &&
        assignment.status !== AssignmentStatus.ACCEPTED)
    ) {
      assignment.generation = incident.escalationGeneration;
      assignment.status = AssignmentStatus.PENDING;
      assignment.acceptedAt = null;
      assignment.rejectedAt = null;
      assignment.rejectionReason = null;
      assignment.rejectionNote = null;
      assignment.withdrawnAt = null;
      assignment.assignedByUserId = isSelf ? null : actor.userId;
    }

    const now = new Date();
    let acceptedPayload: AssignmentAcceptedPayload | undefined;
    if (isSelf) {
      assignment.status = AssignmentStatus.ACCEPTED;
      assignment.acceptedAt = now;
      assignment.rejectedAt = null;
      assignment.rejectionReason = null;
      assignment.rejectionNote = null;
      assignment.withdrawnAt = null;
    }
    assignment = await repo.save(assignment);

    if (isSelf) {
      this.markIntervention(incident, now);
      await manager.getRepository(IncidentEntity).save(incident);
      await this.createPromptDeadline(manager, incident, assignment, now);
      acceptedPayload = {
        assignmentId: assignment.id,
        incidentId,
        assigneeUserId: targetId,
        at: now.toISOString(),
      };
      await this.realtimeOutbox.append(manager, {
        eventKey: `assignment.accepted:${assignment.id}:${assignment.generation}`,
        type: 'assignment.accepted',
        incidentId,
        occurredAt: now,
      });
    }

    await this.audit.append(
      {
        action: isSelf
          ? AuditAction.ASSIGNMENT_ACCEPTED
          : AuditAction.ASSIGNMENT_CREATED,
        actorUserId: actor.userId,
        incidentId,
        resourceType: 'assignment',
        resourceId: assignment.id,
        metadata: {
          assigneeUserId: targetId,
          generation: assignment.generation,
        },
      },
      manager,
    );
    return { assignment, acceptedPayload };
  }

  private async respondLocked(
    manager: EntityManager,
    incidentId: string,
    assignmentId: string,
    actor: AuthUser,
    accepting: boolean,
    reason?: RejectionReason,
    note?: string,
  ): Promise<AssignmentResult> {
    const incident = await this.lockIncident(manager, incidentId);
    const rows = await this.lockAssignments(manager, incidentId);
    const assignment = rows.find((row) => row.id === assignmentId);
    if (!assignment) throw new NotFoundException('assignment_not_found');
    if (assignment.assigneeUserId !== actor.userId) {
      throw new ForbiddenException('not_assignee');
    }
    if (assignment.status !== AssignmentStatus.PENDING) {
      throw new BadRequestException('assignment_not_pending');
    }
    if (assignment.generation !== incident.escalationGeneration) {
      throw new BadRequestException('assignment_stale');
    }

    const now = new Date();
    let acceptedPayload: AssignmentAcceptedPayload | undefined;
    let rejectedPayload: AssignmentRejectedPayload | undefined;
    if (accepting) {
      assignment.status = AssignmentStatus.ACCEPTED;
      assignment.acceptedAt = now;
      assignment.withdrawnAt = null;
      this.markIntervention(incident, now);
      await manager.getRepository(IncidentEntity).save(incident);
      await this.createPromptDeadline(manager, incident, assignment, now);
      acceptedPayload = {
        assignmentId: assignment.id,
        incidentId,
        assigneeUserId: actor.userId,
        at: now.toISOString(),
      };
      await this.realtimeOutbox.append(manager, {
        eventKey: `assignment.accepted:${assignment.id}:${assignment.generation}`,
        type: 'assignment.accepted',
        incidentId,
        occurredAt: now,
      });
    } else {
      assignment.status = AssignmentStatus.REJECTED;
      assignment.rejectedAt = now;
      assignment.rejectionReason = reason ?? RejectionReason.OTHER;
      assignment.rejectionNote = note ?? null;
      rejectedPayload = {
        assignmentId: assignment.id,
        incidentId,
        assigneeUserId: actor.userId,
        reason: assignment.rejectionReason,
        note: assignment.rejectionNote,
        at: now.toISOString(),
      };
      await this.realtimeOutbox.append(manager, {
        eventKey: `assignment.rejected:${assignment.id}:${assignment.generation}`,
        type: 'assignment.rejected',
        incidentId,
        occurredAt: now,
      });
    }

    const saved = await manager
      .getRepository(AssignmentEntity)
      .save(assignment);
    await this.audit.append(
      {
        action: accepting
          ? AuditAction.ASSIGNMENT_ACCEPTED
          : AuditAction.ASSIGNMENT_REJECTED,
        actorUserId: actor.userId,
        incidentId,
        resourceType: 'assignment',
        resourceId: saved.id,
        metadata: accepting
          ? { generation: saved.generation }
          : { reason, note: note ?? null, generation: saved.generation },
      },
      manager,
    );
    return { assignment: saved, acceptedPayload, rejectedPayload };
  }

  private async lockIncident(
    manager: EntityManager,
    incidentId: string,
  ): Promise<IncidentEntity> {
    const incident = await manager
      .getRepository(IncidentEntity)
      .createQueryBuilder('incident')
      .setLock('pessimistic_write')
      .where('incident.id = :incidentId', { incidentId })
      .getOne();
    if (!incident) throw new NotFoundException('incident_not_found');
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestException('incident_resolved');
    }
    return incident;
  }

  private lockAssignments(
    manager: EntityManager,
    incidentId: string,
  ): Promise<AssignmentEntity[]> {
    return manager
      .getRepository(AssignmentEntity)
      .createQueryBuilder('assignment')
      .setLock('pessimistic_write')
      .where('assignment.incident_id = :incidentId', { incidentId })
      .orderBy('assignment.id', 'ASC')
      .getMany();
  }

  private async createPromptDeadline(
    manager: EntityManager,
    incident: IncidentEntity,
    assignment: AssignmentEntity,
    acceptedAt: Date,
  ): Promise<void> {
    await manager
      .getRepository(EscalationDeadlineEntity)
      .createQueryBuilder()
      .insert()
      .values({
        incidentId: incident.id,
        assignmentId: assignment.id,
        generation: incident.escalationGeneration,
        kind: 'prompt',
        status: 'pending',
        dueAt: new Date(acceptedAt.getTime() + this.timers.PROMPT_AFTER_MS),
        completedAt: null,
      })
      .orIgnore()
      .execute();
  }

  private markIntervention(incident: IncidentEntity, acceptedAt: Date): void {
    if (incident.status === IncidentStatus.REPORTED) {
      incident.status = IncidentStatus.INTERVENTION_ONGOING;
    }
    if (!incident.firstAcceptedAt) incident.firstAcceptedAt = acceptedAt;
    incident.escalationHoldAt = null;
  }

  private async incidentIdFor(assignmentId: string): Promise<string> {
    const assignment = await this.assignments.findOne({
      where: { id: assignmentId },
      select: { id: true, incidentId: true },
    });
    if (!assignment) throw new NotFoundException('assignment_not_found');
    return assignment.incidentId;
  }

  private assertCanAssign(actor: AuthUser, isSelf: boolean): void {
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
  }

  private assertCanRespond(actor: AuthUser): void {
    if (!actor.permissions.includes(Permission.ACCEPT_REJECT_INTERVENTION)) {
      throw new ForbiddenException('cannot_accept_reject');
    }
  }

  private publish(result: AssignmentResult): void {
    if (result.acceptedPayload) {
      this.events.emit(AssignmentEvent.ACCEPTED, result.acceptedPayload);
      this.events.emit('realtime.incident_updated', {
        incidentId: result.assignment.incidentId,
      });
    }
    if (result.rejectedPayload) {
      this.events.emit(AssignmentEvent.REJECTED, result.rejectedPayload);
      this.events.emit('realtime.incident_updated', {
        incidentId: result.assignment.incidentId,
      });
    }
  }
}
