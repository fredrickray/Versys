import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { QueueName } from '../../queues/queue-names';
import { RedisService } from '../../redis/redis.service';
import { OfflineAlertDto } from './dto/offline-alert.dto';
import { IncidentsService } from './incidents.service';

const IDEMPOTENCY_TTL = 60 * 60 * 24; // 24h

@Injectable()
export class OfflineAlertsService {
  private readonly logger = new Logger(OfflineAlertsService.name);

  constructor(
    private readonly incidents: IncidentsService,
    private readonly redis: RedisService,
    @InjectQueue(QueueName.OFFLINE_ALERTS) private readonly queue: Queue,
  ) {}

  /**
   * Accept a client offline queue flush. Idempotent on clientEventId.
   * Enqueues durable processing so the HTTP path stays fast on reconnect bursts.
   */
  async enqueue(actor: AuthUser, dto: OfflineAlertDto) {
    const idemKey = `offline:idem:${actor.userId}:${dto.clientEventId}`;
    const existing = await this.redis.client.get(idemKey);
    if (existing) {
      return { accepted: true, duplicate: true, incidentId: existing };
    }

    await this.queue.add(
      'process_offline_alert',
      {
        userId: actor.userId,
        dto,
      },
      {
        jobId: `offline:${actor.userId}:${dto.clientEventId}`,
        removeOnComplete: true,
        attempts: 8,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    // Reserve idempotency key with placeholder until processed
    await this.redis.client.set(
      idemKey,
      'pending',
      'EX',
      IDEMPOTENCY_TTL,
      'NX',
    );
    this.logger.log(
      `Queued offline alert ${dto.clientEventId} from ${actor.userId}`,
    );
    return { accepted: true, duplicate: false };
  }

  async process(userId: string, dto: OfflineAlertDto): Promise<string> {
    const idemKey = `offline:idem:${userId}:${dto.clientEventId}`;
    const current = await this.redis.client.get(idemKey);
    if (current && current !== 'pending') {
      return current;
    }

    const incident = await this.incidents.create(
      {
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
      },
      { userId },
    );

    await this.redis.client.set(idemKey, incident.id, 'EX', IDEMPOTENCY_TTL);
    return incident.id;
  }
}
