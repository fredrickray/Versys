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
import { DataSource, EntityManager, Repository } from 'typeorm';
import { initialAlertLevel } from '../../common/constants/incident';
import {
  NEAREST_STAFF_LIMIT,
  NEAREST_STAFF_RADIUS_M,
  STAFF_GEO_KEY,
} from '../../common/constants/location';
import { ALERT_LEVEL_NOTIFY_ROLES } from '../../common/constants/permissions';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AlertLevel, AuditAction, IncidentStatus } from '../../common/enums';
import {
  IncidentEvent,
  type IncidentCreatedPayload,
} from '../../common/events/incident.events';
import { generatePublicCode } from '../../common/utils/public-code';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { AddIncidentDetailsDto } from './dto/add-incident-details.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentEntity } from './entities/incident.entity';

export type CreateIncidentActor = {
  userId: string | null;
  phoneE164?: string | null;
};

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
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
  ): Promise<IncidentEntity> {
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
    return saved;
  }

  findById(id: string): Promise<IncidentEntity | null> {
    return this.incidents.findOne({ where: { id } });
  }

  async list(opts: { status?: IncidentStatus; limit?: number } = {}) {
    const qb = this.incidents
      .createQueryBuilder('i')
      .orderBy('i.created_at', 'DESC')
      .take(opts.limit ?? 50);
    if (opts.status) qb.andWhere('i.status = :status', { status: opts.status });
    return qb.getMany();
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
