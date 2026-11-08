import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ALERT_LEVEL_NOTIFY_ROLES } from '../../common/constants/permissions';
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
import { PlacesService } from '../places/places.service';
import { UsersService } from '../users/users.service';
import { EscalationEventEntity } from './entities/escalation-event.entity';
import { EscalationScheduler } from './escalation.scheduler';
import { EscalationMachine } from './state-machine/escalation.machine';
import type { EscalationContext } from './state-machine/transitions';

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly machine: EscalationMachine,
    private readonly scheduler: EscalationScheduler,
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    @InjectRepository(EscalationEventEntity)
    private readonly escalationEvents: Repository<EscalationEventEntity>,
    private readonly users: UsersService,
    private readonly places: PlacesService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async onAssignmentAccepted(
    incidentId: string,
    assignmentId: string,
  ): Promise<void> {
    await this.scheduler.schedulePrompt(incidentId, assignmentId);
  }

  async issuePrompt(incidentId: string, assignmentId: string): Promise<void> {
    const incident = await this.requireOpenIncident(incidentId);
    const assignment = await this.assignments.findOne({
      where: {
        id: assignmentId,
        incidentId,
        status: AssignmentStatus.ACCEPTED,
      },
    });
    const ctx = this.systemCtx(incident, assignment?.acceptedAt ?? null);
    const result = this.machine.evaluate('prompt_due', ctx);
    if (!result.ok) {
      this.logger.debug(`prompt skip ${incidentId}: ${result.reason}`);
      return;
    }

    incident.promptIssuedAt = new Date();
    await this.incidents.save(incident);

    await this.recordEvent(incident, 'prompt_due', null, null, null, {
      assignmentId,
    });
    await this.audit.append({
      action: AuditAction.ESCALATION_PROMPTED,
      incidentId,
      metadata: { assignmentId },
    });

    this.events.emit(EscalationEvent.PROMPT_DUE, {
      incidentId,
      assignmentId,
      currentLevel: incident.alertLevel,
      dueAt: incident.promptIssuedAt.toISOString(),
    });
    this.events.emit('realtime.incident_updated', { incidentId });

    // Notify assigned responder(s) to resolve or escalate
    if (assignment) {
      this.events.emit('incident.notify_targets', {
        incidentId,
        userIds: [assignment.assigneeUserId],
        alertLevel: incident.alertLevel,
        publicCode: incident.publicCode,
        type: 'prompt_resolve_or_escalate',
        alarm: incident.alertLevel >= AlertLevel.HIGH,
      });
    }

    await this.scheduler.scheduleAutoEscalate(incidentId);
  }

  async autoEscalate(incidentId: string): Promise<void> {
    const incident = await this.requireOpenIncident(incidentId);
    const accepted = await this.latestAccepted(incidentId);
    const ctx = this.systemCtx(incident, accepted?.acceptedAt ?? null);
    const result = this.machine.evaluate('auto_escalate', ctx);
    if (!result.ok) {
      this.logger.debug(`auto_escalate skip ${incidentId}: ${result.reason}`);
      return;
    }
    if (!result.nextLevel) return;

    const from = incident.alertLevel;
    incident.alertLevel = result.nextLevel;
    incident.promptIssuedAt = null; // new tier gets a fresh clock after next accept
    await this.incidents.save(incident);

    // Withdraw resolution role from lower-level accepted assignments
    await this.assignments.update(
      { incidentId, status: AssignmentStatus.ACCEPTED },
      { status: AssignmentStatus.WITHDRAWN },
    );

    await this.recordEvent(
      incident,
      'auto_escalate',
      from,
      result.nextLevel,
      null,
    );
    await this.audit.append({
      action: AuditAction.ESCALATION_AUTO,
      incidentId,
      metadata: { from, to: result.nextLevel },
    });

    this.events.emit(EscalationEvent.AUTO_ESCALATED, {
      incidentId,
      fromLevel: from,
      toLevel: result.nextLevel,
      at: new Date().toISOString(),
    });
    await this.fanOutLevel(incident);
    this.events.emit('realtime.incident_updated', { incidentId });
  }

  async manualEscalate(
    incidentId: string,
    actor: AuthUser,
  ): Promise<IncidentEntity> {
    const incident = await this.requireOpenIncident(incidentId);
    const accepted = await this.latestAccepted(incidentId);
    const ctx = await this.actorCtx(incident, actor, accepted);
    const result = this.machine.evaluate('manual_escalate', ctx);
    if (!result.ok) throw new BadRequestException(result.reason);
    if (!result.nextLevel) throw new BadRequestException('no_next_level');

    const from = incident.alertLevel;
    incident.alertLevel = result.nextLevel;
    incident.promptIssuedAt = null;
    await this.incidents.save(incident);
    await this.scheduler.cancelForIncident(incidentId);

    await this.recordEvent(
      incident,
      'manual_escalate',
      from,
      result.nextLevel,
      actor.userId,
    );
    await this.audit.append({
      action: AuditAction.ESCALATION_MANUAL,
      actorUserId: actor.userId,
      incidentId,
      metadata: { from, to: result.nextLevel },
    });

    this.events.emit(EscalationEvent.MANUAL_ESCALATED, {
      incidentId,
      fromLevel: from,
      toLevel: result.nextLevel,
      actorUserId: actor.userId,
      at: new Date().toISOString(),
    });
    await this.fanOutLevel(incident);
    this.events.emit('realtime.incident_updated', { incidentId });
    return incident;
  }

  async resolve(
    incidentId: string,
    actor: AuthUser,
    final = false,
  ): Promise<IncidentEntity> {
    const incident = await this.requireOpenIncident(incidentId);
    const accepted = await this.latestAccepted(incidentId);
    const ctx = await this.actorCtx(incident, actor, accepted);
    const action = final ? 'close_final' : 'confirm_resolved';
    const result = this.machine.evaluate(action, ctx);
    if (!result.ok) throw new ForbiddenException(result.reason);

    if (result.nextStatus === IncidentStatus.RESOLVED) {
      incident.status = IncidentStatus.RESOLVED;
      incident.resolvedAt = new Date();
      incident.resolvedByUserId = actor.userId;
      await this.incidents.save(incident);
      await this.scheduler.cancelForIncident(incidentId);
      await this.audit.append({
        action: AuditAction.INCIDENT_RESOLVED,
        actorUserId: actor.userId,
        incidentId,
      });
      this.events.emit('realtime.incident_updated', { incidentId });
      return incident;
    }

    // confirm_resolved: keep open, cancel auto-escalate window (human responded)
    await this.scheduler.cancelForIncident(incidentId);
    await this.audit.append({
      action: AuditAction.INCIDENT_STATUS_CHANGED,
      actorUserId: actor.userId,
      incidentId,
      metadata: { confirm: true },
    });
    this.events.emit('realtime.incident_updated', { incidentId });
    return incident;
  }

  async recordLevel4(
    incidentId: string,
    actor: AuthUser,
    externalContactId: string,
    note?: string,
  ): Promise<IncidentEntity> {
    const incident = await this.requireOpenIncident(incidentId);
    const accepted = await this.latestAccepted(incidentId);
    const ctx = await this.actorCtx(incident, actor, accepted);
    const result = this.machine.evaluate('record_level4', ctx);
    if (!result.ok) throw new ForbiddenException(result.reason);

    const contact = await this.places.getExternalContact(externalContactId);
    const from = incident.alertLevel;
    incident.alertLevel = AlertLevel.ULTRA;
    await this.incidents.save(incident);
    await this.scheduler.cancelForIncident(incidentId);

    await this.recordEvent(
      incident,
      'record_level4',
      from,
      AlertLevel.ULTRA,
      actor.userId,
      {
        externalContactId: contact.id,
        agencyName: contact.agencyName,
        phoneE164: contact.phoneE164,
        note: note ?? null,
      },
    );
    await this.audit.append({
      action: AuditAction.ESCALATION_LEVEL4,
      actorUserId: actor.userId,
      incidentId,
      metadata: {
        externalContactId: contact.id,
        agencyName: contact.agencyName,
        phoneE164: contact.phoneE164,
        note: note ?? null,
      },
    });

    this.events.emit(EscalationEvent.LEVEL4_RECORDED, {
      incidentId,
      actorUserId: actor.userId,
      externalContactId: contact.id,
      agencyName: contact.agencyName,
      at: new Date().toISOString(),
    });
    this.events.emit('realtime.incident_updated', { incidentId });
    return incident;
  }

  /** Safety net: find incidents that missed delayed jobs. */
  async reconcile(): Promise<void> {
    const open = await this.incidents
      .createQueryBuilder('i')
      .where('i.status != :resolved', { resolved: IncidentStatus.RESOLVED })
      .getMany();

    const now = new Date();
    for (const incident of open) {
      const accepted = await this.latestAccepted(incident.id);
      if (!accepted?.acceptedAt) continue;

      const ctx = this.systemCtx(incident, accepted.acceptedAt);
      ctx.now = now;

      if (!incident.promptIssuedAt) {
        const due = this.machine.evaluate('prompt_due', ctx);
        if (due.ok) {
          await this.issuePrompt(incident.id, accepted.id);
        }
        continue;
      }

      const auto = this.machine.evaluate('auto_escalate', {
        ...ctx,
        promptIssuedAt: incident.promptIssuedAt,
      });
      if (auto.ok) {
        await this.autoEscalate(incident.id);
      }
    }
  }

  private async fanOutLevel(incident: IncidentEntity): Promise<void> {
    const roles = [...ALERT_LEVEL_NOTIFY_ROLES[incident.alertLevel]];
    const staff = roles.length
      ? await this.users.findActiveByStaffRoles(roles)
      : [];
    const dispatchers = await this.users.findActiveDispatchers();
    const userIds = [
      ...new Set([...staff.map((s) => s.id), ...dispatchers.map((d) => d.id)]),
    ];
    if (!userIds.length) return;
    this.events.emit('incident.notify_targets', {
      incidentId: incident.id,
      userIds,
      alertLevel: incident.alertLevel,
      publicCode: incident.publicCode,
      type: incident.type,
      alarm: incident.alertLevel >= AlertLevel.HIGH,
    });
  }

  private async requireOpenIncident(id: string): Promise<IncidentEntity> {
    const incident = await this.incidents.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('incident_not_found');
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestException('incident_already_resolved');
    }
    return incident;
  }

  private latestAccepted(incidentId: string): Promise<AssignmentEntity | null> {
    return this.assignments.findOne({
      where: { incidentId, status: AssignmentStatus.ACCEPTED },
      order: { acceptedAt: 'DESC' },
    });
  }

  private systemCtx(
    incident: IncidentEntity,
    assignedAt: Date | null,
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
      now: new Date(),
      timers: this.scheduler.getTimers(),
    };
  }

  private async actorCtx(
    incident: IncidentEntity,
    actor: AuthUser,
    accepted: AssignmentEntity | null,
  ): Promise<EscalationContext> {
    const mine = await this.assignments.findOne({
      where: {
        incidentId: incident.id,
        assigneeUserId: actor.userId,
        status: AssignmentStatus.ACCEPTED,
      },
    });
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
    incident: IncidentEntity,
    action: string,
    fromLevel: AlertLevel | null,
    toLevel: AlertLevel | null,
    actorUserId: string | null,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.escalationEvents.save(
      this.escalationEvents.create({
        incidentId: incident.id,
        action,
        fromLevel,
        toLevel,
        actorUserId,
        payload,
      }),
    );
  }
}
