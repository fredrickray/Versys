import { Module } from '@nestjs/common';
import { RealtimeOutboxModule } from './realtime-outbox.module';
import { RealtimeOutboxPublisher } from './realtime-outbox.publisher';

@Module({
  imports: [RealtimeOutboxModule],
  providers: [RealtimeOutboxPublisher],
  exports: [RealtimeOutboxPublisher],
})
export class RealtimeOutboxJobsModule {}
