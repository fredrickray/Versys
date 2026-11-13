import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { initialAlertLevel } from '../../common/constants/incident';
import {
  NEAREST_STAFF_LIMIT,
  NEAREST_STAFF_RADIUS_M,
  STAFF_GEO_KEY,
} from '../../common/constants/location';
import { ALERT_LEVEL_NOTIFY_ROLES } from '../../common/constants/permissions';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  AlertLevel,
  AssignmentStatus,
  AuditAction,
  IncidentStatus,
  Permission,
} from '../../common/enums';
import {
  IncidentEvent,
  type IncidentCreatedPayload,
} from '../../common/events/incident.events';
import { generatePublicCode } from '../../common/utils/public-code';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { UsersService } from '../users/users.service';
import { AddIncidentDetailsDto } from './dto/add-incident-details.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentEntity } from './entities/incident.entity';

export type CreateIncidentActor = {
  userId: string | null;
  phoneE164?: string | null;
};

export type IncidentView = {
  id: string;
  publicCode: string;
  type: IncidentEntity['type'];
  status: IncidentEntity['status'];
  alertLevel: IncidentEntity['alertLevel'];
  channel: IncidentEntity['channel'];
  locationLabel: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  promptIssuedAt: Date | null;
  firstAcceptedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    private readonly users: UsersService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateIncidentDto,
    actor: CreateIncidentActor,
  ): Promise<IncidentEntity> {
    await this.assertRateLimit(actor);
    const saved = await this.dataSource.transaction((manager) =>
      this.createWithinTransaction(dto, actor, manager),
    );
    await this.publishCreated(saved);
    return saved;
  }

  /**
   * Persists the incident and its audit record through the caller's transaction.
   * Call publishCreated only after that transaction commits.
   */
  async createWithinTransaction(
    dto: CreateIncidentDto,
    actor: CreateIncidentActor,
    manager: EntityManager,
  ): Promise<IncidentEntity> {
    const incidents = manager.getRepository(IncidentEntity);
    const alertLevel = initialAlertLevel(dto.type);
    const incident = incidents.create({
      publicCode: await this.allocatePublicCode(incidents),
      type: dto.type,
      status: IncidentStatus.REPORTED,
      alertLevel,
      channel: dto.channel,
      reporterUserId: actor.userId,
      reporterPhoneE164: actor.phoneE164 ?? null,
      locationLabel: dto.locationLabel ?? null,
      placeId: dto.placeId ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      metadata: dto.metadata ?? {},
    });
    const saved = await incidents.save(incident);

    await this.audit.append(
      {
        action: AuditAction.INCIDENT_CREATED,
        actorUserId: actor.userId,
        incidentId: saved.id,
        resourceType: 'incident',
        resourceId: saved.id,
        metadata: {
          type: saved.type,
          channel: saved.channel,
          alertLevel: saved.alertLevel,
          publicCode: saved.publicCode,
        },
      },
      manager,
    );
    return saved;
  }

  /** Emits post-commit best-effort events for a newly persisted incident. */
  async publishCreated(saved: IncidentEntity): Promise<void> {
    const payload: IncidentCreatedPayload = {
      incidentId: saved.id,
      type: saved.type,
      alertLevel: saved.alertLevel,
      channel: saved.channel,
      reporterUserId: saved.reporterUserId,
      locationLabel: saved.locationLabel,
      latitude: saved.latitude,
      longitude: saved.longitude,
      createdAt: saved.createdAt.toISOString(),
    };
    this.events.emit(IncidentEvent.CREATED, payload);

    const notifyUserIds = await this.resolveNotifyTargets(saved);
    this.events.emit('incident.notify_targets', {
      incidentId: saved.id,
      userIds: notifyUserIds,
      alertLevel: saved.alertLevel,
      publicCode: saved.publicCode,
      type: saved.type,
    });

    this.logger.log(
      `Incident ${saved.publicCode} created level=${saved.alertLevel} notify=${notifyUserIds.length}`,
    );
  }

  async addDetails(
    incidentId: string,
    dto: AddIncidentDetailsDto,
    actor: AuthUser,
  ): Promise<IncidentView> {
    const incident = await this.findById(incidentId);
    if (!incident) throw new NotFoundException('incident_not_found');

    const isReporter = incident.reporterUserId === actor.userId;
    const isStaff = actor.staffCategory != null || actor.isDispatcher;
    if (!isReporter && !isStaff) {
      throw new ForbiddenException('cannot_add_incident_details');
    }

    const existing = Array.isArray(incident.metadata?.reporterNotes)
      ? (incident.metadata.reporterNotes as unknown[])
      : [];
    const at = new Date().toISOString();
    const existingPhotos = Array.isArray(incident.metadata?.reporterPhotos)
      ? (incident.metadata.reporterPhotos as unknown[])
      : [];
    const photoUrls = dto.photoUrls ?? [];
    incident.metadata = {
      ...(incident.metadata ?? {}),
      reporterNotes: [
        ...existing,
        { note: dto.note.trim(), at, userId: actor.userId },
      ],
      ...(photoUrls.length > 0
        ? {
            reporterPhotos: [
              ...existingPhotos,
              ...photoUrls.map((url) => ({ url, at, userId: actor.userId })),
            ],
          }
        : {}),
    };
    const saved = await this.incidents.save(incident);

    await this.audit.append({
      action: AuditAction.INCIDENT_DETAILS_ADDED,
      actorUserId: actor.userId,
      incidentId: saved.id,
      resourceType: 'incident',
      resourceId: saved.id,
      metadata: {
        noteLength: dto.note.trim().length,
        photoCount: photoUrls.length,
      },
    });
    return this.toView(
      saved,
      await this.needsPreciseLocation(saved.id, actor),
    );
    return this.incidents.findOne({ where: { id } });
  }

  async findOneForActor(id: string, actor: AuthUser): Promise<IncidentView> {
    const qb = this.incidents
      .createQueryBuilder('i')
      .where('i.id = :id', { id });
    this.applyActorScope(qb, actor);
    const incident = await qb.getOne();
    if (!incident) throw new NotFoundException('incident_not_found');

    return this.toView(
      incident,
      await this.needsPreciseLocation(incident.id, actor),
    );
  }

  async listForActor(
    actor: AuthUser,
    opts: { status?: IncidentStatus; limit?: number } = {},
  ): Promise<IncidentView[]> {
    const qb = this.incidents
      .createQueryBuilder('i')
      .orderBy('i.created_at', 'DESC')
      .take(opts.limit ?? 50);
    if (opts.status) qb.andWhere('i.status = :status', { status: opts.status });
    this.applyActorScope(qb, actor);
    const incidents = await qb.getMany();

    if (this.hasDispatchAccess(actor)) {
      return incidents.map((incident) => this.toView(incident, true));
    }
    const operationalIncidentIds = await this.acceptedIncidentIds(
      incidents.map((incident) => incident.id),
      actor,
    );
    return incidents.map((incident) =>
      this.toView(incident, operationalIncidentIds.has(incident.id)),
    );
  }

  toView(
    incident: IncidentEntity,
    includePreciseLocation: boolean,
  ): IncidentView {
    return {
      id: incident.id,
      publicCode: incident.publicCode,
      type: incident.type,
      status: incident.status,
      alertLevel: incident.alertLevel,
      channel: incident.channel,
      locationLabel: incident.locationLabel,
      placeId: incident.placeId,
      latitude: includePreciseLocation ? incident.latitude : null,
      longitude: includePreciseLocation ? incident.longitude : null,
      promptIssuedAt: incident.promptIssuedAt,
      firstAcceptedAt: incident.firstAcceptedAt,
      resolvedAt: incident.resolvedAt,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
  }

  async markInterventionOngoing(incidentId: string): Promise<void> {
    const incident = await this.findById(incidentId);
    if (!incident || incident.status === IncidentStatus.RESOLVED) return;
    if (incident.status === IncidentStatus.REPORTED) {
      incident.status = IncidentStatus.INTERVENTION_ONGOING;
    }
    if (!incident.firstAcceptedAt) {
      incident.firstAcceptedAt = new Date();
    }
    await this.incidents.save(incident);
  }

  async assertRateLimit(actor: CreateIncidentActor): Promise<void> {
    const keyPart = actor.userId ?? actor.phoneE164 ?? 'anon';
    const key = `rate:alert:${keyPart}`;
    const limit = this.config.getOrThrow<number>('rateLimitAlertsPerHour');
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 3600);
    if (count > limit) {
      throw new HttpException(
        'alert_rate_limited',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Nearest Level-1 via Redis GEO when coordinates exist; always include dispatchers.
   * Falls back to all active staff matching the alert-level role keys.
   */
  async resolveNotifyTargets(incident: IncidentEntity): Promise<string[]> {
    const targets = new Set<string>();

    const dispatchers = await this.users.findActiveDispatchers();
    for (const dispatcher of dispatchers) targets.add(dispatcher.id);

    const roleKeys = [...ALERT_LEVEL_NOTIFY_ROLES[incident.alertLevel]];
    const level1Roles = [...ALERT_LEVEL_NOTIFY_ROLES[AlertLevel.LOW]];
    const rolesForGeo = level1Roles;

    if (
      incident.latitude != null &&
      incident.longitude != null &&
      rolesForGeo.length
    ) {
      const nearby = (await this.redis.client.call(
        'GEORADIUS',
        STAFF_GEO_KEY,
        String(incident.longitude),
        String(incident.latitude),
        String(NEAREST_STAFF_RADIUS_M),
        'm',
        'ASC',
        'COUNT',
        String(NEAREST_STAFF_LIMIT),
      )) as string[];

      if (nearby?.length) {
        const staff = await this.users.findActiveByStaffRoles(rolesForGeo);
        const allowed = new Set(staff.map((member) => member.id));
        for (const id of nearby) {
          if (allowed.has(id)) targets.add(id);
        }
      }
    }

    if (targets.size <= dispatchers.length) {
      const fallback = await this.users.findActiveByStaffRoles(
        roleKeys.length ? roleKeys : level1Roles,
      );
      for (const member of fallback) targets.add(member.id);
    }

    return [...targets];
  }

  private applyActorScope(
    qb: SelectQueryBuilder<IncidentEntity>,
    actor: AuthUser,
  ): void {
    if (this.hasDispatchAccess(actor)) return;

    qb.andWhere(
      new Brackets((scope) => {
        scope.where('i.reporter_user_id = :actorUserId', {
          actorUserId: actor.userId,
        });
        if (this.hasResponderAccess(actor)) {
          scope.orWhere(
            `EXISTS (
              SELECT 1
              FROM assignments access_assignment
              WHERE access_assignment.incident_id = i.id
                AND access_assignment.assignee_user_id = :actorUserId
                AND access_assignment.status = :acceptedStatus
            )`,
            { acceptedStatus: AssignmentStatus.ACCEPTED },
          );
        }
      }),
    );
  }

  private hasDispatchAccess(actor: AuthUser): boolean {
    return (
      actor.isDispatcher ||
      actor.permissions.includes(Permission.DISPATCH_ASSIGN)
    );
  }

  private hasResponderAccess(actor: AuthUser): boolean {
    return (
      actor.permissions.includes(Permission.ACCEPT_REJECT_INTERVENTION) ||
      actor.permissions.includes(Permission.CONFIRM_OR_ESCALATE_ASSIGNED)
    );
  }

  private async needsPreciseLocation(
    incidentId: string,
    actor: AuthUser,
  ): Promise<boolean> {
    if (this.hasDispatchAccess(actor)) return true;
    if (!this.hasResponderAccess(actor)) return false;
    return this.assignments.exist({
      where: {
        incidentId,
        assigneeUserId: actor.userId,
        status: AssignmentStatus.ACCEPTED,
      },
    });
  }

  private async acceptedIncidentIds(
    incidentIds: string[],
    actor: AuthUser,
  ): Promise<Set<string>> {
    if (!incidentIds.length || !this.hasResponderAccess(actor)) {
      return new Set();
    }
    const rows = await this.assignments
      .createQueryBuilder('assignment')
      .select('assignment.incident_id', 'incidentId')
      .where('assignment.incident_id IN (:...incidentIds)', { incidentIds })
      .andWhere('assignment.assignee_user_id = :userId', {
        userId: actor.userId,
      })
      .andWhere('assignment.status = :status', {
        status: AssignmentStatus.ACCEPTED,
      })
      .getRawMany<{ incidentId: string }>();
    return new Set(rows.map((row) => row.incidentId));
  }

  private async allocatePublicCode(
    incidents: Repository<IncidentEntity>,
  ): Promise<string> {
    for (let i = 0; i < 8; i += 1) {
      const code = generatePublicCode();
      const exists = await incidents.exist({ where: { publicCode: code } });
      if (!exists) return code;
    }
    throw new Error('public_code_allocation_failed');
  }
}
