import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { STAFF_GEO_KEY } from '../../common/constants/location';
import { AssignmentStatus, IncidentStatus } from '../../common/enums';
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

  /**
   * NDPA: only persist/track during an active incident assignment or an explicit duty shift.
   */
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
    const row = this.pings.create({
      userId,
      incidentId,
      onDuty,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracyMetres: dto.accuracyMetres ?? null,
      recordedAt,
    });
    await this.pings.save(row);

    // Latest point for nearest-staff (Redis GEO: lon, lat, member)
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
}
