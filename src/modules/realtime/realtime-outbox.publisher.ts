import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { RealtimeOutboxEntity } from './entities/realtime-outbox.entity';
import { realtimeChannel, type RealtimeEnvelope } from './realtime-envelope';

@Injectable()
export class RealtimeOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeOutboxPublisher.name);
  private readonly channel: string;
  private timer?: NodeJS.Timeout;
  private draining = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.channel = realtimeChannel(
      config.get<string>('appName') ?? 'versys',
      config.get<string>('nodeEnv') ?? 'development',
    );
  }

  async onModuleInit(): Promise<void> {
    await this.drain();
    this.timer = setInterval(() => {
      void this.drain();
    }, 1_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drain(): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const rows = await manager
          .getRepository(RealtimeOutboxEntity)
          .createQueryBuilder('outbox')
          .where('outbox.published_at IS NULL')
          .andWhere('outbox.available_at <= :now', { now: new Date() })
          .orderBy('outbox.created_at', 'ASC')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .take(50)
          .getMany();

        let published = 0;
        for (const row of rows) {
          row.attemptCount += 1;
          try {
            const envelope: RealtimeEnvelope = {
              schemaVersion: 1,
              eventId: row.id,
              type: row.type,
              incidentId: row.incidentId,
              occurredAt: row.occurredAt.toISOString(),
              payload: row.payload,
            };
            const subscribers = await this.redis.client.publish(
              this.channel,
              JSON.stringify(envelope),
            );
            if (subscribers < 1) throw new Error('realtime_no_subscribers');
            row.publishedAt = new Date();
            row.lastError = null;
            published += 1;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            row.lastError = message.slice(0, 256);
            const backoffSeconds = Math.min(
              60,
              2 ** Math.min(row.attemptCount, 6),
            );
            row.availableAt = new Date(Date.now() + backoffSeconds * 1_000);
          }
          await manager.getRepository(RealtimeOutboxEntity).save(row);
        }
        return published;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Realtime outbox drain failed: ${message}`);
      return 0;
    } finally {
      this.draining = false;
    }
  }
}
