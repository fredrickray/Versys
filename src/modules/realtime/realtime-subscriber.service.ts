import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { RedisService } from '../../redis/redis.service';
import { RealtimeGateway } from './realtime.gateway';
import { isRealtimeEnvelope, realtimeChannel } from './realtime-envelope';

@Injectable()
export class RealtimeSubscriberService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeSubscriberService.name);
  private readonly subscriber: Redis;
  private readonly channel: string;

  constructor(
    redis: RedisService,
    config: ConfigService,
    private readonly gateway: RealtimeGateway,
  ) {
    this.subscriber = redis.client.duplicate();
    this.channel = realtimeChannel(
      config.get<string>('appName') ?? 'versys',
      config.get<string>('nodeEnv') ?? 'development',
    );
  }

  async onModuleInit(): Promise<void> {
    this.subscriber.on('message', (channel, raw) => {
      if (channel !== this.channel) return;
      void this.receive(raw);
    });
    await this.subscriber.subscribe(this.channel);
    this.logger.log(
      `Subscribed to committed realtime events on ${this.channel}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.unsubscribe(this.channel);
    await this.subscriber.quit();
  }

  private async receive(raw: string): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRealtimeEnvelope(parsed)) {
        this.logger.warn('Ignored invalid realtime envelope');
        return;
      }
      await this.gateway.deliver(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ignored malformed realtime event: ${message}`);
    }
  }
}
