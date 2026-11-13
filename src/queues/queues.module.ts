import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueName } from './queue-names';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redis.url');
        const connection = url
          ? { url }
          : {
              host: config.getOrThrow<string>('redis.host'),
              port: config.getOrThrow<number>('redis.port'),
              password: config.get<string>('redis.password') || undefined,
              db: config.get<number>('redis.db') ?? 0,
            };
        return {
          connection,
          defaultJobOptions: {
            removeOnComplete: 1000,
            removeOnFail: 5000,
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QueueName.ESCALATION },
      { name: QueueName.NOTIFICATIONS },
      { name: QueueName.LOCATION_RETENTION },
      { name: QueueName.ANALYTICS },
      { name: QueueName.OFFLINE_ALERTS },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
