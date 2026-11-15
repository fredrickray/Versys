import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { STAFF_GEO_KEY } from '../../common/constants/location';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  AssignmentStatus,
  IncidentStatus,
  Permission,
} from '../../common/enums';
import { RedisService } from '../../redis/redis.service';
import { AssignmentEntity } from '../assignments/entities/assignment.entity';
import { IncidentEntity } from '../incidents/entities/incident.entity';
import { UserEntity } from '../users/entities/user.entity';
import { LocationPingDto } from './dto/location-ping.dto';
import { LocationPingEntity } from './entities/location-ping.entity';
import { StaffShiftEntity } from './entities/staff-shift.entity';
import { LOCATION_EXPIRY_KEY, locationMetaKey } from './staff-shift.service';

const UPDATE_LIVE_LOCATION_SCRIPT = `
  local current = redis.call('GET', KEYS[1])
  if current then
    local decoded = cjson.decode(current)
    if tonumber(decoded.recordedAtMs) >= tonumber(ARGV[4]) then
      return 0
    end
  end
  redis.call('GEOADD', KEYS[2], ARGV[1], ARGV[2], ARGV[3])
  redis.call('SET', KEYS[1], ARGV[5], 'EX', ARGV[6])
  redis.call('ZADD', KEYS[3], ARGV[7], ARGV[3])
  return 1
`;

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly maxAgeMs: number;
  private readonly futureSkewMs: number;
  private readonly maxAccuracyMetres: number;
  private readonly liveTtlSeconds: number;

  constructor(
    @InjectRepository(LocationPingEntity)
    private readonly pings: Repository<LocationPingEntity>,
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.maxAgeMs = config.getOrThrow<number>('location.maxAgeMs');
    this.futureSkewMs = config.getOrThrow<number>('location.futureSkewMs');
    this.maxAccuracyMetres = config.getOrThrow<number>(
      'location.maxAccuracyMetres',
    );
    this.liveTtlSeconds = config.getOrThrow<number>('location.liveTtlSeconds');
  }

  async ingest(
    userId: string,
    dto: LocationPingDto,
  ): Promise<{ accepted: true }> {
    const now = new Date();
    const recordedAt = new Date(dto.recordedAt);
    this.validateMeasurement(dto, recordedAt, now);

    const saved = await this.dataSource.transaction(async (manager) => {
      if (dto.incidentId) {
        return this.saveIncidentPing(
          manager,
          userId,
          dto,
          recordedAt,
          dto.incidentId,
        );
      }
      return this.saveShiftPing(manager, userId, dto, recordedAt, now);
    });

    try {
      await this.updateLiveLocation(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Live location cache update deferred: ${message}`);
    }
    return { accepted: true };
  }

  async interventionMap(incidentId: string, actor: AuthUser) {
    if (!actor.permissions.includes(Permission.MONITOR_INTERVENTION_MAP)) {
      throw new ForbiddenException('cannot_monitor_intervention_map');
    }
    const incident = await this.incidents.findOne({
      where: { id: incidentId },
    });
    if (!incident || incident.status === IncidentStatus.RESOLVED) {
      throw new NotFoundException('incident_not_found');
    }

    const responders = await this.assignments
      .createQueryBuilder('assignment')
      .innerJoin(
        UserEntity,
        'responder',
        'responder.id = assignment.assignee_user_id',
      )
      .where('assignment.incident_id = :incidentId', { incidentId })
      .andWhere('assignment.status = :status', {
        status: AssignmentStatus.ACCEPTED,
      })
      .andWhere('responder.is_active = true')
      .getMany();
    const userIds = responders.map((row) => row.assigneeUserId);
    const freshAfter = new Date(Date.now() - this.maxAgeMs);

    const positions = userIds.length
      ? await this.pings
          .createQueryBuilder('ping')
          .distinctOn(['ping.user_id'])
          .where('ping.incident_id = :incidentId', { incidentId })
          .andWhere('ping.user_id IN (:...userIds)', { userIds })
          .andWhere('ping.recorded_at >= :freshAfter', { freshAfter })
          .andWhere('ping.accuracy_metres <= :maxAccuracy', {
            maxAccuracy: this.maxAccuracyMetres,
          })
          .orderBy('ping.user_id', 'ASC')
          .addOrderBy('ping.recorded_at', 'DESC')
          .getMany()
      : [];

    const latestTrail = userIds.length
      ? await this.pings.find({
          where: { incidentId, userId: In(userIds) },
          order: { recordedAt: 'DESC' },
          take: 500,
        })
      : [];

    return {
      incident: {
        id: incident.id,
        publicCode: incident.publicCode,
        status: incident.status,
        alertLevel: incident.alertLevel,
        latitude: incident.latitude,
        longitude: incident.longitude,
        locationLabel: incident.locationLabel,
      },
      responders: positions.map((position) => ({
        userId: position.userId,
        longitude: position.longitude,
        latitude: position.latitude,
        accuracyMetres: position.accuracyMetres,
        recordedAt: position.recordedAt,
      })),
      trail: latestTrail.reverse().map((ping) => ({
        userId: ping.userId,
        latitude: ping.latitude,
        longitude: ping.longitude,
        accuracyMetres: ping.accuracyMetres,
        recordedAt: ping.recordedAt,
      })),
    };
  }

  private async saveIncidentPing(
    manager: EntityManager,
    userId: string,
    dto: LocationPingDto,
    recordedAt: Date,
    incidentId: string,
  ): Promise<LocationPingEntity> {
    const incident = await manager
      .getRepository(IncidentEntity)
      .createQueryBuilder('incident')
      .setLock('pessimistic_read')
      .where('incident.id = :incidentId', { incidentId })
      .getOne();
    if (!incident) throw new NotFoundException('incident_not_found');
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestException('incident_resolved');
    }

    const assignments = await manager
      .getRepository(AssignmentEntity)
      .createQueryBuilder('assignment')
      .setLock('pessimistic_read')
      .where('assignment.incident_id = :incidentId', { incidentId })
      .orderBy('assignment.id', 'ASC')
      .getMany();
    const assignment = assignments.find(
      (row) =>
        row.assigneeUserId === userId &&
        row.status === AssignmentStatus.ACCEPTED &&
        row.generation === incident.escalationGeneration,
    );
    if (!assignment) throw new BadRequestException('not_active_responder');

    await this.assertNewer(manager, userId, recordedAt, { incidentId });
    const repo = manager.getRepository(LocationPingEntity);
    return repo.save(
      repo.create({
        userId,
        incidentId,
        shiftId: null,
        assignmentId: assignment.id,
        onDuty: false,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMetres: dto.accuracyMetres,
        recordedAt,
      }),
    );
  }

  private async saveShiftPing(
    manager: EntityManager,
    userId: string,
    dto: LocationPingDto,
    recordedAt: Date,
    now: Date,
  ): Promise<LocationPingEntity> {
    const shift = await manager
      .getRepository(StaffShiftEntity)
      .createQueryBuilder('shift')
      .setLock('pessimistic_write')
      .where('shift.user_id = :userId', { userId })
      .andWhere('shift.status = :status', { status: 'active' })
      .getOne();
    if (!shift || shift.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException('location_requires_incident_or_shift');
    }

    await this.assertNewer(manager, userId, recordedAt, { shiftId: shift.id });
    const repo = manager.getRepository(LocationPingEntity);
    return repo.save(
      repo.create({
        userId,
        incidentId: null,
        shiftId: shift.id,
        assignmentId: null,
        onDuty: true,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMetres: dto.accuracyMetres,
        recordedAt,
      }),
    );
  }

  private async assertNewer(
    manager: EntityManager,
    userId: string,
    recordedAt: Date,
    context: { incidentId?: string; shiftId?: string },
  ): Promise<void> {
    const query = manager
      .getRepository(LocationPingEntity)
      .createQueryBuilder('ping')
      .where('ping.user_id = :userId', { userId })
      .orderBy('ping.recorded_at', 'DESC')
      .setLock('pessimistic_read');
    if (context.incidentId) {
      query.andWhere('ping.incident_id = :incidentId', {
        incidentId: context.incidentId,
      });
    } else {
      query.andWhere('ping.shift_id = :shiftId', { shiftId: context.shiftId });
    }
    const latest = await query.getOne();
    if (latest && latest.recordedAt.getTime() >= recordedAt.getTime()) {
      throw new BadRequestException('location_out_of_order');
    }
  }

  private validateMeasurement(
    dto: LocationPingDto,
    recordedAt: Date,
    now: Date,
  ): void {
    const age = now.getTime() - recordedAt.getTime();
    if (age > this.maxAgeMs) throw new BadRequestException('location_stale');
    if (age < -this.futureSkewMs) {
      throw new BadRequestException('location_from_future');
    }
    if (dto.accuracyMetres > this.maxAccuracyMetres) {
      throw new BadRequestException('location_inaccurate');
    }
  }

  private async updateLiveLocation(ping: LocationPingEntity): Promise<void> {
    const expiresAt = Date.now() + this.liveTtlSeconds * 1_000;
    const metadata = JSON.stringify({
      incidentId: ping.incidentId,
      shiftId: ping.shiftId,
      assignmentId: ping.assignmentId,
      recordedAt: ping.recordedAt.toISOString(),
      recordedAtMs: ping.recordedAt.getTime(),
      accuracyMetres: ping.accuracyMetres,
    });
    await this.redis.client.eval(
      UPDATE_LIVE_LOCATION_SCRIPT,
      3,
      locationMetaKey(ping.userId),
      STAFF_GEO_KEY,
      LOCATION_EXPIRY_KEY,
      String(ping.longitude),
      String(ping.latitude),
      ping.userId,
      String(ping.recordedAt.getTime()),
      metadata,
      String(this.liveTtlSeconds),
      String(expiresAt),
    );
  }
}
