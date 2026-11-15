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
import {
  InboundIdempotencyService,
  type IdempotencyReservation,
} from '../channels/inbound-idempotency.service';
import { RealtimeOutboxService } from '../realtime/realtime-outbox.service';
import { NotificationIntentService } from '../notifications/notification-intent.service';
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
  isDrill: boolean;
  drillPurpose: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type IncidentIdempotencyCommand = {
  type: IncidentEntity['type'];
  channel: IncidentEntity['channel'];
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  locationLabel: string | null;
  metadata: Record<string, unknown>;
  isDrill: boolean;
  drillPurpose: string | null;
};

type IncidentSubmissionSource =
  'incident_api' | 'incident_drill' | 'offline_alert';

type IncidentCreationOptions = {
  isDrill?: boolean;
  drillPurpose?: string | null;
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
    private readonly idempotency: InboundIdempotencyService,
    private readonly realtimeOutbox: RealtimeOutboxService,
    private readonly notificationIntents: NotificationIntentService,
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
    this.publishCreated(saved);
    return saved;
  }

  reserveIdempotent(
    dto: CreateIncidentDto,
    actor: CreateIncidentActor,
    source: IncidentSubmissionSource,
    idempotencyKey: string,
    options: IncidentCreationOptions = {},
  ): Promise<IdempotencyReservation<IncidentView>> {
    return this.idempotency.reserve(
      source,
      `${actor.userId ?? actor.phoneE164}:${idempotencyKey}`,
      this.toIdempotencyCommand(dto, options),
    );
  }

  async createIdempotent(
    dto: CreateIncidentDto,
    actor: CreateIncidentActor,
    source: IncidentSubmissionSource,
    idempotencyKey: string,
    options: IncidentCreationOptions = {},
  ): Promise<IncidentView> {
    const command = this.toIdempotencyCommand(dto, options);
    const result = await this.idempotency.execute(
      source,
      `${actor.userId ?? actor.phoneE164}:${idempotencyKey}`,
      command,
      async (manager, stored) => {
        const incident = await this.createWithinTransaction(
          {
            type: stored.type,
            channel: stored.channel,
            latitude: stored.latitude ?? undefined,
            longitude: stored.longitude ?? undefined,
            placeId: stored.placeId ?? undefined,
            locationLabel: stored.locationLabel ?? undefined,
            metadata: stored.metadata,
          },
          actor,
          manager,
          {
            isDrill: stored.isDrill,
            drillPurpose: stored.drillPurpose,
          },
        );
        return {
          httpStatus: HttpStatus.CREATED,
          body: this.toView(incident, false),
          incidentId: incident.id,
          value: incident,
        };
      },
      () => this.assertRateLimit(actor),
    );
    const completed = this.idempotency.ensureCompleted(result);
    if (completed.newlyCompleted && completed.value) {
      this.publishCreated(completed.value);
    }
    return completed.body;
  }

  /**
   * Persists the incident and its audit record through the caller's transaction.
   * Call publishCreated only after that transaction commits.
   */
  async createWithinTransaction(
    dto: CreateIncidentDto,
    actor: CreateIncidentActor,
    manager: EntityManager,
    options: IncidentCreationOptions = {},
  ): Promise<IncidentEntity> {
    const incidents = manager.getRepository(IncidentEntity);
    const alertLevel = initialAlertLevel(dto.type);
    const isDrill = options.isDrill === true;
    const drillPurpose = isDrill ? options.drillPurpose?.trim() || null : null;
    const metadata = { ...(dto.metadata ?? {}) };
    delete metadata['drill'];
    delete metadata['isDrill'];
    if (isDrill && (!actor.userId || !drillPurpose)) {
      throw new Error('invalid_drill_context');
    }
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
      isDrill,
      drillPurpose,
      drillActorUserId: isDrill ? actor.userId : null,
      metadata,
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
          isDrill: saved.isDrill,
          drillPurpose: saved.drillPurpose,
        },
      },
      manager,
    );
    await this.realtimeOutbox.append(manager, {
      eventKey: `incident.created:${saved.id}`,
      type: 'incident.created',
      incidentId: saved.id,
      occurredAt: saved.createdAt,
      payload: { isDrill: saved.isDrill },
    });
    if (!saved.isDrill) {
      await this.notificationIntents.append(manager, {
        eventKey: `incident.initial:${saved.id}`,
        incidentId: saved.id,
        kind: 'incident_initial',
      });
    }
    return saved;
  }

  /** Emits post-commit best-effort events for a newly persisted incident. */
  publishCreated(saved: IncidentEntity): void {
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

    if (saved.isDrill) {
      this.logger.log(
        `Drill incident ${saved.publicCode} created without delivery`,
      );
      return;
    }

    this.logger.log(
      `Incident ${saved.publicCode} committed with durable notification intent`,
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
  }

  findById(id: string): Promise<IncidentEntity | null> {
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
      isDrill: incident.isDrill,
      drillPurpose: incident.drillPurpose,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
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

  /** PostgreSQL/PostGIS is authoritative for eligible nearest staff. */
  async resolveNotifyTargets(incident: IncidentEntity): Promise<string[]> {
    const targets = new Set<string>();
    const dispatchers = await this.users.findActiveDispatchers();
    for (const dispatcher of dispatchers) targets.add(dispatcher.id);

    const level1Roles = [...ALERT_LEVEL_NOTIFY_ROLES[AlertLevel.LOW]];
    const nearby = await this.nearestEligibleStaff(
      level1Roles,
      incident.latitude,
      incident.longitude,
    );
    for (const userId of nearby) targets.add(userId);
    return [...targets];
  }

  async resolveLevelNotifyTargets(incident: IncidentEntity): Promise<string[]> {
    const roles = [...ALERT_LEVEL_NOTIFY_ROLES[incident.alertLevel]];
    const staff = roles.length
      ? await this.users.findActiveByStaffRoles(roles)
      : [];
    const dispatchers = await this.users.findActiveDispatchers();
    return [
      ...new Set([
        ...staff.map((member) => member.id),
        ...dispatchers.map((dispatcher) => dispatcher.id),
      ]),
    ];
  }

  private async nearestEligibleStaff(
    roleKeys: string[],
    latitude: number | null,
    longitude: number | null,
  ): Promise<string[]> {
    if (!roleKeys.length) return [];
    const maxAgeMs = this.config.getOrThrow<number>('location.maxAgeMs');
    const maxAccuracy = this.config.getOrThrow<number>(
      'location.maxAccuracyMetres',
    );
    const hasCoordinates = latitude != null && longitude != null;
    const rows = await this.dataSource.query<{ user_id: string }[]>(
      `
        WITH latest AS (
          SELECT DISTINCT ON (ping.user_id)
            ping.user_id,
            ping.position
          FROM location_pings ping
          JOIN users candidate ON candidate.id = ping.user_id
          LEFT JOIN staff_shifts shift ON shift.id = ping.shift_id
          LEFT JOIN assignments assignment ON assignment.id = ping.assignment_id
          LEFT JOIN incidents assigned_incident
            ON assigned_incident.id = assignment.incident_id
          WHERE candidate.is_active = true
            AND candidate.staff_role_key = ANY($1::text[])
            AND ping.recorded_at >= now() - ($2 * interval '1 millisecond')
            AND ping.accuracy_metres <= $3
            AND (
              (
                shift.status = 'active' AND
                shift.expires_at > now()
              ) OR (
                assignment.status = 'accepted' AND
                assigned_incident.status != 'resolved'
              )
            )
          ORDER BY ping.user_id, ping.recorded_at DESC
        )
        SELECT user_id
        FROM latest
        WHERE (
          $4::boolean = false OR
          ST_DWithin(
            position,
            ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
            $7
          )
        )
        ORDER BY
          CASE WHEN $4::boolean THEN
            ST_Distance(
              position,
              ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography
            )
          END ASC NULLS LAST
        LIMIT $8
      `,
      [
        roleKeys,
        maxAgeMs,
        maxAccuracy,
        hasCoordinates,
        longitude ?? 0,
        latitude ?? 0,
        NEAREST_STAFF_RADIUS_M,
        NEAREST_STAFF_LIMIT,
      ],
    );
    return rows.map((row) => row.user_id);
  }

  private toIdempotencyCommand(
    dto: CreateIncidentDto,
    options: IncidentCreationOptions,
  ): IncidentIdempotencyCommand {
    const metadata = { ...(dto.metadata ?? {}) };
    delete metadata['drill'];
    delete metadata['isDrill'];
    return {
      type: dto.type,
      channel: dto.channel,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      placeId: dto.placeId ?? null,
      locationLabel: dto.locationLabel ?? null,
      metadata,
      isDrill: options.isDrill === true,
      drillPurpose: options.isDrill
        ? options.drillPurpose?.trim() || null
        : null,
    };
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
