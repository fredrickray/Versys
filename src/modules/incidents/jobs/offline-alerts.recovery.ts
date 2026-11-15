import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { IncidentChannel, IncidentType } from '../../../common/enums';
import { QueueName } from '../../../queues/queue-names';
import { InboundRequestEntity } from '../../channels/entities/inbound-request.entity';
import type { OfflineAlertDto } from '../dto/offline-alert.dto';

type StoredIncidentCommand = {
  type: IncidentType;
  channel: IncidentChannel;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  locationLabel: string | null;
  metadata: Record<string, unknown>;
};

@Injectable()
export class OfflineAlertsRecovery implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OfflineAlertsRecovery.name);
  private timer?: NodeJS.Timeout;
  private recovering = false;

  constructor(
    @InjectRepository(InboundRequestEntity)
    private readonly records: Repository<InboundRequestEntity>,
    @InjectQueue(QueueName.OFFLINE_ALERTS) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recover();
    this.timer = setInterval(() => {
      void this.recover();
    }, 2_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async recover(): Promise<number> {
    if (this.recovering) return 0;
    this.recovering = true;
    try {
      const now = new Date();
      const records = await this.records.find({
        where: [
          {
            source: 'offline_alert',
            status: 'processing',
            leaseExpiresAt: IsNull(),
          },
          {
            source: 'offline_alert',
            status: 'processing',
            leaseExpiresAt: LessThanOrEqual(now),
          },
        ],
        order: { createdAt: 'ASC' },
        take: 25,
      });

      let recovered = 0;
      for (const record of records) {
        const separator = record.providerKey.indexOf(':');
        if (separator < 1) continue;
        const userId = record.providerKey.slice(0, separator);
        const clientEventId = record.providerKey.slice(separator + 1);
        const command = record.requestPayload as StoredIncidentCommand;
        try {
          await this.queue.add(
            'process_offline_alert',
            {
              userId,
              dto: this.toDto(command, clientEventId, record.createdAt),
            },
            {
              jobId: `offline-recovery-${record.id}`,
              removeOnComplete: true,
              attempts: 8,
              backoff: { type: 'exponential', delay: 2_000 },
            },
          );
          recovered += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Offline recovery deferred ${record.id}: ${message}`,
          );
        }
      }
      return recovered;
    } finally {
      this.recovering = false;
    }
  }

  private toDto(
    command: StoredIncidentCommand,
    clientEventId: string,
    createdAt: Date,
  ): OfflineAlertDto {
    const capturedAt = command.metadata['capturedAt'];
    return {
      clientEventId,
      type: command.type,
      channel: command.channel,
      capturedAt:
        typeof capturedAt === 'string' ? capturedAt : createdAt.toISOString(),
      latitude: command.latitude ?? undefined,
      longitude: command.longitude ?? undefined,
      placeId: command.placeId ?? undefined,
      locationLabel: command.locationLabel ?? undefined,
      metadata: command.metadata,
    };
  }
}
