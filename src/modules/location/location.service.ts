import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { LocationPingDto } from './dto/location-ping.dto';
import { LocationPingEntity } from './entities/location-ping.entity';

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(LocationPingEntity)
    private readonly pings: Repository<LocationPingEntity>,
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(AssignmentEntity)
    private readonly assignments: Repository<AssignmentEntity>,
    private readonly redis: RedisService,
  ) {}

  async ingest(
    userId: string,
    dto: LocationPingDto,
  ): Promise<{ accepted: true }> {
    const onDuty = dto.onDuty === true;
    const incidentId = dto.incidentId ?? null;

    if (incidentId) {
      const incident = await this.incidents.findOne({
        where: { id: incidentId },
      });
      if (!incident) throw new NotFoundException('incident_not_found');
      if (incident.status === IncidentStatus.RESOLVED) {
        throw new BadRequestException('incident_resolved');
      }
      const assignment = await this.assignments.findOne({
        where: {
          incidentId,
          assigneeUserId: userId,
          status: AssignmentStatus.ACCEPTED,
        },
      });
      if (!assignment) {
        throw new BadRequestException('not_active_responder');
      }
    } else if (!onDuty) {
      throw new BadRequestException('location_requires_incident_or_duty');
    }

    const recordedAt = new Date(dto.recordedAt);
    await this.pings.save(
      this.pings.create({
        userId,
        incidentId,
        onDuty,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMetres: dto.accuracyMetres ?? null,
        recordedAt,
      }),
    );

    await this.redis.client.geoadd(
      STAFF_GEO_KEY,
      dto.longitude,
      dto.latitude,
      userId,
    );
    await this.redis.client.set(
      `loc:meta:${userId}`,
      JSON.stringify({
        incidentId,
        onDuty,
        recordedAt: recordedAt.toISOString(),
      }),
      'EX',
      60 * 60 * 12,
    );

    return { accepted: true };
  }

  /**
   * GPS intervention map — CAT2/3 + dispatcher only (Permission.MONITOR_INTERVENTION_MAP).
   */
  async interventionMap(incidentId: string, actor: AuthUser) {
    if (!actor.permissions.includes(Permission.MONITOR_INTERVENTION_MAP)) {
      throw new ForbiddenException('cannot_monitor_intervention_map');
    }
    const incident = await this.incidents.findOne({
      where: { id: incidentId },
    });
    if (!incident) throw new NotFoundException('incident_not_found');

    const responders = await this.assignments.find({
      where: { incidentId, status: AssignmentStatus.ACCEPTED },
    });
    const userIds = responders.map((r) => r.assigneeUserId);

    const positions = [];
    for (const userId of userIds) {
      const pos = await this.redis.client.geopos(STAFF_GEO_KEY, userId);
      const pair = pos?.[0];
      if (pair && pair[0] != null && pair[1] != null) {
        positions.push({
          userId,
          longitude: Number(pair[0]),
          latitude: Number(pair[1]),
        });
      }
    }

    const trail =
      userIds.length === 0
        ? []
        : await this.pings.find({
            where: { incidentId, userId: In(userIds) },
            order: { recordedAt: 'ASC' },
            take: 500,
          });

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
      responders: positions,
      trail: trail.map((t) => ({
        userId: t.userId,
        latitude: t.latitude,
        longitude: t.longitude,
        recordedAt: t.recordedAt,
      })),
    };
  }
}
