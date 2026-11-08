import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { LessThan, Repository } from 'typeorm';
import { QueueName } from '../../../queues/queue-names';
import { LocationPingEntity } from '../entities/location-ping.entity';

/** Nightly NDPA cleanup — purge location history older than retention window. */
@Injectable()
export class LocationRetentionService implements OnModuleInit {
  private readonly logger = new Logger(LocationRetentionService.name);

  constructor(
    @InjectRepository(LocationPingEntity)
    private readonly pings: Repository<LocationPingEntity>,
    @InjectQueue(QueueName.LOCATION_RETENTION) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'location-retention-nightly',
      { pattern: '0 3 * * *' },
      {
        name: 'purge',
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 50 },
      },
    );
  }

  async purge(): Promise<{ deleted: number }> {
    const days = this.config.getOrThrow<number>('locationRetentionDays');
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.pings.delete({ recordedAt: LessThan(cutoff) });
    const deleted = result.affected ?? 0;
    this.logger.log(
      `Location retention purged ${deleted} pings older than ${cutoff.toISOString()}`,
    );
    return { deleted };
  }
}
