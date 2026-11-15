import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { QueueName } from '../../queues/queue-names';
import { RedisService } from '../../redis/redis.service';
import { InboundRequestConflictException } from '../channels/inbound-idempotency.service';
import type { CreateIncidentDto } from './dto/create-incident.dto';
import { OfflineAlertDto } from './dto/offline-alert.dto';
import { IncidentsService } from './incidents.service';

const IDEMPOTENCY_TTL = 60 * 60 * 24;

@Injectable()
export class OfflineAlertsService {
  private readonly logger = new Logger(OfflineAlertsService.name);

  constructor(
    private readonly incidents: IncidentsService,
    private readonly redis: RedisService,
    @InjectQueue(QueueName.OFFLINE_ALERTS) private readonly queue: Queue,
  ) {}

  async enqueue(actor: AuthUser, dto: OfflineAlertDto) {
    const incidentDto = this.toIncidentDto(dto);
    const reservation = await this.incidents.reserveIdempotent(
      incidentDto,
      { userId: actor.userId },
      'offline_alert',
      dto.clientEventId,
    );
    if (reservation.kind === 'conflict') {
      throw new InboundRequestConflictException();
    }
    if (reservation.kind === 'completed') {
      return {
        accepted: true,
        duplicate: true,
        incidentId: reservation.body.id,
      };
    }

    await this.queue.add(
      'process_offline_alert',
      { userId: actor.userId, dto },
      {
        jobId: offlineJobId(actor.userId, dto.clientEventId),
        removeOnComplete: true,
        attempts: 8,
        backoff: { type: 'exponential', delay: 2_000 },
      },
    );

    await this.redis.client.set(
      this.cacheKey(actor.userId, dto.clientEventId),
      'pending',
      'EX',
      IDEMPOTENCY_TTL,
    );
    this.logger.log(
      `Queued offline alert ${dto.clientEventId} from ${actor.userId}`,
    );
    return {
      accepted: true,
      duplicate: !reservation.newlyReserved,
      incidentId: null,
    };
  }

  async process(userId: string, dto: OfflineAlertDto): Promise<string> {
    const incident = await this.incidents.createIdempotent(
      this.toIncidentDto(dto),
      { userId },
      'offline_alert',
      dto.clientEventId,
    );
    await this.redis.client.set(
      this.cacheKey(userId, dto.clientEventId),
      incident.id,
      'EX',
      IDEMPOTENCY_TTL,
    );
    return incident.id;
  }

  private toIncidentDto(dto: OfflineAlertDto): CreateIncidentDto {
    return {
      type: dto.type,
      channel: dto.channel,
      latitude: dto.latitude,
      longitude: dto.longitude,
      placeId: dto.placeId,
      locationLabel: dto.locationLabel,
      metadata: {
        ...(dto.metadata ?? {}),
        offline: true,
        clientEventId: dto.clientEventId,
        capturedAt: dto.capturedAt,
      },
    };
  }

  private cacheKey(userId: string, clientEventId: string): string {
    return `offline:idem:${userId}:${clientEventId}`;
  }
}

function offlineJobId(userId: string, clientEventId: string): string {
  const digest = createHash('sha256')
    .update(`${userId}:${clientEventId}`, 'utf8')
    .digest('hex');
  return `offline-${digest}`;
}
