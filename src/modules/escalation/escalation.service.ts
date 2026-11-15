import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  AlertLevel,
  AssignmentStatus,
  AuditAction,
  IncidentStatus,
} from '../../common/enums';
import { EscalationEvent } from '../../common/events/escalation.events';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { AuditService } from '../audit/audit.service';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { StaffShiftService } from '../location/staff-shift.service';
import { PlacesService } from '../places/places.service';
import { NotificationIntentService } from '../notifications/notification-intent.service';
import { RealtimeOutboxService } from '../realtime/realtime-outbox.service';
import { EscalationDeadlineEntity } from './entities/escalation-deadline.entity';
import { EscalationEventEntity } from './entities/escalation-event.entity';
import { EscalationScheduler } from './escalation.scheduler';
import { EscalationMachine } from './state-machine/escalation.machine';
import type { EscalationContext } from './state-machine/transitions';

type LockedState = {
  incident: IncidentEntity;
  assignments: AssignmentEntity[];
};

type EscalationResult = {
  incident: IncidentEntity;
  promptAssignment?: AssignmentEntity;
  cleanupUserIds?: string[];
  event?: {
    type: string;
    payload: Record<string, unknown>;
  };
};

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly machine: EscalationMachine,
    private readonly scheduler: EscalationScheduler,
    private readonly dataSource: DataSource,
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    private readonly places: PlacesService,
    private readonly audit: AuditService,
    private readonly realtimeOutbox: RealtimeOutboxService,
    private readonly notificationIntents: NotificationIntentService,
    private readonly shifts: StaffShiftService,
    private readonly events: EventEmitter2,
  ) {}

  async onAssignmentAccepted(
    incidentId: string,
    assignmentId: string,
  ): Promise<void> {
    await this.scheduler.schedulePrompt(incidentId, assignmentId);
  }

  async issuePrompt(incidentId: string, assignmentId: string): Promise<void> {
    const result = await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, incidentId);
      const assignment = state.assignments.find(
        (row) =>
          row.id === assignmentId &&
          row.status === AssignmentStatus.ACCEPTED &&
          row.generation === state.incident.escalationGeneration,
      );
      const deadline = await this.lockDeadline(
        manager,
        state.incident,
        'prompt',
      );
      if (!assignment || !deadline || deadline.status !== 'pending') {
        return null;
      }

      const now = new Date();
      const transition = this.machine.evaluate(
        'prompt_due',
        this.systemCtx(state.incident, assignment.acceptedAt, now),
      );
      if (!transition.ok || deadline.dueAt.getTime() > now.getTime()) {
        return null;
      }

      state.incident.promptIssuedAt = now;
      state.incident.escalationHoldAt = null;
      await manager.getRepository(IncidentEntity).save(state.incident);
      deadline.status = 'completed';
      deadline.completedAt = now;
      await manager.getRepository(EscalationDeadlineEntity).save(deadline);
      await this.upsertDeadline(manager, {
        incident: state.incident,
        assignmentId: assignment.id,
        kind: 'auto',
        dueAt: new Date(
          now.getTime() +
            this.scheduler.getTimers().AUTO_ESCALATE_AFTER_PROMPT_MS,
        ),
      });
      await this.recordEvent(
        manager,
        state.incident,
        'prompt_due',
        null,
        null,
        null,
        { assignmentId },
      );
      await this.audit.append(
        {
          action: AuditAction.ESCALATION_PROMPTED,
          incidentId,
          metadata: {
            assignmentId,
            generation: state.incident.escalationGeneration,
          },
        },
        manager,
      );
      await this.appendRealtimeUpdate(manager, state.incident, now, 'prompt');
      await this.appendNotificationIntent(
        manager,
        state.incident,
        'prompt',
        'prompt',
        [assignment.assigneeUserId],
      );
      return {
        incident: state.incident,
        promptAssignment: assignment,
        event: {
          type: EscalationEvent.PROMPT_DUE,
          payload: {
            incidentId,
            assignmentId,
            currentLevel: state.incident.alertLevel,
            dueAt: now.toISOString(),
          },
        },
      } satisfies EscalationResult;
    });

    if (!result) return;
    if (result.event) this.events.emit(result.event.type, result.event.payload);
    this.events.emit('realtime.incident_updated', { incidentId });
    await this.scheduler.scheduleAutoEscalate(incidentId);
  }

  async autoEscalate(incidentId: string): Promise<void> {
    const result = await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, incidentId);
      const accepted = this.latestAcceptedFrom(state.assignments);
      const deadline = await this.lockDeadline(manager, state.incident, 'auto');
      if (!deadline || deadline.status !== 'pending') return null;

      const now = new Date();
      if (deadline.dueAt.getTime() > now.getTime()) return null;
      const transition = this.machine.evaluate(
        'auto_escalate',
        this.systemCtx(state.incident, accepted?.acceptedAt ?? null, now),
      );

      if (!transition.ok && transition.freeze) {
        deadline.status = 'frozen';
        deadline.completedAt = now;
        state.incident.promptIssuedAt = null;
        await manager.getRepository(EscalationDeadlineEntity).save(deadline);
        await manager.getRepository(IncidentEntity).save(state.incident);
        await this.recordEvent(
          manager,
          state.incident,
          'auto_escalation_frozen',
          state.incident.alertLevel,
          state.incident.alertLevel,
          null,
        );
        await this.audit.append(
          {
            action: AuditAction.ESCALATION_AUTO,
            incidentId,
            metadata: {
              frozen: true,
              level: state.incident.alertLevel,
              generation: state.incident.escalationGeneration,
            },
          },
          manager,
        );
        await this.appendRealtimeUpdate(manager, state.incident, now, 'frozen');
        return { incident: state.incident } satisfies EscalationResult;
      }
      if (!transition.ok || !transition.nextLevel) return null;

      const from = state.incident.alertLevel;
      state.incident.alertLevel = transition.nextLevel;
      state.incident.promptIssuedAt = null;
      state.incident.escalationHoldAt = null;
      state.incident.escalationGeneration += 1;
      const cleanupUserIds = this.acceptedUserIds(state.assignments);
      this.withdrawAccepted(state.assignments, now);
      deadline.status = 'completed';
      deadline.completedAt = now;
      await manager.getRepository(IncidentEntity).save(state.incident);
      await manager.getRepository(AssignmentEntity).save(state.assignments);
      await manager.getRepository(EscalationDeadlineEntity).save(deadline);
      await this.recordEvent(
        manager,
        state.incident,
        'auto_escalate',
        from,
        transition.nextLevel,
        null,
      );
      await this.audit.append(
        {
          action: AuditAction.ESCALATION_AUTO,
          incidentId,
          metadata: {
            from,
            to: transition.nextLevel,
            generation: state.incident.escalationGeneration,
          },
        },
        manager,
      );
      await this.appendRealtimeUpdate(manager, state.incident, now, 'auto');
      await this.appendNotificationIntent(
        manager,
        state.incident,
        'level',
        'auto',
      );
      return {
        incident: state.incident,
        cleanupUserIds,
        event: {
          type: EscalationEvent.AUTO_ESCALATED,
          payload: {
            incidentId,
            fromLevel: from,
            toLevel: transition.nextLevel,
            at: now.toISOString(),
          },
        },
      } satisfies EscalationResult;
    });

    await this.publishResult(result);
  }

  async manualEscalate(
    incidentId: string,
    actor: AuthUser,
  ): Promise<IncidentEntity> {
    const result = await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, incidentId);
      const accepted = this.latestAcceptedFrom(state.assignments);
      const transition = this.machine.evaluate(
        'manual_escalate',
        this.actorCtx(state.incident, state.assignments, actor, accepted),
      );
      if (!transition.ok) throw new BadRequestException(transition.reason);
      if (!transition.nextLevel) throw new BadRequestException('no_next_level');

      const now = new Date();
      const from = state.incident.alertLevel;
      state.incident.alertLevel = transition.nextLevel;
      state.incident.promptIssuedAt = null;
      state.incident.escalationHoldAt = null;
      state.incident.escalationGeneration += 1;
      const cleanupUserIds = this.acceptedUserIds(state.assignments);
      this.withdrawAccepted(state.assignments, now);
      await manager.getRepository(IncidentEntity).save(state.incident);
      await manager.getRepository(AssignmentEntity).save(state.assignments);
      await this.cancelDeadlines(manager, incidentId, now);
      await this.recordEvent(
        manager,
        state.incident,
        'manual_escalate',
        from,
        transition.nextLevel,
        actor.userId,
      );
      await this.audit.append(
        {
          action: AuditAction.ESCALATION_MANUAL,
          actorUserId: actor.userId,
          incidentId,
          metadata: { from, to: transition.nextLevel },
        },
        manager,
      );
      await this.appendRealtimeUpdate(manager, state.incident, now, 'manual');
      await this.appendNotificationIntent(
        manager,
        state.incident,
        'level',
        'manual',
      );
      return {
        incident: state.incident,
        cleanupUserIds,
        event: {
          type: EscalationEvent.MANUAL_ESCALATED,
          payload: {
            incidentId,
            fromLevel: from,
            toLevel: transition.nextLevel,
            actorUserId: actor.userId,
            at: now.toISOString(),
          },
        },
      } satisfies EscalationResult;
    });

    await this.scheduler.cancelForIncident(incidentId);
    await this.publishResult(result);
    return result.incident;
  }

  async resolve(
    incidentId: string,
    actor: AuthUser,
    final = false,
  ): Promise<IncidentEntity> {
    const result = await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, incidentId);
      const accepted = this.latestAcceptedFrom(state.assignments);
      const action = final ? 'close_final' : 'confirm_resolved';
      const transition = this.machine.evaluate(
        action,
        this.actorCtx(state.incident, state.assignments, actor, accepted),
      );
      if (!transition.ok) throw new ForbiddenException(transition.reason);

      const now = new Date();
      const cleanupUserIds =
        transition.nextStatus === IncidentStatus.RESOLVED
          ? this.acceptedUserIds(state.assignments)
          : [];
      if (transition.nextStatus === IncidentStatus.RESOLVED) {
        state.incident.status = IncidentStatus.RESOLVED;
        state.incident.resolvedAt = now;
        state.incident.resolvedByUserId = actor.userId;
        state.incident.promptIssuedAt = null;
        state.incident.escalationHoldAt = now;
        for (const assignment of state.assignments) {
          if (assignment.status === AssignmentStatus.ACCEPTED) {
            assignment.status = AssignmentStatus.COMPLETED;
          }
        }
        await manager.getRepository(IncidentEntity).save(state.incident);
        await manager.getRepository(AssignmentEntity).save(state.assignments);
        await this.cancelDeadlines(manager, incidentId, now);
        await this.audit.append(
          {
            action: AuditAction.INCIDENT_RESOLVED,
            actorUserId: actor.userId,
            incidentId,
          },
          manager,
        );
      } else {
        state.incident.promptIssuedAt = null;
        state.incident.escalationHoldAt = now;
        await manager.getRepository(IncidentEntity).save(state.incident);
        await this.cancelDeadlines(manager, incidentId, now);
        await this.audit.append(
          {
            action: AuditAction.INCIDENT_STATUS_CHANGED,
            actorUserId: actor.userId,
            incidentId,
            metadata: { confirm: true },
          },
          manager,
        );
      }
      await this.appendRealtimeUpdate(
        manager,
        state.incident,
        now,
        transition.nextStatus === IncidentStatus.RESOLVED
          ? 'resolved'
          : 'confirmed',
      );
      return {
        incident: state.incident,
        cleanupUserIds,
      } satisfies EscalationResult;
    });

    await this.scheduler.cancelForIncident(incidentId);
    await this.cleanupUsers(result.cleanupUserIds);
    this.events.emit('realtime.incident_updated', { incidentId });
    return result.incident;
  }

  async recordLevel4(
    incidentId: string,
    actor: AuthUser,
    externalContactId: string,
    note?: string,
  ): Promise<IncidentEntity> {
    const contact = await this.places.getExternalContact(externalContactId);
    const result = await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, incidentId);
      const accepted = this.latestAcceptedFrom(state.assignments);
      const transition = this.machine.evaluate(
        'record_level4',
        this.actorCtx(state.incident, state.assignments, actor, accepted),
      );
      if (!transition.ok) throw new ForbiddenException(transition.reason);

      const now = new Date();
      const from = state.incident.alertLevel;
      state.incident.alertLevel = AlertLevel.ULTRA;
      state.incident.promptIssuedAt = null;
      state.incident.escalationHoldAt = now;
      state.incident.escalationGeneration += 1;
      const cleanupUserIds = this.acceptedUserIds(state.assignments);
      this.withdrawAccepted(state.assignments, now);
      await manager.getRepository(IncidentEntity).save(state.incident);
      await manager.getRepository(AssignmentEntity).save(state.assignments);
      await this.cancelDeadlines(manager, incidentId, now);
      const details = {
        externalContactId: contact.id,
        agencyName: contact.agencyName,
        phoneE164: contact.phoneE164,
        note: note ?? null,
      };
      await this.recordEvent(
        manager,
        state.incident,
        'record_level4',
        from,
        AlertLevel.ULTRA,
        actor.userId,
        details,
      );
      await this.audit.append(
        {
          action: AuditAction.ESCALATION_LEVEL4,
          actorUserId: actor.userId,
          incidentId,
          metadata: details,
        },
        manager,
      );
      await this.appendRealtimeUpdate(manager, state.incident, now, 'level4');
      return {
        incident: state.incident,
        cleanupUserIds,
        event: {
          type: EscalationEvent.LEVEL4_RECORDED,
          payload: {
            incidentId,
            actorUserId: actor.userId,
            externalContactId: contact.id,
            agencyName: contact.agencyName,
            at: now.toISOString(),
          },
        },
      } satisfies EscalationResult;
    });

    await this.scheduler.cancelForIncident(incidentId);
    await this.publishResult(result);
    return result.incident;
  }

  async reconcile(): Promise<void> {
    const due = await this.dataSource
      .getRepository(EscalationDeadlineEntity)
      .createQueryBuilder('deadline')
      .where('deadline.status = :status', { status: 'pending' })
      .andWhere('deadline.due_at <= :now', { now: new Date() })
      .orderBy('deadline.due_at', 'ASC')
      .take(100)
      .getMany();

    for (const deadline of due) {
      if (deadline.kind === 'prompt' && deadline.assignmentId) {
        await this.issuePrompt(deadline.incidentId, deadline.assignmentId);
      } else if (deadline.kind === 'auto') {
        await this.autoEscalate(deadline.incidentId);
      }
    }
  }

  private async lockState(
    manager: EntityManager,
    incidentId: string,
  ): Promise<LockedState> {
    const incident = await manager
      .getRepository(IncidentEntity)
      .createQueryBuilder('incident')
      .setLock('pessimistic_write')
      .where('incident.id = :incidentId', { incidentId })
      .getOne();
    if (!incident) throw new NotFoundException('incident_not_found');
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestException('incident_already_resolved');
    }
    const assignments = await manager
      .getRepository(AssignmentEntity)
      .createQueryBuilder('assignment')
      .setLock('pessimistic_write')
      .where('assignment.incident_id = :incidentId', { incidentId })
      .orderBy('assignment.id', 'ASC')
      .getMany();
    return { incident, assignments };
  }

  private async lockDeadline(
    manager: EntityManager,
    incident: IncidentEntity,
    kind: 'prompt' | 'auto',
  ): Promise<EscalationDeadlineEntity | null> {
    return manager
      .getRepository(EscalationDeadlineEntity)
      .createQueryBuilder('deadline')
      .setLock('pessimistic_write')
      .where('deadline.incident_id = :incidentId', {
        incidentId: incident.id,
      })
      .andWhere('deadline.generation = :generation', {
        generation: incident.escalationGeneration,
      })
      .andWhere('deadline.kind = :kind', { kind })
      .getOne();
  }

  private async upsertDeadline(
    manager: EntityManager,
    input: {
      incident: IncidentEntity;
      assignmentId: string | null;
      kind: 'prompt' | 'auto';
      dueAt: Date;
    },
  ): Promise<void> {
    await manager
      .getRepository(EscalationDeadlineEntity)
      .createQueryBuilder()
      .insert()
      .values({
        incidentId: input.incident.id,
        assignmentId: input.assignmentId,
        generation: input.incident.escalationGeneration,
        kind: input.kind,
        status: 'pending',
        dueAt: input.dueAt,
        completedAt: null,
      })
      .orIgnore()
      .execute();
  }

  private async cancelDeadlines(
    manager: EntityManager,
    incidentId: string,
    now: Date,
  ): Promise<void> {
    await manager
      .getRepository(EscalationDeadlineEntity)
      .createQueryBuilder()
      .update(EscalationDeadlineEntity)
      .set({ status: 'cancelled', completedAt: now })
      .where('incident_id = :incidentId', { incidentId })
      .andWhere('status = :status', { status: 'pending' })
      .execute();
  }

  private latestAcceptedFrom(
    assignments: AssignmentEntity[],
  ): AssignmentEntity | null {
    return (
      assignments
        .filter((row) => row.status === AssignmentStatus.ACCEPTED)
        .sort(
          (left, right) =>
            (right.acceptedAt?.getTime() ?? 0) -
            (left.acceptedAt?.getTime() ?? 0),
        )[0] ?? null
    );
  }

  private acceptedUserIds(assignments: AssignmentEntity[]): string[] {
    return assignments
      .filter((assignment) => assignment.status === AssignmentStatus.ACCEPTED)
      .map((assignment) => assignment.assigneeUserId);
  }

  private withdrawAccepted(assignments: AssignmentEntity[], now: Date): void {
    for (const assignment of assignments) {
      if (assignment.status === AssignmentStatus.ACCEPTED) {
        assignment.status = AssignmentStatus.WITHDRAWN;
        assignment.withdrawnAt = now;
      }
    }
  }

  private systemCtx(
    incident: IncidentEntity,
    assignedAt: Date | null,
    now: Date,
  ): EscalationContext {
    return {
      status: incident.status,
      alertLevel: incident.alertLevel,
      assignedAt,
      promptIssuedAt: incident.promptIssuedAt,
      actor: {
        staffCategory: null,
        isDispatcher: false,
        isAssignedResponder: false,
      },
      now,
      timers: this.scheduler.getTimers(),
    };
  }

  private actorCtx(
    incident: IncidentEntity,
    assignments: AssignmentEntity[],
    actor: AuthUser,
    accepted: AssignmentEntity | null,
  ): EscalationContext {
    const mine = assignments.find(
      (row) =>
        row.assigneeUserId === actor.userId &&
        row.status === AssignmentStatus.ACCEPTED &&
        row.generation === incident.escalationGeneration,
    );
    return {
      status: incident.status,
      alertLevel: incident.alertLevel,
      assignedAt: accepted?.acceptedAt ?? mine?.acceptedAt ?? null,
      promptIssuedAt: incident.promptIssuedAt,
      actor: {
        staffCategory: actor.staffCategory,
        isDispatcher: actor.isDispatcher,
        isAssignedResponder: !!mine,
      },
      now: new Date(),
      timers: this.scheduler.getTimers(),
    };
  }

  private async recordEvent(
    manager: EntityManager,
    incident: IncidentEntity,
    action: string,
    fromLevel: AlertLevel | null,
    toLevel: AlertLevel | null,
    actorUserId: string | null,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    const repo = manager.getRepository(EscalationEventEntity);
    await repo.save(
      repo.create({
        incidentId: incident.id,
        action,
        fromLevel,
        toLevel,
        actorUserId,
        payload: {
          ...payload,
          generation: incident.escalationGeneration,
        },
      }),
    );
  }

  private appendNotificationIntent(
    manager: EntityManager,
    incident: IncidentEntity,
    kind: 'level' | 'prompt',
    reason: string,
    userIds: string[] = [],
  ): Promise<void> {
    if (incident.isDrill) return Promise.resolve();
    return this.notificationIntents.append(manager, {
      eventKey: `notification.${reason}:${incident.id}:${incident.escalationGeneration}`,
      incidentId: incident.id,
      kind,
      userIds,
      payload: { reason },
    });
  }

  private appendRealtimeUpdate(
    manager: EntityManager,
    incident: IncidentEntity,
    occurredAt: Date,
    reason: string,
  ): Promise<void> {
    return this.realtimeOutbox.append(manager, {
      eventKey: `incident.updated:${incident.id}:${incident.escalationGeneration}:${reason}`,
      type: 'incident.updated',
      incidentId: incident.id,
      occurredAt,
    });
  }

  private async cleanupUsers(userIds: string[] = []): Promise<void> {
    for (const userId of userIds) await this.shifts.cleanupUser(userId);
  }

  private async publishResult(result: EscalationResult | null): Promise<void> {
    if (!result) return;
    await this.cleanupUsers(result.cleanupUserIds);
    if (result.event) this.events.emit(result.event.type, result.event.payload);
    this.events.emit('realtime.incident_updated', {
      incidentId: result.incident.id,
    });
  }
}
